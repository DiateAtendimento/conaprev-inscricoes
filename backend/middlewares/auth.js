import cfg from "../config/env.js";

export function requireApiKey(req, res, next) {
  const key = req.get("x-api-key") || req.query.api_key;
  if (!cfg.apiKey) return res.status(500).json({ error: "API_KEY not configured" });
  if (key !== cfg.apiKey) return res.status(401).json({ error: "Invalid API key" });
  next();
}
