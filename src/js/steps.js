(() => {
  /* ===============================
   * Rotas (com fallback seguro)
   * =============================== */
  const inferApiBase = () => {
    const h = location.hostname;
    const isLocal = (h === 'localhost' || h === '127.0.0.1');
    return isLocal ? 'http://localhost:3000' : 'https://conaprev-inscricoes.onrender.com';
  };
  const API = (window.API_BASE && String(window.API_BASE).trim()) || inferApiBase();

  const ROUTES = {
    buscarCpf: `${API}/api/inscricoes/buscar`,                         // POST { cpf, perfil }
    confirmar: `${API}/api/inscricoes/confirmar`,                      // POST { formData, perfil } -> { codigo[, pdfUrl] }
    assentosConselheiros: `${API}/api/inscricoes/assentos/conselheiros`// GET -> [{seat, name}]
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
    protocolo: null,
    pdfUrl: null,
    searched: false,
    found: false
  };

  // “Nome no prisma” automático
  let prismaManual = false;
  let ultimaSugestaoPrisma = '';

  /* ===============================
   * Esquemas
   * =============================== */
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
  const CAMPOS_DADOS_REDUZIDOS = [
    { id: 'numerodeinscricao', label: 'Número de Inscrição', type: 'text', readonly: true },
    { id: 'cpf',               label: 'CPF',                 type: 'text', required: true },
    { id: 'nome',              label: 'Nome',                type: 'text', required: true },
    { id: 'ufsigla',           label: 'UF/Sigla',            type: 'text' },
    { id: 'convidadopor',      label: 'Convidado por',       type: 'text' },
    { id: 'email',             label: 'E-mail',              type: 'email' },
  ];
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

  /* ===== Lottie overlay ===== */
  const LOTTIE_MAP = {
    search:      '/animacoes/lottie_search_loading.json',
    seats:       '/animacoes/lottie_seats_loading.json',
    saving:      '/animacoes/lottie_save_progress.json',
    confirming:  '/animacoes/lottie_confirm_progress.json',
    success:     '/animacoes/lottie_success_check.json',
    error:       '/animacoes/lottie_error_generic.json',
    timeout:     '/animacoes/lottie_timeout_hourglass.json',
    network:     '/animacoes/lottie_network_off.json',
    duplicate:   '/animacoes/lottie_duplicate_found.json',
    pdf:         '/animacoes/lottie_pdf_generating.json',
    empty:       '/animacoes/lottie_empty_state.json',
    lock:        '/animacoes/lottie_lock_unauthorized.json',
  };

  let lottieInst = null;
  function openLottie(kind, msg = '') {
    const overlay = document.getElementById('miLottieOverlay');
    const holder  = document.getElementById('miLottieHolder');
    const msgEl   = document.getElementById('miLottieMsg');
    if (!overlay || !holder) return;
    try { if (lottieInst) lottieInst.destroy(); } catch {}
    holder.innerHTML = '';
    const path = LOTTIE_MAP[kind];
    if (path && window.lottie) {
      lottieInst = window.lottie.loadAnimation({
        container: holder, renderer: 'svg', loop: true, autoplay: true, path
      });
    }
    msgEl && (msgEl.textContent = msg);
    overlay.classList.remove('d-none');
  }
  function closeLottie() {
    const overlay = document.getElementById('miLottieOverlay');
    const holder  = document.getElementById('miLottieHolder');
    if (!overlay) return;
    overlay.classList.add('d-none');
    try { if (lottieInst) lottieInst.destroy(); } catch {}
    lottieInst = null;
    if (holder) holder.innerHTML = '';
  }

  const cpfDigits = (str) => String(str || '').replace(/\D/g, '');
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]
    ));
  }

  /* ===============================
   * Stepper
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

    // Grid de assentos
    const seatsWrap = document.createElement('div');
    seatsWrap.id = 'miSeatsWrap';
    seatsWrap.className = 'mt-4 d-none';
    seatsWrap.innerHTML = `
      <div class="fw-semibold mb-2">Conselheiros inscritos</div>
      <div class="mb-2">
        <span class="badge me-2" style="background:#198754">Livre</span>
        <span class="badge" style="background:#dc3545">Ocupado</span>
      </div>
      <div id="miSeatGrid" class="mi-seat-grid"></div>
    `;
    pane.appendChild(seatsWrap);

    pane.dataset.enhanced = '1';
    btnSearch.addEventListener('click', onPesquisarCpf);
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

    try {
      openLottie('seats', 'Carregando mapa de assentos…');
      const res = await fetch(ROUTES.assentosConselheiros, { method: 'GET' });
      const data = res.ok ? await res.json() : [];
      const occ = {};
      (data || []).forEach(s => occ[Number(s.seat)] = s.name || true);
      const MAX = 62;
      grid.innerHTML = '';
      for (let n = 1; n <= MAX; n++) {
        const b = document.createElement('div');
        const ocupado = !!occ[n];
        b.textContent = n;
        b.className = `mi-seat ${ocupado ? 'occupied' : 'available'}`;
        if (ocupado && typeof occ[n] === 'string') b.title = occ[n];
        grid.appendChild(b);
      }
    } catch {
      // fallback: todos livres
      for (let n = 1; n <= 62; n++) {
        const b = document.createElement('div');
        b.textContent = n;
        b.className = 'mi-seat available';
        grid.appendChild(b);
      }
    } finally {
      closeLottie();
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

    // Nome no prisma/crachá automático
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

  // Rascunho local
  function draftKey(cpf = $('#miCpf').value) {
    return `inscricao:${state.perfil}:${cpfDigits(cpf)}`;
  }
  function saveDraft() {
    const d = readForm();
    state.data = { ...state.data, ...d };
    localStorage.setItem(draftKey(), JSON.stringify(state.data));
  }
  function readDraft(cpf) {
    try {
      const raw = localStorage.getItem(draftKey(cpf));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function filterNonEmpty(obj) {
    const out = {};
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v != null && String(v).trim() !== '') out[k] = v;
    });
    return out;
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
    const res = await fetch(ROUTES.buscarCpf, {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify({ cpf, perfil: state.perfil })
    });
    if (!res.ok) return null;
    return res.json();
  }

  async function apiConfirmar(payload) {
    const res = await fetch(ROUTES.confirmar, {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify({ formData: payload, perfil: state.perfil })
    });
    if (!res.ok) {
      let msg = 'Erro ao enviar';
      try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
      throw new Error(msg);
    }
    return res.json(); // { codigo[, pdfUrl] }
  }

  /* ===============================
   * Eventos principais
   * =============================== */
  $('#miBtnAvancar').addEventListener('click', async () => {
    if (!validateStep()) return;

    saveDraft();

    // envio final
    if (state.step === 5) {
      try {
        const payload = { ...state.data, ...readForm() };
        openLottie('confirming', 'Confirmando sua inscrição…');
        const resp = await apiConfirmar(payload);
        state.protocolo = resp?.codigo || null;
        if (resp?.pdfUrl) state.pdfUrl = resp.pdfUrl;

        $('#miProtocolo').textContent = state.protocolo || '—';
        if (state.pdfUrl) $('#miBtnBaixar').href = state.pdfUrl;
        else $('#miBtnBaixar')?.classList.add('disabled');

        updateFinalStepLabel();
        showToast('Inscrição registrada com sucesso!', 'success');

        state.step = 6;
        renderStep();
        openLottie('success', 'Inscrição confirmada!');
        setTimeout(closeLottie, 1200);
        return;
      } catch (e) {
        openLottie('error', e.message || 'Erro ao concluir a inscrição.');
        setTimeout(closeLottie, 1600);
        showToast(e.message || 'Erro ao concluir a inscrição', 'danger');
        return;
      }
    }

    // navegação normal
    if (state.step < STEP_MAX) {
      state.step++;
      renderStep();
      if (state.step === 4) renderReview();
    }
  });

  $('#miBtnVoltar').addEventListener('click', () => {
    if (state.step > STEP_MIN) {
      state.step--;
      renderStep();
      if (state.step === 4) renderReview();
    }
  });

  // CPF: só números + ENTER para pesquisar
  const cpfInput = document.getElementById('miCpf');
  cpfInput.addEventListener('input', (e) => {
    const v = e.target.value.replace(/[^\d]/g, '');
    e.target.value = v;
    state.searched = false;
    renderStep();
  }, { passive: true });
  cpfInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onPesquisarCpf();
    }
  });

  // Atualiza revisão ao vivo no passo 4
  document.getElementById('miForm').addEventListener('input', () => {
    if (state.step === 4) renderReview();
  });

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
      openLottie('search', 'Buscando CPF…');

      const found = await apiLookupCpf(cpf);
      const draft  = readDraft(cpf);

      state.searched = true;
      state.found = !!found;

      if (found) {
        const perfil = state.perfil;
        const back = {
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
          _rowIndex: found._rowIndex
        };
        // rascunho só entra onde tem valor não-vazio
        const merged = { ...back, ...filterNonEmpty(draft) };

        state.data = merged;
        buildStep2Form(perfil, merged);
        buildStep3Perfil(perfil, merged);

        // avança automaticamente para "Dados"
        state.step = 2;
        renderStep();

        msg.textContent = 'Inscrição encontrada. Confira/ajuste os dados.';
        msg.className = 'small ms-2 text-success';
      } else {
        const base = { cpf, identificacao: state.perfil, ...(draft || {}) };
        state.data = base;
        buildStep2Form(state.perfil, base);
        buildStep3Perfil(state.perfil, base);

        // permanece no passo 1 para o usuário revisar antes de avançar
        msg.innerHTML = '<span class="text-warning">CPF não encontrado.</span> Clique em <strong>Avançar</strong> para fazer seu cadastro.';
        msg.className = 'small ms-2';
      }

      renderSeats();
    } catch (e) {
      msg.textContent = e.message || 'Erro na busca.';
      msg.className = 'small ms-2 text-danger';
      openLottie('error', 'Falha ao buscar CPF.');
      setTimeout(closeLottie, 1400);
      return;
    } finally {
      setTimeout(closeLottie, 300); // fecha suavemente
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
        perfil, step: 1, data: {}, protocolo: null, pdfUrl: null,
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
