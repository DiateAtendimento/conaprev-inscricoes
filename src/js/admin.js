// /src/js/admin.js
(() => {
  // ======= Descobrir API_BASE (igual ao steps.js) =======
  const inferApiBase = () => {
    const h = location.hostname;
    const isLocal = (h === 'localhost' || h === '127.0.0.1');
    return (window.API_BASE && String(window.API_BASE).trim())
      || (isLocal ? 'http://localhost:3000' : 'https://conaprev-inscricoes.onrender.com');
  };
  const API = inferApiBase();

  // ======= Perfis monitorados (7 perfis) =======
  const ALL_PROFILES = [
    'Conselheiro',
    'CNRPPS',
    'Palestrante',
    'Staff',
    'Convidado',
    'COPAJURE',
    'Patrocinador'
  ];

  // ======= Elements (podem Não existir nesta página) =======
  const elAdminBtn         = document.getElementById('adminAccessBtn');
  const elAuthModal        = document.getElementById('adminAuthModal');
  const elAuthForm         = document.getElementById('adminAuthForm');
  const elAuthPass         = document.getElementById('adminPass');
  const elAuthMsg          = document.getElementById('adminAuthMsg');

  const elMonitorModal     = document.getElementById('adminMonitorModal');
  const elPerfilSelect     = document.getElementById('adminPerfilSelect');
  const elSearch           = document.getElementById('adminSearch');
  const elRefresh          = document.getElementById('adminRefreshBtn');
  const elDownload         = document.getElementById('adminDownloadBtn');
  const elLogout           = document.getElementById('adminLogoutBtn'); // botão de logout (se existir no HTML)

  const elTabAtivosBtn     = document.getElementById('tabAdminAtivos');
  const elTabFinalBtn      = document.getElementById('tabAdminFinalizados');
  const elAtivosList       = document.getElementById('adminAtivosList');
  const elFinalList        = document.getElementById('adminFinalizadosList');
  const elAtivosPager      = document.getElementById('adminAtivosPager');
  const elFinalPager       = document.getElementById('adminFinalizadosPager');

  const elBadgeTop         = document.getElementById('adminNotifBadge');
  const elBadgeModal       = document.getElementById('adminNotifCount');

  // Se Não tem nada de admin na página, Não faz nada
  if (!elAdminBtn) return;

  // ======= Bootstrap Modals (se existirem) =======
  const getModal = (root) => {
    if (!root || !window.bootstrap) return null;
    return bootstrap.Modal.getOrCreateInstance(root, { backdrop: 'static', keyboard: true });
  };
  const authModal    = getModal(elAuthModal);
  const monitorModal = getModal(elMonitorModal);

  // ======= Toast helper (cria container on-demand) =======
  function ensureToastContainer() {
    let c = document.getElementById('adminToastContainer');
    if (!c) {
      c = document.createElement('div');
      c.id = 'adminToastContainer';
      c.className = 'toast-container position-fixed top-0 end-0 p-3';
      c.style.zIndex = '1080'; // acima do modal Bootstrap
      document.body.appendChild(c);
    }
    return c;
  }
  function showToast(message) {
    const container = ensureToastContainer();
    const toastEl = document.createElement('div');
    toastEl.className = 'toast align-items-center text-bg-success border-0';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    toastEl.setAttribute('aria-atomic', 'true');
    toastEl.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Fechar"></button>
      </div>
    `;
    container.appendChild(toastEl);
    const t = new bootstrap.Toast(toastEl, { delay: 4000 });
    t.show();
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
  }

  // ======= Lottie overlay helpers (usa o overlay global do site) =======
  let _adminLottie = null;
  const LOTTIE_SEARCH_PATH = "/lottie/lottie_search_loading.json"; // ajuste o caminho se estiver em outra pasta

  function showOverlayLottie(msg = "Preparando download…", path = LOTTIE_SEARCH_PATH) {
    try {
      const overlay = document.getElementById("miLottieOverlay");
      const holder  = document.getElementById("miLottieHolder");
      const label   = document.getElementById("miLottieMsg");
      if (!overlay || !holder) return;

      if (label) label.textContent = msg;
      overlay.classList.remove("d-none");
      holder.innerHTML = "";

      if (window.lottie) {
        _adminLottie = window.lottie.loadAnimation({
          container: holder,
          renderer: "svg",
          loop: true,
          autoplay: true,
          path
        });
      }
    } catch {}
  }

  function hideOverlayLottie() {
    try {
      _adminLottie?.destroy?.();
      _adminLottie = null;
      const overlay = document.getElementById("miLottieOverlay");
      const holder  = document.getElementById("miLottieHolder");
      const label   = document.getElementById("miLottieMsg");
      if (overlay) overlay.classList.add("d-none");
      if (holder) holder.innerHTML = "";
      if (label) label.textContent = "";
    } catch {}
  }


  // ======= Estado =======
  const state = {
    adminPass: null,
    perfil: (elPerfilSelect && elPerfilSelect.value) || 'Convidado',
    q: '',
    limit: 50,
    ativosOffset: 0,
    finalOffset: 0,
    ativosCache: [],
    finalCache: [],
    activeTab: 'ativos', // 'ativos' | 'finalizados'
    loading: false,
    pollTimer: null,     // intervalo de polling quando modal aberto
    lastAtivosIds: new Set(), // snapshot da aba atual (para toasts)
  };

  // ======= Persistência local da sessão admin =======
  const storageKeyPass = 'admin.pass';

  function loadSavedSession() {
    const saved = localStorage.getItem(storageKeyPass);
    if (saved) {
      state.adminPass = saved;
    }
  }
  function saveSession(pass) {
    try { localStorage.setItem(storageKeyPass, pass); } catch {}
  }
  function clearSession() {
    try { localStorage.removeItem(storageKeyPass); } catch {}
    state.adminPass = null;
  }

  // ======= Utils =======
  const headersAdmin = () =>
    state.adminPass ? { 'x-admin-pass': state.adminPass } : {};

  const PHOTO_DIR = '/imagens/fotos-conselheiros';
  const PHOTO_MANIFEST_URL = `${PHOTO_DIR}/manifest.json`;
  const DEFAULT_PHOTO_URL = `${PHOTO_DIR}/padrao.svg`;
  const photoCache = new Map();
  let photoIndexPromise = null;
  const photoAliases = new Map([
    ['allex albert rodrigues', 'Allex Albert Rodrigues.png'],
  ]);

  const fmtCPF = (v) => {
    const s = String(v || '').replace(/\D/g, '');
    if (s.length !== 11) return v;
    return `${s.slice(0,3)}.${s.slice(3,6)}.${s.slice(6,9)}-${s.slice(9)}`;
  };

  const debounce = (fn, ms=300) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  // Data/hora pt-BR com America/Sao_Paulo
  function fmtDateBR(x) {
    if (!x) return '-';
    let d = x;
    if (!(x instanceof Date)) {
      // aceita ISO, timestamps ou textos do Sheets
      const tryDate = new Date(String(x));
      d = isNaN(tryDate.getTime()) ? null : tryDate;
    }
    if (!d) return String(x);
    return d.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }

  // Extrai Número para ordenAção por protocolo (ex.: 'CNL028' -> 28, 'PAT-0012' -> 12)
  function protoKey(v) {
    const s = String(v || '');
    const m = s.match(/(\d+)/g);
    if (!m) return 0;
    // pega o MAIOR trecho numérico (resiste a prefixos diferentes)
    return Math.max(...m.map(n => parseInt(n, 10)).filter(n => Number.isFinite(n)));
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
    const url = filename ? `${PHOTO_DIR}/${filename}` : DEFAULT_PHOTO_URL;
    photoCache.set(key, url);
    return url;
  }

  // ======= Contador do sininho (GLOBAL = soma de TODOS os perfis) =======
  async function countAllProfilesActivesWithProtocol() {
    // busca cada perfil (status=ativos) e soma os que têm numerodeinscricao
    try {
      const qs = (perfil) => new URLSearchParams({
        perfil, status: 'ativos', limit: '200', offset: '0'
      }).toString();

      const reqs = ALL_PROFILES.map(p =>
        fetch(`${API}/api/inscricoes/listar?${qs(p)}`, { headers: headersAdmin() })
          .then(r => (r.ok ? r.json() : []))
          .catch(() => [])
      );
      const lists = await Promise.all(reqs);
      let total = 0;
      lists.forEach(arr => {
        if (Array.isArray(arr)) {
          total += arr.filter(it => String(it?.numerodeinscricao || '').trim()).length;
        }
      });
      return total;
    } catch {
      return 0;
    }
  }

  async function refreshGlobalBadge() {
    const c = await countAllProfilesActivesWithProtocol();
    setNotif(c);
  }

  function setNotif(c) {
    const count = Math.max(0, Number(c) || 0);
    if (elBadgeTop) {
      if (count > 0) {
        elBadgeTop.textContent = String(count);
        elBadgeTop.classList.remove('d-none');
      } else {
        elBadgeTop.classList.add('d-none');
        elBadgeTop.textContent = '';
      }
    }
    if (elBadgeModal) elBadgeModal.textContent = String(count);
  }

  function handBtnHtml(checked) {
    const base = 'btn btn-sm';
    const icon = 'bi bi-hand-index-thumb';
    const color = checked ? 'btn-success' : 'btn-outline-secondary';
    const title = checked ? 'Conferido (clique para desfazer)' : 'Marcar como conferido';
    return `<button type="button" class="${base} ${color} btn-hand" title="${title}">
      <i class="${icon}" aria-hidden="true"></i>
    </button>`;
  }

  function rowCardHtml(item, isFinalizados){
    const conferido = String(item.conferido || '').toUpperCase().trim();
    const checked = (conferido === 'SIM' || conferido === 'TRUE' || conferido === 'OK' || conferido === '1');
    const temProtocolo = String(item.numerodeinscricao || '').trim().length > 0;

    // "pitadas de verde" quando tem protocolo
    const highlightStyle = temProtocolo
      ? 'border-left:6px solid #28a745; background: rgba(40,167,69,0.08);'
      : '';

    const showPhoto = (state.perfil === 'Conselheiro');
    const photoHtml = showPhoto ? `
      <div class="admin-photo-wrap me-3">
        <img class="admin-photo" data-name="${item.nome || ''}" src="${DEFAULT_PHOTO_URL}" alt="Foto de ${item.nome || 'Conselheiro'}">
      </div>
    ` : '';

    return `
      <div class="card p-2" data-rowindex="${item._rowIndex}" style="${highlightStyle}">
        <div class="d-flex flex-wrap align-items-center gap-2">
          ${photoHtml}
          <div class="me-3">
            <div class="small text-muted">Protocolo</div>
            <div class="fw-semibold">${item.numerodeinscricao || '-'}</div>
          </div>
          <div class="me-3">
            <div class="small text-muted">CPF</div>
            <div class="fw-semibold">${fmtCPF(item.cpf)}</div>
          </div>
          <div class="flex-grow-1">
            <div class="small text-muted">Nome</div>
            <div class="fw-semibold">${item.nome || '-'}</div>
          </div>

          <div class="d-flex align-items-center gap-2 ms-auto">
            ${handBtnHtml(checked)}
            <div class="text-end small">
              <div><span class="text-muted">Conferido por:</span> ${item.conferidopor || '-'}</div>
              <div><span class="text-muted">Em:</span> ${fmtDateBR(item.conferidoem)}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderList(targetEl, pagerEl, data, status){
    if (!targetEl || !pagerEl) return;

    let toRender = Array.isArray(data) ? [...data] : [];
    if (status === 'ativos') {
      // Mostra apenas inscrições já feitas (com número) e ordena menor -> maior
      toRender = toRender.filter(it => String(it?.numerodeinscricao || '').trim());
      toRender.sort((a, b) => protoKey(a?.numerodeinscricao) - protoKey(b?.numerodeinscricao));
    }
    if (status === 'finalizados') {
      // Mantém apenas finalizados e ordena por nome (A->Z)
      toRender.sort((a, b) => String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR', { sensitivity: 'base' }));
    }

    targetEl.innerHTML = (toRender && toRender.length)
      ? toRender.map(item => rowCardHtml(item, status === 'finalizados')).join('')
      : `<div class="text-muted">Nenhum registro encontrado.</div>`;

    if (state.perfil === 'Conselheiro' && toRender.length) {
      hydrateConselheiroPhotos(targetEl);
    }

    // Eventos do bot�o de m�o
    targetEl.querySelectorAll('.btn-hand').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const card = e.currentTarget.closest('[data-rowindex]');
        const idx = Number(card?.dataset?.rowindex || 0);
        if (!idx) return;
        const isFinal = (state.activeTab === 'finalizados');
        await toggleConferido(idx, !isFinal);
      }, { passive: true });
    });

    // Pager
    const isAtivos = (status === 'ativos');
    const offset   = isAtivos ? state.ativosOffset : state.finalOffset;
    const canPrev  = offset > 0;
    const canNext  = (toRender?.length || 0) >= state.limit;

    pagerEl.innerHTML = `
      <div class="d-flex w-100 justify-content-between align-items-center">
        <button class="btn btn-sm btn-outline-secondary pg-prev" ${canPrev ? '' : 'disabled'}>
          <i class="bi bi-chevron-left"></i> Anterior
        </button>
        <div class="small text-muted">Exibindo ${toRender.length} ${toRender.length === 1 ? 'registro' : 'registros'}</div>
        <button class="btn btn-sm btn-outline-secondary pg-next" ${canNext ? '' : 'disabled'}>
          Próximo <i class="bi bi-chevron-right"></i>
        </button>
      </div>
    `;

    pagerEl.querySelector('.pg-prev')?.addEventListener('click', () => {
      if (isAtivos) state.ativosOffset = Math.max(0, state.ativosOffset - state.limit);
      else          state.finalOffset  = Math.max(0, state.finalOffset  - state.limit);
      refreshActiveTab();
    });
    pagerEl.querySelector('.pg-next')?.addEventListener('click', () => {
      if (isAtivos) state.ativosOffset += state.limit;
      else          state.finalOffset  += state.limit;
      refreshActiveTab();
    });
  }

  async function hydrateConselheiroPhotos(rootEl) {
    const imgs = rootEl.querySelectorAll('img.admin-photo[data-name]');
    if (!imgs.length) return;
    await loadPhotoIndex();
    imgs.forEach((img) => {
      const nome = img.getAttribute('data-name') || '';
      resolvePhotoUrl(nome).then((url) => {
        img.src = url || DEFAULT_PHOTO_URL;
      });
      img.onerror = () => {
        const filename = (img.src || '').split('/').pop();
        const local = filename ? `${PHOTO_DIR_LOCAL}/${filename}` : DEFAULT_PHOTO_URL;
        if (local && local !== DEFAULT_PHOTO_URL && img.src !== local) {
          img.src = local;
          return;
        }
        if (img.src !== DEFAULT_PHOTO_URL) img.src = DEFAULT_PHOTO_URL;
      };
    });
  }

  function buildQuery(status){
    const params = new URLSearchParams();
    params.set('perfil', state.perfil);
    params.set('status', status);
    if (state.q) params.set('q', state.q);
    params.set('hasProtocol', '1');
    params.set('limit', String(state.limit));
    const offset = (status === 'ativos') ? state.ativosOffset : state.finalOffset;
    params.set('offset', String(offset));
    return params.toString();
  }

  async function fetchList(status){
    try {
      const q = buildQuery(status);
      const res = await fetch(`${API}/api/inscricoes/listar?${q}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', ...headersAdmin() }
      });
      if (res.status === 401) {
        if (monitorModal) monitorModal.hide();
        if (authModal) authModal.show();
        throw new Error('Não autorizado');
      }
      if (!res.ok) throw new Error('Erro ao listar');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('[admin] fetchList', status, e);
      return [];
    }
  }

  // Guarda os protocolos atuais para detectar novos (apenas aba ATIVOS do perfil selecionado)
  function snapshotActiveProtocols() {
    const set = new Set();
    (state.ativosCache || []).forEach(it => {
      const proto = String(it?.numerodeinscricao || '').trim();
      if (proto) set.add(proto);
    });
    state.lastAtivosIds = set;
  }

  async function refreshAtivos(){
    if (!elAtivosList) return;
    state.loading = true;
    const data = await fetchList('ativos');
    state.ativosCache = data;
    renderList(elAtivosList, elAtivosPager, data, 'ativos');
    state.loading = false;
  }

  async function refreshFinalizados(){
    if (!elFinalList) return;
    state.loading = true;
    const data = await fetchList('finalizados');
    state.finalCache = data;
    renderList(elFinalList, elFinalPager, data, 'finalizados');
    state.loading = false;
  }

  async function refreshActiveTab(){
    if (state.activeTab === 'ativos') await refreshAtivos();
    else await refreshFinalizados();
    // badge � GLOBAL ? atualiza separado
    refreshGlobalBadge();
  }

  async function refreshBoth(){
    await Promise.all([refreshAtivos(), refreshFinalizados()]);
    refreshGlobalBadge();
  }

  async function toggleConferido(_rowIndex, marcar){
    try {
      const conferidoPor = localStorage.getItem('admin.conferidoPor') || 'Admin';
      const res = await fetch(`${API}/api/inscricoes/conferir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headersAdmin() },
        body: JSON.stringify({
          _rowIndex,
          perfil: state.perfil,
          conferido: !!marcar,
          conferidoPor
        })
      });
      if (res.status === 401) {
        if (monitorModal) monitorModal.hide();
        if (authModal) authModal.show();
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(()=>null);
        throw new Error(j?.error || 'Erro ao marcar conferido');
      }
      await refreshBoth();   // move entre abas e atualiza badge global
      snapshotActiveProtocols();
    } catch (e) {
      console.error('[admin] toggleConferido', e);
      alert(e.message || 'Erro ao marcar conferido.');
    }
  }


  // ======= Download XLSX COMPLETO (todas as abas) =======
  async function downloadWorkbookXLSX(){
    const show = window.miLottieShow || ((k,m)=>window.openLottie?.(k,m));
    const hide = window.miLottieHide || window.closeLottie;

    try {
      show && show('download', 'Preparando dashboard…');

      const res = await fetch(`${API}/api/admin/exportar`, {
        method: 'GET',
        headers: {
          ...headersAdmin(),
          'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Cache-Control': 'no-store'
        }
      });

      if (res.status === 401) {
        monitorModal?.hide?.();
        authModal?.show?.();
        return;
      }
      if (!res.ok) throw new Error('Falha ao gerar XLSX.');

      const blob = await res.blob();

      // tenta extrair o filename do Content-Disposition
      let filename = 'inscricoes.xlsx';
      const cd = res.headers.get('Content-Disposition') || res.headers.get('content-disposition');
      if (cd) {
        const m = cd.match(/filename\*?=(?:UTF-8''|")?([^;"']+)/i);
        if (m && m[1]) filename = decodeURIComponent(m[1].replace(/"/g, ''));
      } else {
        const ts = new Date().toISOString().slice(0,19).replace(/[-:T]/g,'');
        filename = `conaprev-inscricoes_${ts}.xlsx`;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
    } catch (e) {
      console.error('[admin] downloadWorkbookXLSX', e);
      alert(e?.message || 'Não foi possível baixar a planilha completa.');
    } finally {
      hide && hide(); // fecha o Lottie ao iniciar o download
    }
  }



  // ======= Listeners =======
  elAdminBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (state.adminPass) {
      if (monitorModal) {
        monitorModal.show();
        await refreshBoth();
        snapshotActiveProtocols();
      }
    } else {
      if (authModal) authModal.show();
    }
  });

  elAuthForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = (elAuthPass?.value || '').trim();
    if (!pass) return;
    try {
      const res = await fetch(`${API}/api/inscricoes/listar?perfil=${encodeURIComponent(state.perfil)}&status=ativos&limit=1`, {
        headers: { ...headersAdmin(), 'x-admin-pass': pass }
      });
      if (res.status === 401) throw new Error('Senha inválida');
      if (!res.ok) throw new Error('Falha na Validação');
      state.adminPass = pass;
      saveSession(pass); // persiste neste navegador
      elAuthMsg?.classList.add('d-none');
      authModal?.hide();
      monitorModal?.show();
      await refreshBoth();
      snapshotActiveProtocols();
    } catch (err) {
      elAuthMsg?.classList.remove('d-none');
      elAuthMsg.textContent = 'Senha inválida.';
    }
  });

  // LOGOUT
  elLogout?.addEventListener('click', () => {
    clearSession();
    showToast('SesSóo de administrador encerrada.');
    try { monitorModal?.hide(); } catch {}
    setNotif(0);
  });

  elPerfilSelect?.addEventListener('change', async () => {
    state.perfil = elPerfilSelect.value;
    state.ativosOffset = 0;
    state.finalOffset  = 0;
    await refreshBoth();
    snapshotActiveProtocols();
  });

  elSearch?.addEventListener('input', debounce(async () => {
    state.q = (elSearch.value || '').trim();
    state.ativosOffset = 0;
    state.finalOffset  = 0;
    await refreshActiveTab();
    if (state.activeTab === 'ativos') snapshotActiveProtocols();
  }, 300));

  elRefresh?.addEventListener('click', async () => {
    const show = window.miLottieShow || ((k, m) => window.openLottie?.(k, m));
    const hide = window.miLottieHide || window.closeLottie;

    try {
      elRefresh.disabled = true;                 // evita cliques repetidos
      show && show('timeout', 'Atualizando…');   // usa lottie_timeout_hourglass.json
      await refreshBoth();                       // recarrega Ativos + Finalizados
      snapshotActiveProtocols();                 // atualiza snapshot p/ toasts
    } catch (e) {
      console.error('[admin] refresh', e);
      alert('Falha ao atualizar. Tente novamente.');
    } finally {
      hide && hide();                            // fecha o overlay
      elRefresh.disabled = false;
    }
  });

  elDownload?.addEventListener('click', () => {
    downloadWorkbookXLSX();
  });

  // Abas
  elTabAtivosBtn?.addEventListener('shown.bs.tab', async () => {
    state.activeTab = 'ativos';
    await refreshAtivos();
    snapshotActiveProtocols();
  });
  elTabFinalBtn?.addEventListener('shown.bs.tab', async () => {
    state.activeTab = 'finalizados';
    await refreshFinalizados();
    state.lastAtivosIds = new Set(); // reset snapshot quando Não estamos em "Ativos"
  });

  // Ao abrir o modal Admin: refresh e polling focado em novos protocolos (do perfil escolhido)
  elMonitorModal?.addEventListener('shown.bs.modal', () => {
    refreshBoth().then(() => snapshotActiveProtocols());
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(async () => {
      // busca apenas ATIVOS do perfil selecionado para detectar novos protocolos (toasts)
      const data = await fetchList('ativos');

      // detecta novos protocolos (apenas com Número)
      const currentSet = new Set();
      (data || []).forEach(it => {
        const proto = String(it?.numerodeinscricao || '').trim();
        if (proto) currentSet.add(proto);
      });

      // compara com o último snapshot
      currentSet.forEach(proto => {
        if (!state.lastAtivosIds.has(proto)) {
          showToast(`Você tem uma nova inscrição ${proto}`);
        }
      });

      state.ativosCache = data;
      renderList(elAtivosList, elAtivosPager, data, 'ativos');

      // Badge global (soma de todos os perfis)
      refreshGlobalBadge();

      // atualiza snapshot ao final
      state.lastAtivosIds = currentSet;
    }, 8000); // 8s
  });

  elMonitorModal?.addEventListener('hidden.bs.modal', () => {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  });

  // ======= Autologin neste navegador (sem vazar para outros) =======
  (async function bootstrapAdminSession() {
    loadSavedSession();
    if (!state.adminPass) return;
    try {
      // badge GLOBAL logo de cara
      await refreshGlobalBadge();
    } catch {
      clearSession();
      setNotif(0);
    }
  })();

  // ======= Badge GLOBAL "leve" (fora do modal) a cada 15s, se logado) =======
  setInterval(async () => {
    if (!state.adminPass) return;
    await refreshGlobalBadge();
  }, 15000);

})();


