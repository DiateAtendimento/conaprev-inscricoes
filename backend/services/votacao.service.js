// backend/services/votacao.service.js
import cfg from "../config/env.js";
import { getSheets } from "./google.service.js";
import { buscarAutorizadoParaVotarPorCpf, buscarPorCpf } from "./sheets.service.js";

const SHEET_VOTOS = "Votação";
const SHEET_VOTACOES = "Votacoes";

const VOTOS_HEADERS = [
  "NUMERO DE INSCRIÇÃO",
  "NOME",
  "DATA",
  "HORÁRIO",
  "TEMA",
  "RESPOSTAS",
];

const VOTACOES_HEADERS = [
  "ID",
  "TEMA",
  "TITULO",
  "ATIVO",
  "QUESTOES_JSON",
  "CRIADO_EM",
  "ATUALIZADO_EM",
  "ANO",
];

const THEMES = [
  { id: "membros-rotativos", name: "MEMBROS ROTATIVOS", title: "Membros rotativos" },
  { id: "membros-cnrpps", name: "MEMBROS CNRPPS", title: "Membros CNRPPS" },
  { id: "comite-compensacao", name: "COMITÊ DA COMPENSAÇÃO PREVIDENCIÁRIA", title: "Comitê da compensação previdenciária" },
  { id: "certificacao-profissional", name: "CERTIFICAÇÃO PROFISSIONAL", title: "Certificação profissional" },
  { id: "pro-gestao", name: "PRÓ GESTÃO", title: "Pró Gestão" },
  { id: "comissao-copajure", name: "COMISSÃO DO COPAJURE", title: "Comissão do COPAJURE" },
];

/* ===== cache leve em mem�ria ===== */
const CACHE_TTL_MS = 10_000;
const SHEET_READY_TTL_MS = 60_000;
const VALIDATION_CACHE_TTL_MS = 5 * 60_000;
const _cache = new Map(); // key -> { expires, data }
function getCache(key) {
  const hit = _cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;
  _cache.delete(key);
  return null;
}
function setCache(key, data, ttl = CACHE_TTL_MS) {
  _cache.set(key, { expires: Date.now() + ttl, data });
}
function invalidateCache(prefix) {
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

/* ===== helpers ===== */
function normalize(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function cleanAnswerText(value) {
  return String(value || "")
    .trim()
    .replace(/[.;]+$/g, "")
    .replace(/\s+/g, " ");
}

function resolveTheme(input) {
  const norm = normalize(input);
  return THEMES.find((t) => normalize(t.id) === norm || normalize(t.name) === norm) || null;
}

function yearFromEvent() {
  const y = cfg?.event?.inicio ? new Date(cfg.event.inicio).getFullYear() : null;
  return y || new Date().getFullYear();
}

function nowBRParts() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const dd = parts.day.padStart(2, "0");
  const mm = parts.month.padStart(2, "0");
  const yyyy = parts.year;
  const HH = parts.hour.padStart(2, "0");
  const MM = parts.minute.padStart(2, "0");
  return {
    iso: `${yyyy}-${mm}-${dd}T${HH}:${MM}:00-03:00`,
    date: `${dd}/${mm}/${yyyy}`,
    time: `${HH}:${MM}`,
  };
}

function lastColLetter(headers) {
  return String.fromCharCode(64 + headers.length);
}

async function getSpreadsheetMeta() {
  const sheets = await getSheets();
  const m = await sheets.spreadsheets.get({ spreadsheetId: cfg.sheetId });
  return {
    spreadsheetId: cfg.sheetId,
    sheets: m.data?.sheets?.map((s) => ({
      title: s.properties.title,
      sheetId: s.properties.sheetId,
    })) || [],
  };
}

async function ensureSheetWithHeaders(sheetName, headers) {
  const readyKey = `sheet-ready:${sheetName}`;
  if (getCache(readyKey)) return;
  const sheets = await getSheets();
  const meta = await getSpreadsheetMeta();
  const exists = meta.sheets.find((s) => s.title === sheetName);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: cfg.sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
    });
  }
  const range = `${sheetName}!A1:${lastColLetter(headers)}1`;
  const cur = await sheets.spreadsheets.values.get({ spreadsheetId: cfg.sheetId, range });
  const row = (cur.data.values && cur.data.values[0]) ? cur.data.values[0] : [];
  const mismatch = row.length < headers.length || headers.some((h, i) => String(row[i] || "") !== h);
  if (mismatch) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: cfg.sheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });
  }
  setCache(readyKey, true, SHEET_READY_TTL_MS);
}

