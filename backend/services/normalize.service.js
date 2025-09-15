export function normalizeKey(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function titleCase(str) {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .split(" ")
    .map(w =>
      w.length > 2 && !["da", "de", "do", "das", "dos", "e"].includes(w)
        ? w.charAt(0).toUpperCase() + w.slice(1)
        : w
    )
    .join(" ")
    .replace(/\b(\w)/g, l => l.toUpperCase());
}
