import { Router } from "express";
import { buscarPorCpf, inscreverDados, atualizarDados, confirmarInscricao, cancelarInscricao, getConselheiroSeats } from "../services/sheets.service.js";

const r = Router();

// body: { cpf, perfil }
r.post("/buscar", async (req, res) => {
  try {
    const { cpf, perfil } = req.body || {};
    const out = await buscarPorCpf(String(cpf||""), String(perfil||""));
    res.json(out); // null se não achou
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// body: { formData, perfil }
r.post("/criar", async (req, res) => {
  try {
    const { formData, perfil } = req.body || {};
    const codigo = await inscreverDados(formData, perfil);
    res.json({ codigo });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// body: { formData, perfil }
r.post("/atualizar", async (req, res) => {
  try {
    const { formData, perfil } = req.body || {};
    await atualizarDados(formData, perfil);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// body: { formData, perfil }
r.post("/confirmar", async (req, res) => {
  try {
    const { formData, perfil } = req.body || {};
    const codigo = await confirmarInscricao(formData, perfil);
    res.json({ codigo });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// body: { _rowIndex, perfil }
r.post("/cancelar", async (req, res) => {
  try {
    const { _rowIndex, perfil } = req.body || {};
    await cancelarInscricao({ _rowIndex }, perfil);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// GET assentos de conselheiros
r.get("/assentos/conselheiros", async (_req, res) => {
  try {
    const seats = await getConselheiroSeats();
    res.json(seats);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

export default r;
