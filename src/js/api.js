// frontend/src/js/api.js  (ES module)
export const API_BASE =
  location.hostname === 'localhost'
    ? 'http://localhost:3000'                           // dev local (Live Server)
    : 'https://conaprev-inscricoes.onrender.com';               // ⬅️ troque pelo URL do Render

export async function getJson(path) {
  const r = await fetch(`${API_BASE}${path}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function postJson(path, body) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
