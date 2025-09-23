// backend/routes/inscricoes.routes.js
import { Router } from "express";
import {
  buscarPorCpf,
  inscreverDados,
  atualizarDados,
  confirmarInscricao,
  cancelarInscricao,
  getConselheiroSeats,
} from "../services/sheets.service.js";

const r = Router();

/**
 * GET /api/inscricoes/buscar?cpf=...&perfil=...
 * Compat: o front pode chamar GET. Mantemos também o POST abaixo (padrão).
 */
r.get("/buscar", async (req, res) => {
  try {
    const cpf = String(req.query.cpf || "").replace(/\D/g, "");
    const perfil = String(req.query.perfil || "");
    if (cpf.length !== 11) {
      return res.status(400).json({ error: "CPF inválido" });
    }

    const out = await buscarPorCpf(cpf, perfil); // pode ser null
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
    if (cpf.length !== 11) {
      return res.status(400).json({ error: "CPF inválido" });
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
 * Cria (pré-inscreve) e retorna { codigo }
 */
r.post("/criar", async (req, res) => {
  try {
    const { formData, perfil } = req.body || {};
    if (!formData || !perfil) {
      return res.status(400).json({ error: "Dados incompletos" });
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

    await atualizarDados(formData, String(perfil));
    return res.json({ ok: true });
  } catch (e) {
    console.error("[POST /inscricoes/atualizar]", e);
    return res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * POST /api/inscricoes/confirmar
 * body: { formData, perfil }
 * Confirma a inscrição e retorna { codigo }
 */

r.post("/confirmar", async (req, res) => {
  try {
    const { formData = {}, perfil } = req.body || {};
    if (!perfil) return res.status(400).json({ error: "Dados incompletos" });

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
    await cancelarInscricao({ _rowIndex }, String(perfil));
    return res.json({ ok: true });
  } catch (e) {
    console.error("[POST /inscricoes/cancelar]", e);
    return res.status(500).json({ error: String(e.message || e) });
  }
});

/**
 * GET /api/inscricoes/assentos/conselheiros
 * Formato: [{ seat: 1, name: 'Fulano' }, ...]
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
 * (Opcional – stub de geração do PDF)
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
