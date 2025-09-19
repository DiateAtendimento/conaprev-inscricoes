/* steps.js — fluxo de inscrição multi-perfil + backend real (UX legado) */

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
    assentosConselheiros: `/api/inscricoes/assentos/conselheiros`, // <- ajuste se sua API for diferente
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

    // controles de UX
    searched: false,   // já clicou em Pesquisar?
    found: false,      // CPF encontrado?
    edited: false,     // usuário editou e salvou no Passo 2?
  };

  /* ===============================
   * Esquemas de campos por perfil
   * (Passo 2 – “Dados”)
   * =============================== */

  // Campos “legado” (planilha)
  const CAMPOS_CONSELHEIRO = [
    { id: 'numerodeinscricao', label: 'Número de Inscrição', type: 'text', readonly: true },
    { id: 'cpf',               label: 'CPF',                 type: 'text', required: true },
    { id: 'nome',              label: 'Nome',                type: 'text', required: true },
    { id: 'nomenoprismacracha',label: 'Nome no Prisma/Crachá', type: 'text' },
    { id: 'ufsigla',           label: 'UF/Sigla',            type: 'text' },
    { id: 'representatividade',label: 'Representatividade',  type: 'text' },
    { id: 'cargofuncao',       label: 'Cargo / Função',      type: 'text' },
    { id: 'sigladaentidade',   label: 'Sigla da Entidade',   type: 'text' },
    { id: 'identificacao',     label: 'Identificação',       type: 'text', readonly: true },
    { id: 'endereco',          label: 'Endereço',            type: 'text' },
    { id: 'emailconselheiroa', label: 'E-mail Conselheiro(a)', type: 'email' },
    { id: 'emailsecretarioa',  label: 'E-mail Secretário(a)',  type: 'email' },
  ];

  const CAMPOS_REDUZIDOS = [
    // usado por CNRPPS, Staff e Palestrante, conforme pedido
    { id: 'numerodeinscricao', label: 'Número de Inscrição', type: 'text', readonly: true },
    { id: 'cpf',               label: 'CPF',                 type: 'text', required: true },
    { id: 'nome',              label: 'Nome',                type: 'text', required: true },
    { id: 'ufsigla',           label: 'UF/Sigla',            type: 'text' },
    { id: 'identificacao',     label: 'Identificação',       type: 'text', readonly: true },
    { id: 'convidadopor',      label: 'Convidado por',       type: 'text' },
    { id: 'email',             label: 'E-mail',              type: 'email' },
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

  function blockUI(on = true) {
    const id = 'mi_block_ui';
    let mask = document.getElementById(id);
    if (on) {
      if (!mask) {
        mask = document.createElement('div');
        mask.id = id;
        mask.style.position = 'fixed';
        mask.style.inset = '0';
        mask.style.background = 'rgba(0,0,0,.25)';
        mask.style.zIndex = '2000';
        mask.innerHTML = `<div style="position:absolute;inset:auto 0 30% 0;display:flex;justify-content:center">
            <div class="spinner-border text-light" role="status" aria-label="Carregando"></div>
          </div>`;
        document.body.appendChild(mask);
      }
    } else {
      mask?.remove();
    }
  }

  // Lottie (opcional)
  function showLottie(kind, container) {
    // Se você tiver os JSONs, basta carregar por nome.
    // Aqui deixamos ganchos para você conectar seus arquivos.
    // kind: 'search' | 'saving' | 'confirming' | 'seats' | 'success' | 'error'
    // container: HTMLElement
    // Ex.: lottie.loadAnimation({ container, path: `/lotties/${kind}.json`, loop:true, autoplay:true, renderer:'svg' });
  }

  function cpfDigits(str) {
    return String(str || '').replace(/\D/g, '');
  }

  /* ===============================
   * Render do Stepper e rótulos
   * =============================== */
  function updateFinalStepLabel() {
    const lastStep = document.querySelector('.mi-stepper .mi-step[data-step="6"]');
    if (!lastStep) return;
    if (state.protocolo) lastStep.textContent = 'Número de inscrição';
    else lastStep.textContent = 'Finalizar';
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
    avancar.classList.toggle('mi-blink', state.step === 5 && state.edited); // “piscar” no enviar

    // No Passo 1, “Avançar” só libera depois do Pesquisar
    if (state.step === 1) {
      avancar.disabled = !state.searched;
    } else {
      avancar.disabled = false;
    }

    updateFinalStepLabel();
  }

  /* ===============================
   * Construção dinâmica do Passo 1
   * (CPF + Pesquisar + Assentos)
   * =============================== */
  function ensureStep1UI() {
    const pane = document.querySelector('.mi-pane[data-step="1"]');
    if (!pane || pane.dataset.enhanced === '1') return;

    // linha da ação
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

    // adiciona abaixo da linha do CPF
    const row = pane.querySelector('.row.g-3');
    row?.appendChild(actions);

    // Mapa de assentos (só Conselheiro)
    const seatsWrap = document.createElement('div');
    seatsWrap.id = 'miSeatsWrap';
    seatsWrap.className = 'mt-4 d-none';
    seatsWrap.innerHTML = `
      <div class="fw-semibold mb-2">Conselheiros inscritos</div>
      <div id="miSeatsLegend" class="mb-2">
        <span class="badge me-2" style="background:#198754">Livre</span>
        <span class="badge" style="background:#dc3545">Ocupado</span>
      </div>
      <div id="miSeatGrid" style="
        display:grid;grid-template-columns:repeat(9,40px);gap:10px;
      "></div>
    `;
    pane.appendChild(seatsWrap);

    pane.dataset.enhanced = '1';

    // eventos
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
      // data esperado: [{ seat: 1, name: 'Fulano' }, ...]
      const occ = {};
      (data || []).forEach(s => occ[Number(s.seat)] = s.name || true);
      const MAX = 62;
      for (let n = 1; n <= MAX; n++) {
        const b = document.createElement('div');
        const ocupado = !!occ[n];
        b.textContent = n;
        b.className = 'rounded text-white text-center fw-semibold';
        b.style.cssText = `
          padding:.35rem 0; font-size:14px; user-select:none;
          background:${ocupado ? '#dc3545' : '#198754'};
        `;
        if (ocupado && typeof occ[n] === 'string') {
          b.title = occ[n];
        }
        grid.appendChild(b);
      }
      grid.innerHTML += ''; // “mata” o lottie se existir
    } catch {
      // em caso de erro, mostra placeholders livres
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
   * Construção dinâmica do Passo 2
   * =============================== */
  function buildStep2Form(perfil, data = {}, readonly = false) {
    const pane = document.querySelector('.mi-pane[data-step="2"]');
    if (!pane) return;

    const fields = (perfil === 'Conselheiro') ? CAMPOS_CONSELHEIRO : CAMPOS_REDUZIDOS;
    const blocks = fields.map(f => {
      // não renderiza Número de Inscrição se vier vazio
      if (f.id === 'numerodeinscricao' && !data.numerodeinscricao) return '';
      const val = data[f.id] ?? '';
      const ro = f.readonly || readonly ? 'readonly' : '';
      const req = f.required ? 'required' : '';
      const type = f.type || 'text';
      return `
        <div class="col-12 col-md-6">
          <label class="form-label" for="${f.id}">${f.label}${f.required ? ' *' : ''}</label>
          <input id="${f.id}" name="${f.id}" type="${type}" class="form-control" value="${escapeHtml(val)}" ${ro} ${req}>
          ${f.required ? '<div class="invalid-feedback">Campo obrigatório.</div>' : ''}
        </div>
      `;
    }).join('');

    pane.innerHTML = `
      <div class="row g-3">${blocks}</div>
      <div class="mt-3 d-flex gap-2">
        <button type="button" id="miBtnEditToggle" class="btn btn-outline-secondary">${readonly ? 'Editar dados' : 'Salvar dados'}</button>
      </div>
    `;

    // Nome no prisma automático
    const nomeEl = $('#nome');
    const prismaEl = $('#nomenoprismacracha');
    if (nomeEl && prismaEl) {
      nomeEl.addEventListener('input', () => {
        const t = (nomeEl.value || '').trim();
        if (!t) { prismaEl.value = ''; return; }
        const parts = t.split(/\s+/);
        const first = parts[0] || '';
        const last = parts.length > 1 ? parts[parts.length - 1] : '';
        prismaEl.value = (first + ' ' + last).trim();
      });
    }

    // Identificação = perfil
    const ident = $('#identificacao');
    if (ident) ident.value = perfil;

    // Toggle Editar/Salvar
    const btn = $('#miBtnEditToggle');
    btn.onclick = () => {
      const isReadonly = !!$('#cpf')?.readOnly; // checamos um campo para inferir
      const inputs = pane.querySelectorAll('input');
      if (isReadonly) {
        inputs.forEach(i => { if (i.id !== 'numerodeinscricao' && i.id !== 'identificacao') i.readOnly = false; });
        btn.textContent = 'Salvar dados';
      } else {
        // validação leve
        let ok = true;
        inputs.forEach(i => {
          if (i.required && !i.value.trim()) {
            i.classList.add('is-invalid'); ok = false;
          } else {
            i.classList.remove('is-invalid');
          }
        });
        if (!ok) { showToast('Preencha os campos obrigatórios.', 'warning'); return; }

        // salva em state.data
        const d = readForm();
        state.data = { ...state.data, ...d };
        // trava novamente
        inputs.forEach(i => { if (i.id !== 'numerodeinscricao' && i.id !== 'identificacao') i.readOnly = true; });
        btn.textContent = 'Editar dados';
        state.edited = true; // aciona “piscando” no Passo 5
        showToast('Dados salvos. Avance para confirmar sua inscrição.', 'success');
      }
    };
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]
    ));
  }

  /* ===============================
   * Leitura/validação do formulário
   * =============================== */
  function readForm() {
    const form = $('#miForm');
    const data = new FormData(form);
    const obj = {};
    data.forEach((v,k) => {
      obj[k] = v;
    });
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

    // salva rascunho
    saveDraft();

    // gerar revisão quando entrar no 4
    if (state.step === 4) renderReview();

    // Passo 5 => envia
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
    }
  });

  // Voltar
  $('#miBtnVoltar').addEventListener('click', () => {
    if (state.step > STEP_MIN) {
      state.step--;
      renderStep();
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

  // Input de CPF — só mascara/limpa números e não dispara busca automática
  $('#miCpf').addEventListener('input', (e) => {
    const v = e.target.value.replace(/[^\d]/g, '');
    e.target.value = v;
    // sempre que o CPF muda, desabilita avancar até pesquisar
    state.searched = false;
    renderStep();
  }, { passive: true });

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
        // monta Passo 2 preenchido e readonly
        const perfil = state.perfil;
        // mapeia possíveis chaves vindas do backend pro legado
        const m = {
          numerodeinscricao: found.numerodeinscricao || found.numero || found.protocolo || '',
          cpf: cpf,
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
        };
        state.data = { ...state.data, ...m };
        buildStep2Form(perfil, m, true);
        msg.textContent = 'Inscrição encontrada. Confira os dados e avance.';
        msg.className = 'small ms-2 text-success';
      } else {
        // cadastro novo
        state.data = { cpf, identificacao: state.perfil };
        buildStep2Form(state.perfil, state.data, false); // campos livres
        msg.innerHTML = '<span class="text-warning">CPF não encontrado.</span> Clique em <strong>Avançar</strong> para fazer seu cadastro.';
        msg.className = 'small ms-2';
      }

      // habilita avançar
      renderStep();
      // assentos (se necessário)
      renderSeats();
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
        searched: false, found: false, edited: false,
      };

      $('#miPerfil').textContent = perfil;

      // Garante UI do Passo 1 (Pesquisar + assentos)
      ensureStep1UI();
      renderSeats();

      // Reseta formulário e validações
      const form = document.getElementById('miForm');
      form.reset();
      $all('#miForm .was-validated').forEach(el => el.classList.remove('was-validated'));

      // Passo 2 começa vazio até a pesquisa
      const step2 = document.querySelector('.mi-pane[data-step="2"]');
      if (step2) step2.innerHTML = '<div class="text-muted">Faça a pesquisa do CPF para carregar ou iniciar o cadastro.</div>';

      // Ajusta rótulo do último passo
      updateFinalStepLabel();

      renderStep();
      modal.show();
    });
  });

})();
