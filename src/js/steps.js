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
    assentosConselheiros: `${API}/api/inscricoes/assentos/conselheiros`,
    staffs: `${API}/api/inscricoes/staffs`
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
  const DEFAULT_PHOTO_URL = `${PHOTO_DIR_LOCAL}/padrao.svg`;
  const DEFAULT_STAFF_PHOTO_URL = `${PHOTO_DIR_STAFF}/padrao.svg`;
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

    // Mapa de assentos
    const seatsWrap = document.createElement('div');
    seatsWrap.id = 'miSeatsWrap';
    seatsWrap.className = 'mt-4 d-none';
    seatsWrap.innerHTML = `
      <div class="fw-semibold mb-2">Conselheiros inscritos</div>
      <div class="mi-seat-map">
        <div class="mi-seat-map__legend mb-2">
          <span class="badge mi-seat-badge available">Livre</span>
          <span class="badge mi-seat-badge occupied">Ocupado</span>
        </div>
        <div id="miSeatsMsg" class="small text-muted"></div>
        <div class="mi-seat-map__body">
          <div class="mi-seat-screen" aria-hidden="true">
            <span>Tela</span>
          </div>
          <div class="mi-seat-grid-wrap" aria-label="Mapa de assentos em espinha de peixe">
            <div id="miSeatGrid" class="mi-seat-grid"></div>
          </div>
        </div>
      </div>
    `;
    pane.appendChild(seatsWrap);

    const staffWrap = document.createElement('div');
    staffWrap.id = 'miStaffWrap';
    staffWrap.className = 'mt-4 d-none';
    staffWrap.innerHTML = `
      <div class="fw-semibold mb-2">Equipe Staff</div>
      <div id="miStaffMsg" class="small text-muted"></div>
      <div id="miStaffGrid" class="mi-staff-grid"></div>
    `;
    pane.appendChild(staffWrap);

    pane.dataset.enhanced = '1';
    btnSearch.addEventListener('click', onPesquisarCpf);
  }

  const SEAT_CACHE_KEY = 'mi:seat-cache:conselheiros';
  const SEAT_CACHE_TTL_MS = 1000 * 60 * 30; // 30 min

  function readSeatCache() {
    try {
      const raw = localStorage.getItem(SEAT_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.data) || !parsed.ts) return null;
      if (Date.now() - parsed.ts > SEAT_CACHE_TTL_MS) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  function writeSeatCache(data) {
    try {
      localStorage.setItem(SEAT_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch {}
  }

  function setSeatsMsg(text, tone = 'text-muted') {
    const el = document.getElementById('miSeatsMsg');
    if (!el) return;
    el.textContent = text || '';
    el.className = `small ${tone}`;
  }

  function setStaffMsg(text, tone = 'text-muted') {
    const el = document.getElementById('miStaffMsg');
    if (!el) return;
    el.textContent = text || '';
    el.className = `small ${tone}`;
  }

  function buildOccMap(data) {
    const occ = {};
    (data || []).forEach(s => {
      const seatNum = Number(s?.seat);
      if (!Number.isFinite(seatNum)) return;
      occ[seatNum] = s?.name || true;
    });
    return occ;
  }

  async function renderSeats() {
    const wrap = $('#miSeatsWrap');
    const grid = $('#miSeatGrid');
    const staffWrap = $('#miStaffWrap');
    if (!wrap || !grid) return;
    if (state.perfil !== 'Conselheiro') {
      wrap.classList.add('d-none');
      if (state.perfil === 'Staff') {
        staffWrap?.classList.remove('d-none');
        await renderStaffGallery();
      } else {
        staffWrap?.classList.add('d-none');
      }
      return;
    }
    staffWrap?.classList.add('d-none');
    wrap.classList.remove('d-none');
    grid.innerHTML = '';

    try {
      setSeatsMsg('Carregando mapa de assentos...', 'text-muted');
      openLottie('seats', 'Carregando mapa de assentoSó');
      const res = await fetch(ROUTES.assentosConselheiros, { method: 'GET' });
      const data = res.ok ? await res.json() : [];
      const normalized = Array.isArray(data) ? data : [];

      if (normalized.length > 0) {
        writeSeatCache(normalized);
        setSeatsMsg('', 'text-muted');
        renderFishboneSeats(buildOccMap(normalized));
        return;
      }

      const cached = readSeatCache();
      if (cached?.length) {
        setSeatsMsg('Sem dados ao vivo; usando dados salvos recentemente.', 'text-warning');
        renderFishboneSeats(buildOccMap(cached));
        return;
      }

      setSeatsMsg('Nenhum assento ocupado no momento.', 'text-muted');
      renderFishboneSeats({});
    } catch {
      const cached = readSeatCache();
      if (cached?.length) {
        setSeatsMsg('Falha ao carregar ao vivo; usando dados salvos recentemente.', 'text-warning');
        renderFishboneSeats(buildOccMap(cached));
        return;
      }
      setSeatsMsg('Falha ao carregar os assentos.', 'text-danger');
      renderFishboneSeats({});
    } finally {
      closeLottie();
    }
  }

  function renderFishboneSeats(occ = {}) {
    const grid = document.getElementById('miSeatGrid');
    if (!grid) return;

    grid.innerHTML = '';

    // Dois blocos retangulares (como no mock)
    const ROWS = 6;
    const COLS = 6;
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 576px)').matches;
    const GAP_COLS = isMobile ? 1 : 3; // corredor central em colunas vazias
    const TOTAL = 62;

    const pos = [];
    const addPos = (n, row, col) => pos.push({ n, row, col });

    let seat = 1;
    const leftStartCol = 1;
    const rightStartCol = 1 + COLS + GAP_COLS;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (seat > TOTAL) break;
        addPos(seat, 1 + r, leftStartCol + c);
        seat++;
      }
      for (let c = 0; c < COLS; c++) {
        if (seat > TOTAL) break;
        addPos(seat, 1 + r, rightStartCol + c);
        seat++;
      }
      if (seat > TOTAL) break;
    }

    grid.style.setProperty('--grid-rows', ROWS);
    grid.style.setProperty('--grid-cols', COLS * 2 + GAP_COLS);

    const PHOTO_DIR = PHOTO_DIR_LOCAL;
    const PHOTO_MANIFEST_URL = `${PHOTO_DIR_LOCAL}/manifest.json`;
    const DEFAULT_PHOTO_URL = `${PHOTO_DIR_LOCAL}/padrao.svg`;
    const photoCache = new Map();
    let photoIndexPromise = null;
    const photoAliases = new Map([
      ['allex albert rodrigues', 'Allex-albert.svg'],
    ]);

    function getSeatPreviewEl() {
      let el = document.getElementById('miSeatPreview');
      if (!el) {
        el = document.createElement('div');
        el.id = 'miSeatPreview';
        document.body.appendChild(el);
      }
      return el;
    }

    function showSeatPreview(nome, url, anchorEl) {
      const el = getSeatPreviewEl();
      const safeUrl = url || DEFAULT_PHOTO_URL;
      el.innerHTML = `
        <div class="mi-seat-card">
          <img src="${safeUrl}" alt="Foto de ${escapeHtml(nome)}">
        </div>
      `;
      el.style.display = 'block';
      positionSeatPreview(anchorEl);
    }

    function positionSeatPreview(anchorEl) {
      const el = document.getElementById('miSeatPreview');
      if (!el || el.style.display === 'none' || !anchorEl) return;
      const seatRect = anchorEl.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const centerX = seatRect.left + seatRect.width / 2;
      let x = centerX - r.width / 2;
      let y = seatRect.top - r.height - 10; // 10px acima do assento
      x = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
      y = Math.max(8, y);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }

    function hideSeatPreview() {
      const el = document.getElementById('miSeatPreview');
      if (el) el.style.display = 'none';
    }

    const stripDiacritics = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    function normalizeNameKey(value) {
      return stripDiacritics(value)
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
    }

    async function loadPhotoIndex() {
      if (photoIndexPromise) return photoIndexPromise;
      photoIndexPromise = (async () => {
        const map = new Map();
        const tryFetch = async (url) => {
          const res = await fetch(url, { cache: 'no-cache' });
          if (!res.ok) return [];
          const list = await res.json().catch(() => []);
          return Array.isArray(list) ? list : [];
        };
        let list = [];
        try { list = await tryFetch(PHOTO_MANIFEST_URL); } catch {}
        list.forEach((file) => {
          if (typeof file !== 'string') return;
          const key = normalizeNameKey(file);
          if (key) map.set(key, file);
        });
        return map;
      })();
      return photoIndexPromise;
    }

    async function resolvePhotoUrl(name) {
      const key = normalizeNameKey(name);
      if (!key) return null;
      if (photoCache.has(key)) return photoCache.get(key);

      const index = await loadPhotoIndex();
      let filename = index.get(key) || photoAliases.get(key);
      if (!filename) {
        const nameTokens = new Set(key.split(' ').filter(Boolean));
        let bestKey = '';
        index.forEach((_file, idxKey) => {
          const idxTokens = idxKey.split(' ').filter(Boolean);
          if (idxTokens.length < 2) return;
          const allPresent = idxTokens.every(t => nameTokens.has(t));
          if (allPresent && idxKey.length > bestKey.length) bestKey = idxKey;
        });
        if (bestKey) filename = index.get(bestKey);
      }
      const url = filename ? `${PHOTO_DIR_LOCAL}/${filename}` : DEFAULT_PHOTO_URL;
      photoCache.set(key, url);
      return url;
    }

    pos.forEach(({ n, row, col }) => {
      const btn = document.createElement('button');
      const ocupado = !!occ[n];
      btn.type = 'button';
      const num = document.createElement('span');
      num.className = 'mi-seat-num';
      num.textContent = n;
      btn.className = `mi-seat ${ocupado ? 'occupied' : 'available'}`;
      btn.style.gridRow = String(row);
      btn.style.gridColumn = String(col);
      if (ocupado && typeof occ[n] === 'string') {
        btn.title = occ[n];
      }
      btn.appendChild(num);

      if (ocupado && typeof occ[n] === 'string') {
        const nome = occ[n].trim();
        resolvePhotoUrl(nome).then(photoUrl => {
          if (!btn.isConnected) return;
          const safeUrl = photoUrl || DEFAULT_PHOTO_URL;
          btn.classList.add('mi-seat--has-card');
          const card = document.createElement('div');
          card.className = 'mi-seat-card';
          const img = document.createElement('img');
          img.alt = `Foto de ${nome}`;
          img.src = safeUrl;
          img.onerror = () => {
            const file = (img.src || '').split('/').pop();
            const local = file ? `${PHOTO_DIR_LOCAL}/${file}` : DEFAULT_PHOTO_URL;
            if (local && local !== DEFAULT_PHOTO_URL && img.src !== local) {
              img.src = local;
              return;
            }
            if (img.src !== DEFAULT_PHOTO_URL) img.src = DEFAULT_PHOTO_URL;
          };
          card.appendChild(img);
          btn.appendChild(card);

          btn.addEventListener('mouseenter', () => showSeatPreview(nome, safeUrl, btn));
          btn.addEventListener('mouseleave', hideSeatPreview);
          btn.addEventListener('blur', hideSeatPreview);
        });
      }
      grid.appendChild(btn);
    });

    // 5) FIT automático (caber em largura E altura sem scroll)
    requestAnimationFrame(() => {
      const wrap = document.querySelector('.mi-seat-grid-wrap');
      if (!wrap) return;

      grid.style.transform = 'scale(1)';

      const wrapRect = wrap.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();

      const scaleW = wrapRect.width / gridRect.width;
      const scaleH = wrapRect.height / gridRect.height;
      // permite crescer um pouco quando há espaço, para evitar mapa "miúdo"
      const maxScale = 1.2;
      const scale = Math.min(maxScale, scaleW, scaleH);
      grid.style.transform = `scale(${scale})`;
    });
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

  async function renderStaffGallery() {
    const wrap = $('#miStaffWrap');
    const grid = $('#miStaffGrid');
    if (!wrap || !grid) return;
    if (state.perfil !== 'Staff') {
      wrap.classList.add('d-none');
      return;
    }
    wrap.classList.remove('d-none');
    grid.innerHTML = '';

    try {
      setStaffMsg('Carregando equipe...', 'text-muted');
      const res = await fetch(ROUTES.staffs, { method: 'GET' });
      const data = res.ok ? await res.json() : [];
      const list = Array.isArray(data) ? data : [];
      if (!list.length) {
        setStaffMsg('Nenhuma inscrição de staff encontrada.', 'text-muted');
        return;
      }
      setStaffMsg('', 'text-muted');
      list.forEach((item) => {
        const nome = String(item?.nome || '').trim();
        const sigla = String(item?.sigladaentidade || '').trim();
        const codigo = String(item?.numerodeinscricao || '').trim();
        const gender = guessGenderByName(nome);
        const card = document.createElement('div');
        card.className = `mi-staff-card ${gender === 'female' ? 'is-female' : 'is-male'}`;
        card.innerHTML = `
          <div class="mi-staff-photo">
            <img alt="Foto de ${escapeHtml(nome || 'Staff')}" src="${DEFAULT_STAFF_PHOTO_URL}">
          </div>
          <div class="mi-staff-name">${escapeHtml(nome || 'Staff')}</div>
          ${sigla ? `<div class="mi-staff-entity">${escapeHtml(sigla)}</div>` : ''}
          ${codigo ? `<div class="mi-staff-code">${escapeHtml(codigo)}</div>` : ''}
        `;
        grid.appendChild(card);
        const img = card.querySelector('img');
        if (img && nome) {
          resolveStaffPhotoUrlByName(nome).then((url) => {
            if (url) img.src = url;
          });
          img.onerror = () => {
            if (img.src !== DEFAULT_STAFF_PHOTO_URL) img.src = DEFAULT_STAFF_PHOTO_URL;
          };
        }
      });
    } catch {
      setStaffMsg('Falha ao carregar o staff.', 'text-danger');
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

  function renderReviewValue(key, value) {
    return Array.isArray(value) ? value.map(escapeHtml).join(', ') : escapeHtml(value);
  }

  function renderReview() {
    const d = { ...state.data, ...readForm() };
    const rows = Object.entries(d)
      .filter(([k,v]) => !HIDDEN_KEYS.has(k) && String(v).trim() !== '')
      .map(([k,v]) => `<div class="d-flex">
        <div class="me-2 text-secondary" style="min-width:220px">${escapeHtml(prettyLabel(k))}</div>
        <div class="fw-semibold flex-grow-1">${renderReviewValue(k, v)}</div>
      </div>`)
      .join('');

    let fotoRow = '';
    if (state.perfil === 'Conselheiro' || state.perfil === 'Staff') {
      const isStaff = state.perfil === 'Staff';
      const staffGender = isStaff ? guessGenderByName(d.nome || state.data?.nome || '') : '';
      const staffClass = isStaff
        ? `mi-photo-preview--staff ${staffGender === 'female' ? 'is-female' : 'is-male'}`
        : '';
      const fotoUrl = d.foto
        ? getFotoUrl(d.foto)
        : (isStaff ? DEFAULT_STAFF_PHOTO_URL : DEFAULT_PHOTO_URL);
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
      <button type="button" id="miCancelarInscricao" class="btn btn-outline-danger btn-sm">
        Cancelar inscrição
      </button>
    ` : '';

    const editarLink = `<div class="mt-3 d-flex flex-wrap align-items-center gap-3">
      <button type="button" id="miEditarInfo" class="btn btn-link p-0">Editar informações</button>
      ${cancelBtn}
    </div>`;

    const body = (rows || '<div class="text-muted">Sem dados para revisar.</div>');
    $('#miReview').innerHTML = (fotoRow ? fotoRow + body : body) + editarLink;

    if (state.perfil === 'Conselheiro' || state.perfil === 'Staff') {
      loadPhotoIndexGlobal().then(() => {
        const img = document.getElementById('miReviewFoto');
        if (!img) return;
        const nome = d.nome || state.data?.nome || $('#nome')?.value || '';
        if (!nome) return;
        if (state.perfil === 'Staff') {
          resolveStaffPhotoUrlByName(nome).then((url) => {
            if (url) img.src = url;
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


