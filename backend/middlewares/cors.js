import cors from "cors";
import cfg from "../config/env.js";

const corsMw = cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl/health
    if (cfg.corsAllow.length === 0 || cfg.corsAllow.includes(origin)) return cb(null, true);
    return cb(new Error("CORS blocked"), false);
  },
});

export default corsMw;
