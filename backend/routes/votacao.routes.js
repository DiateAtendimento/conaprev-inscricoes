// backend/routes/votacao.routes.js
import { Router } from "express";
import cfg from "../config/env.js";
import {
  listThemesWithLatest,
  listVotesByTema,
  createVote,
  updateVote,
  deleteVote,
  setVoteActive,
  getLatestVoteForTema,
  validateVoter,
  submitVote,
  getVoteResults,
  getVoteById,
  getUserResponseForVote,
} from "../services/votacao.service.js";

const r = Router();

// Guard de administrador (usa header x-admin-pass)
const adminGuard = (req, res, next) => {
  const required = cfg?.adminPass;
  if (!required) return next();
  const got = String(req.headers["x-admin-pass"] || "");
  if (got === String(required)) return next();
  return res.status(401).json({ error: "Não autorizado" });
};

function sendError(res, e, fallback = "Erro interno") {
  const msg = e?.message || fallback;
  return res.status(400).json({ error: String(msg) });
}

// ===== P�blico =====
r.post("/login", async (req, res) => {
  try {
    const cpf = String(req.body?.cpf || "").replace(/\D/g, "");
    const out = await validateVoter(cpf);
    if (!out.ok) return res.json({ ok: false, reason: out.reason });
    return res.json({ ok: true, user: out.user });
  } catch (e) {
    return sendError(res, e, "Erro ao validar CPF");
  }
});

r.get("/temas", async (_req, res) => {
  try {
    const data = await listThemesWithLatest();
    return res.json(data);
  } catch (e) {
    return sendError(res, e, "Erro ao listar temas");
  }
});

r.get("/temas/:tema/latest", async (req, res) => {
  try {
    const tema = String(req.params.tema || "");
    const cpf = String(req.query?.cpf || "").replace(/\D/g, "");
    const vote = await getLatestVoteForTema(tema);
    if (!vote) return res.json({ active: false });
    let previousAnswers = null;
    if (cpf) {
      const valid = await validateVoter(cpf);
      if (valid.ok) {
        const prev = await getUserResponseForVote(vote, cpf);
        if (prev?.answers?.length) previousAnswers = prev.answers;
      }
    }
    return res.json({
      active: !!vote.active,
      vote: vote.active ? vote : null,
      previousAnswers,
    });
  } catch (e) {
    return sendError(res, e, "Erro ao buscar votação");
  }
});

r.post("/votar", async (req, res) => {
  try {
    const { voteId, cpf, answers, durationMs } = req.body || {};
    if (!voteId || !cpf) return res.status(400).json({ error: "Dados incompletos" });
    const out = await submitVote({ voteId, cpf, answers, durationMs });
    return res.json(out);
  } catch (e) {
    return sendError(res, e, "Erro ao enviar voto");
  }
});

// ===== Admin =====
r.get("/admin/temas", adminGuard, async (_req, res) => {
  try {
    const data = await listThemesWithLatest();
    return res.json(data);
  } catch (e) {
    return sendError(res, e, "Erro ao listar temas");
  }
});

r.get("/admin/temas/:tema/votacoes", adminGuard, async (req, res) => {
  try {
    const tema = String(req.params.tema || "");
    const list = await listVotesByTema(tema);
    return res.json(list);
  } catch (e) {
    return sendError(res, e, "Erro ao listar votações");
  }
});

r.post("/admin/votacoes", adminGuard, async (req, res) => {
  try {
    const { tema, questions } = req.body || {};
    if (!tema) return res.status(400).json({ error: "Tema é obrigatório" });
    const out = await createVote({ temaInput: tema, questions });
    return res.status(201).json(out);
  } catch (e) {
    return sendError(res, e, "Erro ao criar votação");
  }
});

r.put("/admin/votacoes/:id", adminGuard, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const { questions } = req.body || {};
    const out = await updateVote(id, { questions });
    return res.json(out);
  } catch (e) {
    return sendError(res, e, "Erro ao atualizar votação");
  }
});

r.delete("/admin/votacoes/:id", adminGuard, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const out = await deleteVote(id);
    return res.json(out);
  } catch (e) {
    return sendError(res, e, "Erro ao excluir votação");
  }
});

r.post("/admin/votacoes/:id/ativar", adminGuard, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const ativo = Boolean(req.body?.ativo);
    const out = await setVoteActive(id, ativo);
    return res.json(out);
  } catch (e) {
    return sendError(res, e, "Erro ao alterar status");
  }
});

r.get("/admin/votacoes/:id/results", adminGuard, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const out = await getVoteResults(id);
    return res.json(out);
  } catch (e) {
    return sendError(res, e, "Erro ao obter resultados");
  }
});

r.get("/admin/votacoes/:id", adminGuard, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const out = await getVoteById(id);
    if (!out) return res.status(404).json({ error: "Votação não encontrada" });
    return res.json(out);
  } catch (e) {
    return sendError(res, e, "Erro ao buscar votação");
  }
});

export default r;

