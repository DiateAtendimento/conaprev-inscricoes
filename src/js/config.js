// src/js/config.js
export const EVENTO = {
  // ⚠️ quando LIBERAM as inscrições (usado pelo gate)
  INICIO: '2025-09-22T08:00:00-03:00',

  // (opcionais) dados do evento para a UI
  FIM:   '2025-08-13T13:00:00-03:00',
  LOCAL: 'Brasília/DF'
};

// Base da API (Render em produção; localhost no dev)
// 👉 troque a URL abaixo pela da SUA API no Render
const PROD_API = 'https://conaprev-inscricoes.onrender.com';

export const API_BASE =
  location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : PROD_API;
