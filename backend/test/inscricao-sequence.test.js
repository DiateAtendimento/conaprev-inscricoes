import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCodigoFromSequence,
  findNextAvailableSequence,
} from "../services/inscricao-sequence.service.js";

function codesThrough(last, missing = []) {
  const omitted = new Set(missing);
  return Array.from({ length: last }, (_, index) => index + 1)
    .filter((sequence) => !omitted.has(sequence))
    .map((sequence) => buildCodigoFromSequence("Conselheiro", sequence));
}

test("preenche primeiro a menor vaga existente na sequência", () => {
  const usedCodes = [...codesThrough(33), buildCodigoFromSequence("Conselheiro", 35)];
  assert.equal(findNextAvailableSequence(usedCodes), 34);
});

test("usa o número seguinte ao maior quando não existem vagas", () => {
  assert.equal(findNextAvailableSequence(codesThrough(35)), 36);
});

test("um protocolo repetido não faz a sequência pular uma vaga", () => {
  const usedCodes = [...codesThrough(26), buildCodigoFromSequence("Conselheiro", 26)];
  assert.equal(findNextAvailableSequence(usedCodes), 27);
});
