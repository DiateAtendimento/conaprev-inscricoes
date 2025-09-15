import { Router } from "express";
import sheetsSvc from "../services/sheets.service.js";

const r = Router();

r.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// teste rápido: título da planilha (valida Sheets + credenciais)
r.get("/test/sheets", async (req, res) => {
  try {
    const meta = await sheetsSvc.getSpreadsheetMeta();
    res.json({ spreadsheetId: meta.spreadsheetId, title: meta.title });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default r;