async function readAll(sheetName) {
  const sheets = await getSheets();
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId: cfg.sheetId, range: `${sheetName}` });
  const values = resp.data.values || [];
  const headers = (values[0] || []).map((h) => String(h));
  const rows = values.slice(1);
  return { headers, rows };
}

async function readAllCached(sheetName, cacheKey) {
  const hit = getCache(cacheKey);
  if (hit) return hit;
  const data = await readAll(sheetName);
  setCache(cacheKey, data);
  return data;
}

function parseJSON(val) {
  try { return JSON.parse(val); } catch { return null; }
}

function mapVoteRow(row, idx) {
  return {
    _rowIndex: idx + 2,
    id: row[0],
    tema: row[1],
    title: row[2],
    active: String(row[3] || "").toUpperCase() === "SIM",
    questions: parseJSON(row[4]) || [],
    createdAt: row[5],
    updatedAt: row[6],
    ano: row[7],
  };
}

async function readVotesSheetCached() {
  await ensureSheetWithHeaders(SHEET_VOTOS, VOTOS_HEADERS);
  return readAllCached(SHEET_VOTOS, "votos:all");
}

async function readVotacoesSheetCached() {
  await ensureSheetWithHeaders(SHEET_VOTACOES, VOTACOES_HEADERS);
  return readAllCached(SHEET_VOTACOES, "votacoes:all");
}

function buildVoteRecord(validationUser, vote, answers, date, time, durationMs) {
  const temaLabel = String(vote.title || vote.tema || "").trim();
  return {
    temaLabel,
    row: [
      String(validationUser.numerodeinscricao || ""),
      String(validationUser.nome || ""),
      date,
      time,
      temaLabel,
      formatResponsesText(vote, answers || [], durationMs),
    ],
  };
}

function findExistingVoteRowIndex(rows, numeroInscricao, temaLabel) {
  let existingRowIndex = -1;
  rows.forEach((r, idx) => {
    const numero = String(r[0] || "").trim();
    const tema = String(r[4] || "").trim();
    if (numero !== String(numeroInscricao || "").trim()) return;
    if (tema === String(temaLabel || "").trim()) existingRowIndex = idx + 2;
  });
  return existingRowIndex;
}

function extractAnswersFromStoredValue(storedValue, vote) {
  const parsed = parseResponsesText(storedValue, vote);
  let answers = parsed.answers || [];

  if (!answers.length) {
    const json = parseJSON(storedValue);
    if (json && json.answers) {
      answers = json.answers.map((ans) => {
        if (ans.type === "text") {
          return { questionId: ans.questionId, type: "text", value: String(ans.value || "") };
        }
        const optionIds = Array.isArray(ans.optionIds) ? ans.optionIds : [];
        return { questionId: ans.questionId, type: "options", optionIds };
      });
    }
  } else {
    answers = answers.map((ans) => {
      if (ans.type === "text") return ans;
      const optionIds = (ans.optionTexts || []).map((text) => {
        const q = (vote.questions || []).find((qq) => qq.id === ans.questionId);
        const opt = (q?.options || []).find((o) => normalize(o.text) === normalize(cleanAnswerText(text)));
        return opt?.id;
      }).filter(Boolean);
      return { questionId: ans.questionId, type: "options", optionIds };
    });
  }

  return { answers };
}

