// backend/routes/inscricoes.routes.js
import { Router } from "express";
import cfg from "../config/env.js";
import {
  buscarPorCpf,
  inscreverDados,
  atualizarDados,
  confirmarInscricao,
  cancelarInscricao,
  getConselheiroSeats,
  listarInscricoes,
  marcarConferido,
} from "../services/sheets.service.js";

const r = Router();

// Perfis válidos para todas as operações
const PERFIS_OK = new Set([
  "Conselheiro",
  "CNRPPS",
  "Palestrante",
  "Staff",
  "Convidado",
  "Patrocinador",
  "COPAJURE",
]);

// Guard de administrador (usa header x-admin-pass)
const adminGuard = (req, res, next) => {
  const required = cfg?.adminPass;
  if (!required) return next(); // sem senha configurada, libera
  const got = String(req.headers["x-admin-pass"] || "");
  if (got === String(required)) return next();
  return res.status(401).json({ error: "Não autorizado" });
};

/**
 * GET /api/inscricoes/listar?perfil=...&status=ativos|finalizados&q=...&limit=&offset=
 * Lista inscrições para acompanhamento administrativo.
 * Obs.: a ordenação “finalizados do MAIOR→MENOR protocolo” já está garantida no frontend.
 * Se quiser mover a ordenação para o backend, ajustamos em sheets.service.js (listarInscricoes).
 */
r.get("/listar", adminGuard, async (req, res) => {
  try {
    const perfil = String(req.query.perfil || "");
    const status = String(req.query.status || "ativos");
    const q = String(req.query.q || "");
    const limit = Math.min(parseInt(req.query.limit || "200", 10) || 200, 500);
    const offset = Math.max(parseInt(req.query.offset || "0", 10) || 0, 0);

    if (!PERFIS_OK.has(perfil)) {
      return res.status(400).json({ error: "Perfil inválido" });
    }

    const out = await listarInscricoes(perfil, status, q, { limit, offset });
    return res.json(Array.isArray(out) ? out : []);
  } catch (e) {
    console.error("[GET /inscricoes/listar]", e);
    return res.status(500).json({ error: "Erro ao listar inscrições" });
  }
});

/**
 * GET /api/inscricoes/buscar?cpf=...&perfil=...
 */
r.get("/buscar", async (req, res) => {
  try {
    const cpf = String(req.query.cpf || "").replace(/\D/g, "");
    const perfil = String(req.query.perfil || "");
    if (cpf.length !== 11) return res.status(400).json({ error: "CPF inválido" });
    if (perfil && !PERFIS_OK.has(perfil)) {
      return res.status(400).json({ error: "Perfil inválido" });
    }
    const out = await buscarPorCpf(cpf, perfil);
    return res.json(out);
  } catch (e) {
    console.error("[GET /inscricoes/buscar]", e);
    return res.status(500).json({ error: "Erro ao buscar CPF" });
  }
});

/**
 * POST /api/inscricoes/buscar
 * body: { cpf, perfil }
 */
r.post("/buscar", async (req, res) => {
  try {
    const cpf = String(req.body?.cpf || "").replace(/\D/g, "");
    const perfil = String(req.body?.perfil || "");
    if (cpf.length !== 11) return res.status(400).json({ error: "CPF inválido" });
    if (perfil && !PERFIS_OK.has(perfil)) {
      return res.status(400).json({ error: "Perfil inválido" });
    }
    const out = await buscarPorCpfSafe(cpf, perfil);
    return res.json(out);
  } catch (e) {
    console.error("[POST /inscricoes/buscar]", e);
    return res.status(500).json({ error: "Erro ao buscar CPF" });
  }
});

// helper para normalizar e tolerar exceptions pequenas
async function buscarPorCpfSafe(cpf, perfil) {
  try {
    return await buscarPorCpf(cpf, perfil);
  } catch (e) {
    console.error("buscarPorCpfSafe:", e);
    return null;
  }
}

/**
 * POST /api/inscricoes/criar
 * body: { formData, perfil }
 */
