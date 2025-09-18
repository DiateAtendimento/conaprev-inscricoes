// /src/js/config.js  (script clássico, sem export/import)
(() => {
  // Janela de liberação das inscrições (usado pelo gate)
  window.EVENTO = {
    INICIO: '2025-09-22T08:00:00-03:00',
    // dica: FIM deveria ser > INICIO
    FIM:   '2025-12-03T13:00:00-03:00',
    LOCAL: 'Brasília/DF',
  };

  // Base da API (Render em produção; localhost no dev)
  const PROD_API = 'https://conaprev-inscricoes.onrender.com';
  const API_BASE = location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : PROD_API;

  // Exponha se precisar em outros scripts
  window.API_BASE = API_BASE;

  // Rotas reais para o steps.js
  window.APP_ROUTES = {
    base: API_BASE,
    lookupCpf: (cpf) => `${API_BASE}/pessoas?cpf=${encodeURIComponent(cpf)}`,
    createInscricao: `${API_BASE}/inscricoes`,
    resendEmail: (id) => `${API_BASE}/inscricoes/${id}/reenviar-email`,
    comprovantePdf: (id) => `${API_BASE}/inscricoes/${id}/comprovante.pdf`,
  };

  // (Opcional) Token global, se precisar
  // window.AUTH_TOKEN = '...';
})();
