export function normalizeKey(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function normalizeText(str) {
  return String(str ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

const LOWERCASE_NAME_PARTICLES = new Set([
  "a", "as", "da", "das", "de", "do", "dos", "e",
]);

const ROMAN_NUMERALS = new Set([
  "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
]);

function capitalizeNamePart(part) {
  if (!part) return "";
  const [first, ...rest] = Array.from(part);
  return first.toLocaleUpperCase("pt-BR") + rest.join("");
}

function capitalizeCompoundName(word) {
  return word
    .split(/([-\u2019'])/u)
    .map(part => (/^[-\u2019']$/u.test(part) ? part : capitalizeNamePart(part)))
    .join("");
}

export function titleCase(str) {
  const normalized = normalizeText(str).toLocaleLowerCase("pt-BR");
  if (!normalized) return "";

  return normalized
    .split(" ")
    .map((word, index) => {
      if (index > 0 && LOWERCASE_NAME_PARTICLES.has(word)) return word;
      if (ROMAN_NUMERALS.has(word)) return word.toLocaleUpperCase("pt-BR");
      return capitalizeCompoundName(word);
    })
    .join(" ");
}
