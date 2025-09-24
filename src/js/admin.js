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

  // ======= Elements (podem não existir nesta página) =======
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

  const elTabAtivosBtn     = document.getElementById('tabAdminAtivos');
  const elTabFinalBtn      = document.getElementById('tabAdminFinalizados');
  const elAtivosList       = document.getElementById('adminAtivosList');
  const elFinalList        = document.getElementById('adminFinalizadosList');
  const elAtivosPager      = document.getElementById('adminAtivosPager');
  const elFinalPager       = document.getElementById('adminFinalizadosPager');

  const elBadgeTop         = document.getElementById('adminNotifBadge');
  const elBadgeModal       = document.getElementById('adminNotifCount');

  // Se não tem nada de admin na página, não faz nada
  if (!elAdminBtn) return;

  // ======= Bootstrap Modals (se existirem) =======
  const getModal = (root) => {
    if (!root || !window.bootstrap) return null;
    return bootstrap.Modal.getOrCreateInstance(root, { backdrop: 'static', keyboard: true });
  };
  const authModal    = getModal(elAuthModal);
  const monitorModal = getModal(elMonitorModal);

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
  };

  // ======= Utils =======
  const headersAdmin = () =>
    state.adminPass ? { 'x-admin-pass': state.adminPass } : {};

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

  function setNotif(count) {
    const c = Math.max(0, Number(count) || 0);
    if (elBadgeTop) {
      if (c > 0) {
        elBadgeTop.textContent = String(c);
        elBadgeTop.classList.remove('d-none');
      } else {
        elBadgeTop.classList.add('d-none');
      }
    }
    if (elBadgeModal) elBadgeModal.textContent = String(c);
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

    return `
      <div class="card p-2" data-rowindex="${item._rowIndex}">
        <div class="d-flex flex-wrap align-items-center gap-2">
          <div class="me-3">
            <div class="small text-muted">Protocolo</div>
            <div class="fw-semibold">${item.numerodeinscricao || '—'}</div>
          </div>
          <div class="me-3">
            <div class="small text-muted">CPF</div>
            <div class="fw-semibold">${fmtCPF(item.cpf)}</div>
          </div>
          <div class="flex-grow-1">
            <div class="small text-muted">Nome</div>
            <div class="fw-semibold">${item.nome || '—'}</div>
          </div>

          <div class="d-flex align-items-center gap-2 ms-auto">
            ${handBtnHtml(checked)}
            <div class="text-end small">
              <div><span class="text-muted">Conferido por:</span> ${item.conferidopor || '—'}</div>
              <div><span class="text-muted">Em:</span> ${item.conferidoem || '—'}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderList(targetEl, pagerEl, data, status){
    if (!targetEl || !pagerEl) return;
    targetEl.innerHTML = (data && data.length)
      ? data.map(item => rowCardHtml(item, status === 'finalizados')).join('')
      : `<div class="text-muted">Nenhum registro encontrado.</div>`;

    // Eventos do botão de mão
    targetEl.querySelectorAll('.btn-hand').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const card = e.currentTarget.closest('[data-rowindex]');
        const idx = Number(card?.dataset?.rowindex || 0);
        if (!idx) return;
        const isFinal = (state.activeTab === 'finalizados');
        await toggleConferido(idx, !isFinal); // se estou em "ativos", marcar true; se estou em "finalizados", marcar false
      }, { passive: true });
    });

    // Pager
    const isAtivos = (status === 'ativos');
    const offset   = isAtivos ? state.ativosOffset : state.finalOffset;
    const canPrev  = offset > 0;
    const canNext  = (data?.length || 0) >= state.limit;

    pagerEl.innerHTML = `
      <div class="d-flex w-100 justify-content-between align-items-center">
        <button class="btn btn-sm btn-outline-secondary pg-prev" ${canPrev ? '' : 'disabled'}>
          <i class="bi bi-chevron-left"></i> Anterior
        </button>
        <div class="small text-muted">Exibindo ${data.length} ${data.length === 1 ? 'registro' : 'registros'}</div>
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

  function buildQuery(status){
    const params = new URLSearchParams();
    params.set('perfil', state.perfil);
    params.set('status', status);
    if (state.q) params.set('q', state.q);
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
        // precisa logar
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

  async function refreshAtivos(){
    if (!elAtivosList) return;
    state.loading = true;
    const data = await fetchList('ativos');
    state.ativosCache = data;
    renderList(elAtivosList, elAtivosPager, data, 'ativos');
    setNotif((state.ativosCache || []).length + (state.finalCache || []).length ? (state.ativosCache || []).length : 0);
    state.loading = false;
  }

  async function refreshFinalizados(){
    if (!elFinalList) return;
    state.loading = true;
    const data = await fetchList('finalizados');
    state.finalCache = data;
    renderList(elFinalList, elFinalPager, data, 'finalizados');
    setNotif((state.ativosCache || []).length);
    state.loading = false;
  }

  async function refreshActiveTab(){
    if (state.activeTab === 'ativos') await refreshAtivos();
    else await refreshFinalizados();
  }

  async function refreshBoth(){
    await Promise.all([refreshAtivos(), refreshFinalizados()]);
  }

  async function toggleConferido(_rowIndex, marcar){
    try {
      // Nome do conferente — se quiser, podemos perguntar uma vez e guardar em localStorage
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
      // Atualiza as duas listas (mover entre abas)
      await refreshBoth();
    } catch (e) {
      console.error('[admin] toggleConferido', e);
      alert(e.message || 'Erro ao marcar conferido.');
    }
  }

  function toCSV(rows){
    if (!rows || !rows.length) return 'numerodeinscricao,cpf,nome,conferido,conferidopor,conferidoem\n';
    const head = ['numerodeinscricao','cpf','nome','conferido','conferidopor','conferidoem'];
    const esc = (v) => {
      const s = String(v ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const lines = [head.join(',')];
    rows.forEach(r => {
      lines.push(head.map(k => esc(r[k])).join(','));
    });
    return lines.join('\n');
  }

  function downloadCSV(filename, text){
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }

  // ======= Listeners =======
  elAdminBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (state.adminPass) {
      // já autenticado
      if (monitorModal) {
        monitorModal.show();
        refreshBoth();
      }
    } else {
      if (authModal) authModal.show();
    }
  });

  elAuthForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = (elAuthPass?.value || '').trim();
    if (!pass) return;
    // Tentamos uma chamada protegida só para validar
    try {
      const res = await fetch(`${API}/api/inscricoes/listar?perfil=${encodeURIComponent(state.perfil)}&status=ativos&limit=1`, {
        headers: { ...headersAdmin(), 'x-admin-pass': pass }
      });
      if (res.status === 401) throw new Error('Senha inválida');
      if (!res.ok) throw new Error('Falha na validação');
      state.adminPass = pass;
      elAuthMsg?.classList.add('d-none');
      authModal?.hide();
      monitorModal?.show();
      await refreshBoth();
    } catch (err) {
      elAuthMsg?.classList.remove('d-none');
      elAuthMsg.textContent = 'Senha inválida.';
    }
  });

  elPerfilSelect?.addEventListener('change', async () => {
    state.perfil = elPerfilSelect.value;
    // reset offsets
    state.ativosOffset = 0;
    state.finalOffset  = 0;
    await refreshBoth();
  });

  elSearch?.addEventListener('input', debounce(async () => {
    state.q = (elSearch.value || '').trim();
    state.ativosOffset = 0;
    state.finalOffset  = 0;
    await refreshActiveTab();
  }, 300));

  elRefresh?.addEventListener('click', async () => {
    await refreshBoth();
  });

  elDownload?.addEventListener('click', () => {
    const now = new Date();
    const ts = now.toISOString().slice(0,19).replace(/[-:T]/g,'');
    const rows = (state.activeTab === 'ativos') ? state.ativosCache : state.finalCache;
    const csv  = toCSV(rows);
    const fname = `inscricoes_${state.perfil}_${state.activeTab}_${ts}.csv`;
    downloadCSV(fname, csv);
  });

  // Abas (ajustar qual está ativa para o refresh e estilo maiorzinho vem de CSS/Bootstrap)
  elTabAtivosBtn?.addEventListener('shown.bs.tab', async () => {
    state.activeTab = 'ativos';
    await refreshAtivos();
  });
  elTabFinalBtn?.addEventListener('shown.bs.tab', async () => {
    state.activeTab = 'finalizados';
    await refreshFinalizados();
  });

  // Se o modal Admin abrir por outros meios, garantir refresh inicial:
  elMonitorModal?.addEventListener('shown.bs.modal', () => {
    // carrega ambos em paralelo e mantém a aba atual como “primária”
    refreshBoth();
  });

  // Atualiza badge periodicamente quando autenticado (leve)
  setInterval(async () => {
    if (!state.adminPass) return;
    try {
      const q = new URLSearchParams({ perfil: state.perfil, status: 'ativos', limit: '1' }).toString();
      const res = await fetch(`${API}/api/inscricoes/listar?${q}`, { headers: headersAdmin() });
      if (!res.ok) return;
      const data = await res.json();
      // Não temos contagem total — usamos quantidade da lista carregada em memória quando modal está aberto;
      // aqui usamos 1 só para manter "tem/notificações". Opcionalmente, poderíamos refazer a lista.
      // Se o modal estiver aberto, a contagem será atualizada pelo refreshBoth().
      if (!document.body.contains(elMonitorModal) || !elMonitorModal.classList.contains('show')) {
        // Só indica que há algo (1) sem custo. Opcional.
        setNotif((state.ativosCache || []).length);
      }
    } catch {}
  }, 15000); // 15s

})();
