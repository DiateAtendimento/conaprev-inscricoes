import helmet from "helmet";
import hpp from "hpp";
import rateLimit from "express-rate-limit";

const limiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

export default [
  helmet({ contentSecurityPolicy: false }),
  hpp(),
  limiter,
];