function formatResponsesText(vote, answers = [], durationMs = 0) {
  const questions = vote?.questions || [];
  const body = questions.map((q, index) => {
    const ans = (answers || []).find((a) => String(a.questionId) === String(q.id));
    if (q.type === "text") {
      const val = String(ans?.value || "").trim();
      return `${index + 1}. ${q.text || "Pergunta"}\nResposta: ${val || "-"}`;
    }
    const ids = Array.isArray(ans?.optionIds) ? ans.optionIds : [];
    const labels = ids.map((id) => {
      const opt = (q.options || []).find((o) => String(o.id) === String(id));
      return opt?.text || "";
    }).filter(Boolean).map(cleanAnswerText);
    return `${index + 1}. ${q.text || "Pergunta"}\nResposta: ${labels.length ? labels.join(", ") : "-"}`;
  }).join("\n\n");
  const secs = Math.max(0, Math.round((Number(durationMs || 0) || 0) / 1000));
  return `${body}\n\nTempo de resposta (s): ${secs}`;
}

function parseResponsesText(text, vote) {
  const normalized = String(text || "").trim();
  if (!normalized) return { answers: [], durationMs: 0 };
  const questions = vote?.questions || [];
  const blocks = normalized.split(/\n\s*\n/);
  const parsed = [];
  let durationMs = 0;
  blocks.forEach((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const first = lines[0] || "";
    if (/^tempo de resposta/i.test(first)) {
      const val = first.split(":")[1] || "";
      const secs = parseInt(String(val).replace(/\D/g, ""), 10);
      if (Number.isFinite(secs)) durationMs = secs * 1000;
      return;
    }
    const match = first.match(/^(\d+)\.\s*(.*)$/);
    if (!match) return;
    const index = parseInt(match[1], 10) - 1;
    const q = questions[index];
    if (!q) return;
    const respLine = lines.find((l) => l.toLowerCase().startsWith("resposta:"));
    let respText = respLine ? cleanAnswerText(respLine.replace(/^resposta:\s*/i, "")) : "";
    if (respText === "-") respText = "";
    if (q.type === "text") {
      if (respText) parsed.push({ questionId: q.id, type: "text", value: respText });
      return;
    }
    const parts = respText
      ? respText.split(/[;,]/).map((p) => cleanAnswerText(p)).filter(Boolean)
      : [];
    if (parts.length) parsed.push({ questionId: q.id, type: "options", optionTexts: parts });
  });
  return { answers: parsed, durationMs };
}

function normalizePresenceCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizePresenceName(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/* ===== presença Dia2 ===== */
async function checarPresencaDia2(codInscricao, nomeOpcional) {
  const sheets = await getSheets();
  const targetCode = normalizePresenceCode(codInscricao);
  const targetName = normalizePresenceName(nomeOpcional);

  try {
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId: cfg.sheetId, range: "Dia2!A2:B" });
    const rows = resp.data.values || [];
    for (const r of rows) {
      const num = normalizePresenceCode(r[0]);
      const nome = normalizePresenceName(r[1]);
      if (num !== targetCode) continue;
      if (targetName && nome) {
        const sameName = nome === targetName;
        const partialName = nome.includes(targetName) || targetName.includes(nome);
        if (!sameName && !partialName) continue;
      }
      return true;
    }
  } catch {
    // aba pode nao existir
  }
  return false;
}

/* ===== consultas ===== */
export async function listThemesWithLatest() {
  const { rows } = await readVotacoesSheetCached();
  const votes = rows.map(mapVoteRow);

  return THEMES.map((t) => {
    const same = votes.filter((v) => normalize(v.tema) === normalize(t.name));
    const latest = same.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0] || null;
    return {
      id: t.id,
      name: t.name,
      title: t.title,
      latest,
      active: same.some((vote) => vote.active),
    };
  });
}

