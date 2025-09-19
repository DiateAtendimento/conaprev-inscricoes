
/* steps.js — fluxo de inscrição multi-perfil + backend real (UX legado) — ATUALIZADO */

(() => {
  /* ===============================
   * Rotas (usa o que vier de window.APP_ROUTES)
   * =============================== */
  const ROUTES = window.APP_ROUTES ?? {
    base: '',
    lookupCpf: (cpf) => `/api/inscricoes/buscar?cpf=${encodeURIComponent(cpf)}`, // GET
    createInscricao: `/api/inscricoes/confirmar`,  // POST { formData, perfil } -> { codigo }
    assentosConselheiros: `/api/inscricoes/assentos/conselheiros`,
  };

  const defaultHeaders = { 'Content-Type': 'application/json' };

  /* ===============================
   * Estado geral
   * =============================== */
  const modalEl = document.getElementById('modalInscricao');
  if (!modalEl) {
    console.error('Faltou o HTML do modal #modalInscricao no index.html');
    return;
  }
  const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: true });

  const STEP_MIN = 1, STEP_MAX = 6;
  let state = {
    perfil: null,
    step: 1,
    data: {},
    idInscricao: null,
    protocolo: null,
    pdfUrl: null,

    // UX
    searched: false,
    found: false
  };

  // Controle do “Nome no prisma” automático
  let prismaManual = false;
  let ultimaSugestaoPrisma = '';

  /* ===============================
   * Esquemas de campos
   * =============================== */

  // PASSO 2 — Dados (pessoais/contato)
  const CAMPOS_DADOS_CONSELHEIRO = [
    { id: 'numerodeinscricao', label: 'Número de Inscrição', type: 'text', readonly: true },
    { id: 'cpf',               label: 'CPF',                 type: 'text', required: true },
    { id: 'nome',              label: 'Nome',                type: 'text', required: true },
    { id: 'nomenoprismacracha',label: 'Nome no Prisma/Crachá', type: 'text' },
    { id: 'ufsigla',           label: 'UF/Sigla',            type: 'text' },
    { id: 'sigladaentidade',   label: 'Sigla da Entidade',   type: 'text' },
    { id: 'endereco',          label: 'Endereço',            type: 'text' },
    { id: 'emailconselheiroa', label: 'E-mail Conselheiro(a)', type: 'email' },
    { id: 'emailsecretarioa',  label: 'E-mail Secretário(a)',  type: 'email' },
  ];

  // PASSO 2 — Dados reduzidos (CNRPPS, Staff, Palestrante)
  const CAMPOS_DADOS_REDUZIDOS = [
    { id: 'numerodeinscricao', label: 'Número de Inscrição', type: 'text', readonly: true },
    { id: 'cpf',               label: 'CPF',                 type: 'text', required: true },
    { id: 'nome',              label: 'Nome',                type: 'text', required: true },
    { id: 'ufsigla',           label: 'UF/Sigla',            type: 'text' },
    { id: 'convidadopor',      label: 'Convidado por',       type: 'text' },
    { id: 'email',             label: 'E-mail',              type: 'email' },
  ];

  // PASSO 3 — Perfil
  const CAMPOS_PERFIL_BASE = [
    { id: 'identificacao',     label: 'Identificação',       type: 'text', readonly: true },
  ];
  const CAMPOS_PERFIL_CONSELHEIRO = [
    { id: 'representatividade',label: 'Representatividade',  type: 'text' },
    { id: 'cargofuncao',       label: 'Cargo / Função',      type: 'text' },
  ];

  /* ===============================
   * Helpers DOM/UX
   * =============================== */
  const $ = sel => document.querySelector(sel);
  const $all = sel => [...document.querySelectorAll(sel)];

  function showToast(msg, type = 'info') {
    const wrapId = 'mi_toast_wrap';
    let wrap = document.getElementById(wrapId);
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = wrapId;
      wrap.style.position = 'fixed';
      wrap.style.right = '12px';
      wrap.style.bottom = '12px';
      wrap.style.zIndex = '2000';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = `alert alert-${type} shadow-sm mb-2`;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  /* ========= LOTTIES ========= */
  // precisa do lottie-web já incluso no index.html
  const LOTTIE_MAP = {
    search:         '/animacoes/lottie_search_loading.json',
    seats:          '/animacoes/lottie_seats_loading.json',
    saving:         '/animacoes/lottie_save_progress.json',
    confirming:     '/animacoes/lottie_confirm_progress.json',
    success:        '/animacoes/lottie_success_check.json',
    error:          '/animacoes/lottie_error_generic.json',
    timeout:        '/animacoes/lottie_timeout_hourglass.json',
    offline:        '/animacoes/lottie_network_off.json',
    duplicate:      '/animacoes/lottie_duplicate_found.json',
    pdf:            '/animacoes/lottie_pdf_generating.json',
    empty:          '/animacoes/lottie_empty_state.json',
    unauthorized:   '/animacoes/lottie_lock_unauthorized.json',
  };
  let _overlayAnim = null;

  function showLottie(kind, container, message = '') {
    const path = LOTTIE_MAP[kind];
    if (!path || !window.lottie) return;

    // Se o container for o body, usamos o overlay
    if (!container || container === document.body) {
      const overlay = document.getElementById('miLottieOverlay');
      const holder  = document.getElementById('miLottieHolder');
      const msgEl   = document.getElementById('miLottieMsg');
      if (!overlay || !holder) return;

      holder.innerHTML = '';
      msgEl.textContent = message || '';
      overlay.classList.remove('d-none');

      _overlayAnim = window.lottie.loadAnimation({
        container: holder,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path
      });
      return {
        close: hideOverlayLottie
      };
    }

    // Inline
    container.innerHTML = '';
    return window.lottie.loadAnimation({
      container,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path
    });
  }

  function hideOverlayLottie() {
    const overlay = document.getElementById('miLottieOverlay');
    const holder  = document.getElementById('miLottieHolder');
    if (!overlay || !holder) return;
    try { _overlayAnim?.destroy?.(); } catch {}
    _overlayAnim = null;
    holder.innerHTML = '';
    overlay.classList.add('d-none');
  }
  /* ====== fim LOTTIES ====== */

  function cpfDigits(str) { return String(str || '').replace(/\D/g, ''); }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]
    ));
  }

  /* ===============================
   * Stepper e rótulos
   * =============================== */
  function updateFinalStepLabel() {
    const lastStep = document.querySelector('.mi-stepper .mi-step[data-step="6"]');
    if (!lastStep) return;
    lastStep.textContent = state.protocolo ? 'Número de inscrição' : 'Finalizar';
  }

  function renderStep() {
    $('#miStepLabel').textContent = `Passo ${state.step} de ${STEP_MAX}`;
    $all('.mi-stepper .mi-step').forEach(s => {
      const n = Number(s.dataset.step);
      s.classList.toggle('is-active', n === state.step);
      s.classList.toggle('is-done', n < state.step);
    });
    $all('.mi-pane').forEach(p => p.classList.toggle('active', Number(p.dataset.step) === state.step));
    $('#miBtnVoltar').disabled = state.step === STEP_MIN;

    const avancar = $('#miBtnAvancar');
    avancar.textContent = state.step < STEP_MAX ? 'Avançar' : 'Concluir';
    avancar.disabled = (state.step === 1 && !state.searched);

    updateFinalStepLabel();
  }

  /* ===============================
   * PASSO 1 — CPF + Pesquisar + Assentos
   * =============================== */
  function ensureStep1UI() {
    const pane = document.querySelector('.mi-pane[data-step="1"]');
    if (!pane || pane.dataset.enhanced === '1') return;

    // Ações (Pesquisar + mensagem)
    const actions = document.createElement('div');
    actions.className = 'd-flex align-items-end gap-2 mt-2';

    const btnSearch = document.createElement('button');
    btnSearch.type = 'button';
    btnSearch.id = 'miBtnBuscarCpf';
    btnSearch.className = 'btn btn-primary';
    btnSearch.textContent = 'Pesquisar';

    const msg = document.createElement('div');
    msg.id = 'miCpfMsg';
    msg.className = 'small ms-2 text-muted';

    actions.appendChild(btnSearch);
    actions.appendChild(msg);
    pane.querySelector('.row.g-3')?.appendChild(actions);

    // Grid de assentos (apenas Conselheiro)
    const seatsWrap = document.createElement('div');
    seatsWrap.id = 'miSeatsWrap';
    seatsWrap.className = 'mt-4 d-none';
    seatsWrap.innerHTML = `
      <div class="fw-semibold mb-2">Conselheiros inscritos</div>
      <div class="mb-2">
        <span class="badge me-2" style="background:#198754">Livre</span>
        <span class="badge" style="background:#dc3545">Ocupado</span>
      </div>
      <!-- 19 colunas para ocupar toda a linha -->
      <div id="miSeatGrid" style="display:grid;grid-template-columns:repeat(19,1fr);gap:10px;"></div>
    `;
    pane.appendChild(seatsWrap);

    pane.dataset.enhanced = '1';

    // eventos
    btnSearch.addEventListener('click', onPesquisarCpf);

    // ENTER no CPF dispara busca
    const cpfInput = document.getElementById('miCpf');
    cpfInput?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        onPesquisarCpf();
      }
    });
  }

  function seatBoxStyle(ocupado) {
    // altura fixa agradável + largura fluida pelas 19 colunas
    return `
      display:flex;align-items:center;justify-content:center;
      border-radius:.5rem;color:#fff;font-weight:600;
      height:40px;user-select:none;
      background:${ocupado ? '#dc3545' : '#198754'};
    `;
  }

  async function renderSeats() {
    const wrap = $('#miSeatsWrap');
    const grid = $('#miSeatGrid');
    if (!wrap || !grid) return;
    if (state.perfil !== 'Conselheiro') {
      wrap.classList.add('d-none');
      return;
    }
    wrap.classList.remove('d-none');
    grid.innerHTML = '';

    let anim;
    try {
      anim = showLottie('seats', grid);
      const res = await fetch(ROUTES.assentosConselheiros, { method: 'GET' });
      const data = res.ok ? await res.json() : [];
      const occ = {};
      (data || []).forEach(s => occ[Number(s.seat)] = s.name || true);

      // remove lottie antes de pintar
      try { anim?.destroy?.(); } catch {}
      grid.innerHTML = '';

      const MAX = 62;
      for (let n = 1; n <= MAX; n++) {
        const b = document.createElement('div');
        const ocupado = !!occ[n];
        b.textContent = n;
        b.style.cssText = seatBoxStyle(ocupado);
        if (ocupado && typeof occ[n] === 'string') b.title = occ[n];
        grid.appendChild(b);
      }
    } catch {
      try { anim?.destroy?.(); } catch {}
      grid.innerHTML = '';
      for (let n = 1; n <= 62; n++) {
        const b = document.createElement('div');
        b.textContent = n;
        b.style.cssText = seatBoxStyle(false);
        grid.appendChild(b);
      }
    }
  }

  /* ===============================
   * PASSO 2 — Dados
   * =============================== */
  function buildStep2Form(perfil, data = {}) {
    const pane = document.querySelector('.mi-pane[data-step="2"]');
    if (!pane) return;

    const fields = (perfil === 'Conselheiro') ? CAMPOS_DADOS_CONSELHEIRO : CAMPOS_DADOS_REDUZIDOS;
    const blocks = fields.map(f => {
      if (f.id === 'numerodeinscricao' && !data.numerodeinscricao) return '';
      const val = data[f.id] ?? '';
      const ro  = f.readonly ? 'readonly' : '';
      const req = f.required ? 'required' : '';
      const type= f.type || 'text';
      return `
        <div class="col-12 col-md-6">
          <label class="form-label" for="${f.id}">${f.label}${f.required ? ' *' : ''}</label>
          <input id="${f.id}" name="${f.id}" type="${type}" class="form-control" value="${escapeHtml(val)}" ${ro} ${req}>
          ${f.required ? '<div class="invalid-feedback">Campo obrigatório.</div>' : ''}
        </div>
      `;
    }).join('');

    pane.innerHTML = `<div class="row g-3">${blocks}</div>`;

    // Nome no prisma/crachá automático respeitando edição manual
    const nomeEl   = $('#nome');
    const prismaEl = $('#nomenoprismacracha');

    prismaManual = false;
    ultimaSugestaoPrisma = '';

    if (prismaEl) {
      prismaEl.addEventListener('input', () => { prismaManual = true; });
    }

    if (nomeEl && prismaEl) {
      nomeEl.addEventListener('input', () => {
        const t = (nomeEl.value || '').trim();
        const parts = t.split(/\s+/).filter(Boolean);
        const first = parts[0] || '';
        const last  = parts.length > 1 ? parts[parts.length - 1] : '';
        const sug   = (first + ' ' + last).trim();
        if (!prismaManual || prismaEl.value.trim() === ultimaSugestaoPrisma) {
          prismaEl.value = sug;
          ultimaSugestaoPrisma = sug;
        }
      });
    }
  }

  /* ===============================
   * PASSO 3 — Perfil
   * =============================== */
  function buildStep3Perfil(perfil, data = {}) {
    const pane = document.querySelector('.mi-pane[data-step="3"]');
    if (!pane) return;

    const fields = [
      ...CAMPOS_PERFIL_BASE,
      ...(perfil === 'Conselheiro' ? CAMPOS_PERFIL_CONSELHEIRO : []),
    ];

    const blocks = fields.map(f => {
      const val = (f.id === 'identificacao') ? perfil : (data[f.id] ?? '');
      const ro  = f.readonly ? 'readonly' : '';
      const type= f.type || 'text';
      return `
        <div class="col-12 col-md-6">
          <label class="form-label" for="${f.id}">${f.label}</label>
          <input id="${f.id}" name="${f.id}" type="${type}" class="form-control" value="${escapeHtml(val)}" ${ro}>
        </div>
      `;
    }).join('');

    pane.innerHTML = `<div class="row g-3">${blocks}</div>`;
  }

  /* ===============================
   * Leitura/validação
   * =============================== */
  function readForm() {
    const form = $('#miForm');
    const data = new FormData(form);
    const obj = {};
    data.forEach((v,k) => { obj[k] = v; });
    return obj;
  }

  function validateStep() {
    const active = $('.mi-pane.active');
    let ok = true;
    [...active.querySelectorAll('input,select,textarea')].forEach(el => {
      if (!el.checkValidity()) ok = false;
      el.classList.add('was-validated');
    });
    return ok;
  }

  // Rascunho local (por CPF limpo)
  function draftKey(cpf = $('#miCpf').value) {
    return `inscricao:${state.perfil}:${cpfDigits(cpf)}`;
  }
  function saveDraft() {
    const d = readForm();
    state.data = { ...state.data, ...d };
    localStorage.setItem(draftKey(), JSON.stringify(state.data));
  }
  function loadDraft(cpf) {
    const raw = localStorage.getItem(draftKey(cpf));
    if (!raw) return;
    state.data = JSON.parse(raw);
    Object.entries(state.data).forEach(([k,v]) => {
      const el = document.querySelector(`[name="${k}"]`);
      if (!el) return;
      el.value = v;
    });
  }

  function renderReview() {
    const d = { ...state.data, ...readForm() };
    const lines = Object.entries(d)
      .filter(([k,v]) => String(v).trim() !== '')
      .map(([k,v]) => `<div class="d-flex">
        <div class="me-2 text-secondary text-capitalize" style="min-width:220px">${k}</div>
        <div class="fw-semibold flex-grow-1">${Array.isArray(v)?v.join(', '):escapeHtml(v)}</div>
      </div>`);
    $('#miReview').innerHTML = lines.join('');
  }

  /* ===============================
   * API helpers
   * =============================== */
  async function apiLookupCpf(cpf) {
    // se existir ROUTES.lookupCpf como função (GET), usamos; caso contrário,
    // tentamos POST em /buscar (compat alternativo)
    if (typeof ROUTES.lookupCpf === 'function') {
      const res = await fetch(ROUTES.lookupCpf(cpf), { method: 'GET', headers: defaultHeaders });
      if (!res.ok) return null;
      return res.json();
    } else if (ROUTES.buscarCpf) {
      const res = await fetch(ROUTES.buscarCpf, {
        method: 'POST', headers: defaultHeaders, body: JSON.stringify({ cpf, perfil: state.perfil })
      });
      if (!res.ok) return null;
      return res.json();
    }
    return null;
  }

  async function apiConfirmar(payload) {
    // Preferimos ROUTES.createInscricao (como no config atual) que aponta para /confirmar
    if (ROUTES.createInscricao) {
      const res = await fetch(ROUTES.createInscricao, {
        method: 'POST',
        headers: defaultHeaders,
        // backend espera { formData, perfil }
        body: JSON.stringify({ formData: payload, perfil: state.perfil })
      });
      if (!res.ok) {
        let msg = 'Erro ao enviar';
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
      return res.json(); // { codigo, pdfUrl? }
    }

    // Fallback: ROUTES.confirmar
    if (ROUTES.confirmar) {
      const res = await fetch(ROUTES.confirmar, {
        method: 'POST', headers: defaultHeaders,
        body: JSON.stringify({ formData: payload, perfil: state.perfil })
      });
      if (!res.ok) {
        let msg = 'Erro ao enviar';
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
      return res.json();
    }

    throw new Error('Rota de confirmação não configurada.');
  }

  /* ===============================
   * Eventos principais
   * =============================== */

  // Avançar
  $('#miBtnAvancar').addEventListener('click', async () => {
    if (!validateStep()) return;

    saveDraft();

    // Passo 5 => envia
    if (state.step === 5) {
      let closer;
      try {
        const payload = { ...state.data, ...readForm() };
        closer = showLottie('confirming', document.body, 'Enviando sua inscrição...');
        const resp = await apiConfirmar(payload);

        state.protocolo = resp?.codigo || null;
        if (resp?.pdfUrl) state.pdfUrl = resp.pdfUrl;

        const protoEl = $('#miProtocolo');
        if (protoEl) protoEl.textContent = state.protocolo || '—';
        if (state.pdfUrl) $('#miBtnBaixar').href = state.pdfUrl;
        else $('#miBtnBaixar')?.classList.add('disabled');

        updateFinalStepLabel();
        showToast('Inscrição registrada com sucesso!', 'success');

        state.step = 6;
        renderStep();
      } catch (e) {
        showToast(e.message || 'Erro ao concluir a inscrição', 'danger');
      } finally {
        hideOverlayLottie();
      }
      return;
    }

    // navegação normal
    if (state.step < STEP_MAX) {
      state.step++;
      renderStep();
      if (state.step === 4) renderReview(); // revisa ao entrar no Passo 4
    }
  });

  // Voltar
  $('#miBtnVoltar').addEventListener('click', () => {
    if (state.step > STEP_MIN) {
      state.step--;
      renderStep();
      if (state.step === 4) renderReview();
    }
  });

  // CPF: só números e bloqueia avançar até pesquisar
  $('#miCpf').addEventListener('input', (e) => {
    const v = e.target.value.replace(/[^\d]/g, '');
    e.target.value = v;
    state.searched = false;
    renderStep();
  }, { passive: true });

  // Atualiza a revisão “ao vivo” quando estiver no Passo 4
  document.getElementById('miForm').addEventListener('input', () => {
    if (state.step === 4) renderReview();
  });

  // Clique em “Pesquisar”
  async function onPesquisarCpf() {
    const cpf = cpfDigits($('#miCpf').value);
    const msg = $('#miCpfMsg');
    if (!cpf || cpf.length !== 11) {
      msg.textContent = 'Digite um CPF válido (11 dígitos).';
      msg.className = 'small ms-2 text-danger';
      return;
    }

    try {
      msg.textContent = 'Buscando...';
      msg.className = 'small ms-2 text-muted';
      const closer = showLottie('search', document.body, 'Consultando CPF...');

      const found = await apiLookupCpf(cpf);
      state.searched = true;
      state.found = !!found;

      if (found) {
        const perfil = state.perfil;
        const m = {
          numerodeinscricao: found.numerodeinscricao || found.numero || found.protocolo || '',
          cpf,
          nome: found.nome || '',
          nomenoprismacracha: found.nomenoprismacracha || '',
          ufsigla: found.uf || found.ufsigla || '',
          representatividade: found.representatividade || found.representa || '',
          cargofuncao: found.cargofuncao || found.cargo || '',
          sigladaentidade: found.sigladaentidade || found.sigla || '',
          identificacao: perfil,
          endereco: found.endereco || '',
          emailconselheiroa: found.emailconselheiroa || found.email || '',
          emailsecretarioa: found.emailsecretarioa || '',
          convidadopor: found.convidadopor || '',
          email: found.email || '',
        };
        state.data = { ...state.data, ...m };
        buildStep2Form(perfil, m);
        buildStep3Perfil(perfil, m);
        msg.textContent = 'Inscrição encontrada. Confira/ajuste os dados e avance.';
        msg.className = 'small ms-2 text-success';
      } else {
        state.data = { cpf, identificacao: state.perfil };
        buildStep2Form(state.perfil, state.data);
        buildStep3Perfil(state.perfil, state.data);
        msg.innerHTML = '<span class="text-warning">CPF não encontrado.</span> Clique em <strong>Avançar</strong> para fazer seu cadastro.';
        msg.className = 'small ms-2';
      }

      renderStep();
      renderSeats();
      loadDraft(cpf);
      hideOverlayLottie();
    } catch (e) {
      hideOverlayLottie();
      msg.textContent = e.message || 'Erro na busca.';
      msg.className = 'small ms-2 text-danger';
    }
  }

  /* ===============================
   * Abrir modal a partir dos cards
   * =============================== */
  $all('.select-profile').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.profile-card');
      const perfil = card?.dataset.profile || 'Conselheiro';
      state = {
        perfil, step: 1, data: {}, idInscricao: null, protocolo: null, pdfUrl: null,
        searched: false, found: false,
      };

      $('#miPerfil').textContent = perfil;

      ensureStep1UI();
      renderSeats();

      const form = document.getElementById('miForm');
      form.reset();
      $all('#miForm .was-validated').forEach(el => el.classList.remove('was-validated'));

      const step2 = document.querySelector('.mi-pane[data-step="2"]');
      if (step2) step2.innerHTML = '<div class="text-muted">Faça a pesquisa do CPF para carregar ou iniciar o cadastro.</div>';
      const step3 = document.querySelector('.mi-pane[data-step="3"]');
      if (step3) step3.innerHTML = '<div class="text-muted">Os campos do perfil aparecerão aqui após a pesquisa do CPF.</div>';

      updateFinalStepLabel();
      renderStep();
      modal.show();
    });
  });

})();

