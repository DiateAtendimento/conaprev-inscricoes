// backend/middlewares/cors.js
import cors from "cors";
import cfg from "../config/env.js";

// Helpers para normalizar e aceitar domínios comuns do projeto
function norm(url = "") {
  try { return new URL(url).origin; } catch { return String(url).replace(/\/+$/, ""); }
}
const allowed = new Set((cfg.corsAllow || []).map(norm));

// Aceita automaticamente localhost (dev) e o domínio do Render do serviço
const extraAllow = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "https://conaprev-inscricoes.onrender.com",
];
extraAllow.forEach(o => allowed.add(o));

const corsMw = cors({
  origin(origin, cb) {
    // Sem origin (ex: curl/health) → libera
    if (!origin) return cb(null, true);
    const o = norm(origin);
    if (allowed.size === 0 || allowed.has(o)) return cb(null, true);
    return cb(new Error("CORS blocked"), false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Admin-Pass",
    "x-admin-pass", // variante minúscula por segurança
  ],
  credentials: false,              // deixe false: não usamos cookies/sessão
  optionsSuccessStatus: 204,
});

export default corsMw;
