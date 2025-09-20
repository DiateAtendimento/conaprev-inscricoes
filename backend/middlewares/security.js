// backend/middlewares/security.js
import helmet from "helmet";
import hpp from "hpp";
import rateLimit from "express-rate-limit";

/**
 * Rate limiter “seguro” para produção.
 * – Usa cabeçalhos padrão (RFC)
 * – Evita herdar o trust proxy permissivo (já está em app.set('trust proxy', 1))
 * – Mensagem clara em caso de excesso
 */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 300,                 // ajuste conforme sua necessidade
  standardHeaders: true,    // RateLimit-* headers
  legacyHeaders: false,     // X-RateLimit-* desabilitados
  message: {
    error: "Too many requests, please try again later.",
    code: "RATE_LIMITED",
  },
});

/**
 * Helmet com defaults (pode ajustar CSP depois, se necessário)
 */
const helmetMw = helmet({
  // exemplo: descomente se usar inline styles/scripts e quiser flexibilizar CSP depois
  // contentSecurityPolicy: false,
});

const security = [
  helmetMw,
  hpp(),     // protege contra HTTP Parameter Pollution
  limiter,   // aplica rate limit global
];

export default security;
