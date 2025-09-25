// backend/middlewares/cors.js
import cors from "cors";
import cfg from "../config/env.js";

// Normaliza para origin (sem path)
function norm(url = "") {
  try { return new URL(url).origin; }
  catch { return String(url).replace(/\/+$/, ""); }
}

// Base vinda do .env (CORS_ALLOW)
const allowed = new Set((cfg.corsAllow || []).map(norm));

// Extras úteis do projeto (dev + produção)
const extraAllow = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://conaprev-inscricoes.netlify.app",      // 🔸 frontend (Netlify)
  "https://conaprev-inscricoes.onrender.com",     // 🔸 backend (Render)
];
extraAllow.forEach(o => allowed.add(o));

// Permite também “deploy previews” do Netlify (*.netlify.app)
function isAllowed(origin) {
  const o = norm(origin);
  if (allowed.size === 0) return true;
  if (allowed.has(o)) return true;
  if (o.endsWith(".netlify.app")) return true;    // opcional, útil p/ previews
  return false;
}

const corsMw = cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);           // ex.: curl/health
    return isAllowed(origin) ? cb(null, true) : cb(new Error("CORS blocked"), false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  // 🔴 Inclui Cache-Control/Pragma (necessários p/ o preflight do download)
  allowedHeaders: [
    "Content-Type",
    "Accept",
    "X-Admin-Pass",
    "x-admin-pass",     // variante minúscula
    "Cache-Control",
    "Pragma",
  ],
  // 🔴 Exponha o header para o front poder ler o filename do XLSX
  exposedHeaders: ["Content-Disposition"],
  credentials: false,        // não usamos cookies/sessão
  optionsSuccessStatus: 204,
  maxAge: 86400,             // cache do preflight (1 dia)
});

export default corsMw;
