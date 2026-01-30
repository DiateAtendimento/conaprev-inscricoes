// backend/services/sheets.service.js
import cfg from "../config/env.js";
import { getSheets } from "./google.service.js";
import { normalizeKey, titleCase } from "./normalize.service.js";

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

function invalidateSheetCache(sheetName) {
  _cache.delete(_ck(sheetName));
  _cache.delete(_pk(sheetName));
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

const PROFILE_PREFIX = {
  "Conselheiro": "CNL",
  "CNRPPS": "CJU",
  "Palestrante": "PLT",
  "Staff": "STF",
  "Convidado": "CON",
  "Patrocinador": "PAT",
  "COPAJURE": "CPJ"
};

function sheetForPerfil(perfil) {
  const map = {
    Conselheiro: "Conselheiros",
    CNRPPS: "CNRPPS",
    Palestrante: "Palestrantes",
    Staff: "Staffs",
    Convidado: "Convidados",
    Patrocinador: "Patrocinadores",
    COPAJURE: "COPAJURE"
  };
  return map[perfil] || "Banco de dados";
}

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

function validarDados(formData) {
  if (!formData?.cpf || !String(formData.cpf).trim()) throw new Error("Campo obrigat�rio: cpf");
  const clean = String(formData.cpf).replace(/\D/g, "");
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
  const clean = String(cpf||"").replace(/\D/g, "");
  const sheetName = sheetForPerfil(perfil);
  const { headers, rows } = await readAllCached(sheetName, CACHE_TTL_SEARCH_MS);
  const idxCpf = headers.map(normalizeKey).indexOf("cpf");
  if (idxCpf < 0) throw new Error('Cabeçalho "CPF" não encontrado.');
  for (let i = 0; i < rows.length; i++) {
    const cell = String(rows[i][idxCpf] || "").replace(/\D/g, "");
    if (cell === clean) {
      const out = mapRow(headers, rows[i]);
      out._rowIndex = i + 2; // 1-based + header
      return out;
    }
  }
  return null;
}


async function gerarNumeroInscricao(perfil) {
  const sheetName = sheetForPerfil(perfil);
  const sheets = await getSheets();
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${sheetName}!A2:A` });
  const nums = (resp.data.values || [])
    .flat()
    .map(v => parseInt(String(v).replace(/^\D+/, ""), 10))
    .filter(n => !isNaN(n))
    .sort((a,b)=>a-b);
  for (let i = 1; i <= 500; i++) if (!nums.includes(i)) return ("00" + i).slice(-3);
  throw new Error("Limite de inscrições atingido");
}

export async function inscreverDados(formData, perfil) {
  validarDados(formData);
  const exists = await buscarPorCpf(formData.cpf, perfil);
  if (exists) throw new Error("CPF já inscrito neste perfil.");

  const prefix = PROFILE_PREFIX[perfil] || "";
  const raw = await gerarNumeroInscricao(perfil);
  const codigo = prefix + raw;

  const sheetName = sheetForPerfil(perfil);
  const { headers } = await readAllCached(sheetName, CACHE_TTL_DEFAULT_MS);
  formData.numerodeinscricao = codigo;
  const row = createRowFromFormData(formData, perfil, headers);

  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A1:${String.fromCharCode(64 + headers.length)}`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] }
  });

  // ap�s escrita, invalida cache dessa aba
  invalidateSheetCache(sheetName);

  return codigo;
}

export async function atualizarDados(formData, perfil) {
  validarDados(formData);
  const sheetName = sheetForPerfil(perfil);
  const { headers } = await readAllCached(sheetName, CACHE_TTL_DEFAULT_MS);
  const idx = Number(formData._rowIndex);
  if (!idx || idx < 2) throw new Error("Linha inválida.");
  const row = createRowFromFormData(formData, perfil, headers);
  const range = `${sheetName}!A${idx}:${String.fromCharCode(64 + headers.length)}${idx}`;
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range, valueInputOption: "RAW", requestBody: { values: [row] }
  });

  invalidateSheetCache(sheetName);
}

export async function confirmarInscricao(formData, perfil) {
  const sheetName = sheetForPerfil(perfil);
  const idx = Number(formData._rowIndex);
  if (!idx || idx < 2) throw new Error("Linha inválida.");
  const sheets = await getSheets();
  const cellResp = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${sheetName}!A${idx}` });
  const cur = (cellResp.data.values || [])[0]?.[0];
  if (cur) return cur;
  const prefix = PROFILE_PREFIX[perfil] || "";
  const raw = await gerarNumeroInscricao(perfil);
  const codigo = prefix + raw;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `${sheetName}!A${idx}`, valueInputOption: "RAW", requestBody: { values: [[codigo]] }
  });

  invalidateSheetCache(sheetName);

  return codigo;
}

export async function cancelarInscricao(formData, perfil) {
  const idx = Number(formData._rowIndex);
  if (!idx || idx < 2) throw new Error("Linha inválida.");
  const sheetName = sheetForPerfil(perfil);

  // precisamos do sheetId num�rico para apagar a linha via batchUpdate
  const meta = await getSpreadsheetMeta();
  const sh = meta.sheets.find(s => s.title === sheetName);
  if (!sh) throw new Error(`Aba não existe: ${sheetName}`);
  const sheets = await getSheets();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId: sh.sheetId, dimension: "ROWS", startIndex: idx-1, endIndex: idx }
        }
      }]
    }
  });

  invalidateSheetCache(sheetName);
}


export async function getConselheiroSeats() {
  const sheetName = sheetForPerfil("Conselheiro");
  const { headers, rows } = await readAllCached(sheetName, CACHE_TTL_DEFAULT_MS);
  const normHdrs = headers.map(h => normalizeKey(h));
  const idxCode = normHdrs.indexOf("numerodeinscricao");
  const idxName = normHdrs.indexOf("nome");
  if (idxCode < 0 || idxName < 0) throw new Error('Cabeçalhos "Número de Inscrição" ou "Nome" não encontrados.');
  const seats = [];
  rows.forEach(r => {
    const code = r[idxCode];
    const name = r[idxName];
    if (code) {
      const num = parseInt(String(code).replace(/\D/g, ""), 10);
      if (!isNaN(num)) seats.push({ seat: num, name });
    }
  });
  return seats;
}


export async function listarInscricoes(perfil, status = "ativos", q = "", { limit = 200, offset = 0 } = {}) {
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

    out.push({
      _rowIndex: obj._rowIndex,
      numerodeinscricao: obj.numerodeinscricao || "",
      cpf: String(obj.cpf || "").replace(/\D/g, ""), // Só Números para exibição/consulta
      nome: obj.nome || "",
      conferido: obj.conferido || "",
      conferidopor: obj.conferidopor || "",
      conferidoem: obj.conferidoem || "",
    });
  }

  // OrdenAção server-side para FINALIZADOS: MAIOR ? MENOR por Número do protocolo
  if (String(status).toLowerCase() === "finalizados") {
    out.sort((a, b) => protoKey(b.numerodeinscricao) - protoKey(a.numerodeinscricao));
  }

  // paginAção
  const start = Math.max(0, offset);
  const end = Math.min(out.length, start + Math.max(1, limit));
  return out.slice(start, end);
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
  const lastColLetter = String.fromCharCode(64 + headers.length);
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



