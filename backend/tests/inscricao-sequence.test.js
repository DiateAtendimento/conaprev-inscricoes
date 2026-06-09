import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MAX_INSCRICOES_POR_PERFIL,
  buildCodigoFromSequence,
  findMissingSequences,
  findNextAvailableSequence,
  normalizeUsedSequences,
  validateProfileSequences,
} from "../services/inscricao-sequence.service.js";

test("gera codigo com prefixo do perfil", () => {
  assert.equal(buildCodigoFromSequence("Conselheiro", 1), "CNL001");
  assert.equal(buildCodigoFromSequence("Patrocinador", 12), "PAT012");
  assert.equal(buildCodigoFromSequence("COPAJURE", 65), "CPJ065");
});

test("normaliza sequencias repetidas e ordena", () => {
  assert.deepEqual(
    normalizeUsedSequences(["PAT010", "PAT002", "PAT010", "PAT001"]),
    [1, 2, 10],
  );
});

test("encontra o primeiro numero faltante sem pular inscricoes", () => {
  assert.equal(findNextAvailableSequence(["PAT001", "PAT002", "PAT004"]), 3);
  assert.deepEqual(findMissingSequences(["PAT001", "PAT002", "PAT004"], 5), [3, 5]);
});

test("retorna null quando o perfil ja ocupou as 65 inscricoes", () => {
  const codigos = Array.from(
    { length: DEFAULT_MAX_INSCRICOES_POR_PERFIL },
    (_, index) => buildCodigoFromSequence("Staff", index + 1),
  );
  assert.equal(findNextAvailableSequence(codigos), null);
});

test("valida uma sequencia completa de 1 ate 65", () => {
  const codigos = Array.from(
    { length: DEFAULT_MAX_INSCRICOES_POR_PERFIL },
    (_, index) => buildCodigoFromSequence("Palestrante", index + 1),
  );
  assert.deepEqual(validateProfileSequences(codigos), {
    ok: true,
    used: Array.from({ length: DEFAULT_MAX_INSCRICOES_POR_PERFIL }, (_, index) => index + 1),
    missing: [],
    overflow: [],
    max: DEFAULT_MAX_INSCRICOES_POR_PERFIL,
  });
});

test("aponta buracos e excesso acima do limite por perfil", () => {
  const result = validateProfileSequences(["CJU001", "CJU003", "CJU066"], 5);
  assert.deepEqual(result, {
    ok: false,
    used: [1, 3, 66],
    missing: [2, 4, 5],
    overflow: [66],
    max: 5,
  });
});
