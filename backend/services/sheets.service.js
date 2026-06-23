// backend/services/sheets.service.js
import cfg from "../config/env.js";
import { getSheets } from "./google.service.js";
import { normalizeKey, titleCase } from "./normalize.service.js";
import {
  DEFAULT_MAX_INSCRICOES_POR_PERFIL,
  buildCodigoFromSequence,
  findNextAvailableSequence,
} from "./inscricao-sequence.service.js";

const SHEET_ID = cfg.sheetId;

/** =========================================================
 *  CACHE LEVE (mem�ria) p/ leituras do Google Sheets
 *  - TTL curto (default 15s)
 *  - anti-stampede (reaproveita a mesma Promise simult�nea)
 *  - inValidação autom�tica ap�s escritas
 *  ========================================================= */
const CACHE_TTL_DEFAULT_MS = 15_000;
const CACHE_TTL_SEARCH_MS  = 10_000;

const _cache = new Map(); // key -> { expires, data } | Promise
const _ck = (sheetName) => `sheet:${sheetName}`;
const _pk = (sheetName) => `${_ck(sheetName)}:pending`;
const _sequenceLocks = new Map(); // perfil -> Promise

function invalidateSheetCache(sheetName) {
  _cache.delete(_ck(sheetName));
  _cache.delete(_pk(sheetName));
}

async function withSequenceLock(perfil, task) {
  const previous = _sequenceLocks.get(perfil) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  _sequenceLocks.set(perfil, previous.then(() => current));

  await previous;
  try {
    return await task();
  } finally {
    release();
    if (_sequenceLocks.get(perfil) === current) {
      _sequenceLocks.delete(perfil);
    }
  }
}

async function readAllCached(sheetName, ttlMs = CACHE_TTL_DEFAULT_MS) {
  const now = Date.now();
  const key = _ck(sheetName);
  const pendingKey = _pk(sheetName);

  const hit = _cache.get(key);
  if (hit && hit.expires > now) return hit.data;

  if (_cache.has(pendingKey)) {
    return _cache.get(pendingKey); // reaproveita a mesma promessa
  }

  const p = (async () => {
    const res = await readAll(sheetName);
    _cache.set(key, { expires: now + ttlMs, data: res });
    _cache.delete(pendingKey);
    return res;
  })().catch((err) => {
    _cache.delete(pendingKey);
    throw err;
  });

  _cache.set(pendingKey, p);
  return p;
}


const HEADER_ALIASES = {
  numerodeinscricao: "numerodeinscricao",
  cpf: "cpf",
  nome: "nome",
  nomenoprismacracha: "nomenoprismacracha",
  ufsigla: "ufsigla",
  representatividade: "representatividade",
  titularidade: "titularidade",
  cargofuncao: "cargofuncao",
  sigladaentidade: "sigladaentidade",
  identificacao: "identificacao",
  endereco: "endereco",
  emailconselheiroa: "emailconselheiroa",
  emailsecretarioa: "emailsecretarioa",
  convidadopor: "convidadopor",
  email: "email",
  conferido: "conferido",
  conferidopor: "conferidopor",
  conferidoem: "conferidoem"
};

function sheetForPerfil(perfil) {
  const map = {
    Conselheiro: "Conselheiros",
    CNRPPS: "CNRPPS",
    Palestrante: "Palestrantes",
    Staff: "Staffs",
    Convidado: "Convidados",
    Apoiador: "Apoiadores",
    Patrocinador: "Apoiadores",
    COPAJURE: "COPAJURE"
  };
  return map[perfil] || "Banco de dados";
}

const AUTHORIZED_VOTERS_SHEET = "Autorizados para votar";

/* ====== Helpers de tempo (BR) ====== */
// ISO com timezone -03:00 est�vel (sem depender do fuso do servidor)
function nowBRISO() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const dd = parts.day.padStart(2,'0');
  const mm = parts.month.padStart(2,'0');
  const yyyy = parts.year;
  const HH = parts.hour.padStart(2,'0');
  const MM = parts.minute.padStart(2,'0');
  const SS = parts.second.padStart(2,'0');
  return `${yyyy}-${mm}-${dd}T${HH}:${MM}:${SS}-03:00`;
}