export async function listVotesByTema(temaInput) {
  const tema = resolveTheme(temaInput);
  if (!tema) throw new Error("Tema inválido");
  const { rows } = await readVotacoesSheetCached();
  return rows.map(mapVoteRow).filter((v) => normalize(v.tema) === normalize(tema.name));
}

export async function getVoteById(id) {
  const { rows } = await readVotacoesSheetCached();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      return mapVoteRow(rows[i], i);
    }
  }
  return null;
}

export async function getLatestVoteForTema(temaInput) {
  const list = await listVotesByTema(temaInput);
  const latest = list.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0] || null;
  return latest || null;
}

export async function createVote({ temaInput, questions }) {
  const tema = resolveTheme(temaInput);
  if (!tema) throw new Error("Tema inválido");
  await ensureSheetWithHeaders(SHEET_VOTACOES, VOTACOES_HEADERS);

  const now = nowBRParts();
  const ano = String(yearFromEvent());
  const id = `vote_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const title = `${ano} - ${tema.title}`;

  const row = [
    id,
    tema.name,
    title,
    "SIM",
    JSON.stringify(questions || []),
    now.iso,
    now.iso,
    ano,
  ];

  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: cfg.sheetId,
    range: `${SHEET_VOTACOES}!A1:${lastColLetter(VOTACOES_HEADERS)}`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });

  invalidateCache("votacoes:");
  return { id, tema: tema.name, title, active: true, questions };
}

export async function updateVote(id, { questions }) {
  const vote = await getVoteById(id);
  if (!vote) throw new Error("Votação não encontrada");

  const now = nowBRParts();
  const sheets = await getSheets();
  const row = [
    vote.id,
    vote.tema,
    vote.title,
    vote.active ? "SIM" : "",
    JSON.stringify(questions || []),
    vote.createdAt,
    now.iso,
    vote.ano || "",
  ];

  const range = `${SHEET_VOTACOES}!A${vote._rowIndex}:${lastColLetter(VOTACOES_HEADERS)}${vote._rowIndex}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: cfg.sheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  });

  invalidateCache("votacoes:");
  return { ...vote, questions, updatedAt: now.iso };
}

export async function deleteVote(id) {
  const vote = await getVoteById(id);
  if (!vote) throw new Error("Votação não encontrada");
  const meta = await getSpreadsheetMeta();
  const sh = meta.sheets.find((s) => s.title === SHEET_VOTACOES);
  if (!sh) throw new Error(`Aba não existe: ${SHEET_VOTACOES}`);
  const sheets = await getSheets();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: cfg.sheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId: sh.sheetId, dimension: "ROWS", startIndex: vote._rowIndex - 1, endIndex: vote._rowIndex },
        },
      }],
    },
  });
  invalidateCache("votacoes:");
  invalidateCache("votos:");
  return { ok: true };
}

