// backend/services/excel.service.js
import ExcelJS from "exceljs";
import { getSheets } from "./google.service.js";
import cfg from "../config/env.js";

/** decide se a aba entra no export */
function shouldExportSheet(sheetMeta) {
  const title = sheetMeta?.properties?.title || "";
  const hidden = !!sheetMeta?.properties?.hidden;

  if (hidden) return false;
  if (!title) return false;

  const t = String(title).trim();

  // regras de exclusão
  if (t.toLowerCase() === "senha") return false;        // aba sensível
  if (t.startsWith("_")) return false;                  // técnicas/backup
  if (t.startsWith("!")) return false;                  // auxiliares
  if (/templates?/i.test(t)) return false;              // modelos

  return true;
}

/** largura automática de colunas (segura) */
function autosizeColumns(ws) {
  // ExcelJS não calcula sozinho; medimos o maior comprimento de cada coluna
  const colCount = ws.columnCount || 0;
  const MIN = 10;
  const MAX = 40;

  for (let c = 1; c <= colCount; c++) {
    let maxLen = 0;
    ws.getColumn(c).eachCell({ includeEmpty: true }, (cell) => {
      const v = cell?.value;
      const s =
        v == null
          ? ""
          : typeof v === "object" && v.text
          ? String(v.text)
          : String(v);
      if (s.length > maxLen) maxLen = s.length;
    });
    ws.getColumn(c).width = Math.max(MIN, Math.min(MAX, maxLen + 2));
  }
}

/** congela cabeçalho e aplica autofiltro */
function styleHeader(ws) {
  if (ws.rowCount === 0) return;
  const header = ws.getRow(1);
  header.font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // autoFiltro em toda a extensão ocupada
  const lastCol = ws.columnCount;
  if (lastCol > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: lastCol },
    };
  }
}

/** gera timestamp YYYYMMDD-HHMM no fuso de Brasília */
function tsBR() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  return `${y}${m}${d}-${hh}${mm}`;
}

export async function exportSpreadsheetToXlsx() {
  const sheets = await getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: cfg.sheetId });
  const wb = new ExcelJS.Workbook();

  // metadados básicos
  wb.creator = "CONAPREV Inscrições";
  wb.created = new Date();

  const allSheets = meta.data.sheets || [];
  for (const sh of allSheets) {
    if (!shouldExportSheet(sh)) continue;

    const title = sh.properties.title;
    const ws = wb.addWorksheet(title);

    try {
      const vals = await sheets.spreadsheets.values.get({
        spreadsheetId: cfg.sheetId,
        range: `${title}`,
      });
      const rows = vals?.data?.values || [];

      // insere linhas como estão na planilha
      if (rows.length) {
        rows.forEach((r) => ws.addRow(r));
      } else {
        // garante ao menos a primeira linha vazia para não quebrar
        ws.addRow([]);
      }

      styleHeader(ws);
      autosizeColumns(ws);
    } catch (err) {
      // se uma aba falhar, cria uma anotação e segue o baile
      ws.addRow(["[ERRO AO LER ESTA ABA NO GOOGLE SHEETS]"]);
      ws.addRow([String(err?.message || err)]);
      styleHeader(ws);
      autosizeColumns(ws);
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const bookTitle = (meta?.data?.properties?.title || "export").trim();
  const filename = `${bookTitle}_${tsBR()}.xlsx`;

  return {
    buffer,
    filename,
    mime:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}
