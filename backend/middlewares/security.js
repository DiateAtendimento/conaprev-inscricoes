import helmet from "helmet";
import hpp from "hpp";
import rateLimit from "express-rate-limit";

const RATE_LIMIT_MESSAGE = {
  error: "Too many requests, please try again later.",
  code: "RATE_LIMITED",
};

const helmetMw = helmet({
  // contentSecurityPolicy: false,
});

function createLimiter({ windowMs, max, skip }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: RATE_LIMIT_MESSAGE,
    skip,
  });
}

// Mantem protecao geral da API, mas sem derrubar o fluxo publico de votacao.
const generalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 500,
  skip: (req) => req.path.startsWith("/api/votacao"),
});

// Fluxo de votacao com limite mais folgado para cenarios de evento/rede compartilhada.
const votingLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 2500,
});

const securityBase = [
  helmetMw,
  hpp(),
];

export { generalLimiter, votingLimiter };
export default securityBase;
