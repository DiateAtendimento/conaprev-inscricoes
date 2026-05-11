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
    cancelar:  `${API}/api/inscricoes/cancelar`,
    galeria: `${API}/api/inscricoes/galeria`
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
  async function apiCancelar(_rowIndex){
    const res = await fetch(ROUTES.cancelar, { method:'POST', headers:defaultHeaders, body:JSON.stringify({ _rowIndex, perfil: state.perfil })});
    if(!res.ok){ const j=await res.json().catch(()=>null); throw new Error(j?.error||'Erro ao cancelar'); }
    return res.json(); // { ok:true }
  }

  const defaultHeaders = { 'Content-Type': 'application/json' };

  /* ===============================
   * Estado geral
   * =============================== */
  const modalEl = document.getElementById('modalInscricao');
  if (!modalEl) { console.error('Faltou o HTML do modal #modalInscricao no index.html'); return; }
  const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: true });
  const cancelModalEl = document.getElementById('cancelInscricaoModal');
  const cancelModal = cancelModalEl ? new bootstrap.Modal(cancelModalEl, { backdrop: 'static', keyboard: true }) : null;
  const cancelMsgEl = document.getElementById('cancelInscricaoMsg');
  const cancelYesBtn = document.getElementById('cancelInscricaoYes');
  const cancelNoBtn = document.getElementById('cancelInscricaoNo');

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

  // "Nome no prisma" automático
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

  const PHOTO_DIR_LOCAL = '/imagens/fotos-conselheiros';
  const PHOTO_DIR_STAFF = '/imagens/fotos-staff';
  const PHOTO_DIR_SPEAKER = '/imagens/fotos-palestrantes';
  const DEFAULT_PHOTO_URL = `${PHOTO_DIR_LOCAL}/padrao.svg`;
  const DEFAULT_STAFF_PHOTO_URL = `${PHOTO_DIR_STAFF}/padrao.svg`;
  const DEFAULT_SPEAKER_PHOTO_URL = '/imagens/cards/palestrante.svg';
  const photoCacheGlobal = new Map();
  let photoIndexPromiseGlobal = null;
  let photoIndexLocal = new Map();

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

  // ?? Expor para outros módulos (ex.: admin.js)
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
    lastStep.textContent = state.protocolo ? 'Número de Inscrição' : 'Finalizar';
  }

  function renderStep() {
    $('#miStepLabel').textContent = `Passo ${state.step} de ${STEP_MAX}`;
    $all('.mi-stepper .mi-step').forEach(s => {
      const n = Number(s.dataset.step);
      s.classList.toggle('is-active', n === state.step);
      s.classList.toggle('is-done', n < state.step);
    });
    $all('.mi-pane').forEach(p => p.classList.toggle('active', Number(p.dataset.step) === state.step));

    // Voltar: visível só do passo 2 ao 6 e fica à esquerda (CSS cuida do layout)
    const btnVoltar = $('#miBtnVoltar');
    btnVoltar.classList.toggle('d-none', state.step === 1);

    const avancar = $('#miBtnAvancar');
    if (state.step === 4 && state.data?.numerodeinscricao) {
      avancar.textContent = 'Salvar e Sair';
    } else {
      avancar.textContent = state.step < STEP_MAX ? 'Avançar' : 'Concluir';
    }
    const allowAdvanceStep1 = state.searched && (!state.found || !!state.data?.numerodeinscricao);
    avancar.classList.toggle('d-none', state.step === 1 && !allowAdvanceStep1);
    avancar.disabled = (state.step === 1 && !allowAdvanceStep1);

    updateFinalStepLabel();
  }

  /* ===============================
   * PASSO 1 – CPF + Pesquisar + Assentos
   * =============================== */
  function ensureStep1UI() {
    const pane = document.querySelector('.mi-pane[data-step="1"]');
    if (!pane || pane.dataset.enhanced === '1') return;

    const btnSearch = document.createElement('button');
    btnSearch.type = 'button';
    btnSearch.id = 'miBtnBuscarCpf';
    btnSearch.className = 'btn btn-primary';
    btnSearch.textContent = 'Pesquisar';

    const msg = document.createElement('div');
    msg.id = 'miCpfMsg';
    msg.className = 'small text-muted mt-2';

    const cpfInput = pane.querySelector('#miCpf');
    const cpfCol = cpfInput?.closest('.col-12');
    if (cpfInput && cpfCol) {
      if (!cpfCol.querySelector('.mi-cpf-wrap')) {
        const wrap = document.createElement('div');
        wrap.className = 'mi-cpf-wrap d-flex align-items-end gap-2';
        cpfInput.parentNode.insertBefore(wrap, cpfInput);
        wrap.appendChild(cpfInput);
        wrap.appendChild(btnSearch);
        cpfCol.appendChild(msg);
      }
    }

    const galleryWrap = document.createElement('div');
    galleryWrap.id = 'miGalleryWrap';
    galleryWrap.className = 'mt-4 d-none';
    galleryWrap.innerHTML = `
      <div id="miGalleryTitle" class="fw-semibold mb-2">Inscritos</div>
      <div id="miGalleryMsg" class="small text-muted"></div>
      <div id="miGalleryGridWrap" class="mi-gallery-grid-wrap">
        <div id="miGalleryGrid" class="mi-staff-grid"></div>
      </div>
    `;
    pane.appendChild(galleryWrap);

    pane.dataset.enhanced = '1';
    btnSearch.addEventListener('click', onPesquisarCpf);
  }

  function setGalleryMsg(text, tone = 'text-muted') {
    const el = document.getElementById('miGalleryMsg');
    if (!el) return;
    el.textContent = text || '';
    el.className = `small ${tone}`;
  }

  function getGalleryTitle(perfil) {
    const labels = {
      Conselheiro: 'Conselheiros inscritos',
      CNRPPS: 'CNRPPS inscritos',
      Palestrante: 'Palestrantes inscritos',
      Staff: 'Staff inscrito',
      Convidado: 'Convidados inscritos',
      Apoiador: 'Apoiadores inscritos',
      Patrocinador: 'Patrocinadores inscritos',
      COPAJURE: 'COPAJURE inscrito',
    };
    return labels[String(perfil || '').trim()] || 'Inscritos';
  }

  function getDefaultGalleryPhoto(perfil) {
    if (perfil === 'Staff') return DEFAULT_STAFF_PHOTO_URL;
    if (perfil === 'Palestrante') return DEFAULT_SPEAKER_PHOTO_URL;
    return DEFAULT_PHOTO_URL;
  }

  async function resolveGalleryPhotoUrl(perfil, nome) {
    if (perfil === 'Staff') return resolveStaffPhotoUrlByName(nome);
    if (perfil === 'Palestrante') return resolveSpeakerPhotoUrlByName(nome);
    return resolvePhotoUrlByName(nome);
  }

  function attachGalleryFallback(img, perfil, nome, initialUrl) {
    if (!img || !nome) return;
    if (perfil === 'Staff') {
      attachStaffFallback(img, nome, initialUrl);
      return;
    }
    if (perfil === 'Palestrante') {
      attachSpeakerFallback(img, nome, initialUrl);
      return;
    }
    img.onerror = () => {
      if (img.src !== DEFAULT_PHOTO_URL) img.src = DEFAULT_PHOTO_URL;
    };
  }

  function buildGalleryMeta(item) {
    const sigla = String(item?.sigladaentidade || '').trim();
    const ufSigla = String(item?.ufsigla || '').trim();
    return sigla || ufSigla;
  }

  async function renderProfileGallery(list = []) {
    const grid = $('#miGalleryGrid');
    const gridWrap = $('#miGalleryGridWrap');
    if (!grid || !gridWrap) return;

    grid.innerHTML = '';
    gridWrap.classList.toggle('is-scrollable', list.length > 14);

    list.forEach((item) => {
      const nome = String(item?.nome || '').trim();
      const codigo = String(item?.numerodeinscricao || '').trim();
      const meta = buildGalleryMeta(item);
      const gender = guessGenderByName(nome);
      const card = document.createElement('div');
      card.className = `mi-staff-card ${gender === 'female' ? 'is-female' : 'is-male'}`;
      card.innerHTML = `
        <div class="mi-staff-photo">
          <img alt="Foto de ${escapeHtml(nome || 'Inscrito')}" src="${escapeHtml(getDefaultGalleryPhoto(state.perfil))}">
        </div>
        <div class="mi-staff-name">${escapeHtml(nome || 'Inscrito')}</div>
        ${meta ? `<div class="mi-staff-entity">${escapeHtml(meta)}</div>` : ''}
        ${codigo ? `<div class="mi-staff-code">${escapeHtml(codigo)}</div>` : ''}
      `;
      grid.appendChild(card);

      const img = card.querySelector('img');
      if (!img || !nome) return;
      resolveGalleryPhotoUrl(state.perfil, nome).then((url) => {
        const safeUrl = url || getDefaultGalleryPhoto(state.perfil);
        img.src = safeUrl;
        attachGalleryFallback(img, state.perfil, nome, safeUrl);
      });
    });
  }

  async function renderSeats() {
    const wrap = $('#miGalleryWrap');
    const title = $('#miGalleryTitle');
    const grid = $('#miGalleryGrid');
    const gridWrap = $('#miGalleryGridWrap');
    if (!wrap || !title || !grid || !gridWrap) return;

    if (!state.perfil) {
      wrap.classList.add('d-none');
      return;
    }

    wrap.classList.remove('d-none');
    title.textContent = getGalleryTitle(state.perfil);
    grid.innerHTML = '';
    gridWrap.classList.remove('is-scrollable');

    try {
      setGalleryMsg('Carregando inscritos...', 'text-muted');
      openLottie('seats', 'Carregando inscritos');
      const url = `${ROUTES.galeria}?perfil=${encodeURIComponent(state.perfil)}`;
      const res = await fetch(url, { method: 'GET' });
      const data = res.ok ? await res.json() : [];
      const list = Array.isArray(data) ? data : [];

      if (!list.length) {
        setGalleryMsg('Nenhuma inscrição encontrada até o momento.', 'text-muted');
        return;
      }

      setGalleryMsg('', 'text-muted');
      await renderProfileGallery(list);
    } catch {
      setGalleryMsg('Falha ao carregar os inscritos.', 'text-danger');
    } finally {
      closeLottie();
    }
  }

  /* ===============================
   * PASSO 2 – Dados
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
   * PASSO 3 – Perfil
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

    const fotoBlock = (perfil === 'Conselheiro') ? `
      <div class="col-12">
        <label class="form-label">Foto</label>
        <div class="d-flex align-items-center gap-3 flex-wrap">
          <div class="mi-photo-preview">
            <img id="miFotoPreview" src="${escapeHtml(DEFAULT_PHOTO_URL)}" alt="Foto do conselheiro">
          </div>
        </div>
      </div>
    ` : '';

    pane.innerHTML = `<div class="row g-3">${fotoBlock}${blocks}</div>`;

    if (perfil === 'Conselheiro') {
      loadPhotoIndexGlobal().then(() => {
        const preview = document.getElementById('miFotoPreview');
        if (!preview) return;
        if (data.nome) {
          resolvePhotoUrlByName(data.nome).then((url) => {
            if (url) preview.src = url;
          });
        }
      });
    }
  }

  function guessGenderByName(nome) {
    const n = normalizeNameKeyGlobal(nome).split(' ')[0] || '';
    if (!n) return 'male';
    const maleExceptions = new Set(['luca', 'lucca', 'lucca', 'josue', 'jonas', 'matias', 'baltazar']);
    if (maleExceptions.has(n)) return 'male';
    if (n.endsWith('a')) return 'female';
    return 'male';
  }

  /* ===============================
   * Leitura/Validação + rascunho
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

  // Rótulos bonitos para Revisão
  const LABELS = {
    numerodeinscricao: 'Número de Inscrição',
    cpf: 'CPF',
    nome: 'Nome',
    nomenoprismacracha: 'Nome no Prisma/Crachá',
    ufsigla: 'UF/Sigla',
    representatividade: 'Representatividade',
    cargofuncao: 'Cargo / Função',
    sigladaentidade: 'Sigla da Entidade',
    identificacao: 'Identificação',
    endereco: 'Endereço',
    emailconselheiroa: 'E-mail Conselheiro(a)',
    emailsecretarioa: 'E-mail Secretário(a)',
    convidadopor: 'Convidado por',
    email: 'E-mail'
  };
  const HIDDEN_KEYS = new Set(['_rowIndex', 'foto']);

  function prettyLabel(key) {
    if (LABELS[key]) return LABELS[key];
    return String(key)
      .replace(/^_+/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_\-]+/g, ' ')
      .replace(/\b\w/g, m => m.toUpperCase());
  }

  function getFotoUrl(value) {
    if (!value) return DEFAULT_PHOTO_URL;
    const v = String(value).trim();
    if (!v) return DEFAULT_PHOTO_URL;
    if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/')) return v;
    return `${PHOTO_DIR_LOCAL}/${v}`;
  }

  const stripDiacriticsGlobal = (value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  function normalizeNameKeyGlobal(value) {
    return stripDiacriticsGlobal(value)
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  async function loadPhotoIndexGlobal() {
    if (photoIndexPromiseGlobal) return photoIndexPromiseGlobal;
    photoIndexPromiseGlobal = (async () => {
      const tryFetch = async (url) => {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) return [];
        const list = await res.json().catch(() => []);
        return Array.isArray(list) ? list : [];
      };
      let list = [];
      try { list = await tryFetch(`${PHOTO_DIR_LOCAL}/manifest.json`); } catch {}
      list.forEach((file) => {
        if (typeof file !== 'string') return;
        const key = normalizeNameKeyGlobal(file);
        if (key) photoIndexLocal.set(key, file);
      });
      return { local: photoIndexLocal };
    })();
    return photoIndexPromiseGlobal;
  }

  async function resolvePhotoUrlByName(nome) {
    const key = normalizeNameKeyGlobal(nome);
    if (!key) return null;
    if (photoCacheGlobal.has(key)) return photoCacheGlobal.get(key);
    const index = await loadPhotoIndexGlobal();
    const filename = index.local.get(key);
    const url = filename
      ? `${PHOTO_DIR_LOCAL}/${filename}`
      : DEFAULT_PHOTO_URL;
    photoCacheGlobal.set(key, url);
    return url;
  }

  async function resolveStaffPhotoUrlByName(nome) {
    const safeName = String(nome || '').trim();
    const key = normalizeNameKeyGlobal(safeName);
    if (!key) return null;
    if (photoCacheGlobal.has(`staff:${key}`)) return photoCacheGlobal.get(`staff:${key}`);
    let filename = '';
    try {
      const res = await fetch(`${PHOTO_DIR_STAFF}/manifest.json`, { cache: 'no-cache' });
      if (res.ok) {
        const list = await res.json().catch(() => []);
        if (Array.isArray(list)) {
          list.forEach((file) => {
            if (typeof file !== 'string') return;
            const k = normalizeNameKeyGlobal(file);
            if (k && k === key) filename = file;
          });
        }
      }
    } catch {}
    if (!filename && safeName) {
      filename = `${safeName}.png`;
    }
    const safeFile = filename ? encodeURIComponent(filename) : '';
    const url = safeFile ? `${PHOTO_DIR_STAFF}/${safeFile}` : DEFAULT_STAFF_PHOTO_URL;
    photoCacheGlobal.set(`staff:${key}`, url);
    return url;
  }

  const STAFF_PHOTO_EXTS = ['png', 'jpg', 'jpeg'];

  function staffPhotoUrlFromName(name, ext) {
    const safeName = String(name || '').trim();
    if (!safeName) return DEFAULT_STAFF_PHOTO_URL;
    return `${PHOTO_DIR_STAFF}/${encodeURIComponent(`${safeName}.${ext}`)}`;
  }

  function setStaffFallbackIndex(img, url) {
    const match = String(url || '').match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    const ext = match ? match[1].toLowerCase() : '';
    const idx = STAFF_PHOTO_EXTS.indexOf(ext);
    img.dataset.staffExtIndex = String(idx >= 0 ? idx : 0);
  }

  function attachStaffFallback(img, name, initialUrl) {
    if (!img || !name) return;
    if (initialUrl === DEFAULT_STAFF_PHOTO_URL) return;
    img.dataset.staffName = name;
    setStaffFallbackIndex(img, initialUrl);
    img.onerror = () => {
      const n = img.dataset.staffName || name;
      let idx = Number(img.dataset.staffExtIndex || '0');
      idx += 1;
      if (idx < STAFF_PHOTO_EXTS.length) {
        img.dataset.staffExtIndex = String(idx);
        img.src = staffPhotoUrlFromName(n, STAFF_PHOTO_EXTS[idx]);
        return;
      }
      if (img.src !== DEFAULT_STAFF_PHOTO_URL) img.src = DEFAULT_STAFF_PHOTO_URL;
    };
  }

  async function resolveSpeakerPhotoUrlByName(nome) {
    const safeName = String(nome || '').trim();
    const key = normalizeNameKeyGlobal(safeName);
    if (!key) return null;
    if (photoCacheGlobal.has(`speaker:${key}`)) return photoCacheGlobal.get(`speaker:${key}`);
    let filename = '';
    try {
      const res = await fetch(`${PHOTO_DIR_SPEAKER}/manifest.json`, { cache: 'no-cache' });
      if (res.ok) {
        const list = await res.json().catch(() => []);
        if (Array.isArray(list)) {
          list.forEach((file) => {
            if (typeof file !== 'string') return;
            const k = normalizeNameKeyGlobal(file);
            if (k && k === key) filename = file;
          });
        }
      }
    } catch {}
    if (!filename && safeName) {
      filename = `${safeName}.jpg`;
    }
    const safeFile = filename ? encodeURIComponent(filename) : '';
    const url = safeFile ? `${PHOTO_DIR_SPEAKER}/${safeFile}` : DEFAULT_SPEAKER_PHOTO_URL;
    photoCacheGlobal.set(`speaker:${key}`, url);
    return url;
  }

  const SPEAKER_PHOTO_EXTS = ['jpg', 'jpeg', 'png'];

  function speakerPhotoUrlFromName(name, ext) {
    const safeName = String(name || '').trim();
    if (!safeName) return DEFAULT_SPEAKER_PHOTO_URL;
    return `${PHOTO_DIR_SPEAKER}/${encodeURIComponent(`${safeName}.${ext}`)}`;
  }

  function setSpeakerFallbackIndex(img, url) {
    const match = String(url || '').match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    const ext = match ? match[1].toLowerCase() : '';
    const idx = SPEAKER_PHOTO_EXTS.indexOf(ext);
    img.dataset.speakerExtIndex = String(idx >= 0 ? idx : 0);
  }

  function attachSpeakerFallback(img, name, initialUrl) {
    if (!img || !name) return;
    if (initialUrl === DEFAULT_SPEAKER_PHOTO_URL) return;
    img.dataset.speakerName = name;
    setSpeakerFallbackIndex(img, initialUrl);
    img.onerror = () => {
      const n = img.dataset.speakerName || name;
      let idx = Number(img.dataset.speakerExtIndex || '0');
      idx += 1;
      if (idx < SPEAKER_PHOTO_EXTS.length) {
        img.dataset.speakerExtIndex = String(idx);
        img.src = speakerPhotoUrlFromName(n, SPEAKER_PHOTO_EXTS[idx]);
        return;
      }
      if (img.src !== DEFAULT_SPEAKER_PHOTO_URL) img.src = DEFAULT_SPEAKER_PHOTO_URL;
    };
  }

  function renderReviewValue(key, value) {
    return Array.isArray(value) ? value.map(escapeHtml).join(', ') : escapeHtml(value);
  }

  function renderReview() {
    const d = { ...state.data, ...readForm() };
    const editBtn = `
      <button type="button" id="miEditarInfo" class="btn btn-primary btn-sm">
        <i class="bi bi-pencil-square me-1" aria-hidden="true"></i>
        Editar
      </button>
    `;
    const rows = Object.entries(d)
      .filter(([k,v]) => !HIDDEN_KEYS.has(k) && String(v).trim() !== '')
      .map(([k,v]) => {
        const label = escapeHtml(prettyLabel(k));
        const value = renderReviewValue(k, v);
        if (k === 'numerodeinscricao') {
          return `
            <div class="d-flex align-items-center">
              <div class="me-2 fw-semibold" style="min-width:220px">${label}</div>
              <div class="flex-grow-1 d-flex align-items-center justify-content-between gap-2">
                <span>${value}</span>
                ${editBtn}
              </div>
            </div>
          `;
        }
        return `
          <div class="d-flex">
            <div class="me-2 fw-semibold" style="min-width:220px">${label}</div>
            <div class="flex-grow-1">${value}</div>
          </div>
        `;
      })
      .join('');

    let fotoRow = '';
    if (state.perfil === 'Conselheiro' || state.perfil === 'Staff' || state.perfil === 'Palestrante') {
      const isStaff = state.perfil === 'Staff';
      const isSpeaker = state.perfil === 'Palestrante';
      const staffGender = isStaff ? guessGenderByName(d.nome || state.data?.nome || '') : '';
      const staffClass = isStaff
        ? `mi-photo-preview--staff ${staffGender === 'female' ? 'is-female' : 'is-male'}`
        : (isSpeaker ? 'mi-photo-preview--speaker' : '');
      const fotoUrl = d.foto
        ? getFotoUrl(d.foto)
        : (isStaff ? DEFAULT_STAFF_PHOTO_URL : (isSpeaker ? DEFAULT_SPEAKER_PHOTO_URL : DEFAULT_PHOTO_URL));
      fotoRow = `
        <div class="d-flex">
          <div class="me-2 text-secondary" style="min-width:220px">Foto</div>
          <div class="fw-semibold flex-grow-1">
            <div class="mi-photo-preview ${staffClass}">
              <img id="miReviewFoto" src="${escapeHtml(fotoUrl)}" alt="Foto do inscrito">
            </div>
          </div>
        </div>
      `;
    }

    const allowedCancel = new Set(['Conselheiro', 'CNRPPS', 'Palestrante', 'COPAJURE', 'Staff']);
    const showCancel = allowedCancel.has(state.perfil) && !!d._rowIndex;
    const cancelBtn = showCancel ? `
      <button type="button" id="miCancelarInscricao" class="btn btn-danger btn-sm">
        <i class="bi bi-trash me-1" aria-hidden="true"></i>
        Cancelar inscrição
      </button>
    ` : '';

    const cancelRow = cancelBtn
      ? `<div class="mt-3 d-flex justify-content-center">${cancelBtn}</div>`
      : '';

    const body = (rows || '<div class="text-muted">Sem dados para revisar.</div>');
    $('#miReview').innerHTML = (fotoRow ? fotoRow + body : body) + cancelRow;

    if (state.perfil === 'Conselheiro' || state.perfil === 'Staff' || state.perfil === 'Palestrante') {
      loadPhotoIndexGlobal().then(() => {
        const img = document.getElementById('miReviewFoto');
        if (!img) return;
        const nome = d.nome || state.data?.nome || $('#nome')?.value || '';
        if (!nome) return;
        if (state.perfil === 'Staff') {
          resolveStaffPhotoUrlByName(nome).then((url) => {
            if (url) img.src = url;
            attachStaffFallback(img, nome, url);
          });
        } else if (state.perfil === 'Palestrante') {
          resolveSpeakerPhotoUrlByName(nome).then((url) => {
            if (url) img.src = url;
            attachSpeakerFallback(img, nome, url);
          });
        } else {
          resolvePhotoUrlByName(nome).then((url) => {
            if (url) img.src = url;
          });
        }
      });
    }

    // Editar ? volta para passo 2
    $('#miEditarInfo')?.addEventListener('click', () => {
      state.step = 2;
      renderStep();
    });

    $('#miCancelarInscricao')?.addEventListener('click', async () => {
      const idx = Number(d._rowIndex || 0);
      if (!idx) return;
      if (cancelMsgEl) {
        const nome = d.nome || '';
        cancelMsgEl.textContent = `${nome || 'Usuário'}, Tem certeza que deseja cancelar sua inscrição?`;
      }
      cancelYesBtn?.classList.remove('d-none');
      cancelModal?.show();
      if (cancelNoBtn) {
        cancelNoBtn.onclick = () => cancelModal?.hide();
      }
      if (!cancelYesBtn) return;
      cancelYesBtn.onclick = async () => {
      try {
        openLottie('saving', 'Cancelando inscrição…');
        await apiCancelar(idx);
        closeLottie();
        cancelModal?.hide();
        state.data.numerodeinscricao = '';
        state.protocolo = null;
        const numInput = document.getElementById('numerodeinscricao');
        if (numInput) numInput.value = '';
        updateFinalStepLabel();
        renderReview();
        window.location.href = '/';
      } catch (e) {
        openLottie('error', e.message || 'Erro ao cancelar.');
        setTimeout(closeLottie, 1600);
      }
      };
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
    if (!res.ok) {
      let msg = 'Erro ao buscar CPF';
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {}
      throw new Error(msg);
    }
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
    if (step2) step2.innerHTML = '<div class="text-muted">Faça a pesquisa do CPF para carregar ou iniciar o cadastro.</div>';
    const step3 = document.querySelector('.mi-pane[data-step="3"]');
    if (step3) step3.innerHTML = '<div class="text-muted">Os campos do perfil aparecerão aqui após a pesquisa do CPF.</div>';
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

    // Caso "Salvar e Sair" (editar dados de quem já tem Número)
    if (state.step === 4 && state.data?.numerodeinscricao) {
      if (!validateStep()) return;
      saveDraft();
      try {
        const payload = { ...state.data, ...readForm() };
        openLottie('saving', 'Salvando alterações…');
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

    // envio final (gerar Número de Inscrição)
    if (state.step === 5) {
      try {
        const payload   = { ...state.data, ...readForm() };
        const isNew     = !state.found || !payload._rowIndex;       // Não veio da planilha ? novo
        const hasNumero = !!payload.numerodeinscricao;               // já tem nº? -> é edição

        let resp;

        if (isNew) {
          openLottie('saving', 'Realizando sua inscrição…');
          resp = await apiCriar(payload);                            // { codigo }
        } else if (hasNumero) {
          openLottie('saving', 'Atualizando seus dadoSó');
          await apiAtualizar(payload);                               // { ok:true }
          resp = { codigo: payload.numerodeinscricao };
        } else {
          openLottie('saving', 'Confirmando sua inscrição…');
          resp = await apiConfirmar(payload);                        // { codigo }
        }

        state.protocolo = resp?.codigo || null;
        state.pdfUrl    = resp?.pdfUrl || null;
        $('#miProtocolo').textContent = state.protocolo || '-';

        state.step = 6;
        renderStep();

        closeLottie();
        openLottie('confirming', 'Inscrição concluída!');
        setTimeout(closeLottie, 1200);
        return;
      } catch (e) {
        openLottie('error', e.message || 'Erro ao concluir a Inscrição.');
        setTimeout(closeLottie, 1600);
        return;
      }
    }


    // navegAção normal
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

  // CPF: Só Números + ENTER para pesquisar
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

  // Atualiza Revisão ao vivo no passo 4
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
        const merged = { ...back, ...filterNonEmpty(draft) };

        state.data = merged;
        buildStep2Form(perfil, merged);
        buildStep3Perfil(perfil, merged);

        // AVANÇA DIRETO PARA Revisão (passo 4)
        state.step = 4;
        renderStep();
        renderReview();

        msg.textContent = 'Inscrição encontrada. Revise os dados.';
        msg.className = 'small ms-2 text-success';
      } else {
        const base = { cpf, identificacao: state.perfil, ...(draft || {}) };
        state.data = base;
        buildStep2Form(state.perfil, base);
        buildStep3Perfil(state.perfil, base);

        msg.innerHTML = '<span class="text-warning">CPF Não encontrado.</span> Clique em <strong>Avançar</strong> para fazer seu cadastro.';
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
