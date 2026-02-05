// backend/services/votacao.service.js
import cfg from "../config/env.js";
import { getSheets } from "./google.service.js";
import { buscarPorCpf } from "./sheets.service.js";

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
];

/* ===== cache leve em mem�ria ===== */
const CACHE_TTL_MS = 1_500;
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

/* ===== presença Dia1/Dia2 ===== */
async function checarPresencaDias(codInscricao, nomeOpcional) {
  const sheets = await getSheets();
  const abas = ["Dia1", "Dia2"];
  let dia1 = false, dia2 = false;

  for (let i = 0; i < abas.length; i++) {
    const title = abas[i];
    try {
      const resp = await sheets.spreadsheets.values.get({ spreadsheetId: cfg.sheetId, range: `${title}!A2:B` });
      const rows = resp.data.values || [];
      for (const r of rows) {
        const num = String(r[0] || "").trim().toUpperCase();
        const nome = String(r[1] || "").trim().toUpperCase();
        if (num === String(codInscricao).trim().toUpperCase()) {
          if (nomeOpcional) {
            const cmp = String(nomeOpcional || "").trim().toUpperCase();
            if (nome && cmp && nome !== cmp) continue;
          }
          if (i === 0) dia1 = true;
          if (i === 1) dia2 = true;
          break;
        }
      }
    } catch {
      // aba pode Não existir
    }
  }
  return { dia1, dia2 };
}

/* ===== consultas ===== */
export async function listThemesWithLatest() {
  await ensureSheetWithHeaders(SHEET_VOTACOES, VOTACOES_HEADERS);
  const { rows } = await readAllCached(SHEET_VOTACOES, "votacoes:all");
  const votes = rows.map((r, idx) => ({
    _rowIndex: idx + 2,
    id: r[0],
    tema: r[1],
    title: r[2],
    active: String(r[3] || "").toUpperCase() === "SIM",
    questions: parseJSON(r[4]) || [],
    createdAt: r[5],
    updatedAt: r[6],
    ano: r[7],
  }));

  return THEMES.map((t) => {
    const same = votes.filter((v) => normalize(v.tema) === normalize(t.name));
    const latest = same.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0] || null;
    return {
      id: t.id,
      name: t.name,
      title: t.title,
      latest,
      active: !!latest?.active,
    };
  });
}

export async function listVotesByTema(temaInput) {
  const tema = resolveTheme(temaInput);
  if (!tema) throw new Error("Tema inválido");
  await ensureSheetWithHeaders(SHEET_VOTACOES, VOTACOES_HEADERS);
  const { rows } = await readAllCached(SHEET_VOTACOES, "votacoes:all");
  return rows.map((r, idx) => ({
    _rowIndex: idx + 2,
    id: r[0],
    tema: r[1],
    title: r[2],
    active: String(r[3] || "").toUpperCase() === "SIM",
    questions: parseJSON(r[4]) || [],
    createdAt: r[5],
    updatedAt: r[6],
    ano: r[7],
  })).filter((v) => normalize(v.tema) === normalize(tema.name));
}

export async function getVoteById(id) {
  await ensureSheetWithHeaders(SHEET_VOTACOES, VOTACOES_HEADERS);
  const { rows } = await readAllCached(SHEET_VOTACOES, "votacoes:all");
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      return {
        _rowIndex: i + 2,
        id: rows[i][0],
        tema: rows[i][1],
        title: rows[i][2],
        active: String(rows[i][3] || "").toUpperCase() === "SIM",
        questions: parseJSON(rows[i][4]) || [],
        createdAt: rows[i][5],
        updatedAt: rows[i][6],
        ano: rows[i][7],
      };
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

  const user = await buscarPorCpf(clean, "Conselheiro");
  if (!user) return { ok: false, reason: "NAO_CONSELHEIRO" };
  if (!user.numerodeinscricao || String(user.numerodeinscricao).trim() === "") {
    return { ok: false, reason: "SEM_NUMERO" };
  }

  const dias = await checarPresencaDias(user.numerodeinscricao, user.nome);
  if (!dias.dia1 && !dias.dia2) return { ok: false, reason: "SEM_PRESENCA" };

  return {
    ok: true,
    user: {
      cpf: clean,
      nome: user.nome || "",
      numerodeinscricao: user.numerodeinscricao || "",
      representatividade: user.representatividade || "",
      titularidade: user.titularidade || "",
    },
  };
}

export async function getUserResponseForVote(vote, cpf) {
  if (!vote) return null;
  const clean = String(cpf || "").replace(/\D/g, "");
  if (!/^\d{11}$/.test(clean)) return null;

  const user = await buscarPorCpf(clean, "Conselheiro");
  if (!user || !user.numerodeinscricao) return null;

  await ensureSheetWithHeaders(SHEET_VOTOS, VOTOS_HEADERS);
  const temaLabel = String(vote.title || vote.tema || "").trim();
  const { rows } = await readAllCached(SHEET_VOTOS, `votos:${vote.id}`);

  let found = null;
  rows.forEach((r) => {
    const numero = String(r[0] || "").trim();
    const tema = String(r[4] || "").trim();
    if (numero !== String(user.numerodeinscricao || "").trim()) return;
    if (tema !== temaLabel) return;
    found = r[5];
  });
  if (!found) return null;

  const parsed = parseResponsesText(found, vote);
  let answers = parsed.answers || [];

  if (!answers.length) {
    const json = parseJSON(found);
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

export async function submitVote({ voteId, cpf, answers, durationMs }) {
  const vote = await getVoteById(voteId);
  if (!vote) throw new Error("Votação não encontrada");
  const latest = await getLatestVoteForTema(vote.tema);
  if (!latest || latest.id !== vote.id || !vote.active) {
    throw new Error("VOTACAO_INDISPONIVEL");
  }

  const validation = await validateVoter(cpf);
  if (!validation.ok) throw new Error("NAO_PERMITIDO");

  await ensureSheetWithHeaders(SHEET_VOTOS, VOTOS_HEADERS);
  const { date, time } = nowBRParts();
  const temaLabel = vote.title || vote.tema;
  const responsesText = formatResponsesText(vote, answers || [], durationMs);
  const sheets = await getSheets();

  const cacheKey = `votos:${vote.id}`;
  const { rows } = await readAllCached(SHEET_VOTOS, cacheKey);
  let existingRowIndex = -1;

  rows.forEach((r, idx) => {
    const numero = String(r[0] || "").trim();
    const tema = String(r[4] || "").trim();
    if (numero !== String(validation.user.numerodeinscricao || "").trim()) return;
    if (tema === String(temaLabel).trim()) existingRowIndex = idx + 2;
  });

  const row = [
    String(validation.user.numerodeinscricao || ""),
    String(validation.user.nome || ""),
    date,
    time,
    temaLabel,
    responsesText,
  ];

  if (existingRowIndex > 1) {
    const range = `${SHEET_VOTOS}!A${existingRowIndex}:${lastColLetter(VOTOS_HEADERS)}${existingRowIndex}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: cfg.sheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: cfg.sheetId,
      range: `${SHEET_VOTOS}!A1:${lastColLetter(VOTOS_HEADERS)}`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
  }

  invalidateCache("votos:");
  return { ok: true, nome: validation.user.nome || "" };
}

export async function getVoteResults(voteId) {
  const vote = await getVoteById(voteId);
  if (!vote) throw new Error("Votação não encontrada");
  await ensureSheetWithHeaders(SHEET_VOTOS, VOTOS_HEADERS);

  const { rows } = await readAllCached(SHEET_VOTOS, `votos:${voteId}`);
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