// extrai Número para ordenAção (ex.: CNL028 ? 28, PAT-0012 ? 12)
function protoKey(v) {
  const s = String(v || '');
  const m = s.match(/(\d+)/g);
  if (!m) return 0;
  return Math.max(...m.map(n => parseInt(n, 10)).filter(Number.isFinite));
}

export async function getSpreadsheetMeta() {
  const sheets = await getSheets();
  const m = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  return {
    spreadsheetId: SHEET_ID,
    title: m.data?.properties?.title || null,
    sheets: m.data?.sheets?.map(s => ({ title: s.properties.title, sheetId: s.properties.sheetId })) || []
  };
}

async function readAll(sheetName) {
  const sheets = await getSheets();
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${sheetName}` });
  const values = resp.data.values || [];
  const headers = (values[0] || []).map(h => String(h));
  const rows = values.slice(1);
  return { headers, rows };
}

function headerIndex(headers, wantedNorm) {
  const idx = headers.map(normalizeKey).indexOf(wantedNorm);
  return idx; // -1 se Não achou
}

function columnLetterFromIndex(index) {
  if (!Number.isInteger(index) || index < 0) throw new Error("Índice de coluna inválido.");
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function parseRowIndexFromUpdatedRange(updatedRange) {
  const match = String(updatedRange || "").match(/![A-Z]+(\d+):[A-Z]+(\d+)$/i);
  if (!match) return NaN;
  return Number(match[1] || match[2] || NaN);
}

function dedupeItems(items, keyBuilder) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const key = String(keyBuilder(item) || "").trim();
    if (!key) {
      out.push(item);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function buildDisplayDedupKey(item) {
  const cpf = normalizeCpfValue(item?.cpf);
  if (cpf) return `cpf:${cpf}`;

  const codigo = String(item?.numerodeinscricao || "").trim().toUpperCase();
  if (codigo) return `codigo:${codigo}`;

  const nome = normalizeKey(item?.nome || "");
  const sigla = normalizeKey(item?.sigladaentidade || item?.ufsigla || "");
  if (nome) return `nome:${nome}|sigla:${sigla}`;
  return "";
}

function matchQuery(rowObj, q) {
  if (!q) return true;
  const term = String(q).trim().toLowerCase();
  if (!term) return true;
  const cpf = String(rowObj.cpf || "").replace(/\D/g, "");
  const nome = String(rowObj.nome || "").toLowerCase();
  return cpf.includes(term.replace(/\D/g, "")) || nome.includes(term);
}

function isConferido(rowObj) {
  const v = String(rowObj.conferido || "").trim().toUpperCase();
  return v === "SIM" || v === "TRUE" || v === "OK" || v === "1";
}

function mapRow(headers, row) {
  const out = {};
  headers.forEach((h, j) => {
    const norm = normalizeKey(h);
    const key = HEADER_ALIASES[norm] || norm;
    out[key] = row[j] ?? "";
  });
  return out;
}

function rowBelongsToPerfil(rowObj, perfil, sheetName) {
  if (sheetName !== "Apoiadores") return true;
  return String(rowObj.identificacao || "").trim() === String(perfil || "").trim();
}

function getUsedCodesForPerfil(headers, rows, perfil, sheetName) {
  const usedCodes = [];
  rows.forEach((row) => {
    const obj = mapRow(headers, row);
    if (!rowBelongsToPerfil(obj, perfil, sheetName)) return;
    const codigo = String(obj.numerodeinscricao || "").trim();
    if (codigo) usedCodes.push(codigo);
  });
  return usedCodes;
}

function normalizeCpfValue(value) {
  return String(value || "").replace(/\D/g, "");
}

function findRowsByCpfInRows(headers, rows, cpf, perfil, sheetName) {
  const cleanCpf = normalizeCpfValue(cpf);
  const idxCpf = headers.map(normalizeKey).indexOf("cpf");
  if (idxCpf < 0) throw new Error('Cabeçalho "CPF" não encontrado.');

  const matches = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowCpf = normalizeCpfValue(row[idxCpf]);
    if (rowCpf !== cleanCpf) continue;

    const obj = mapRow(headers, row);
    if (!rowBelongsToPerfil(obj, perfil, sheetName)) continue;
    obj._rowIndex = i + 2;
    matches.push({
      rowIndex: i + 2,
      row,
      obj,
    });
  }
  return matches.sort((a, b) => a.rowIndex - b.rowIndex);
}

async function clearRow(sheetName, headers, rowIndex) {
  const sheets = await getSheets();
  const lastColLetter = columnLetterFromIndex(headers.length - 1);
  const range = `${sheetName}!A${rowIndex}:${lastColLetter}${rowIndex}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: "RAW",
    requestBody: { values: [Array(headers.length).fill("")] }
  });
}

