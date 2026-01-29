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
    buscarCpf: `${API}/api/inscricoes/buscar`,
    criar:     `${API}/api/inscricoes/criar`,
    atualizar: `${API}/api/inscricoes/atualizar`,
    confirmar: `${API}/api/inscricoes/confirmar`,
    assentosConselheiros: `${API}/api/inscricoes/assentos/conselheiros`
  };

  async function apiCriar(payload){
    const res = await fetch(ROUTES.criar, { method:'POST', headers:defaultHeaders, body:JSON.stringify({ formData:payload, perfil: state.perfil })});
    if(!res.ok){ const j=await res.json().catch(()=>null); throw new Error(j?.error||'Erro ao criar'); }
    return res.json(); // { codigo }
  }
  async function apiAtualizar(payload){
    const res = await fetch(ROUTES.atualizar, { method:'POST', headers:defaultHeaders, body:JSON.stringify({ formData:payload, perfil: state.perfil })});
    if(!res.ok){ const j=await res.json().catch(()=>null); throw new Error(j?.error||'Erro ao atualizar'); }
    return res.json(); // { ok:true }
  }

  const defaultHeaders = { 'Content-Type': 'application/json' };

  /* ===============================
   * Estado geral
   * =============================== */
  const modalEl = document.getElementById('modalInscricao');
  if (!modalEl) { console.error('Faltou o HTML do modal #modalInscricao no index.html'); return; }
  const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: true });

  const STEP_MIN = 1, STEP_MAX = 6;
  const initialState = () => ({
    perfil: null,
    step: 1,
    data: {},
    protocolo: null,
    pdfUrl: null,
    searched: false,
    found: false
  });
  let state = initialState();

  // �Nome no prisma� autom�tico
  let prismaManual = false;
  let ultimaSugestaoPrisma = '';

  /* ===============================
   * Esquemas
   * =============================== */
  const CAMPOS_DADOS_CONSELHEIRO = [
    { id: 'numerodeinscricao', label: 'N�mero de Inscri��o', type: 'text', readonly: true },
    { id: 'cpf',               label: 'CPF',                 type: 'text', required: true },
    { id: 'nome',              label: 'Nome',                type: 'text', required: true },
    { id: 'nomenoprismacracha',label: 'Nome no Prisma/Crach�', type: 'text' },
    { id: 'ufsigla',           label: 'UF/Sigla',            type: 'text' },
    { id: 'sigladaentidade',   label: 'Sigla da Entidade',   type: 'text' },
    { id: 'endereco',          label: 'Endere�o',            type: 'text' },
    { id: 'emailconselheiroa', label: 'E-mail Conselheiro(a)', type: 'email' },
    { id: 'emailsecretarioa',  label: 'E-mail Secret�rio(a)',  type: 'email' },
  ];
  const CAMPOS_DADOS_REDUZIDOS = [
    { id: 'numerodeinscricao', label: 'N�mero de Inscri��o', type: 'text', readonly: true },
    { id: 'cpf',               label: 'CPF',                 type: 'text', required: true },
    { id: 'nome',              label: 'Nome',                type: 'text', required: true },
    { id: 'ufsigla',           label: 'UF/Sigla',            type: 'text' },
    { id: 'convidadopor',      label: 'Convidado por',       type: 'text' },
    { id: 'email',             label: 'E-mail',              type: 'email' },
  ];
  const CAMPOS_PERFIL_BASE = [
    { id: 'identificacao',     label: 'Identifica��o',       type: 'text', readonly: true },
  ];
  const CAMPOS_PERFIL_CONSELHEIRO = [
    { id: 'representatividade',label: 'Representatividade',  type: 'text' },
    { id: 'cargofuncao',       label: 'Cargo / Fun��o',      type: 'text' },
  ];

  /* ===============================
   * Helpers DOM/UX
   * =============================== */
  const $ = sel => document.querySelector(sel);
  const $all = sel => [...document.querySelectorAll(sel)];

  /* ===== Lottie overlay ===== */
  const LOTTIE_MAP = {
    search:      '/animacoes/lottie_search_loading.json',
    download: '/animacoes/lottie_download.json', 
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

  // ?? Agora aceita "chave" (ex.: 'search') OU caminho direto (ex.: '/animacoes/xxx.json')
  function openLottie(kindOrPath = 'search', msg = '') {
    const overlay = document.getElementById('miLottieOverlay');
    const holder  = document.getElementById('miLottieHolder');
    const msgEl   = document.getElementById('miLottieMsg');
    if (!overlay || !holder) return;

    try { if (lottieInst) lottieInst.destroy(); } catch {}
    holder.innerHTML = '';

    const path = LOTTIE_MAP[kindOrPath] || String(kindOrPath || '');
    if (path && window.lottie) {
      lottieInst = window.lottie.loadAnimation({
        container: holder, renderer: 'svg', loop: true, autoplay: true, path
      });
    }

    if (msgEl) msgEl.textContent = msg;
    overlay.classList.remove('d-none');
  }

  function closeLottie() {
    const overlay = document.getElementById('miLottieOverlay');
    const holder  = document.getElementById('miLottieHolder');
    const msgEl   = document.getElementById('miLottieMsg');
    if (!overlay) return;

    overlay.classList.add('d-none');
    try { if (lottieInst) lottieInst.destroy(); } catch {}
    lottieInst = null;
    if (holder) holder.innerHTML = '';
    if (msgEl) msgEl.textContent = '';
  }

  // ?? Expor para outros m�dulos (ex.: admin.js)
  window.miLottieShow = (kindOrPath = 'search', msg = '') => openLottie(kindOrPath, msg);
  window.miLottieHide = () => closeLottie();

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
    lastStep.textContent = state.protocolo ? 'N�mero de inscri��o' : 'Finalizar';
  }

  function renderStep() {
    $('#miStepLabel').textContent = `Passo ${state.step} de ${STEP_MAX}`;
    $all('.mi-stepper .mi-step').forEach(s => {
      const n = Number(s.dataset.step);
      s.classList.toggle('is-active', n === state.step);
      s.classList.toggle('is-done', n < state.step);
    });
    $all('.mi-pane').forEach(p => p.classList.toggle('active', Number(p.dataset.step) === state.step));

    // Voltar: vis�vel s� do passo 2 ao 6 e fica � esquerda (CSS cuida do layout)
    const btnVoltar = $('#miBtnVoltar');
    btnVoltar.classList.toggle('d-none', state.step === 1);

    const avancar = $('#miBtnAvancar');
    if (state.step === 4 && state.data?.numerodeinscricao) {
      avancar.textContent = 'Salvar e Sair';
    } else {
      avancar.textContent = state.step < STEP_MAX ? 'Avan�ar' : 'Concluir';
    }
    avancar.disabled = (state.step === 1 && !state.searched);

    updateFinalStepLabel();
  }

  /* ===============================
   * PASSO 1 � CPF + Pesquisar + Assentos
   * =============================== */
  function ensureStep1UI() {
    const pane = document.querySelector('.mi-pane[data-step="1"]');
    if (!pane || pane.dataset.enhanced === '1') return;

    // A��es (Pesquisar + mensagem)
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
      openLottie('seats', 'Carregando mapa de assentos�');
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
   * PASSO 2 � Dados
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
          ${f.required ? '<div class="invalid-feedback">Campo obrigat�rio.</div>' : ''}
        </div>
      `;
    }).join('');

    pane.innerHTML = `<div class="row g-3">${blocks}</div>`;

    // Nome no prisma/crach� autom�tico
    const nomeEl   = $('#nome');
    const prismaEl = $('#nomenoprismacracha');

    prismaManual = false;
    ultimaSugestaoPrisma = '';

    if (prismaEl) prismaEl.addEventListener('input', () => { prismaManual = true; });
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
   * PASSO 3 � Perfil
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
   * Leitura/valida��o + rascunho
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

  // R�tulos bonitos para Revis�o
  const LABELS = {
    numerodeinscricao: 'N�mero de Inscri��o',
    cpf: 'CPF',
    nome: 'Nome',
    nomenoprismacracha: 'Nome no Prisma/Crach�',
    ufsigla: 'UF/Sigla',
    representatividade: 'Representatividade',
    cargofuncao: 'Cargo / Fun��o',
    sigladaentidade: 'Sigla da Entidade',
    identificacao: 'Identifica��o',
    endereco: 'Endere�o',
    emailconselheiroa: 'E-mail Conselheiro(a)',
    emailsecretarioa: 'E-mail Secret�rio(a)',
    convidadopor: 'Convidado por',
    email: 'E-mail'
  };
  const HIDDEN_KEYS = new Set(['_rowIndex']);

  function prettyLabel(key) {
    if (LABELS[key]) return LABELS[key];
    return String(key)
      .replace(/^_+/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_\-]+/g, ' ')
      .replace(/\b\w/g, m => m.toUpperCase());
  }

  function renderReview() {
    const d = { ...state.data, ...readForm() };
    const rows = Object.entries(d)
      .filter(([k,v]) => !HIDDEN_KEYS.has(k) && String(v).trim() !== '')
      .map(([k,v]) => `<div class="d-flex">
        <div class="me-2 text-secondary" style="min-width:220px">${escapeHtml(prettyLabel(k))}</div>
        <div class="fw-semibold flex-grow-1">${Array.isArray(v)?v.map(escapeHtml).join(', '):escapeHtml(v)}</div>
      </div>`)
      .join('');

    const editarLink = `<div class="mt-3">
      <button type="button" id="miEditarInfo" class="btn btn-link p-0">Editar informa��es</button>
    </div>`;

    $('#miReview').innerHTML = (rows || '<div class="text-muted">Sem dados para revisar.</div>') + editarLink;

    // Editar ? volta para passo 2
    $('#miEditarInfo')?.addEventListener('click', () => {
      state.step = 2;
      renderStep();
    });
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
   * Reset do modal/estado
   * =============================== */
  function resetModal() {
    state = initialState();
    const form = document.getElementById('miForm');
    form.reset();
    $all('#miForm .was-validated').forEach(el => el.classList.remove('was-validated'));
    $('#miCpfMsg') && ($('#miCpfMsg').textContent = '');
    const step2 = document.querySelector('.mi-pane[data-step="2"]');
    if (step2) step2.innerHTML = '<div class="text-muted">Fa�a a pesquisa do CPF para carregar ou iniciar o cadastro.</div>';
    const step3 = document.querySelector('.mi-pane[data-step="3"]');
    if (step3) step3.innerHTML = '<div class="text-muted">Os campos do perfil aparecer�o aqui ap�s a pesquisa do CPF.</div>';
    $('#miReview') && ($('#miReview').innerHTML = '');
    updateFinalStepLabel();
    renderStep();
  }
  modalEl.addEventListener('hidden.bs.modal', resetModal);

  /* ===============================
   * Eventos principais
   * =============================== */
  $('#miBtnAvancar').addEventListener('click', async () => {
    // Passo 6: concluir ? fecha modal
    if (state.step === 6) { modal.hide(); return; }

    // Caso �Salvar e Sair� (editar dados de quem j� tem n�mero)
    if (state.step === 4 && state.data?.numerodeinscricao) {
      if (!validateStep()) return;
      saveDraft();
      try {
        const payload = { ...state.data, ...readForm() };
        openLottie('saving', 'Salvando altera��es�');
        await apiAtualizar(payload);  // ? editar = /atualizar
        closeLottie();
        openLottie('confirming', `${(payload.nome || '').split(' ')[0] || 'OK'}, dados atualizados!`);
        setTimeout(() => { closeLottie(); modal.hide(); }, 1200);
      } catch (e) {
        openLottie('error', e.message || 'Erro ao salvar.');
        setTimeout(closeLottie, 1600);
      }
      return;
    }


    if (!validateStep()) return;
    saveDraft();

    // envio final (gerar n�mero de inscri��o)
    if (state.step === 5) {
      try {
        const payload   = { ...state.data, ...readForm() };
        const isNew     = !state.found || !payload._rowIndex;       // n�o veio da planilha ? novo
        const hasNumero = !!payload.numerodeinscricao;               // j� tem n�? ? � edi��o

        let resp;

        if (isNew) {
          openLottie('saving', 'Realizando sua inscri��o�');
          resp = await apiCriar(payload);                            // { codigo }
        } else if (hasNumero) {
          openLottie('saving', 'Atualizando seus dados�');
          await apiAtualizar(payload);                               // { ok:true }
          resp = { codigo: payload.numerodeinscricao };
        } else {
          openLottie('saving', 'Confirmando sua inscri��o�');
          resp = await apiConfirmar(payload);                        // { codigo }
        }

        state.protocolo = resp?.codigo || null;
        state.pdfUrl    = resp?.pdfUrl || null;
        $('#miProtocolo').textContent = state.protocolo || '�';

        state.step = 6;
        renderStep();

        closeLottie();
        openLottie('confirming', 'Inscri��o conclu�da!');
        setTimeout(closeLottie, 1200);
        return;
      } catch (e) {
        openLottie('error', e.message || 'Erro ao concluir a inscri��o.');
        setTimeout(closeLottie, 1600);
        return;
      }
    }


    // navega��o normal
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

  // CPF: s� n�meros + ENTER para pesquisar
  const cpfInput = document.getElementById('miCpf');
  cpfInput.addEventListener('input', (e) => {
    const v = e.target.value.replace(/[^\d]/g, '');
    e.target.value = v;
    state.searched = false;
    renderStep();
  }, { passive: true });
  cpfInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); onPesquisarCpf(); }
  });

  // Atualiza revis�o ao vivo no passo 4
  document.getElementById('miForm').addEventListener('input', () => {
    if (state.step === 4) renderReview();
  });

  async function onPesquisarCpf() {
    const cpf = cpfDigits($('#miCpf').value);
    const msg = $('#miCpfMsg');
    if (!cpf || cpf.length !== 11) {
      msg.textContent = 'Digite um CPF v�lido (11 d�gitos).';
      msg.className = 'small ms-2 text-danger';
      return;
    }

    try {
      msg.textContent = 'Buscando...';
      msg.className = 'small ms-2 text-muted';
      openLottie('search', 'Buscando CPF�');

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
        const merged = { ...back, ...filterNonEmpty(draft) };

        state.data = merged;
        buildStep2Form(perfil, merged);
        buildStep3Perfil(perfil, merged);

        // AVAN�A DIRETO PARA REVIS�O (passo 4)
        state.step = 4;
        renderStep();
        renderReview();

        msg.textContent = 'Inscri��o encontrada. Revise os dados.';
        msg.className = 'small ms-2 text-success';
      } else {
        const base = { cpf, identificacao: state.perfil, ...(draft || {}) };
        state.data = base;
        buildStep2Form(state.perfil, base);
        buildStep3Perfil(state.perfil, base);

        msg.innerHTML = '<span class="text-warning">CPF n�o encontrado.</span> Clique em <strong>Avan�ar</strong> para fazer seu cadastro.';
        msg.className = 'small ms-2';

        renderStep();
      }

      renderSeats();
    } catch (e) {
      msg.textContent = e.message || 'Erro na busca.';
      msg.className = 'small ms-2 text-danger';
      openLottie('error', 'Falha ao buscar CPF.');
      setTimeout(closeLottie, 1400);
      return;
    } finally {
      setTimeout(closeLottie, 300);
    }
  }

  /* ===============================
   * Abrir modal a partir dos cards
   * =============================== */
  const openProfileModal = (card) => {
    if (!card) return;
    const perfil = card?.dataset.profile || 'Conselheiro';
    state = initialState();
    state.perfil = perfil;

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
  };

  $all('.profile-card').forEach(card => {
    card.addEventListener('click', (event) => {
      if (event.target.closest('a, button, input, textarea, select')) return;
      openProfileModal(card);
    });
  });

  $all('.select-profile').forEach(btn => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      openProfileModal(btn.closest('.profile-card'));
    });
  });

})();

