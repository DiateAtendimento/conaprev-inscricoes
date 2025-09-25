import cfg from "../config/env.js";
import { getSheets } from "./google.service.js";
import { normalizeKey, titleCase } from "./normalize.service.js";

const SHEET_ID = cfg.sheetId;

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
  return idx; // -1 se não achou
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
  if (!formData?.cpf || !String(formData.cpf).trim()) throw new Error("Campo obrigatório: cpf");
  const clean = String(formData.cpf).replace(/\D/g, "");
  if (!/^\d{11}$/.test(clean)) throw new Error("CPF deve conter apenas números e ter 11 dígitos.");
  if (!formData?.nome || !String(formData.nome).trim()) throw new Error("Campo obrigatório: nome");
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
  const { headers, rows } = await readAll(sheetName);
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
  const { headers } = await readAll(sheetName);
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
  return codigo;
}

export async function atualizarDados(formData, perfil) {
  validarDados(formData);
  const sheetName = sheetForPerfil(perfil);
  const { headers } = await readAll(sheetName);
  const idx = Number(formData._rowIndex);
  if (!idx || idx < 2) throw new Error("Linha inválida.");
  const row = createRowFromFormData(formData, perfil, headers);
  const range = `${sheetName}!A${idx}:${String.fromCharCode(64 + headers.length)}${idx}`;
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range, valueInputOption: "RAW", requestBody: { values: [row] }
  });
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
  return codigo;
}

export async function cancelarInscricao(formData, perfil) {
  const idx = Number(formData._rowIndex);
  if (!idx || idx < 2) throw new Error("Linha inválida.");
  const sheetName = sheetForPerfil(perfil);

  // precisamos do sheetId numérico para apagar a linha via batchUpdate
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
}

export async function getConselheiroSeats() {
  const sheetName = sheetForPerfil("Conselheiro");
  const { headers, rows } = await readAll(sheetName);
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
  const { headers, rows } = await readAll(sheetName);

  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const obj = mapRow(headers, rows[i]);
    obj._rowIndex = i + 2; // cabeçalho + 1-based

    // status: ativos => não conferidos | finalizados => conferidos
    const conf = isConferido(obj);
    const wantFinalizados = (String(status).toLowerCase() === "finalizados");
    if (wantFinalizados ? !conf : conf) continue;

    // filtro por CPF/Nome
    if (!matchQuery(obj, q)) continue;

    out.push({
      _rowIndex: obj._rowIndex,
      numerodeinscricao: obj.numerodeinscricao || "",
      cpf: String(obj.cpf || "").replace(/^'+/, ""), // remove apóstrofo inicial
      nome: obj.nome || "",
      conferido: obj.conferido || "",
      conferidopor: obj.conferidopor || "",
      conferidoem: obj.conferidoem || "",
    });
  }

  // paginação
  const start = Math.max(0, offset);
  const end = Math.min(out.length, start + Math.max(1, limit));
  return out.slice(start, end);
}


export async function marcarConferido({ _rowIndex, perfil, conferido, conferidoPor }) {
  const idx = Number(_rowIndex);
  if (!idx || idx < 2) throw new Error("Linha inválida.");
  const sheetName = sheetForPerfil(perfil);

  const { headers } = await readAll(sheetName);
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
  const d = new Date();
  const valEm = conferido ? d.toLocaleString('pt-BR') : "";


  // range da linha inteira (para montar o array completo com as 3 posições)
  const lastColLetter = String.fromCharCode(64 + headers.length);
  const range = `${sheetName}!A${idx}:${lastColLetter}${idx}`;

  // lê a linha atual
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

  return { ok: true };
}