async function ensureCodigoForRow(sheetName, headers, rows, rowIndex, perfil) {
  const colCode = headerIndex(headers, "numerodeinscricao");
  if (colCode < 0) throw new Error(`Planilha ${sheetName} está sem a coluna "Número de Inscrição".`);

  const row = rows[rowIndex - 2] || [];
  const currentCode = String(row[colCode] || "").trim();
  if (currentCode) return currentCode;

  const usedCodes = getUsedCodesForPerfil(headers, rows, perfil, sheetName);
  const nextSequence = findNextAvailableSequence(usedCodes, DEFAULT_MAX_INSCRICOES_POR_PERFIL);
  if (!nextSequence) {
    throw new Error(`Limite de ${DEFAULT_MAX_INSCRICOES_POR_PERFIL} inscrições atingido para o perfil ${perfil}.`);
  }

  const codigo = buildCodigoFromSequence(perfil, nextSequence);
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!${columnLetterFromIndex(colCode)}${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: { values: [[codigo]] }
  });
  return codigo;
}

async function reconcileCpfRows({ cpf, perfil, sheetName }) {
  const { headers, rows } = await readAll(sheetName);
  const matches = findRowsByCpfInRows(headers, rows, cpf, perfil, sheetName);
  if (!matches.length) return null;

  const keeper = matches[0];
  const duplicates = matches.slice(1);
  const codigo = await ensureCodigoForRow(sheetName, headers, rows, keeper.rowIndex, perfil);

  for (const duplicate of duplicates) {
    await clearRow(sheetName, headers, duplicate.rowIndex);
  }

  invalidateSheetCache(sheetName);
  return {
    codigo,
    rowIndex: keeper.rowIndex,
  };
}

function validarDados(formData) {
  if (!formData?.cpf || !String(formData.cpf).trim()) throw new Error("Campo obrigat�rio: cpf");
  const clean = normalizeCpfValue(formData.cpf);
  if (!/^\d{11}$/.test(clean)) throw new Error("CPF deve conter apenas Números e ter 11 dígitos.");
  if (!formData?.nome || !String(formData.nome).trim()) throw new Error("Campo obrigat�rio: nome");
}

function createRowFromFormData(formData, perfil, headers) {
  const camposTitle = ["nome","nomenoprismacracha","representatividade","cargofuncao","identificacao","endereco"];
  const obj = headers.map(h => {
    const norm = normalizeKey(h);
    if (norm === "numerodeinscricao") return formData.numerodeinscricao || "";
    if (norm === "cpf") return "'" + String(formData.cpf).replace(/\D/g, "");
    if (norm === "identificacao") return perfil;
    let val = formData[norm] || "";
    if (camposTitle.includes(norm) && val) val = titleCase(val);
    return val;
  });
  return obj;
}

export async function buscarPorCpf(cpf, perfil) {
  const clean = normalizeCpfValue(cpf);
  const sheetName = sheetForPerfil(perfil);
  const { headers, rows } = await readAllCached(sheetName, CACHE_TTL_SEARCH_MS);
  const matches = findRowsByCpfInRows(headers, rows, clean, perfil, sheetName);
  return matches[0]?.obj || null;
}

export async function buscarAutorizadoParaVotarPorCpf(cpf) {
  const clean = String(cpf || "").replace(/\D/g, "");
  const { headers, rows } = await readAllCached(AUTHORIZED_VOTERS_SHEET, CACHE_TTL_SEARCH_MS);
  const idxCpf = headers.map(normalizeKey).indexOf("cpf");
  if (idxCpf < 0) throw new Error('Cabeçalho "CPF" não encontrado na aba "Autorizados para votar".');
  for (let i = 0; i < rows.length; i++) {
    const cell = String(rows[i][idxCpf] || "").replace(/\D/g, "");
    if (cell === clean) {
      const out = mapRow(headers, rows[i]);
      out._rowIndex = i + 2;
      return out;
    }
  }
  return null;
}


