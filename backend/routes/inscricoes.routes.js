// backend/routes/inscricoes.routes.js
import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { fileURLToPath } from "url";
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

// Perfis válidos para todas as operAções
const PERFIS_OK = new Set([
  "Conselheiro",
  "CNRPPS",
  "Palestrante",
  "Staff",
  "Convidado",
  "Patrocinador",
  "COPAJURE",
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(BACKEND_ROOT, "..");
const BACKEND_PHOTO_DIR = path.resolve(BACKEND_ROOT, "public", "imagens", "fotos-conselheiros");
const ROOT_PHOTO_DIR = path.resolve(REPO_ROOT, "public", "imagens", "fotos-conselheiros");
const PHOTO_DIR = fs.existsSync(BACKEND_PHOTO_DIR) ? BACKEND_PHOTO_DIR : ROOT_PHOTO_DIR;
const MANIFEST_PATH = path.join(PHOTO_DIR, "manifest.json");

function ensurePhotoDir() {
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
}

function sanitizeFileBase(input, fallback = "conselheiro") {
  const raw = String(input || "").trim();
  const base = raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base || fallback;
}

function ensureManifestHas(filename) {
  try {
    ensurePhotoDir();
    let list = [];
    if (fs.existsSync(MANIFEST_PATH)) {
      const raw = fs.readFileSync(MANIFEST_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    }
    if (!list.includes(filename)) {
      list.push(filename);
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify(list, null, 2) + "\n");
    }
  } catch (e) {
    console.error("[POST /inscricoes/foto] Falha ao atualizar manifest.json", e);
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      try { ensurePhotoDir(); } catch {}
      cb(null, PHOTO_DIR);
    },
    filename: (req, file, cb) => {
      const requested = sanitizeFileBase(req.body?.filename);
      const nome = sanitizeFileBase(req.body?.nome);
      const cpf = String(req.body?.cpf || "").replace(/\D/g, "");
      const base = requested || nome || (cpf ? `CPF ${cpf}` : "conselheiro");
      const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
      cb(null, `${base}${ext}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/jpg"].includes(file.mimetype);
    cb(ok ? null : new Error("Formato inválido. Use JPG ou PNG."), ok);
  },
});

// Guard de administrador (usa header x-admin-pass)
const adminGuard = (req, res, next) => {
  const required = cfg?.adminPass;
  if (!required) return next(); // sem senha configurada, libera (�til em dev)
  const got = String(req.headers["x-admin-pass"] || "");
  if (got === String(required)) return next();
  return res.status(401).json({ error: "Não autorizado" });
};

// Utilit�rio: traduz erros do Google (ex.: 429) para HTTP adequado
function sendGoogleError(res, e, fallbackMessage = "Erro interno") {
  const status =
    Number(e?.status) ||
    Number(e?.code) ||
    Number(e?.response?.status) ||
    500;

  // Mensagem mais clara para rate limit
  if (status === 429) {
    return res.status(429).json({
      error:
        "Google Sheets: limite de leitura por minuto excedido. Tente novamente em alguns segundos.",
    });
  }

  const msg =
    e?.response?.data?.error?.message ||
    e?.message ||
    fallbackMessage;

  return res.status(status >= 400 && status < 600 ? status : 500).json({
    error: String(msg),
  });
}

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
 * GET /api/inscricoes/listar?perfil=...&status=ativos|finalizados&q=...&limit=&offset=
 * Lista Inscrições para acompanhamento administrativo.
 * ObservAção: a ordenAção de FINALIZADOS (MAIOR?MENOR por protocolo) j� � feita no service.
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
    return sendGoogleError(res, e, "Erro ao listar inscrições");
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
    const out = await buscarPorCpfSafe(cpf, perfil);
    return res.json(out);
  } catch (e) {
    console.error("[GET /inscricoes/buscar]", e);
    return sendGoogleError(res, e, "Erro ao buscar CPF");
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
    return sendGoogleError(res, e, "Erro ao buscar CPF");
  }
});

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
    return sendGoogleError(res, e, "Erro ao criar inscrição");
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
    return sendGoogleError(res, e, "Erro ao atualizar inscrição");
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
    return sendGoogleError(res, e, "Erro ao marcar conferido");
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

    // Fallback: se Não veio _rowIndex, tenta achar por CPF dentro da mesma aba/perfil
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
    return sendGoogleError(res, e, "Erro ao confirmar inscrição");
  }
});

/**
 * POST /api/inscricoes/foto
 * multipart/form-data: foto (file), nome, cpf, perfil
 */
r.post("/foto", upload.single("foto"), async (req, res) => {
  try {
    const perfil = String(req.body?.perfil || "");
    if (perfil !== "Conselheiro") {
      return res.status(400).json({ error: "Upload de foto disponível apenas para Conselheiro." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Arquivo de foto não enviado." });
    }
    const filename = req.file.filename;
    ensureManifestHas(filename);
    return res.json({
      filename,
      url: `/imagens/fotos-conselheiros/${filename}`
    });
  } catch (e) {
    console.error("[POST /inscricoes/foto]", e);
    return res.status(500).json({ error: e?.message || "Falha ao enviar foto." });
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
    return sendGoogleError(res, e, "Erro ao cancelar inscrição");
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
    // Para esse endpoint, preferimos não estourar erro no front:
    return res.json([]);
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


