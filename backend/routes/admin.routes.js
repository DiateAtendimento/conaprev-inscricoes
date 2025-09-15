import { Router } from "express";
import { requireApiKey } from "../middlewares/auth.js";
import { exportSpreadsheetToXlsx } from "../services/excel.service.js";

const r = Router();

// retorna .xlsx com todas as abas (menos "Senha"), gerado localmente (SEM Drive)
r.get("/exportar", requireApiKey, async (_req, res) => {
  try {
    const { buffer, filename } = await exportSpreadsheetToXlsx();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

export default r;
