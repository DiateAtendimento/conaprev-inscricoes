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

  // regras de exclus�o
  if (t.toLowerCase() === "senha") return false; // aba sens�vel
  if (t.startsWith("_")) return false;           // t�cnicas/backup
  if (t.startsWith("!")) return false;           // auxiliares
  if (/templates?/i.test(t)) return false;       // modelos

  return true;
}

/** gera timestamp YYYYMMDD-HHMM no fuso de Bras�lia */
function tsBR() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  const pad = (s) => String(s).padStart(2, "0");
  const y = parts.year;
  const m = pad(parts.month);
  const d = pad(parts.day);
  const hh = pad(parts.hour);
  const mm = pad(parts.minute);
  return `${y}${m}${d}-${hh}${mm}`;
}

/** largura autom�tica de colunas (segura) */
function autosizeColumns(ws) {
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

/** congela cabe�alho e aplica autofiltro */
function styleHeader(ws) {
  if (ws.rowCount === 0) return;
  const header = ws.getRow(1);
  header.font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const lastCol = ws.columnCount;
  if (lastCol > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: lastCol },
    };
  }
}

/** sanitiza nome de worksheet (Excel: m�x 31 chars; sem : \ / ? * [ ] ) e garante unicidade */
function makeWorksheetNameFactory() {
  const used = new Set();
  const ILLEGAL = /[:\\\/\?\*\[\]]/g;

  const sanitize = (t) => {
    let s = String(t || "").trim().replace(ILLEGAL, "_");
    if (!s) s = "Aba";
    // remove quebras/ctl
    s = s.replace(/[\u0000-\u001F\u007F]/g, " ");
    // limita 31 chars
    if (s.length > 31) s = s.slice(0, 31);
    return s;
  };

  return (raw) => {
    let base = sanitize(raw);
    let name = base;
    let i = 2;
    while (used.has(name)) {
      const suffix = ` (${i})`;
      const maxBase = 31 - suffix.length;
      name = (base.length > maxBase ? base.slice(0, maxBase) : base) + suffix;
      i++;
    }
    used.add(name);
    return name;
  };
}

export async function exportSpreadsheetToXlsx() {
  const sheets = await getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: cfg.sheetId });

  const wb = new ExcelJS.Workbook();
  wb.creator = "CONAPREV Inscrições";
  wb.created = new Date();

  const allSheets = meta.data.sheets || [];
  const exportables = allSheets.filter(shouldExportSheet);

  // nada a exportar?
  if (!exportables.length) {
    const ws = wb.addWorksheet("Export");
    ws.addRow(["Não há abas públicas para exportar."]);
    styleHeader(ws);
    autosizeColumns(ws);
    const bufferEmpty = await wb.xlsx.writeBuffer();
    const filenameEmpty = `export_${tsBR()}.xlsx`;
    return {
      buffer: bufferEmpty,
      filename: filenameEmpty,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  // Tenta ler todas as abas de uma vez (menos chamadas ? menos 429)
  const ranges = exportables.map((sh) => sh.properties.title);
  let valueRanges = null;

  try {
    const batch = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: cfg.sheetId,
      ranges,
    });
    valueRanges = batch?.data?.valueRanges || [];
  } catch (err) {
    // Se o batch falhar (ex.: 429), vamos cair para leitura individual abaixo
    valueRanges = null;
  }

  const makeName = makeWorksheetNameFactory();

  // Se veio pelo batch, monta direto; sen�o, faz get por aba com try/catch individual
  if (valueRanges && valueRanges.length === exportables.length) {
    exportables.forEach((sh, i) => {
      const title = sh.properties.title;
      const wsName = makeName(title);
      const ws = wb.addWorksheet(wsName);

      try {
        const rows = valueRanges[i]?.values || [];
        if (rows.length) {
          rows.forEach((r) => ws.addRow(r));
        } else {
          ws.addRow([]);
        }
      } catch (err) {
        ws.addRow(["[ERRO AO LER ESTA ABA NO GOOGLE SHEETS]"]);
        ws.addRow([String(err?.message || err)]);
      }

      styleHeader(ws);
      autosizeColumns(ws);
    });
  } else {
    // Fallback: leitura individual (mant�m resili�ncia por aba)
    for (const sh of exportables) {
      const title = sh.properties.title;
      const wsName = makeName(title);
      const ws = wb.addWorksheet(wsName);

      try {
        const vals = await sheets.spreadsheets.values.get({
          spreadsheetId: cfg.sheetId,
          range: `${title}`,
        });
        const rows = vals?.data?.values || [];

        if (rows.length) {
          rows.forEach((r) => ws.addRow(r));
        } else {
          ws.addRow([]);
        }
      } catch (err) {
        ws.addRow(["[ERRO AO LER ESTA ABA NO GOOGLE SHEETS]"]);
        ws.addRow([String(err?.message || err)]);
      }

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
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