export async function setVoteActive(id, active) {
  const vote = await getVoteById(id);
  if (!vote) throw new Error("Votação não encontrada");
  const now = nowBRParts();

  const sheets = await getSheets();
  const row = [
    vote.id,
    vote.tema,
    vote.title,
    active ? "SIM" : "",
    JSON.stringify(vote.questions || []),
    vote.createdAt,
    now.iso,
    vote.ano || "",
  ];
  const range = `${SHEET_VOTACOES}!A${vote._rowIndex}:${lastColLetter(VOTACOES_HEADERS)}${vote._rowIndex}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: cfg.sheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  });

  invalidateCache("votacoes:");
  return { ...vote, active: !!active, updatedAt: now.iso };
}

export async function validateVoter(cpf) {
  const clean = String(cpf || "").replace(/\D/g, "");
  if (!/^\d{11}$/.test(clean)) throw new Error("CPF inválido");
  const cacheKey = `validate:${clean}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const authorized = await buscarAutorizadoParaVotarPorCpf(clean);
  if (!authorized) {
    const out = { ok: false, reason: "NAO_AUTORIZADO" };
    setCache(cacheKey, out, VALIDATION_CACHE_TTL_MS);
    return out;
  }
  if (!authorized.numerodeinscricao || String(authorized.numerodeinscricao).trim() === "") {
    const out = { ok: false, reason: "SEM_NUMERO" };
    setCache(cacheKey, out, VALIDATION_CACHE_TTL_MS);
    return out;
  }

  const user = await buscarPorCpf(clean, "Conselheiro").catch(() => null);
  const presenteDia2 = await checarPresencaDia2(authorized.numerodeinscricao, authorized.nome || user?.nome);
  if (!presenteDia2) {
    const out = { ok: false, reason: "SEM_PRESENCA" };
    setCache(cacheKey, out, VALIDATION_CACHE_TTL_MS);
    return out;
  }

  const out = {
    ok: true,
    user: {
      cpf: clean,
      nome: user?.nomenoprismacracha || authorized.nome || user?.nome || "",
      nomeCompleto: user?.nome || authorized.nome || "",
      numerodeinscricao: authorized.numerodeinscricao || user?.numerodeinscricao || "",
      representatividade: authorized.representatividade || user?.representatividade || "",
      titularidade: user?.cargofuncao || user?.titularidade || "",
      uf: authorized.ufsigla || user?.ufsigla || "",
    },
  };
  setCache(cacheKey, out, VALIDATION_CACHE_TTL_MS);
  return out;
}

export async function getUserResponseForVote(vote, cpf) {
  if (!vote) return null;
  const validation = await validateVoter(cpf).catch(() => null);
  if (!validation?.ok || !validation.user?.numerodeinscricao) return null;
  const temaLabel = String(vote.title || vote.tema || "").trim();
  const { rows } = await readVotesSheetCached();

  let found = null;
  rows.forEach((r) => {
    const numero = String(r[0] || "").trim();
    const tema = String(r[4] || "").trim();
    if (numero !== String(validation.user.numerodeinscricao || "").trim()) return;
    if (tema !== temaLabel) return;
    found = r[5];
  });
  if (!found) return null;

  return extractAnswersFromStoredValue(found, vote);
}

export async function getUserResponsesForVotes(votes, cpf) {
  const list = Array.isArray(votes) ? votes.filter(Boolean) : [];
  if (!list.length) return new Map();

  const validation = await validateVoter(cpf).catch(() => null);
  if (!validation?.ok || !validation.user?.numerodeinscricao) return new Map();

  const { rows } = await readVotesSheetCached();
  const byTema = new Map();
  rows.forEach((r) => {
    const numero = String(r[0] || "").trim();
    const tema = String(r[4] || "").trim();
    if (numero !== String(validation.user.numerodeinscricao || "").trim()) return;
    byTema.set(tema, r[5]);
  });

  const results = new Map();
  list.forEach((vote) => {
    const temaLabel = String(vote.title || vote.tema || "").trim();
    const found = byTema.get(temaLabel);
    if (!found) return;
    results.set(vote.id, extractAnswersFromStoredValue(found, vote));
  });
  return results;
}

export async function submitVote({ voteId, cpf, answers, durationMs }) {
  const out = await submitVotesBatch({
    cpf,
    votes: [{ voteId, answers, durationMs }],
  });
  return { ok: out.ok, nome: out.nome || "" };
}

