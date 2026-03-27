const DEFAULT_BASE_URL = "https://conaprev-inscricoes.onrender.com";
const DEFAULT_USERS = 40;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith("--")) continue;
    const key = raw.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function toMs(start) {
  return Math.round(performance.now() - start);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanCpf(value) {
  return String(value || "").replace(/\D/g, "");
}

function buildCpfPool(cpfList, users) {
  const list = cpfList.map(cleanCpf).filter((cpf) => cpf.length === 11);
  if (!list.length) throw new Error("Nenhum CPF válido informado");
  const pool = [];
  for (let i = 0; i < users; i += 1) {
    pool.push(list[i % list.length]);
  }
  return pool;
}

async function fetchJson(baseUrl, path, opts = {}) {
  const started = performance.now();
  const res = await fetch(`${baseUrl}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return {
    ok: res.ok,
    status: res.status,
    data,
    durationMs: toMs(started),
  };
}

function questionsFromVote(vote) {
  return ensureArray(vote?.questions || vote?.perguntas || vote?.questoes);
}

function optionsFromQuestion(question) {
  return ensureArray(question?.options || question?.opcoes || question?.alternativas);
}

function isBlankOption(opt) {
  if (opt?.blank) return true;
  const text = typeof opt === "string" ? opt : opt?.text;
  return String(text || "").trim().toLowerCase() === "votar em branco";
}

function buildAnswerForQuestion(question, userIndex) {
  if (!question) return null;
  if (question.type === "text") {
    return {
      questionId: question.id,
      type: "text",
      value: `Resposta automatizada ${userIndex + 1}`,
    };
  }

  const options = optionsFromQuestion(question).map((opt) => (typeof opt === "string" ? { text: opt } : opt));
  const blankOptions = options.filter(isBlankOption);
  const realOptions = options.filter((opt) => !isBlankOption(opt));
  const limitType = String(question.limitType || "none");
  const limitValue = parseInt(question.limitValue || "0", 10) || 0;

  let pickCount = 1;
  if (limitType === "equal" && limitValue > 0) pickCount = limitValue;
  if (limitType === "max" && limitValue > 0) pickCount = Math.min(limitValue, Math.max(1, limitValue));
  if (question.allowMultiple && limitValue > 0 && limitType === "none") pickCount = Math.min(limitValue, realOptions.length || 1);
  if (!question.allowMultiple) pickCount = 1;

  let chosen = realOptions.slice(0, Math.max(1, pickCount));
  if (!chosen.length && blankOptions.length) chosen = [blankOptions[0]];
  if (!chosen.length && options.length) chosen = [options[0]];

  return {
    questionId: question.id,
    type: "options",
    optionIds: chosen.map((opt) => opt.id).filter(Boolean),
  };
}

function buildVoteAnswers(vote, userIndex) {
  return questionsFromVote(vote)
    .map((question) => buildAnswerForQuestion(question, userIndex))
    .filter(Boolean);
}

async function simulateUser({ baseUrl, themeId, cpf, userIndex }) {
  const result = {
    userIndex: userIndex + 1,
    cpfSuffix: cpf.slice(-4),
    ok: false,
    loginMs: 0,
    temasMs: 0,
    votosMs: 0,
    submitMs: 0,
    totalMs: 0,
    votesCount: 0,
    error: "",
  };
  const started = performance.now();

  const login = await fetchJson(baseUrl, "/api/votacao/login", {
    method: "POST",
    body: JSON.stringify({ cpf }),
  });
  result.loginMs = login.durationMs;
  if (!login.ok || !login.data?.ok) {
    result.error = `login:${login.status}`;
    result.totalMs = toMs(started);
    return result;
  }

  const temas = await fetchJson(baseUrl, "/api/votacao/temas");
  result.temasMs = temas.durationMs;
  if (!temas.ok) {
    result.error = `temas:${temas.status}`;
    result.totalMs = toMs(started);
    return result;
  }

  const votesResp = await fetchJson(
    baseUrl,
    `/api/votacao/temas/${encodeURIComponent(themeId)}/votacoes?cpf=${encodeURIComponent(cpf)}`
  );
  result.votosMs = votesResp.durationMs;
  const votes = ensureArray(votesResp.data?.votes);
  result.votesCount = votes.length;
  if (!votesResp.ok || !votes.length) {
    result.error = `votacoes:${votesResp.status || 200}`;
    result.totalMs = toMs(started);
    return result;
  }

  const payloadVotes = votes.map((vote) => ({
    voteId: vote.id,
    answers: buildVoteAnswers(vote, userIndex),
    durationMs: 15000 + userIndex,
  }));

  const submit = await fetchJson(baseUrl, "/api/votacao/votar", {
    method: "POST",
    body: JSON.stringify({
      cpf,
      votes: payloadVotes,
    }),
  });
  result.submitMs = submit.durationMs;
  result.totalMs = toMs(started);
  result.ok = submit.ok && submit.data?.ok !== false;
  if (!result.ok) {
    result.error = `submit:${submit.status}`;
  }
  return result;
}

function summarize(themeId, results, cpfPool) {
  const okResults = results.filter((item) => item.ok);
  const failResults = results.filter((item) => !item.ok);
  const avg = (key) => okResults.length
    ? Math.round(okResults.reduce((sum, item) => sum + Number(item[key] || 0), 0) / okResults.length)
    : 0;

  return {
    themeId,
    usersRequested: results.length,
    uniqueCpfsUsed: [...new Set(cpfPool)].length,
    successCount: okResults.length,
    failureCount: failResults.length,
    avgLoginMs: avg("loginMs"),
    avgTemasMs: avg("temasMs"),
    avgVotacoesMs: avg("votosMs"),
    avgSubmitMs: avg("submitMs"),
    avgTotalMs: avg("totalMs"),
    failures: failResults.slice(0, 10).map((item) => ({
      userIndex: item.userIndex,
      cpfSuffix: item.cpfSuffix,
      error: item.error,
      votesCount: item.votesCount,
    })),
  };
}

async function runTheme(baseUrl, themeId, cpfPool) {
  const results = [];
  for (let i = 0; i < cpfPool.length; i += 1) {
    const item = await simulateUser({
      baseUrl,
      themeId,
      cpf: cpfPool[i],
      userIndex: i,
    });
    results.push(item);
  }
  return summarize(themeId, results, cpfPool);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = String(args["base-url"] || DEFAULT_BASE_URL).replace(/\/$/, "");
  const users = Math.max(1, parseInt(args.users || DEFAULT_USERS, 10) || DEFAULT_USERS);
  const cpfList = String(args.cpfs || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!cpfList.length) {
    throw new Error("Informe ao menos um CPF com --cpfs");
  }

  const themesResp = await fetchJson(baseUrl, "/api/votacao/temas");
  if (!themesResp.ok) {
    throw new Error(`Falha ao listar temas: HTTP ${themesResp.status}`);
  }
  const allThemes = ensureArray(themesResp.data);
  const requestedThemes = String(args.themes || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const themeIds = requestedThemes.length
    ? requestedThemes
    : allThemes.filter((theme) => theme?.active).map((theme) => theme.id);

  if (!themeIds.length) {
    throw new Error("Nenhum módulo ativo disponível para teste");
  }

  const cpfPool = buildCpfPool(cpfList, users);
  const summary = [];
  for (const themeId of themeIds) {
    const theme = allThemes.find((item) => item.id === themeId);
    if (!theme?.active) {
      summary.push({
        themeId,
        usersRequested: users,
        uniqueCpfsUsed: [...new Set(cpfPool)].length,
        successCount: 0,
        failureCount: users,
        skipped: true,
        reason: "theme_inactive",
      });
      continue;
    }
    const themeSummary = await runTheme(baseUrl, themeId, cpfPool);
    summary.push(themeSummary);
  }

  console.log(JSON.stringify({
    baseUrl,
    users,
    requestedThemes: themeIds,
    summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
