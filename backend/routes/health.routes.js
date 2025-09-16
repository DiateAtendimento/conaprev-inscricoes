// backend/routes/health.routes.js
import { Router } from "express";
import { getSpreadsheetMeta } from "../services/sheets.service.js"; // <= aqui!

const r = Router();

r.get("/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

r.get("/test/sheets", async (_req, res) => {
  try {
    const meta = await getSpreadsheetMeta(); // <= e aqui
    res.json({ spreadsheetId: meta.spreadsheetId, title: meta.title });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default r;
