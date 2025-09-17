// frontend/src/js/api.js
import { API_BASE } from './config.js';

// Util: timeout p/ evitar fetch pendurado
function withTimeout(ms, promise) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout na requisição')), ms)),
  ]);
}

// Util: tenta ler { error } do backend
async function parseError(resp) {
  const txt = await resp.text();
  try {
    const j = JSON.parse(txt);
    if (j?.error) return new Error(j.error);
  } catch (_) {}
  return new Error(txt || `HTTP ${resp.status}`);
}

// Core request
async function request(path, { method = 'GET', headers = {}, body, timeout = 20000 } = {}) {
  const opts = {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    // mode: 'cors' // (desnecessário pois é default em browsers modernos)
  };
  const url = `${API_BASE}${path}`;
  const resp = await withTimeout(timeout, fetch(url, opts));
  if (!resp.ok) throw await parseError(resp);
  // tenta JSON; se não for JSON, retorna a Response p/ o chamador decidir (ex: blob)
  const ctype = resp.headers.get('content-type') || '';
  if (ctype.includes('application/json')) return resp.json();
  return resp;
}

/* ========= Atalhos GET/POST em JSON ========= */
export const getJson  = (path, opt={}) => request(path, { ...opt, method: 'GET' });
export const postJson = (path, body, opt={}) => request(path, { ...opt, method: 'POST', body });

/* ========= Rotas de inscrições ========= */

// body: { cpf, perfil }
export function buscarInscricao(cpf, perfil) {
  return postJson('/api/inscricoes/buscar', { cpf, perfil });
}

// body: { formData, perfil }
export function criarInscricao(formData, perfil) {
  return postJson('/api/inscricoes/criar', { formData, perfil });
}

// body: { formData, perfil } (precisa _rowIndex)
export function atualizarInscricao(formData, perfil) {
  return postJson('/api/inscricoes/atualizar', { formData, perfil });
}

// body: { formData, perfil } (gera número caso vazio)
export function confirmarInscricao(formData, perfil) {
  return postJson('/api/inscricoes/confirmar', { formData, perfil });
}

// body: { _rowIndex, perfil }
export function cancelarInscricao(_rowIndex, perfil) {
  return postJson('/api/inscricoes/cancelar', { _rowIndex, perfil });
}

// GET assentos (conselheiros)
export function getAssentosConselheiros() {
  return getJson('/api/inscricoes/assentos/conselheiros');
}

/* ========= Certificado ========= */

// POST /api/certificado/emitir  -> PDF
export async function emitirCertificado(cpf) {
  const resp = await request('/api/certificado/emitir', {
    method: 'POST',
    body: { cpf },
  });
  // resp é Response (pdf)
  const blob = await resp.blob();
  return blob; // deixe o chamador decidir baixar/abrir
}

/* ========= Admin (export XLSX) ========= */

// GET /api/admin/exportar  -> XLSX (usa x-api-key)
export async function baixarExportXlsx(apiKey) {
  const resp = await request('/api/admin/exportar', {
    method: 'GET',
    headers: { 'x-api-key': apiKey },
  });
  const blob = await resp.blob();
  return blob;
}
