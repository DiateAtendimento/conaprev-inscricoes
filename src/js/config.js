// /src/js/config.js  (script cl�ssico, sem export/import)
(() => {
  // Janela de libera��o das inscri��es (usado pelo gate)
  window.EVENTO = {
    INICIO: '2025-09-22T08:00:00-03:00',
    FIM:    '2025-12-03T13:00:00-03:00', // FIM > INICIO
    LOCAL:  'Bras�lia/DF',
  };

  // Base da API (Render em produ��o; localhost no dev)
  const PROD_API = 'https://conaprev-inscricoes.onrender.com';
  const API_BASE =
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3000'
      : PROD_API;

  // Exponha globalmente
  window.API_BASE = API_BASE;
  window.VOTACAO_ADMIN_PASS = window.VOTACAO_ADMIN_PASS || 'Ecac2025@';

  /**
   * Rotas (opcional)
   * O steps.js atual j� monta as rotas usando window.API_BASE diretamente,
   * mas deixo aqui para refer�ncia/uso em outros scripts.
   *
   * IMPORTANTE:
   * - /api/inscricoes/buscar  => POST { cpf, perfil }
   * - /api/inscricoes/confirmar => POST { formData, perfil } -> { codigo, [pdfUrl] }
   * - /api/inscricoes/assentos/conselheiros => GET -> [{ seat, name }]
   */
  window.APP_ROUTES = {
    base: API_BASE,

    // POST (o steps.js faz o POST com { cpf, perfil })
    buscarCpf: `${API_BASE}/api/inscricoes/buscar`,

    // Passo 5 (confirma��o) � retorna { codigo [, pdfUrl] }
    confirmar: `${API_BASE}/api/inscricoes/confirmar`,

    // PDF opcional (se o backend expuser por ID/c�digo)
    comprovantePdf: (id) => `${API_BASE}/api/inscricoes/${encodeURIComponent(id)}/comprovante.pdf`,

    // Assentos � somente para Conselheiro
    assentosConselheiros: `${API_BASE}/api/inscricoes/assentos/conselheiros`,
  };

  // (Opcional) Auth global
  // window.AUTH_TOKEN = '...';
})();

