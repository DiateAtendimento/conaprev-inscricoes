import test from "node:test";
import assert from "node:assert/strict";

import { normalizeText, titleCase } from "../services/normalize.service.js";

test("titleCase padroniza maiúsculas, minúsculas e partículas de nomes", () => {
  assert.equal(
    titleCase("rICARDO aNDRÉ xIMENES DOS sANTOS"),
    "Ricardo André Ximenes dos Santos"
  );
});

test("titleCase preserva acentos, nomes compostos e algarismos romanos", () => {
  assert.equal(
    titleCase("mARIA-cLARA d'ÁVILA ii"),
    "Maria-Clara D'Ávila II"
  );
});

test("normalizeText grava Unicode NFC e remove espaços e controles indevidos", () => {
  assert.equal(normalizeText("  Jose\u0301\t  da\nSilva  "), "José da Silva");
  assert.equal(normalizeText("Ana\u0000Maria"), "Ana Maria");
});
