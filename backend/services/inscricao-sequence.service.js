const DEFAULT_MAX_INSCRICOES_POR_PERFIL = 65;

const PROFILE_PREFIX = {
  Conselheiro: "CNL",
  CNRPPS: "CJU",
  Palestrante: "PLT",
  Staff: "STF",
  Convidado: "CON",
  Apoiador: "PAT",
  Patrocinador: "PAT",
  COPAJURE: "CPJ",
};

function getProfilePrefix(perfil) {
  const prefix = PROFILE_PREFIX[String(perfil || "")];
  if (!prefix) throw new Error(`Perfil sem prefixo configurado: ${perfil}`);
  return prefix;
}

function extractSequenceNumber(codigo) {
  const matches = String(codigo || "").match(/\d+/g);
  if (!matches) return null;
  const numbers = matches.map((value) => parseInt(value, 10)).filter(Number.isFinite);
  if (!numbers.length) return null;
  return Math.max(...numbers);
}

function buildCodigoFromSequence(perfil, sequence, padLength = 3) {
  const n = Number(sequence);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error("Sequência inválida para inscrição.");
  }
  return `${getProfilePrefix(perfil)}${String(n).padStart(padLength, "0")}`;
}

function normalizeUsedSequences(codigos) {
  const used = new Set();
  for (const codigo of codigos || []) {
    const n = extractSequenceNumber(codigo);
    if (Number.isInteger(n) && n > 0) used.add(n);
  }
  return [...used].sort((a, b) => a - b);
}

function findMissingSequences(codigos, max = DEFAULT_MAX_INSCRICOES_POR_PERFIL) {
  const used = new Set(normalizeUsedSequences(codigos));
  const missing = [];
  for (let i = 1; i <= max; i += 1) {
    if (!used.has(i)) missing.push(i);
  }
  return missing;
}

function findNextAvailableSequence(codigos, max = DEFAULT_MAX_INSCRICOES_POR_PERFIL) {
  const [next] = findMissingSequences(codigos, max);
  return next || null;
}

function validateProfileSequences(codigos, max = DEFAULT_MAX_INSCRICOES_POR_PERFIL) {
  const used = normalizeUsedSequences(codigos);
  const missing = findMissingSequences(codigos, max);
  const overflow = used.filter((n) => n > max);
  return {
    ok: missing.length === 0 && overflow.length === 0 && used.length === max,
    used,
    missing,
    overflow,
    max,
  };
}

export {
  DEFAULT_MAX_INSCRICOES_POR_PERFIL,
  PROFILE_PREFIX,
  buildCodigoFromSequence,
  extractSequenceNumber,
  findMissingSequences,
  findNextAvailableSequence,
  getProfilePrefix,
  normalizeUsedSequences,
  validateProfileSequences,
};
