import ExcelJS from "exceljs";
import { getSheets } from "./google.service.js";
import cfg from "../config/env.js";

export async function exportSpreadsheetToXlsx() {
  const sheets = await getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: cfg.sheetId });
  const wb = new ExcelJS.Workbook();

  for (const sh of meta.data.sheets || []) {
    const title = sh.properties.title;
    if (title === "Senha") continue; // não exportar
    const ws = wb.addWorksheet(title);
    const vals = await sheets.spreadsheets.values.get({ spreadsheetId: cfg.sheetId, range: `${title}` });
    const rows = vals.data.values || [];
    rows.forEach(r => ws.addRow(r));
    ws.columns.forEach(col => { col.width = Math.min(40, Math.max(10, (col.values || []).reduce((m, v) => Math.max(m, String(v||"").length), 10))); });
    ws.getRow(1).font = { bold: true };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = (meta.data.properties.title || "export") + ".xlsx";
  return { buffer, filename };
}
