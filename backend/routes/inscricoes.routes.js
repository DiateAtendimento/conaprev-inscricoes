// backend/routes/inscricoes.routes.js
import { Router } from "express";

// Serviços (ajuste os nomes/locais conforme seu projeto)
import {
  buscarPorCpf,
  inscreverDados,
  atualizarDados,
  confirmarInscricao,
  cancelarInscricao,
  getConselheiroSeats,
  // se tiver funções específicas:
  // reenviarEmailComprovante,
} from "../services/sheets.service.js";

const r = Router();

/* ===========================
   Helpers
   =========================== */

// Normaliza o objeto pessoa para o formato esperado pelo front
function normalizarPessoa(p, cpf, perfil) {
  if (!p) return null;
  return {
    numerodeinscricao: p.numerodeinscricao || p.numero || p.protocolo || "",
    cpf: String(cpf || p.cpf || ""),
    nome: p.nome || "",
    nomenoprismacracha: p.nomenoprismacracha || "",
    uf: p.uf || p.ufsigla || "",
    ufsigla: p.uf || p.ufsigla || "",
    representatividade: p.representatividade || p.representa || "",
    cargofuncao: p.cargofuncao || p.cargo || "",
    sigladaentidade: p.sigladaentidade || p.sigla || "",
    endereco: p.endereco || "",
    email: p.email || p.emailconselheiroa || "",
    emailconselheiroa: p.emailconselheiroa || p.email || "",
    emailsecretarioa: p.emailsecretarioa || "",
    convidadopor: p.convidadopor || "",
    identificacao: perfil || p.identificacao || "",
  };
}

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

/* ===========================
   LOOKUP CPF — compatibilidade
   - GET /pessoas?cpf=...&perfil=...
   - POST /buscar { cpf, perfil }
   =========================== */

// Compatível com o steps.js (ROUTES.lookupCpf -> GET)
r.get("/pessoas", async (req, res) => {
  try {
    const cpf = onlyDigits(req.query.cpf);
    const perfil = String(req.query.perfil || req.query.role || "").trim();
    if (!cpf || cpf.length !== 11) {
      return res.status(400).json({ message: "CPF inválido." });
    }
    const pessoa = await buscarPorCpf(cpf, perfil);
    if (!pessoa) return res.status(404).json({ message: "Não encontrado" });

    return res.json(normalizarPessoa(pessoa, cpf, perfil));
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erro interno ao buscar CPF." });
  }
});

// Versão POST (sua rota já existente)
r.post("/buscar", async (req, res) => {
  try {
    const { cpf, perfil } = req.body || {};
    const clean = onlyDigits(cpf);
    if (!clean || clean.length !== 11) {
      return res.status(400).json({ error: "CPF inválido." });
    }
    const pessoa = await buscarPorCpf(clean, String(perfil || ""));
    // Mantém comportamento anterior: retorna null se não achou
    const out = pessoa ? normalizarPessoa(pessoa, clean, perfil) : null;
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});

/* ===========================
   CRIAR / ATUALIZAR / CONFIRMAR / CANCELAR
   - POST /inscricoes (compatível com steps.js atual)
   - POST /criar (compat com sua API anterior)
   - POST /atualizar
   - POST /confirmar
   - POST /cancelar
   =========================== */

// Compatível com steps.js atual: ROUTES.createInscricao -> POST /inscricoes
// Espera receber todos os campos no body (payload) e devolve {id, protocolo, pdfUrl}
r.post("/inscricoes", async (req, res) => {
  try {
    const payload = req.body || {};
    // Você pode decidir: se vier formData/perfil, usa inscreverDados/confirmarInscricao
    // Aqui vamos priorizar confirmarInscricao (gera número), e se não tiver, inscreverDados.
    let id = null;
    let protocolo = null;

    if (payload?.formData && payload?.perfil) {
      // caminho de compatibilidade com sua API antiga
      protocolo = await confirmarInscricao(payload.formData, payload.perfil);
      id = protocolo || null;
    } else {
      // Se quiser mapear/validar o payload antes, faça aqui.
      // Exemplo simples: usa inscreverDados e em seguida confirmarInscricao
      const perfil = payload.perfil || payload.identificacao || "";
      const formData = { ...payload };
      // Se já tiver número, apenas devolve; senão, confirma e gera.
      protocolo = await confirmarInscricao(formData, perfil);
      id = protocolo || null;
    }

    const host = `${req.protocol}://${req.get("host")}`;
    const pdfUrl = id ? `${host}/api/inscricoes/${encodeURIComponent(id)}/comprovante.pdf` : null;

    return res.status(201).json({ id, protocolo, pdfUrl });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erro ao criar inscrição." });
  }
});

// Compat: sua rota antiga /criar
// body: { formData, perfil } -> { codigo }
r.post("/criar", async (req, res) => {
  try {
    const { formData, perfil } = req.body || {};
    const codigo = await inscreverDados(formData, perfil);
    res.json({ codigo });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});

// body: { formData, perfil } -> { ok: true }
r.post("/atualizar", async (req, res) => {
  try {
    const { formData, perfil } = req.body || {};
    await atualizarDados(formData, perfil);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});

// body: { formData, perfil } -> { codigo }
r.post("/confirmar", async (req, res) => {
  try {
    const { formData, perfil } = req.body || {};
    const codigo = await confirmarInscricao(formData, perfil);
    res.json({ codigo });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});

// body: { _rowIndex, perfil } -> { ok: true }
r.post("/cancelar", async (req, res) => {
  try {
    const { _rowIndex, perfil } = req.body || {};
    await cancelarInscricao({ _rowIndex }, perfil);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});

/* ===========================
   ASSENTOS (Conselheiros)
   =========================== */
r.get("/inscricoes/assentos/conselheiros", async (_req, res) => {
  try {
    const seats = await getConselheiroSeats();
    // Formato esperado pelo front: [{ seat: 1, name: 'Fulano' }, ...]
    res.json(Array.isArray(seats) ? seats : []);
  } catch (e) {
    console.error(e);
    // Para não travar o front, devolve vazio
    res.json([]);
  }
});

/* ===========================
   Reenviar e-mail de comprovante
   =========================== */
r.post("/inscricoes/:id/reenviar-email", async (req, res) => {
  try {
    const { id } = req.params;
    // Se você tiver serviço real para reenvio, chame-o aqui.
    // await reenviarEmailComprovante(id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Falha ao reenviar e-mail." });
  }
});

export default r;