export async function submitVotesBatch({ cpf, votes }) {
  const payloadVotes = Array.isArray(votes) ? votes.filter((item) => item?.voteId) : [];
  if (!payloadVotes.length) throw new Error("Dados incompletos");

  const loadedVotes = await Promise.all(payloadVotes.map((item) => getVoteById(item.voteId)));
  loadedVotes.forEach((vote) => {
    if (!vote) throw new Error("Votação não encontrada");
    if (!vote.active) throw new Error("VOTACAO_INDISPONIVEL");
  });

  const validation = await validateVoter(cpf);
  if (!validation.ok) throw new Error("NAO_PERMITIDO");

  await ensureSheetWithHeaders(SHEET_VOTOS, VOTOS_HEADERS);
  const { date, time } = nowBRParts();
  const sheets = await getSheets();
  const { rows } = await readVotesSheetCached();
  const updates = [];
  const appends = [];

  payloadVotes.forEach((item, index) => {
    const vote = loadedVotes[index];
    const record = buildVoteRecord(validation.user, vote, item.answers || [], date, time, item.durationMs);
    const existingRowIndex = findExistingVoteRowIndex(rows, validation.user.numerodeinscricao, record.temaLabel);
    if (existingRowIndex > 1) {
      updates.push({
        range: `${SHEET_VOTOS}!A${existingRowIndex}:${lastColLetter(VOTOS_HEADERS)}${existingRowIndex}`,
        values: [record.row],
      });
      return;
    }
    appends.push(record.row);
  });

  if (updates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: cfg.sheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: updates,
      },
    });
  }

  if (appends.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: cfg.sheetId,
      range: `${SHEET_VOTOS}!A1:${lastColLetter(VOTOS_HEADERS)}`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: appends },
    });
  }

  invalidateCache("votos:");
  return {
    ok: true,
    nome: validation.user.nome || "",
    submitted: loadedVotes.map((vote) => vote.id),
  };
}

export async function getVoteResults(voteId) {
  const vote = await getVoteById(voteId);
  if (!vote) throw new Error("Votação não encontrada");
  const { rows } = await readVotesSheetCached();
  const responses = [];
  const temaLabel = String(vote.title || vote.tema || "").trim();
  rows.forEach((r) => {
    const tema = String(r[4] || "").trim();
    if (tema !== temaLabel) return;
    const parsed = parseResponsesText(r[5], vote);
    if (parsed.answers.length) {
      responses.push(parsed);
      return;
    }
    const json = parseJSON(r[5]);
    if (json && json.voteId === voteId) {
      const mapped = (json.answers || []).map((ans) => {
        if (ans.type === "text") {
          const value = String(ans.value || "").trim();
          return value && value !== "-" ? { questionId: ans.questionId, type: "text", value } : null;
        }
        const optTexts = (ans.optionIds || []).map((oid) => {
          const opt = (vote.questions || []).flatMap((q) => q.options || []).find((o) => o.id === oid);
          return opt?.text || "";
        }).filter((text) => String(text || "").trim() && String(text || "").trim() !== "-");
        return optTexts.length ? { questionId: ans.questionId, type: "options", optionTexts: optTexts } : null;
      }).filter(Boolean);
      if (mapped.length) {
        responses.push({ answers: mapped, durationMs: Number(json.durationMs || 0) || 0 });
      }
    }
  });

  const stats = (vote.questions || []).map((q) => {
    if (q.type === "text") {
      return { questionId: q.id, type: "text", total: responses.length };
    }
    const counts = {};
    (q.options || []).forEach((opt) => { counts[opt.id] = 0; });
    responses.forEach((resp) => {
      const ans = (resp.answers || []).find((a) => a.questionId === q.id);
      if (!ans) return;
      const texts = Array.isArray(ans.optionTexts) ? ans.optionTexts : [];
      texts.forEach((text) => {
        const opt = (q.options || []).find((o) => normalize(o.text) === normalize(cleanAnswerText(text)));
        if (opt && counts.hasOwnProperty(opt.id)) counts[opt.id] += 1;
      });
    });
    return { questionId: q.id, type: "options", counts };
  });

  const durations = responses.map((r) => Number(r.durationMs || 0)).filter((n) => Number.isFinite(n) && n > 0);
  const avgMs = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

  return {
    voteId,
    title: vote.title,
    total: responses.length,
    avgDurationMs: avgMs,
    questions: vote.questions || [],
    stats,
  };
}
