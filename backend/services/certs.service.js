import cfg from "../config/env.js";
import { getSheets, getSlides } from "./google.service.js";
import { buscarPorCpf } from "./sheets.service.js";

// checa presença nas abas Dia1/Dia2
async function checarPresencaDias(codInscricao, nomeOpcional) {
  const sheets = await getSheets();
  const abas = ["Dia1", "Dia2"];
  let dia1 = false, dia2 = false;

  for (let i = 0; i < abas.length; i++) {
    const title = abas[i];
    try {
      const resp = await sheets.spreadsheets.values.get({ spreadsheetId: cfg.sheetId, range: `${title}!A2:B` });
      const rows = resp.data.values || [];
      for (const r of rows) {
        const num = String(r[0] || "").trim().toUpperCase();
        const nome = String(r[1] || "").trim().toUpperCase();
        if (num === String(codInscricao).trim().toUpperCase()) {
          if (nomeOpcional) {
            const cmp = String(nomeOpcional || "").trim().toUpperCase();
            if (nome && cmp && nome !== cmp) continue;
          }
          if (i === 0) dia1 = true;
          if (i === 1) dia2 = true;
          break;
        }
      }
    } catch (_e) { /* aba pode não existir */ }
  }
  return { dia1, dia2 };
}

function montarPeriodoTexto(dias) {
  const inicio = new Date(cfg.event.inicio);
  const fim = new Date(cfg.event.fim);
  const dd = (n) => String(n.getDate()).padStart(2, "0");
  const mes = inicio.toLocaleDateString("pt-BR", { month: "long" });
  const ano = fim.getFullYear();
  if (dias.dia1 && dias.dia2) return `nos dias ${dd(inicio)} e ${dd(fim)} de ${mes} de ${ano}`;
  if (dias.dia1) return `no dia ${dd(inicio)} de ${mes} de ${ano}`;
  if (dias.dia2) return `no dia ${dd(fim)} de ${mes} de ${ano}`;
  return "";
}

export async function emitirCertificadoPDF(cpf) {
  const perfis = ["Conselheiro", "CNRPPS", "Palestrante", "Staff"];
  let user = null, perfilEncontrado = "";
  for (const p of perfis) {
    const u = await buscarPorCpf(cpf, p);
    if (u) { user = u; perfilEncontrado = p; break; }
  }
  if (!user) throw new Error("CPF não encontrado.");
  if (!user.numerodeinscricao || String(user.numerodeinscricao).trim() === "")
    throw new Error("Certificado disponível apenas para inscritos confirmados (com número de inscrição).");

  const dias = await checarPresencaDias(user.numerodeinscricao, user.nome);
  if (!dias.dia1 && !dias.dia2)
    throw new Error("NAO_CONSTA_PRESENCA|O seu número de inscrição não consta nas listas Dia1/Dia2.");

  const agora = new Date();
  const eventoFim = new Date(cfg.event.fim);
  const liberacao = new Date(eventoFim.getTime() + cfg.event.certAfterHours * 60 * 60 * 1000);

  if (agora < eventoFim) {
    const msFalta = eventoFim - agora;
    const diasFalta = Math.ceil(msFalta / (24 * 60 * 60 * 1000));
    throw new Error("EVENTO_NAO_TERMINOU|" + diasFalta);
  }
  if (agora < liberacao) {
    const msFalta = liberacao - agora;
    throw new Error("CERTIFICADO_NAO_LIBERADO|" + msFalta);
  }

  const nome = user.nome;
  const funcao = perfilEncontrado.toLowerCase();
  const periodoTexto = montarPeriodoTexto(dias);

  // === GERAÇÃO via Slides (copia template -> substitui -> exporta PDF) ===
  const { slides, drive } = await getSlides();
  const parents = process.env.DRIVE_PARENT_ID ? [process.env.DRIVE_PARENT_ID] : undefined;

  // 1) copiar o template para não alterarmos o original
  const copy = await drive.files.copy({
    fileId: cfg.slidesTplId,
    requestBody: {
      name: `certificado_temp_${Date.now()}`,
      ...(parents ? { parents } : {})
    }
  });
  const copyId = copy.data.id;

  // 2) substituir placeholders
  await slides.presentations.batchUpdate({
    presentationId: copyId,
    requestBody: {
      requests: [
        { replaceAllText: { containsText: { text: "<<NOME>>", matchCase: false }, replaceText: nome } },
        { replaceAllText: { containsText: { text: "<<PERIODO>>", matchCase: false }, replaceText: periodoTexto } }
      ]
    }
  });

  // 3) exportar como PDF
  const pdfResp = await drive.files.export(
    { fileId: copyId, mimeType: "application/pdf" },
    { responseType: "arraybuffer" }
  );
  const buffer = Buffer.from(pdfResp.data);

  // 4) limpar arquivo temporário
  try { await drive.files.delete({ fileId: copyId }); } catch {}

  return { buffer, filename: "certificado_conaprev.pdf" };
}
