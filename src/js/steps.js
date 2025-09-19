/* steps.js — fluxo de inscrição multi-perfil + backend real (UX legado) — ATUALIZADO */

(() => {
  /* ===============================
   * Rotas (ajuste se necessário)
   * =============================== */
  const ROUTES = window.APP_ROUTES ?? {
    base: '/backend',
    lookupCpf: (cpf) => `/backend/pessoas?cpf=${encodeURIComponent(cpf)}`,
    createInscricao: `/backend/inscricoes`,
    resendEmail: (id) => `/backend/inscricoes/${id}/reenviar-email`,
    comprovantePdf: (id) => `/backend/inscricoes/${id}/comprovante.pdf`,
    assentosConselheiros: `/api/inscricoes/assentos/conselheiros`, // ajuste se sua API for diferente
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
    searched: false,   // já clicou em Pesquisar?
    found: false       // CPF encontrado?
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

  // PASSO 2 — Dados para CNRPPS, Staff, Palestrante (reduzido)
  const CAMPOS_DADOS_REDUZIDOS = [
    { id: 'numerodeinscricao', label: 'Número de Inscrição', type: 'text', readonly: true },
    { id: 'cpf',               label: 'CPF',                 type: 'text', required: true },
    { id: 'nome',              label: 'Nome',                type: 'text', required: true },
    { id: 'ufsigla',           label: 'UF/Sigla',            type: 'text' },
    { id: 'convidadopor',      label: 'Convidado por',       type: 'text' },
    { id: 'email',             label: 'E-mail',              type: 'email' },
  ];

  // PASSO 3 — Perfil (sempre “Identificação”; para Conselheiro também Representatividade e Cargo/Função)
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

  function showLottie(kind, container) {
    // gancho para animações Lottie: 'search' | 'saving' | 'confirming' | 'seats' | 'success' | 'error'
    // lottie.loadAnimation({ container, path: `/lotties/${kind}.json`, loop:true, autoplay:true });
  }

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
      <div id="miSeatGrid" style="display:grid;grid-template-columns:repeat(9,40px);gap:10px;"></div>
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
      showLottie('seats', grid);
      const res = await fetch(ROUTES.assentosConselheiros, { method: 'GET' });
      const data = res.ok ? await res.json() : [];
      const occ = {};
      (data || []).forEach(s => occ[Number(s.seat)] = s.name || true);
      const MAX = 62;
      for (let n = 1; n <= MAX; n++) {
        const b = document.createElement('div');
        const ocupado = !!occ[n];
        b.textContent = n;
        b.className = 'rounded text-white text-center fw-semibold';
        b.style.cssText = `padding:.35rem 0;font-size:14px;user-select:none;background:${ocupado ? '#dc3545' : '#198754'};`;
        if (ocupado && typeof occ[n] === 'string') b.title = occ[n];
        grid.appendChild(b);
      }
    } catch {
      for (let n = 1; n <= 62; n++) {
        const b = document.createElement('div');
        b.textContent = n;
        b.className = 'rounded text-white text-center fw-semibold';
        b.style.cssText = `padding:.35rem 0;background:#198754;`;
        grid.appendChild(b);
      }
    }
  }

  /* ===============================
   * PASSO 2 — Dados (render dinâmico)
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

    // Nome no prisma/crachá automático com respeito à edição manual
    const nomeEl   = $('#nome');
    const prismaEl = $('#nomenoprismacracha');

    prismaManual = false;
    ultimaSugestaoPrisma = '';

    if (prismaEl) {
      prismaEl.addEventListener('input', () => {
        prismaManual = true; // usuário editou manualmente -> não sobrescrever mais
      });
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
   * PASSO 3 — Perfil (render dinâmico)
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
    const url = ROUTES.lookupCpf ? ROUTES.lookupCpf(cpf) : `/api/pessoas?cpf=${encodeURIComponent(cpf)}`;
    const res = await fetch(url, { method: 'GET', headers: defaultHeaders });
    if (!res.ok) return null;
    return res.json();
  }

  async function apiCreateInscricao(payload) {
    const res = await fetch(ROUTES.createInscricao, {
      method: 'POST', headers: defaultHeaders, body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let msg = 'Erro ao enviar';
      try { const j = await res.json(); if (j?.message) msg = j.message; } catch {}
      throw new Error(msg);
    }
    return res.json();
  }

  async function apiReenviarEmail(id) {
    const res = await fetch(ROUTES.resendEmail(id), { method: 'POST', headers: defaultHeaders });
    if (!res.ok) throw new Error('Não foi possível reenviar o e-mail.');
    return true;
  }

  /* ===============================
   * Eventos principais
   * =============================== */

  // Avançar
  $('#miBtnAvancar').addEventListener('click', async () => {
    if (!validateStep()) return;

    // salva rascunho do passo atual
    saveDraft();

    // Passo 5 => envia (salva definitivo)
    if (state.step === 5) {
      try {
        const payload = {
          perfil: state.perfil,
          ...state.data,
          ...readForm(),
        };
        showLottie('confirming', document.body);
        const resp = await apiCreateInscricao(payload);
        state.idInscricao = resp.id;
        state.protocolo  = resp.protocolo || resp.numero || resp.codigo || null;
        state.pdfUrl     = resp.pdfUrl || (resp.id ? ROUTES.comprovantePdf(resp.id) : null);

        const protoEl = $('#miProtocolo');
        if (protoEl) protoEl.textContent = state.protocolo || '—';
        if (state.pdfUrl) $('#miBtnBaixar').href = state.pdfUrl;
        else $('#miBtnBaixar')?.classList.add('disabled');

        updateFinalStepLabel();
        showToast('Inscrição registrada com sucesso!', 'success');

        state.step = 6;
        renderStep();
        return;
      } catch (e) {
        showToast(e.message || 'Erro ao concluir a inscrição', 'danger');
        return;
      }
    }

    // navegação normal
    if (state.step < STEP_MAX) {
      state.step++;
      renderStep();
      // montar/atualizar revisão ao entrar no Passo 4
      if (state.step === 4) renderReview();
    }
  });

  // Voltar
  $('#miBtnVoltar').addEventListener('click', () => {
    if (state.step > STEP_MIN) {
      state.step--;
      renderStep();
      if (state.step === 4) renderReview(); // mantém revisão atualizada ao voltar para o 4
    }
  });

  // Reenviar e-mail
  $('#miBtnReenviar').addEventListener('click', async () => {
    if (!state.idInscricao) return;
    try {
      await apiReenviarEmail(state.idInscricao);
      showToast('E-mail reenviado!', 'success');
    } catch (e) {
      showToast(e.message || 'Falha ao reenviar e-mail', 'danger');
    }
  });

  // CPF: só números e bloqueia avançar até pesquisar
  $('#miCpf').addEventListener('input', (e) => {
    const v = e.target.value.replace(/[^\d]/g, '');
    e.target.value = v;
    state.searched = false;
    renderStep();
  }, { passive: true });

  // Atualiza a revisão “ao vivo” enquanto edita (quando estiver no Passo 4)
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
      showLottie('search', document.body);

      const found = await apiLookupCpf(cpf);
      state.searched = true;
      state.found = !!found;

      if (found) {
        const perfil = state.perfil;
        // normaliza campos vindos do backend
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

        // Monta Passo 2 e Passo 3 com dados
        buildStep2Form(perfil, m);
        buildStep3Perfil(perfil, m);

        msg.textContent = 'Inscrição encontrada. Confira/ajuste os dados e avance.';
        msg.className = 'small ms-2 text-success';
      } else {
        // cadastro novo: pré-preenche CPF e Identificação
        state.data = { cpf, identificacao: state.perfil };
        buildStep2Form(state.perfil, state.data);
        buildStep3Perfil(state.perfil, state.data);

        msg.innerHTML = '<span class="text-warning">CPF não encontrado.</span> Clique em <strong>Avançar</strong> para fazer seu cadastro.';
        msg.className = 'small ms-2';
      }

      renderStep();
      renderSeats();
      loadDraft(cpf); // carrega rascunho local (se houver)
    } catch (e) {
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

      // Placeholders do Passo 2 e 3 até a pesquisa
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