r.post("/criar", async (req, res) => {
  try {
    const { formData, perfil } = req.body || {};
    if (!formData || !perfil) {
      return res.status(400).json({ error: "Dados incompletos" });
    }
    if (!PERFIS_OK.has(String(perfil))) {
      return res.status(400).json({ error: "Perfil inválido" });
    }

    const codigo = await inscreverDados(formData, String(perfil));
    return res.status(201).json({ codigo });
  } catch (e) {
    console.error("[POST /inscricoes/criar]", e);
    return res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * POST /api/inscricoes/atualizar
 * body: { formData, perfil }
 */
r.post("/atualizar", async (req, res) => {
  try {
    const { formData, perfil } = req.body || {};
    if (!formData || !perfil) {
      return res.status(400).json({ error: "Dados incompletos" });
    }
    if (!PERFIS_OK.has(String(perfil))) {
      return res.status(400).json({ error: "Perfil inválido" });
    }

    await atualizarDados(formData, String(perfil));
    return res.json({ ok: true });
  } catch (e) {
    console.error("[POST /inscricoes/atualizar]", e);
    return res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * POST /api/inscricoes/conferir
 * body: { _rowIndex, perfil, conferido: boolean, conferidoPor?: string }
 */
r.post("/conferir", adminGuard, async (req, res) => {
  try {
    const { _rowIndex, perfil, conferido, conferidoPor } = req.body || {};
    if (!_rowIndex || Number(_rowIndex) < 2 || !perfil) {
      return res.status(400).json({ error: "Dados incompletos (_rowIndex e perfil são obrigatórios)" });
    }
    if (!PERFIS_OK.has(String(perfil))) {
      return res.status(400).json({ error: "Perfil inválido" });
    }

    const ok = await marcarConferido({
      _rowIndex: Number(_rowIndex),
      perfil: String(perfil),
      conferido: Boolean(conferido),
      conferidoPor: String(conferidoPor || ""),
    });
    return res.json({ ok: !!ok });
  } catch (e) {
    console.error("[POST /inscricoes/conferir]", e);
    return res.status(500).json({ error: "Erro ao marcar conferido" });
  }
});

/**
 * POST /api/inscricoes/confirmar
 * body: { formData, perfil }
 */
r.post("/confirmar", async (req, res) => {
  try {
    const { formData = {}, perfil } = req.body || {};
    if (!perfil) return res.status(400).json({ error: "Dados incompletos" });
    if (!PERFIS_OK.has(String(perfil))) {
      return res.status(400).json({ error: "Perfil inválido" });
    }

    // Fallback: se não veio _rowIndex, tenta achar por CPF dentro da mesma aba/perfil
    if ((!formData._rowIndex || Number(formData._rowIndex) < 2) && formData.cpf) {
      const achado = await buscarPorCpf(String(formData.cpf), String(perfil));
      if (!achado) {
        return res.status(404).json({ error: "Registro não encontrado para confirmar (CPF não localizado nesse perfil)." });
      }
      formData._rowIndex = achado._rowIndex;
    }

    if (!formData._rowIndex || Number(formData._rowIndex) < 2) {
      return res.status(400).json({ error: "Linha inválida (faltou _rowIndex)." });
    }

    const codigo = await confirmarInscricao(formData, String(perfil));
    return res.json({ codigo });
  } catch (e) {
    console.error("[POST /inscricoes/confirmar]", e);
    return res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * POST /api/inscricoes/cancelar
 * body: { _rowIndex, perfil }
 */
r.post("/cancelar", async (req, res) => {
  try {
    const { _rowIndex, perfil } = req.body || {};
    if (_rowIndex == null || perfil == null) {
      return res.status(400).json({ error: "Dados incompletos" });
    }
    if (!PERFIS_OK.has(String(perfil))) {
      return res.status(400).json({ error: "Perfil inválido" });
    }

    await cancelarInscricao({ _rowIndex }, String(perfil));
    return res.json({ ok: true });
  } catch (e) {
    console.error("[POST /inscricoes/cancelar]", e);
    return res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * GET /api/inscricoes/assentos/conselheiros
 */
r.get("/assentos/conselheiros", async (_req, res) => {
  try {
    const seats = await getConselheiroSeats();
    return res.json(Array.isArray(seats) ? seats : []);
  } catch (e) {
    console.error("[GET /inscricoes/assentos/conselheiros]", e);
    return res.json([]); // vazio p/ não travar o front
  }
});

/**
 * GET /api/inscricoes/:id/comprovante.pdf
 */
r.get("/:id/comprovante.pdf", async (req, res) => {
  try {
    const { id } = req.params;
    // TODO: gerar/streamar PDF com base no id/codigo
    return res.status(404).type("application/json").send({
      error: "Geração de PDF não implementada",
      hint: `Implemente a geração do comprovante do id=${id} no controller/service.`,
    });
  } catch (e) {
    console.error("[GET /inscricoes/:id/comprovante.pdf]", e);
    return res.status(500).json({ error: "Erro ao gerar comprovante" });
  }
});

export default r;