export async function inscreverDados(formData, perfil) {
  return withSequenceLock(perfil, async () => {
    validarDados(formData);
    const sheetName = sheetForPerfil(perfil);
    const existing = await reconcileCpfRows({ cpf: formData.cpf, perfil, sheetName });
    if (existing) return existing.codigo;

    const { headers } = await readAll(sheetName);

    formData.numerodeinscricao = "";
    const row = createRowFromFormData(formData, perfil, headers);
    const lastColLetter = columnLetterFromIndex(headers.length - 1);

    const sheets = await getSheets();
    const appendResp = await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A1:${lastColLetter}`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] }
    });

    const reconciled = await reconcileCpfRows({ cpf: formData.cpf, perfil, sheetName });
    if (!reconciled?.codigo) {
      throw new Error("Falha ao consolidar a inscrição após a gravação.");
    }
    return reconciled.codigo;
  });
}

export async function atualizarDados(formData, perfil) {
  validarDados(formData);
  const sheetName = sheetForPerfil(perfil);
  let idx = Number(formData._rowIndex);
  let headers;

  if (formData?.cpf) {
    const reconciled = await reconcileCpfRows({ cpf: formData.cpf, perfil, sheetName });
    if (reconciled?.rowIndex) {
      idx = reconciled.rowIndex;
    }
  }

  if (!idx || idx < 2) throw new Error("Linha inválida.");
  ({ headers } = await readAll(sheetName));
  const row = createRowFromFormData(formData, perfil, headers);
  const range = `${sheetName}!A${idx}:${columnLetterFromIndex(headers.length - 1)}${idx}`;
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range, valueInputOption: "RAW", requestBody: { values: [row] }
  });

  invalidateSheetCache(sheetName);
}

export async function confirmarInscricao(formData, perfil) {
  return withSequenceLock(perfil, async () => {
    const sheetName = sheetForPerfil(perfil);
    if (formData?.cpf) {
      const reconciled = await reconcileCpfRows({ cpf: formData.cpf, perfil, sheetName });
      if (reconciled?.codigo) return reconciled.codigo;
    }

    const idx = Number(formData._rowIndex);
    if (!idx || idx < 2) throw new Error("Linha inválida.");
    const { headers, rows } = await readAll(sheetName);
    const codigo = await ensureCodigoForRow(sheetName, headers, rows, idx, perfil);
    invalidateSheetCache(sheetName);
    return codigo;
  });
}

export async function cancelarInscricao(formData, perfil) {
  const idx = Number(formData._rowIndex);
  if (!idx || idx < 2) throw new Error("Linha inválida.");
  const sheetName = sheetForPerfil(perfil);
  const { headers } = await readAllCached(sheetName, CACHE_TTL_DEFAULT_MS);
  const colCode = headerIndex(headers, "numerodeinscricao");
  if (colCode < 0) throw new Error(`Planilha ${sheetName} está sem a coluna "Número de Inscrição".`);

  const sheets = await getSheets();
  const lastColLetter = columnLetterFromIndex(headers.length - 1);
  const range = `${sheetName}!A${idx}:${lastColLetter}${idx}`;

  const curResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range
  });
  const row = (curResp.data.values && curResp.data.values[0]) ? curResp.data.values[0] : [];
  while (row.length < headers.length) row.push("");
  row[colCode] = "";

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: "RAW",
    requestBody: { values: [row] }
  });

  invalidateSheetCache(sheetName);
}


export async function getConselheiroSeats() {
  const sheetName = sheetForPerfil("Conselheiro");
  const { headers, rows } = await readAllCached(sheetName, CACHE_TTL_DEFAULT_MS);
  const normHdrs = headers.map(h => normalizeKey(h));
  const idxCode = normHdrs.indexOf("numerodeinscricao");
  const idxName = normHdrs.indexOf("nome");
  const idxCpf = normHdrs.indexOf("cpf");
  if (idxCode < 0 || idxName < 0) throw new Error('Cabeçalhos "Número de Inscrição" ou "Nome" não encontrados.');
  const seats = [];
  rows.forEach(r => {
    const code = r[idxCode];
    const name = r[idxName];
    const cpf = idxCpf >= 0 ? r[idxCpf] : "";
    if (code && String(name || "").trim() && String(cpf || "").trim()) {
      const num = parseInt(String(code).replace(/\D/g, ""), 10);
      if (!isNaN(num)) seats.push({ seat: num, name });
    }
  });
  return seats;
}

export async function getProGestaoMap() {
  const sheetName = "ProGestao";
  const { headers, rows } = await readAllCached(sheetName, CACHE_TTL_DEFAULT_MS);
  const idxEnte = headerIndex(headers, "entefederativo");
  const idxUf = headerIndex(headers, "uf");
  const idxNivel = headerIndex(headers, "nivelatual");
  if (idxEnte < 0 || idxUf < 0 || idxNivel < 0) {
    throw new Error('Aba "ProGestao" está sem colunas obrigatórias.');
  }
  const map = {};
  rows.forEach((row) => {
    const ente = String(row[idxEnte] || "").trim();
    const uf = String(row[idxUf] || "").trim();
    const nivel = String(row[idxNivel] || "").trim();
    if (!ente || !uf) return;
    const key = `${normalizeKey(ente)}|${normalizeKey(uf)}`;
    map[key] = nivel;
  });
  return map;
}

export async function listStaffGallery() {
  const sheetName = sheetForPerfil("Staff");
  const { headers, rows } = await readAllCached(sheetName, CACHE_TTL_DEFAULT_MS);
  const normHdrs = headers.map(h => normalizeKey(h));
  const idxCode = normHdrs.indexOf("numerodeinscricao");
  const idxName = normHdrs.indexOf("nome");
  const idxSigla = normHdrs.indexOf("sigladaentidade");
  if (idxCode < 0 || idxName < 0) throw new Error('Cabeçalhos "Número de Inscrição" ou "Nome" não encontrados.');

  const out = [];
  rows.forEach(r => {
    const code = r[idxCode];
    const name = r[idxName];
    if (!String(code || "").trim() || !String(name || "").trim()) return;
    out.push({
      numerodeinscricao: code,
      nome: name,
      sigladaentidade: idxSigla >= 0 ? r[idxSigla] : ""
    });
  });
  out.sort((a, b) => protoKey(a.numerodeinscricao) - protoKey(b.numerodeinscricao));
  return dedupeItems(out, buildDisplayDedupKey);
}

export async function listPalestrantesGallery() {
  const sheetName = sheetForPerfil("Palestrante");
  const { headers, rows } = await readAllCached(sheetName, CACHE_TTL_DEFAULT_MS);
  const normHdrs = headers.map(h => normalizeKey(h));
  const idxName = normHdrs.indexOf("nome");
  const idxCode = normHdrs.indexOf("numerodeinscricao");
  const idxUfSigla = normHdrs.indexOf("ufsigla");
  if (idxName < 0) throw new Error('Cabeçalho "Nome" não encontrado.');
  if (idxCode < 0) throw new Error('Cabeçalho "Número de Inscrição" não encontrado.');

  const out = [];
  rows.forEach(r => {
    const name = r[idxName];
    const code = r[idxCode];
    if (!String(name || "").trim() || !String(code || "").trim()) return;
    out.push({
      nome: name,
      ufsigla: idxUfSigla >= 0 ? r[idxUfSigla] : ""
    });
  });
  out.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", { sensitivity: "base" }));
  return dedupeItems(out, buildDisplayDedupKey);
}

export async function listInscricoesGallery(perfil) {
  const sheetName = sheetForPerfil(perfil);
  const { headers, rows } = await readAllCached(sheetName, CACHE_TTL_DEFAULT_MS);
  const normHdrs = headers.map(h => normalizeKey(h));
  const idxCode = normHdrs.indexOf("numerodeinscricao");
  const idxName = normHdrs.indexOf("nome");
  const idxSigla = normHdrs.indexOf("sigladaentidade");
  const idxUfSigla = normHdrs.indexOf("ufsigla");

  if (idxCode < 0) throw new Error('Cabeçalho "Número de Inscrição" não encontrado.');
  if (idxName < 0) throw new Error('Cabeçalho "Nome" não encontrado.');

  const out = [];
  rows.forEach((r) => {
    const code = r[idxCode];
    const name = r[idxName];
    if (!String(code || "").trim() || !String(name || "").trim()) return;
    out.push({
      numerodeinscricao: code,
      nome: name,
      cpf: normHdrs.indexOf("cpf") >= 0 ? normalizeCpfValue(r[normHdrs.indexOf("cpf")]) : "",
      sigladaentidade: idxSigla >= 0 ? r[idxSigla] : "",
      ufsigla: idxUfSigla >= 0 ? r[idxUfSigla] : "",
      perfil: String(perfil || ""),
    });
  });

  out.sort((a, b) => protoKey(a.numerodeinscricao) - protoKey(b.numerodeinscricao));
  return dedupeItems(out, buildDisplayDedupKey);
}


export async function listarInscricoes(perfil, status = "ativos", q = "", { limit = 200, offset = 0, hasProtocol = false } = {}) {
  const sheetName = sheetForPerfil(perfil);
  const { headers, rows } = await readAllCached(sheetName, CACHE_TTL_DEFAULT_MS);

  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const obj = mapRow(headers, rows[i]);
    obj._rowIndex = i + 2; // cabeçalho + 1-based

    // status: ativos => Não conferidos | finalizados => conferidos
    const conf = isConferido(obj);
    const wantFinalizados = (String(status).toLowerCase() === "finalizados");
    if (wantFinalizados ? !conf : conf) continue;

    // filtro por CPF/Nome (CPF normalizado)
    obj.cpf = String(obj.cpf || "").replace(/^'+/, ""); // tira ap�strofo
    if (!matchQuery(obj, q)) continue;

    const item = {
      _rowIndex: obj._rowIndex,
      numerodeinscricao: obj.numerodeinscricao || "",
      cpf: String(obj.cpf || "").replace(/\D/g, ""), // Só Números para exibição/consulta
      nome: obj.nome || "",
      conferido: obj.conferido || "",
      conferidopor: obj.conferidopor || "",
      conferidoem: obj.conferidoem || "",
    };
    if (hasProtocol && !String(item.numerodeinscricao || "").trim()) continue;
    out.push(item);
  }

  const deduped = dedupeItems(out, buildDisplayDedupKey);

  // OrdenAção server-side para FINALIZADOS: MAIOR ? MENOR por Número do protocolo
  if (String(status).toLowerCase() === "finalizados") {
    deduped.sort((a, b) => protoKey(b.numerodeinscricao) - protoKey(a.numerodeinscricao));
  }

  // paginAção
  const start = Math.max(0, offset);
  const end = Math.min(deduped.length, start + Math.max(1, limit));
  return deduped.slice(start, end);
}

export async function marcarConferido({ _rowIndex, perfil, conferido, conferidoPor }) {
  const idx = Number(_rowIndex);
  if (!idx || idx < 2) throw new Error("Linha inválida.");
  const sheetName = sheetForPerfil(perfil);

  const { headers } = await readAllCached(sheetName, CACHE_TTL_DEFAULT_MS);
  const colConf    = headerIndex(headers, "conferido");
  const colPor     = headerIndex(headers, "conferidopor");
  const colEm      = headerIndex(headers, "conferidoem");

  if (colConf < 0 || colPor < 0 || colEm < 0) {
    throw new Error(`Planilha ${sheetName} está sem as colunas de conferência (Conferido/ConferidoPor/ConferidoEm).`);
  }

  const sheets = await getSheets();

  // valores a gravar
  const valConf = conferido ? "SIM" : "";
  const valPor  = conferido ? (conferidoPor || "") : "";
  const valEm   = conferido ? nowBRISO() : ""; // ISO com timezone BR (-03:00)

  // range da linha inteira (para montar o array completo com as 3 posi��es)
  const lastColLetter = columnLetterFromIndex(headers.length - 1);
  const range = `${sheetName}!A${idx}:${lastColLetter}${idx}`;

  // lá a linha atual
  const curResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range
  });
  const row = (curResp.data.values && curResp.data.values[0]) ? curResp.data.values[0] : [];
  // garante tamanho
  while (row.length < headers.length) row.push("");

  row[colConf] = valConf;
  row[colPor]  = valPor;
  row[colEm]   = valEm;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: "RAW",
    requestBody: { values: [row] }
  });

  invalidateSheetCache(sheetName);

  return { ok: true };
}
