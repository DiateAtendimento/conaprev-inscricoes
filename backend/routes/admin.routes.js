// backend/routes/admin.routes.js
import { Router } from "express";
import cfg from "../config/env.js";
import { exportSpreadsheetToXlsx } from "../services/excel.service.js";

const r = Router();

// Mesmo guard usado no restante do admin: header X-Admin-Pass
const adminGuard = (req, res, next) => {
  const required = cfg?.adminPass;
  if (!required) return next(); // se n�o configurar senha, libera (�til em dev)
  const got = String(req.headers["x-admin-pass"] || "");
  if (got === String(required)) return next();
  return res.status(401).json({ error: "N�o autorizado" });
};

// GET /api/export/xlsx  ? baixa a planilha completa (todas as abas v�lidas) em XLSX
r.get("/xlsx", adminGuard, async (_req, res) => {
  try {
    const { buffer, filename, mime } = await exportSpreadsheetToXlsx();
    res.setHeader("Content-Type", mime || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename || "export.xlsx"}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(buffer);
  } catch (e) {
    console.error("[GET /api/export/xlsx]", e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Alias legacy para compatibilidade antiga: /api/exportar
r.get("/exportar", adminGuard, async (_req, res) => {
  try {
    const { buffer, filename, mime } = await exportSpreadsheetToXlsx();
    res.setHeader("Content-Type", mime || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename || "export.xlsx"}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(buffer);
  } catch (e) {
    console.error("[GET /api/exportar]", e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

export default r;

