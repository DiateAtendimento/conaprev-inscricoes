// /src/js/votacao.js
(() => {
  const API = window.API_BASE || ((location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://conaprev-inscricoes.onrender.com');

  const ADMIN_PASS_KEY = 'votacao.admin.pass';
  const SESSION_KEY = 'votacao.admin.session';
  const USER_KEY = 'votacao.user.session';

  const THEMES = [
    { id: 'membros-rotativos', name: 'MEMBROS ROTATIVOS', title: 'Membros rotativos', icon: 'bi-arrow-repeat' },
    { id: 'membros-cnrpps', name: 'MEMBROS CNRPPS', title: 'Membros CNRPPS', icon: 'bi-people' },
    { id: 'comite-compensacao', name: 'COMITÊ DA COMPENSACÃO PREVIDENCIÁRIA', title: 'Comitê da compensação previdenciária', icon: 'bi-shield-check' },
    { id: 'certificacao-profissional', name: 'CERTIFICAÇÃO PROFISSIONAL', title: 'Certificação profissional', icon: 'bi-award' },
    { id: 'pro-gestao', name: 'PRÓ GESTÃO', title: 'Pró Gestão', icon: 'bi-patch-check' },
  ];

  const REGION_IMAGE_DIR = '/imagens/membros-rotat-mun';
  const REGION_IMAGE_DEFAULT = `${REGION_IMAGE_DIR}/PADRAO.svg`;
  const CITY_DATA_URL = '/data/uf-municipios.json';

  const REGION_LABELS = {
    NORTE: 'Norte',
    NORDESTE: 'Nordeste',
    'CENTRO-OESTE': 'Centro Oeste',
    SUDESTE: 'Sudeste',
    SUL: 'Sul',
  };

  const UF_REGION = {
    AC: 'NORTE',
    AM: 'NORTE',
    AP: 'NORTE',
    PA: 'NORTE',
    RO: 'NORTE',
    RR: 'NORTE',
    TO: 'NORTE',
    AL: 'NORDESTE',
    BA: 'NORDESTE',
    CE: 'NORDESTE',
    MA: 'NORDESTE',
    PB: 'NORDESTE',
    PE: 'NORDESTE',
    PI: 'NORDESTE',
    RN: 'NORDESTE',
    SE: 'NORDESTE',
    DF: 'CENTRO-OESTE',
    GO: 'CENTRO-OESTE',
    MS: 'CENTRO-OESTE',
    MT: 'CENTRO-OESTE',
    ES: 'SUDESTE',
    MG: 'SUDESTE',
    RJ: 'SUDESTE',
    SP: 'SUDESTE',
    PR: 'SUL',
    RS: 'SUL',
    SC: 'SUL',
  };

  const normalizeRegionKey = (value) => String(value || '')
    .replace(/^regiao/i, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-');

  const getRegionKeyByUf = (uf) => UF_REGION[String(uf || '').trim().toUpperCase()] || '';

  const formatRegionLabel = (key) => {
    if (!key) return '';
    const label = REGION_LABELS[key] || key.replace(/-/g, ' ');
    return `Região ${label}`;
  };

  const formatProGestaoValue = (value) => {
    const num = parseInt(String(value || ''), 10);
    if (!Number.isFinite(num) || num <= 0) return '';
    return { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }[num] || String(num);
  };

  const resolveRegionImageUrl = (key) =>
    (key ? `${REGION_IMAGE_DIR}/REGIAO-${key}.png` : REGION_IMAGE_DEFAULT);

  const simulateProGestao = (city, uf) => {
    const seed = `${String(city || '').trim().toLowerCase()}|${String(uf || '').trim().toLowerCase()}`;
    if (!seed.trim()) return 1;
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    const level = Math.abs(hash) % 4;
    return level + 1;
  };

  const getAdminPass = () => sessionStorage.getItem(ADMIN_PASS_KEY) || '';

  const apiFetch = async (path, opts = {}) => {
    const headers = opts.headers || {};
    return fetch(`${API}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    });
  };

  const adminFetch = async (path, opts = {}) => {
    const pass = getAdminPass();
    return apiFetch(path, {
      ...opts,
      headers: {
        ...(opts.headers || {}),
        'x-admin-pass': pass,
      },
    });
  };

  const formatDate = (value) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const msToTime = (ms) => {
    if (!ms) return '-';
    const total = Math.round(ms / 1000);
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
  };

  const ensureUiModal = () => {
    if (document.getElementById('voteUiModal')) return;
    const markup = `
      <div class="modal fade" id="voteUiModal" tabindex="-1" aria-hidden="true" aria-labelledby="voteUiTitle">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content vote-ui-modal">
            <div class="modal-header">
              <h5 class="modal-title" id="voteUiTitle">Aviso</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
              <div class="vote-ui-lottie" id="voteUiLottie"></div>
              <div id="voteUiBody" class="mt-3"></div>
            </div>
            <div class="modal-footer vote-ui-footer">
              <button type="button" class="btn btn-outline-secondary d-none" id="voteUiCancel">Cancelar</button>
              <button type="button" class="btn btn-primary" id="voteUiOk" data-bs-dismiss="modal">Ok</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', markup);
  };

  const showUiModal = ({ title = 'Aviso', message = '', variant = 'info', confirm = false } = {}) => {
    ensureUiModal();
    const modalEl = document.getElementById('voteUiModal');
    const titleEl = document.getElementById('voteUiTitle');
    const bodyEl = document.getElementById('voteUiBody');
    const okBtn = document.getElementById('voteUiOk');
    const cancelBtn = document.getElementById('voteUiCancel');
    const lottieEl = document.getElementById('voteUiLottie');

    if (!modalEl || !titleEl || !bodyEl || !okBtn || !cancelBtn) return Promise.resolve(false);

    titleEl.textContent = title;
    bodyEl.textContent = message;

    okBtn.classList.toggle('btn-danger', variant === 'danger');
    okBtn.classList.toggle('btn-primary', variant !== 'danger');
    cancelBtn.classList.toggle('d-none', !confirm);
    const footerEl = modalEl.querySelector('.vote-ui-footer');
    footerEl?.classList.toggle('is-dual', !!confirm);

    let lottieInstance = null;
    if (lottieEl) {
      lottieEl.innerHTML = '';
      const map = {
        success: '/animacoes/lottie_success_check.json',
        danger: '/animacoes/lottie_error_generic.json',
        warning: '/animacoes/lottie_timeout_hourglass.json',
        denied: '/animacoes/lottie_lock_unauthorized.json',
        info: '/animacoes/lottie_empty_state.json',
      };
      const src = map[variant] || map.info;
      if (window.lottie && src) {
        lottieInstance = window.lottie.loadAnimation({
          container: lottieEl,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: src,
        });
      }
    }

    const modal = window.bootstrap ? bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static', keyboard: true }) : null;
    return new Promise((resolve) => {
      const clean = () => {
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        modalEl.removeEventListener('hidden.bs.modal', onHidden);
        if (lottieInstance) lottieInstance.destroy();
      };
      const onHidden = () => {
        clean();
        resolve(false);
      };
      okBtn.onclick = () => {
        clean();
        resolve(true);
      };
      cancelBtn.onclick = () => {
        clean();
        modal?.hide();
        resolve(false);
      };
      modalEl.addEventListener('hidden.bs.modal', onHidden, { once: true });
      modal?.show();
    });
  };

  const showToast = (message) => {
    if (!message) return;
    const containerId = 'voteToastContainer';
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.className = 'toast-container position-fixed top-0 end-0 p-3';
      container.style.zIndex = '2000';
      document.body.appendChild(container);
    }
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
    if (window.bootstrap) {
      const toast = bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 2200 });
      toast.show();
      toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove(), { once: true });
    } else {
      setTimeout(() => toastEl.remove(), 2400);
    }
  };

  const showLoading = (message = 'Carregando...') => {
    if (document.getElementById('voteLoadingModal')) {
      const msgEl = document.getElementById('voteLoadingMsg');
      if (msgEl) msgEl.textContent = message;
      const modalEl = document.getElementById('voteLoadingModal');
      const modal = window.bootstrap ? bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static', keyboard: false }) : null;
      modal?.show();
      return;
    }
    const markup = `
      <div class="modal fade" id="voteLoadingModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content vote-ui-modal">
            <div class="modal-body text-center">
              <div class="vote-ui-lottie" id="voteLoadingLottie"></div>
              <div id="voteLoadingMsg" class="mt-2">${message}</div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', markup);
    const modalEl = document.getElementById('voteLoadingModal');
    const modal = window.bootstrap ? bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static', keyboard: false }) : null;
    const lottieEl = document.getElementById('voteLoadingLottie');
    if (lottieEl && window.lottie) {
      window.lottie.loadAnimation({
        container: lottieEl,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: '/animacoes/lottie_search_loading.json',
      });
    }
    modal?.show();
  };

  const hideLoading = () => {
    const modalEl = document.getElementById('voteLoadingModal');
    if (!modalEl || !window.bootstrap) return;
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal?.hide();
  };

  const startLoading = (message) => {
    let shown = false;
    const timer = setTimeout(() => {
      shown = true;
      showLoading(message);
    }, 3000);
    return () => {
      clearTimeout(timer);
      if (shown) hideLoading();
    };
  };

  // ===== Admin =====
  const initAdminModule = () => {
    const elButton = document.getElementById('liveVotingBtn');
    const elAuthModal = document.getElementById('votingAuthModal');
    const elAuthForm = document.getElementById('votingAuthForm');
    const elAuthPass = document.getElementById('votingAuthPass');
    const elAuthMsg = document.getElementById('votingAuthMsg');
    const elAdminModal = document.getElementById('votingAdminModal');
    const elOffcanvas = document.getElementById('menuOffcanvas');
    const elLogoutBtn = document.getElementById('votingLogoutBtn');
    const elCreateBtn = document.getElementById('votingCreateBtn');
    const elEmptyCreateBtn = document.getElementById('votingEmptyCreateBtn');
    const elThemeGrid = document.getElementById('votingThemeGrid');
    const elThemeTitle = document.getElementById('votingThemeTitle');
    const elEmptyState = document.getElementById('votingEmptyState');
    const elList = document.getElementById('votingList');
    const elResultsModal = document.getElementById('votingResultsModal');
    const elResultsMeta = document.getElementById('votingResultsMeta');
    const elResultsBody = document.getElementById('votingResultsBody');
    const elResultsTitle = document.getElementById('votingResultsTitle');

    if (!elButton || !elAdminModal) return;

    const getModal = (root) => {
      if (!root || !window.bootstrap) return null;
      return bootstrap.Modal.getOrCreateInstance(root, { backdrop: 'static', keyboard: true });
    };

    const authModal = getModal(elAuthModal);
    const adminModal = getModal(elAdminModal);
    const resultsModal = getModal(elResultsModal);
    const offcanvas = (elOffcanvas && window.bootstrap)
      ? bootstrap.Offcanvas.getOrCreateInstance(elOffcanvas)
      : null;

    let selectedTheme = null;

    const renderThemeGrid = (themes) => {
      if (!elThemeGrid) return;
      elThemeGrid.innerHTML = themes.map((t) => {
        const active = t.active ? 'Ativo' : 'Inativo';
        const statusClass = t.active ? 'text-success' : 'text-muted';
        return `
          <div class="col-12 col-md-6 col-lg-4">
            <div class="voting-theme-card" data-theme="${t.id}">
              <div class="voting-theme-icon"><i class="bi ${t.icon}" aria-hidden="true"></i></div>
              <div>
                <div class="voting-theme-text">${t.name}</div>
                <div class="voting-theme-sub ${statusClass}">${active}</div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    };

    const fetchThemes = async () => {
      const stop = startLoading('Carregando temas...');
      const res = await adminFetch('/api/votacao/admin/temas');
      stop();
      if (!res.ok) throw new Error('Falha ao carregar temas');
      return res.json();
    };

    const fetchVotes = async (themeId) => {
      const stop = startLoading('Carregando votações...');
      const res = await adminFetch(`/api/votacao/admin/temas/${encodeURIComponent(themeId)}/votacoes`);
      stop();
      if (!res.ok) throw new Error('Falha ao carregar votAções');
      return res.json();
    };

    const renderList = (votes = []) => {
      if (!elList || !elEmptyState) return;
      const cardColors = [
        '#f8fafc',
        '#f0f9ff',
        '#f0fdf4',
        '#fff7ed',
        '#fdf2f8',
        '#f5f3ff',
      ];
      elEmptyState.classList.toggle('d-none', votes.length > 0);
      elList.innerHTML = votes.map((vote, index) => {
        const cardBg = cardColors[index % cardColors.length];
        const status = vote.active ? 'Ativa' : 'Inativa';
        const linkUrl = `${location.origin}/votacao.html`;
        const toggleClass = vote.active ? 'btn-success' : 'btn-danger';
        const toggleLabel = vote.active ? 'Desativar' : 'Ativar';
        return `
          <div class="card voting-card" data-id="${vote.id}" style="--vote-card-bg:${cardBg}">
            <div class="card-body d-flex flex-wrap align-items-center gap-3">
              <div class="flex-grow-1">
                <div class="text-muted small">${status}</div>
                <div class="h6 mb-1">${vote.title || 'Sem título'}</div>
                <div class="small text-muted">Atualizada em ${formatDate(vote.updatedAt || vote.createdAt)}</div>
              </div>
              <div class="voting-actions" role="group" aria-label="Ações">
                <button type="button" class="btn btn-sm vote-action-btn is-edit" data-action="edit" aria-label="Editar">
                  <i class="bi bi-pencil-square" aria-hidden="true"></i>
                </button>
                <button type="button" class="btn btn-sm vote-action-btn is-delete" data-action="delete" aria-label="Excluir">
                  <i class="bi bi-trash" aria-hidden="true"></i>
                </button>
                <button type="button" class="btn btn-sm vote-action-btn is-link" data-action="link" data-link="${linkUrl}" aria-label="Copiar link">
                  <i class="bi bi-link-45deg" aria-hidden="true"></i>
                </button>
                <button type="button" class="btn btn-sm vote-action-btn is-results" data-action="results" aria-label="Ver respostas">
                  <i class="bi bi-eye" aria-hidden="true"></i>
                </button>
                <button type="button" class="btn btn-sm vote-action-btn ${vote.active ? 'is-toggle-on' : 'is-toggle-off'}" data-action="toggle" data-active="${vote.active ? '1' : '0'}" aria-label="${vote.active ? 'Desativar' : 'Ativar'}">
                  <i class="bi ${vote.active ? 'bi-toggle-on' : 'bi-toggle-off'}" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    };

    const renderResults = (payload) => {
      if (!payload || !elResultsMeta || !elResultsBody || !elResultsTitle) return;
      elResultsTitle.textContent = payload.title || 'Visão geral das respostas';
      elResultsMeta.innerHTML = `
        <div class="voting-meta-item">
          <div class="small text-muted">Total de respostas</div>
          <div class="fw-semibold">${payload.total}</div>
        </div>
        <div class="voting-meta-item">
          <div class="small text-muted">Tempo médio</div>
          <div class="fw-semibold">${msToTime(payload.avgDurationMs)}</div>
        </div>
      `;

      const questions = payload.questions || [];
      const rankColors = [
        '#22c55e',
        '#60a5fa',
        '#f59e0b',
        '#fb7185',
        '#a78bfa',
        '#94a3b8',
      ];
      elResultsBody.innerHTML = questions.map((q, index) => {
        const stat = (payload.stats || []).find((s) => s.questionId === q.id) || {};
        if (q.type === 'text') {
          return `
            <div class="voting-question">
              <h6>${index + 1}. ${q.text || 'Pergunta'}</h6>
              <div class="text-muted mt-2">Respostas: ${stat.total || 0}</div>
            </div>
          `;
        }
        const counts = stat.counts || {};
        const options = (q.options || []).map((opt) => ({
          ...opt,
          count: counts[opt.id] || 0,
        }));
        const hasVotes = options.some((opt) => opt.count > 0);
        const sorted = options.sort((a, b) => {
          if (!hasVotes) return String(a.text || '').localeCompare(String(b.text || ''), 'pt-BR');
          if (b.count !== a.count) return b.count - a.count;
          return String(a.text || '').localeCompare(String(b.text || ''), 'pt-BR');
        });
        const rows = sorted.map((opt, idx) => {
          const color = rankColors[idx] || rankColors[rankColors.length - 1];
          return `
            <div class="voting-option-row" style="--vote-rank-color:${color}">
              <span>${opt.text || 'Opção'}</span>
              <span class="voting-option-count">${opt.count || 0}</span>
            </div>
          `;
        }).join('');
        return `
          <div class="voting-question">
            <h6>${index + 1}. ${q.text || 'Pergunta'}</h6>
            <div class="vstack gap-2 mt-2">
              ${rows || '<div class="text-muted">Sem opções cadastradas.</div>'}
            </div>
          </div>
        `;
      }).join('');
    };

    const openCreateTab = (themeId) => {
      const url = themeId ? `/votacao-criar.html?tema=${encodeURIComponent(themeId)}` : '/votacao-criar.html';
      window.open(url, '_blank');
    };

    const openEditTab = (id) => {
      const url = `/votacao-criar.html?edit=${encodeURIComponent(id)}`;
      window.open(url, '_blank');
    };

    const loadAdminView = async () => {
      const themes = await fetchThemes();
      renderThemeGrid(themes.map((t) => {
        const theme = THEMES.find((x) => x.id === t.id);
        return { ...t, icon: theme?.icon || 'bi-ballot-check' };
      }));
      if (selectedTheme) {
        const votes = await fetchVotes(selectedTheme.id);
        renderList(votes);
        if (elThemeTitle) elThemeTitle.textContent = selectedTheme.name;
      }
    };

    elButton.addEventListener('click', (event) => {
      event.preventDefault();
      if (elOffcanvas?.classList.contains('show')) {
        offcanvas?.hide();
        setTimeout(() => {
          if (sessionStorage.getItem(SESSION_KEY)) {
            loadAdminView().then(() => adminModal?.show());
          } else {
            authModal?.show();
          }
        }, 250);
        return;
      }
      if (sessionStorage.getItem(SESSION_KEY)) {
        loadAdminView().then(() => adminModal?.show());
      } else {
        authModal?.show();
      }
    });

    elAuthForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const pass = (elAuthPass?.value || '').trim();
      if (!pass) return;
      sessionStorage.setItem(ADMIN_PASS_KEY, pass);
      const res = await adminFetch('/api/votacao/admin/temas');
      if (!res.ok) {
        elAuthMsg?.classList.remove('d-none');
        elAuthMsg.textContent = 'Senha inválida.';
        sessionStorage.removeItem(ADMIN_PASS_KEY);
        return;
      }
      sessionStorage.setItem(SESSION_KEY, 'ok');
      elAuthMsg?.classList.add('d-none');
      elAuthPass.value = '';
      authModal?.hide();
      await loadAdminView();
      adminModal?.show();
    });

    elLogoutBtn?.addEventListener('click', () => {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(ADMIN_PASS_KEY);
      adminModal?.hide();
    });

    elCreateBtn?.addEventListener('click', async () => {
      if (!selectedTheme) {
        await showUiModal({ title: 'Aviso', message: 'Selecione um tema.', variant: 'warning' });
        return;
      }
      openCreateTab(selectedTheme.id);
    });
    elEmptyCreateBtn?.addEventListener('click', async () => {
      if (!selectedTheme) {
        await showUiModal({ title: 'Aviso', message: 'Selecione um tema.', variant: 'warning' });
        return;
      }
      openCreateTab(selectedTheme.id);
    });

    elThemeGrid?.addEventListener('click', async (event) => {
      const card = event.target.closest('.voting-theme-card');
      if (!card) return;
      const themeId = card.dataset.theme;
      selectedTheme = THEMES.find((t) => t.id === themeId) || null;
      if (elThemeTitle && selectedTheme) elThemeTitle.textContent = selectedTheme.name;
      const votes = await fetchVotes(themeId);
      renderList(votes);
    });

    elList?.addEventListener('click', async (event) => {
      const card = event.target.closest('.voting-card');
      if (!card) return;
      const voteId = card.dataset.id;
      const actionBtn = event.target.closest('[data-action]');
      if (!voteId) return;

      if (actionBtn) {
        const action = actionBtn.dataset.action;
        if (action === 'edit') openEditTab(voteId);
        if (action === 'delete') {
          const ok = await showUiModal({
            title: 'Confirmar exclusão',
            message: 'Tem certeza que deseja excluir esta votação?',
            variant: 'danger',
            confirm: true,
          });
          if (!ok) return;
          await adminFetch(`/api/votacao/admin/votacoes/${encodeURIComponent(voteId)}`, { method: 'DELETE' });
          const votes = await fetchVotes(selectedTheme?.id || '');
          renderList(votes);
        }
        if (action === 'toggle') {
          const active = actionBtn.dataset.active === '1';
          await adminFetch(`/api/votacao/admin/votacoes/${encodeURIComponent(voteId)}/ativar`, {
            method: 'POST',
            body: JSON.stringify({ ativo: !active }),
          });
          const votes = await fetchVotes(selectedTheme?.id || '');
          renderList(votes);
        }
        if (action === 'results') {
          const res = await adminFetch(`/api/votacao/admin/votacoes/${encodeURIComponent(voteId)}/results`);
          if (res.ok) {
            const data = await res.json();
            renderResults(data);
            resultsModal?.show();
          }
        }
        if (action === 'link') {
          const link = actionBtn.dataset.link || `${location.origin}/votacao.html`;
          try {
            await navigator.clipboard.writeText(link);
            showToast('Link copiado com sucesso.');
          } catch {
            showToast(`Copie o link: ${link}`);
          }
        }
      }
    });

    const shouldOpen = new URLSearchParams(window.location.search).get('votacao') === '1';
    if (shouldOpen) {
      if (sessionStorage.getItem(SESSION_KEY)) {
        loadAdminView().then(() => adminModal?.show());
      } else {
        authModal?.show();
      }
    }
  };

  // ===== Builder =====
  const initBuilderPage = () => {
    const form = document.getElementById('voteCreateForm');
    const builder = document.getElementById('voteBuilder');
    const titleInput = document.getElementById('voteTitle');
    const addQuestionBtn = document.getElementById('voteAddQuestion');
    const saveBtn = document.getElementById('voteSaveBtn');
    const msg = document.getElementById('voteCreateMsg');
    const msgLink = document.getElementById('voteCreateLink');
    const successModalEl = document.getElementById('voteCreateSuccessModal');
    const successModalLink = document.getElementById('voteCreateModalLink');
    const typeModalEl = document.getElementById('voteTypeModal');

    if (!form || !builder || !titleInput) return;

    const getModal = (root) => {
      if (!root || !window.bootstrap) return null;
      return bootstrap.Modal.getOrCreateInstance(root, { backdrop: 'static', keyboard: true });
    };
    const successModal = getModal(successModalEl);
    const typeModal = getModal(typeModalEl);

    const getSearchParam = (name) => new URLSearchParams(window.location.search).get(name);
    const editId = getSearchParam('edit');
    const themeId = getSearchParam('tema');

    let currentVote = null;
    let isEdit = false;
    let isRotativos = themeId === 'membros-rotativos';
    if (themeId) {
      document.body?.classList.add('vote-module-bg');
    }

    const REGION_DIR = REGION_IMAGE_DIR;
    const DEFAULT_REGION_URL = REGION_IMAGE_DEFAULT;
    let cityDataPromise = null;

    const themeMeta = themeId ? THEMES.find((t) => t.id === themeId) : null;
    if (titleInput && themeMeta) {
      titleInput.value = `${new Date().getFullYear()} - ${themeMeta.title}`;
    }

    const createId = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const stripDiacritics = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const normalizeToken = (value) =>
      stripDiacritics(value)
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

    const normalizeCityUfKey = (city, uf) => {
      const c = normalizeToken(city);
      const u = normalizeToken(uf).replace(/\s+/g, '');
      if (!c || !u) return '';
      return `${c}|${u}`;
    };

    const loadCityData = async () => {
      if (cityDataPromise) return cityDataPromise;
      cityDataPromise = (async () => {
        const res = await fetch(CITY_DATA_URL, { cache: 'no-cache' });
        if (!res.ok) return { states: [] };
        const data = await res.json().catch(() => null);
        if (!data) return { states: [] };
        if (Array.isArray(data.states)) return data;
        if (Array.isArray(data)) return { states: data };
        if (typeof data === 'object') {
          const states = Object.entries(data).map(([uf, cities]) => ({
            uf,
            region: getRegionKeyByUf(uf),
            cities: Array.isArray(cities) ? cities : [],
          }));
          return { states };
        }
        return { states: [] };
      })();
      return cityDataPromise;
    };

    const ensureUfDatalist = () => Promise.resolve();

    const ensureCityDatalist = async () => {
      await loadCityData();
    };

    const getCityStates = async () => {
      const data = await loadCityData();
      return Array.isArray(data.states) ? data.states : [];
    };

    const cityExistsInUf = async (city, uf) => {
      const stateUf = String(uf || '').trim().toUpperCase();
      if (!stateUf) return true;
      const states = await getCityStates();
      const state = states.find((s) => String(s.uf || '').trim().toUpperCase() === stateUf);
      if (!state || !Array.isArray(state.cities) || !state.cities.length) return true;
      const target = normalizeToken(city);
      return state.cities.some((name) => normalizeToken(name) === target);
    };

    const parseCityUfFromText = (text) => {
      const raw = String(text || '').trim();
      if (!raw) return { city: '', uf: '' };
      const match = raw.match(/^(.+?)[\s\-\/]+([A-Za-z]{2})$/);
      if (match) {
        return { city: match[1].trim(), uf: match[2].trim() };
      }
      return { city: raw, uf: '' };
    };

    const formatCityUfText = (city, uf) => {
      const c = String(city || '').trim();
      const u = String(uf || '').trim();
      if (!c || !u) return '';
      return `${c.toUpperCase()} - ${u.toUpperCase()}`;
    };

    const resolveThemeIdFromVote = (vote) => {
      const raw = vote?.tema || vote?.themeId || vote?.theme || vote?.modulo || vote?.module
        || vote?.tema?.id || vote?.theme?.id || vote?.modulo?.id || vote?.module?.id;
      if (raw) {
        const norm = normalizeToken(raw);
        const match = THEMES.find((t) => normalizeToken(t.id) === norm || normalizeToken(t.name) === norm);
        if (match) return match.id;
      }
      const title = normalizeToken(vote?.title || vote?.titulo || '');
      if (title.includes('membros rotativos')) return 'membros-rotativos';
      if (title.includes('membros cnrpps')) return 'membros-cnrpps';
      if (title.includes('comite da compensacao')) return 'comite-compensacao';
      if (title.includes('certificacao profissional')) return 'certificacao-profissional';
      if (title.includes('pro gestao')) return 'pro-gestao';
      return '';
    };

    const getQuestionsFromVote = (vote) =>
      vote?.questions || vote?.perguntas || vote?.questoes || [];

    const inferRotativosFromOptions = (questions = []) => {
      const isCityUf = (text) => {
        const raw = String(text || '').trim();
        if (!raw) return false;
        return /[A-Za-z].+[\-\/]\s*[A-Za-z]{2}\b/.test(raw);
      };
      return (questions || []).some((q) =>
        (q?.options || q?.opcoes || q?.alternativas || []).some((opt) => {
          const txt = (typeof opt === 'string') ? opt : opt?.text;
          return isCityUf(txt);
        })
      );
    };

    const normalizeOption = (opt) => {
      if (typeof opt === 'string') {
        return { id: createId('o'), text: opt };
      }
      const text = opt?.text ?? opt?.label ?? '';
      return { ...opt, id: opt?.id || createId('o'), text };
    };

    const getCitiesByUf = async (uf) => {
      if (!isRotativos) return [];
      const key = String(uf || '').trim().toUpperCase();
      if (!key) return [];
      const states = await getCityStates();
      const state = states.find((s) => String(s.uf || '').trim().toUpperCase() === key);
      return (state?.cities || []).map((city) => String(city || '').trim()).filter(Boolean);
    };

    const createAutocomplete = (input, getItems, opts = {}) => {
      if (!input) return null;
      const maxItems = opts.maxItems || 12;
      const minChars = opts.minChars || 0;
      const emptyMessage = opts.emptyMessage || '';
      const wrapper = input.closest('.vote-field') || input.parentElement;
      if (!wrapper) return null;

      const menu = document.createElement('div');
      menu.className = 'vote-autocomplete-menu d-none';
      menu.setAttribute('role', 'listbox');
      wrapper.appendChild(menu);

      let activeIndex = -1;
      let currentItems = [];

      const normalizeSearch = (value) =>
        String(value || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();

      const closeMenu = () => {
        menu.classList.add('d-none');
        menu.innerHTML = '';
        activeIndex = -1;
      };

      const renderMenu = (items) => {
        menu.innerHTML = '';
        if (!items.length) {
          if (emptyMessage) {
            const empty = document.createElement('div');
            empty.className = 'vote-autocomplete-empty';
            empty.textContent = emptyMessage;
            menu.appendChild(empty);
            menu.classList.remove('d-none');
          } else {
            closeMenu();
          }
          return;
        }
        items.slice(0, maxItems).forEach((item, idx) => {
          const el = document.createElement('div');
          el.className = 'vote-autocomplete-item';
          el.setAttribute('role', 'option');
          el.textContent = item;
          el.addEventListener('mouseenter', () => {
            activeIndex = idx;
            updateActive();
          });
          el.addEventListener('mousedown', (event) => {
            event.preventDefault();
            selectItem(item);
          });
          menu.appendChild(el);
        });
        menu.classList.remove('d-none');
        updateActive();
      };

      const updateActive = () => {
        const items = Array.from(menu.querySelectorAll('.vote-autocomplete-item'));
        items.forEach((el, idx) => el.classList.toggle('is-active', idx === activeIndex));
      };

      const selectItem = (value) => {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        closeMenu();
      };

      const refresh = async () => {
        const query = normalizeSearch(input.value);
        if (query.length < minChars) {
          closeMenu();
          return;
        }
        const list = await Promise.resolve(getItems());
        currentItems = Array.isArray(list) ? list : [];
        const filtered = query
          ? currentItems.filter((item) => normalizeSearch(item).includes(query))
          : currentItems;
        activeIndex = filtered.length ? 0 : -1;
        renderMenu(filtered);
      };

      const onKeyDown = (event) => {
        if (menu.classList.contains('d-none')) return;
        const items = Array.from(menu.querySelectorAll('.vote-autocomplete-item'));
        if (!items.length) return;
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          activeIndex = (activeIndex + 1) % items.length;
          updateActive();
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          activeIndex = (activeIndex - 1 + items.length) % items.length;
          updateActive();
        } else if (event.key === 'Enter') {
          if (activeIndex >= 0 && items[activeIndex]) {
            event.preventDefault();
            selectItem(items[activeIndex].textContent || '');
          }
        } else if (event.key === 'Escape') {
          closeMenu();
        }
      };

      input.addEventListener('focus', refresh);
      input.addEventListener('input', refresh);
      input.addEventListener('keydown', onKeyDown);

      const outsideHandler = (event) => {
        if (wrapper.contains(event.target)) return;
        closeMenu();
      };
      document.addEventListener('click', outsideHandler);

      return { refresh, close: closeMenu };
    };

    const updateNumbers = () => {
      const cards = Array.from(builder.querySelectorAll('.vote-question-card'));
      cards.forEach((card, idx) => {
        const badge = card.querySelector('.vote-q-number');
        if (badge) badge.textContent = `${idx + 1}.`;
      });
    };

    const setFlagPreview = (row, url) => {
      const preview = row.querySelector('.vote-flag-preview');
      const img = preview?.querySelector('img');
      const placeholder = preview?.querySelector('.vote-flag-placeholder');
      if (!preview || !img) return;
      const finalUrl = url || DEFAULT_REGION_URL;
      if (finalUrl) {
        img.src = finalUrl;
        img.alt = 'Região selecionada';
        preview.classList.remove('is-empty');
        placeholder?.classList.add('d-none');
      }
    };

    const setConfirmState = (row, confirmed) => {
      const confirmBtn = row.querySelector('.vote-flag-confirm');
      const inputs = row.querySelectorAll('.vote-option-city, .vote-option-uf');
      row.classList.toggle('is-confirmed', confirmed);
      inputs.forEach((input) => {
        if (confirmed) input.setAttribute('disabled', 'disabled');
        else input.removeAttribute('disabled');
      });
      if (!confirmBtn) return;
      confirmBtn.setAttribute('aria-label', confirmed ? 'Confirmado' : 'Confirmar');
      confirmBtn.classList.toggle('is-confirmed', confirmed);
    };

    const updateFlagFromInputs = async (row) => {
      const city = row.querySelector('.vote-option-city')?.value || '';
      const uf = row.querySelector('.vote-option-uf')?.value || '';
      const regionKey = getRegionKeyByUf(uf);
      const regionInput = row.querySelector('.vote-option-region');
      const proInput = row.querySelector('.vote-option-progestao');
      const regionLabel = formatRegionLabel(regionKey);
      const proValue = (city || uf) ? simulateProGestao(city, uf) : '';

      if (regionInput) regionInput.value = regionLabel;
      if (proInput) proInput.value = formatProGestaoValue(proValue);

      const url = resolveRegionImageUrl(regionKey);
      setFlagPreview(row, url || null);
      row.dataset.flagFound = regionKey ? '1' : '0';
      row.dataset.regionKey = regionKey;
      row.dataset.proGestao = proValue ? String(proValue) : '';
      return { regionKey, proGestao: proValue };
    };

    const createOptionEl = (option) => {
      const wrap = document.createElement('div');
      wrap.className = isRotativos ? 'vote-option-input is-flag-option' : 'vote-option-input';
      wrap.dataset.oid = option.id;
      if (!isRotativos) {
        wrap.innerHTML = `
          <input type="text" class="form-control vote-option-text" placeholder="Opção" value="${option.text || ''}" />
          <button type="button" class="btn btn-danger btn-sm vote-remove-option">Remover</button>
        `;
        return wrap;
      }
      const parsed = parseCityUfFromText(option.text);
      const city = option.city || parsed.city || '';
      const uf = option.uf || parsed.uf || '';
      const regionKey = normalizeRegionKey(option.region) || getRegionKeyByUf(uf);
      const regionLabel = formatRegionLabel(regionKey);
      const proGestao = (option.proGestao || option.pro_gestao || option.proGestaoLevel)
        ?? ((city || uf) ? simulateProGestao(city, uf) : '');
      wrap.innerHTML = `
        <div class="vote-flag-preview is-empty">
          <img class="vote-flag-img" alt="Região padrão" src="${DEFAULT_REGION_URL}">
          <span class="vote-flag-placeholder d-none">Sem região</span>
        </div>
        <div class="vote-flag-fields">
          <div class="vote-field">
            <input type="text" class="form-control vote-option-uf" placeholder="UF" maxlength="2">
          </div>
          <div class="vote-field">
            <input type="text" class="form-control vote-option-city" placeholder="Município">
          </div>
          <div class="vote-field">
            <input type="text" class="form-control vote-option-region" placeholder="Região" readonly>
          </div>
          <div class="vote-field">
            <input type="text" class="form-control vote-option-progestao" placeholder="Pró-Gestão" readonly>
          </div>
        </div>
        <div class="vote-flag-actions" role="group" aria-label="Ações">
          <button type="button" class="vote-flag-action is-clear vote-flag-clear" aria-label="Limpar"><i class="bi bi-eraser"></i></button>
          <button type="button" class="vote-flag-action is-remove vote-remove-option" aria-label="Remover"><i class="bi bi-trash"></i></button>
        </div>
      `;
      const cityInput = wrap.querySelector('.vote-option-city');
      const ufInput = wrap.querySelector('.vote-option-uf');
      const regionInput = wrap.querySelector('.vote-option-region');
      const proInput = wrap.querySelector('.vote-option-progestao');
      if (cityInput) cityInput.value = city;
      if (ufInput) ufInput.value = uf;
      if (regionInput) regionInput.value = regionLabel;
      if (proInput) proInput.value = formatProGestaoValue(proGestao);

      const ufAuto = createAutocomplete(ufInput, () => Object.keys(UF_REGION), { maxItems: 10 });
      const cityAuto = createAutocomplete(
        cityInput,
        () => getCitiesByUf(ufInput?.value),
        { maxItems: 12, emptyMessage: 'Selecione uma UF' }
      );
      if (ufInput) {
        const syncCity = () => {
          if (cityInput) cityInput.value = '';
          cityAuto?.refresh();
        };
        ufInput.addEventListener('input', syncCity);
        ufInput.addEventListener('change', syncCity);
      }
      if (city && uf) {
        updateFlagFromInputs(wrap);
      }
      return wrap;
    };

    const createQuestionEl = (question) => {
      const card = document.createElement('div');
      card.className = 'card vote-question-card';
      card.dataset.qid = question.id;
      card.dataset.type = question.type;

      const isOptions = question.type === 'options';
      const optionsHtml = isOptions ? `
        <div class="vote-options vstack gap-2 mt-3"></div>
        <button type="button" class="btn btn-success btn-sm mt-3 vote-add-option">Adicionar opção</button>
        <div class="form-check form-switch mt-3">
          <input class="form-check-input vote-multi-toggle" type="checkbox" ${question.allowMultiple ? 'checked' : ''}>
          <label class="form-check-label">Permitir várias respostas</label>
        </div>
        <div class="vote-multi-limits mt-2 ${question.allowMultiple ? '' : 'd-none'}">
          <div class="row g-2 align-items-end">
            <div class="col-12 col-md-6">
              <label class="form-label">Limite de respostas</label>
              <select class="form-select vote-limit-type">
                <option value="none">Sem limite</option>
                <option value="equal">Igual a</option>
                <option value="max">No máximo</option>
              </select>
            </div>
            <div class="col-12 col-md-6">
              <label class="form-label">Quantidade</label>
              <input type="number" min="1" class="form-control vote-limit-value" placeholder="Ex.: 2" />
            </div>
          </div>
        </div>
      ` : `
        <div class="text-muted mt-3">Resposta em texto.</div>
      `;

      card.innerHTML = `
        <div class="card-body">
          <div class="vote-q-row">
            <span class="badge text-bg-light vote-q-number">1.</span>
            <input type="text" class="form-control flex-grow-1 vote-question-text" placeholder="Digite a pergunta" value="${question.text || ''}" />
            <button type="button" class="btn btn-outline-danger btn-sm vote-remove-question" aria-label="Remover pergunta">
              <i class="bi bi-trash"></i>
            </button>
          </div>
          ${optionsHtml}
        </div>
      `;

      if (isOptions) {
        const optionsWrap = card.querySelector('.vote-options');
        (question.options || []).forEach((opt) => optionsWrap.appendChild(createOptionEl(opt)));
        const limitType = card.querySelector('.vote-limit-type');
        const limitValue = card.querySelector('.vote-limit-value');
        if (limitType) limitType.value = question.limitType || 'none';
        if (limitValue && question.limitValue) limitValue.value = question.limitValue;
      }

      return card;
    };

    const addQuestion = (type) => {
      const data = type === 'text'
        ? { id: createId('q'), type: 'text', text: '' }
        : {
          id: createId('q'),
          type: 'options',
          text: '',
          options: [
            { id: createId('o'), text: '' },
            { id: createId('o'), text: '' },
          ],
          allowMultiple: false,
          limitType: 'none',
          limitValue: '',
        };
      builder.appendChild(createQuestionEl(data));
      updateNumbers();
    };

    const hydrate = async () => {
      builder.innerHTML = '';
      if (editId) {
        const res = await adminFetch(`/api/votacao/admin/votacoes/${encodeURIComponent(editId)}`);
        if (res.ok) {
          currentVote = await res.json();
          isEdit = true;
          const questions = getQuestionsFromVote(currentVote);
          const voteThemeId = resolveThemeIdFromVote(currentVote);
          if (voteThemeId) {
            isRotativos = voteThemeId === 'membros-rotativos';
          } else if (inferRotativosFromOptions(questions)) {
            isRotativos = true;
          }
          ensureUfDatalist();
          await ensureCityDatalist();
          titleInput.value = currentVote.title || '';
          if (saveBtn) saveBtn.textContent = 'Salvar';
          (questions || []).forEach((q) => addQuestion(q.type || q.tipo || 'options'));
          const cards = Array.from(builder.querySelectorAll('.vote-question-card'));
          cards.forEach((card, idx) => {
            const q = (questions || [])[idx];
            if (!q) return;
            card.dataset.qid = q.id || createId('q');
            card.dataset.type = q.type || q.tipo || 'options';
            card.querySelector('.vote-question-text').value = q.text || q.titulo || '';
            if ((q.type || q.tipo || 'options') === 'options') {
              const optionsWrap = card.querySelector('.vote-options');
              optionsWrap.innerHTML = '';
              const rawOptions = q.options || q.opcoes || q.alternativas || [];
              rawOptions.forEach((opt) => optionsWrap.appendChild(createOptionEl(normalizeOption(opt))));
              const toggle = card.querySelector('.vote-multi-toggle');
              const limits = card.querySelector('.vote-multi-limits');
              const limitType = card.querySelector('.vote-limit-type');
              const limitValue = card.querySelector('.vote-limit-value');
              if (toggle) toggle.checked = !!q.allowMultiple;
              if (limits) limits.classList.toggle('d-none', !q.allowMultiple);
              if (limitType) limitType.value = q.limitType || 'none';
              if (limitValue && q.limitValue) limitValue.value = q.limitValue;
            }
          });
        }
      } else {
        addQuestion('options');
      }
      updateNumbers();
    };

    hydrate();

    addQuestionBtn?.addEventListener('click', () => {
      typeModal?.show();
    });

    typeModalEl?.addEventListener('click', (event) => {
      const btn = event.target.closest('.vote-type-btn');
      if (!btn) return;
      const type = btn.dataset.type;
      addQuestion(type);
      typeModal?.hide();
    });

    builder.addEventListener('click', async (event) => {
      const addOptionBtn = event.target.closest('.vote-add-option');
      if (addOptionBtn) {
        const questionCard = event.target.closest('.vote-question-card');
        const optionsWrap = questionCard?.querySelector('.vote-options');
        if (!optionsWrap) return;
        const option = { id: createId('o'), text: '' };
        optionsWrap.appendChild(createOptionEl(option));
      }

      const clearBtn = event.target.closest('.vote-flag-clear');
      if (clearBtn) {
        const row = event.target.closest('.vote-option-input');
        if (!row) return;
        const cityInput = row.querySelector('.vote-option-city');
        const ufInput = row.querySelector('.vote-option-uf');
        const regionInput = row.querySelector('.vote-option-region');
        const proInput = row.querySelector('.vote-option-progestao');
        if (cityInput) cityInput.value = '';
        if (ufInput) ufInput.value = '';
        if (regionInput) regionInput.value = '';
        if (proInput) proInput.value = '';
        setConfirmState(row, false);
        setFlagPreview(row, null);
        row.dataset.flagFound = '0';
        row.dataset.regionKey = '';
        row.dataset.proGestao = '';
        return;
      }

      const removeOptionBtn = event.target.closest('.vote-remove-option');
      if (removeOptionBtn) {
        const optionRow = event.target.closest('.vote-option-input');
        const optionsWrap = event.target.closest('.vote-options');
        if (optionsWrap && optionsWrap.children.length <= 2) {
          await showUiModal({
            title: 'Aviso',
            message: 'Cada pergunta precisa ter pelo menos duas opções.',
            variant: 'warning',
          });
          return;
        }
        optionRow?.remove();
      }

      const removeQuestionBtn = event.target.closest('.vote-remove-question');
      if (removeQuestionBtn) {
        if (builder.children.length <= 1) {
          await showUiModal({
            title: 'Aviso',
            message: 'É necessário manter ao menos uma pergunta.',
            variant: 'warning',
          });
          return;
        }
        event.target.closest('.vote-question-card')?.remove();
        updateNumbers();
      }
    });

    builder.addEventListener('change', (event) => {
      const toggle = event.target.closest('.vote-multi-toggle');
      if (!toggle) return;
      const card = event.target.closest('.vote-question-card');
      const limits = card?.querySelector('.vote-multi-limits');
      if (limits) limits.classList.toggle('d-none', !toggle.checked);
    });

    builder.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.classList.contains('vote-option-uf')) {
        target.value = target.value.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
      }
      if (target.classList.contains('vote-option-city') || target.classList.contains('vote-option-uf')) {
        const row = target.closest('.vote-option-input');
        if (!row) return;
        if (row.classList.contains('is-confirmed')) setConfirmState(row, false);
        if (target.classList.contains('vote-option-city')) {
          const ufInput = row.querySelector('.vote-option-uf');
          const parsed = parseCityUfFromText(target.value);
          if (parsed?.uf && ufInput) {
            target.value = parsed.city || '';
            ufInput.value = parsed.uf.toUpperCase();
          }
        }
        updateFlagFromInputs(row);
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const questions = [];
      const cards = Array.from(builder.querySelectorAll('.vote-question-card'));
      for (const card of cards) {
        const qText = (card.querySelector('.vote-question-text')?.value || '').trim();
        const qType = card.dataset.type || 'options';
        if (!qText) {
          await showUiModal({ title: 'Aviso', message: 'Preencha todas as perguntas.', variant: 'warning' });
          return;
        }

        if (qType === 'text') {
          questions.push({ id: card.dataset.qid || createId('q'), type: 'text', text: qText });
          continue;
        }

        const optionEls = Array.from(card.querySelectorAll('.vote-option-input'));
        let invalidRotativos = false;
        const options = optionEls.map((optEl) => {
          if (isRotativos) {
            const city = optEl.querySelector('.vote-option-city')?.value || '';
            const uf = optEl.querySelector('.vote-option-uf')?.value || '';
            const regionKey = optEl.dataset.regionKey || getRegionKeyByUf(uf);
            const proGestaoRaw = optEl.dataset.proGestao || optEl.querySelector('.vote-option-progestao')?.value || '';
            const proGestao = parseInt(String(proGestaoRaw || '0'), 10) || simulateProGestao(city, uf);
            const text = formatCityUfText(city, uf);
            if (!text || !regionKey) invalidRotativos = true;
            return {
              id: optEl.dataset.oid || createId('o'),
              text,
              city: city.trim(),
              uf: uf.trim().toUpperCase(),
              region: regionKey,
              proGestao,
            };
          }
          return {
            id: optEl.dataset.oid || createId('o'),
            text: (optEl.querySelector('.vote-option-text')?.value || '').trim(),
          };
        }).filter((opt) => opt.text);
        if (isRotativos && invalidRotativos) {
          await showUiModal({
            title: 'Aviso',
            message: 'Preencha município e UF válidos em todas as opções.',
            variant: 'warning',
          });
          return;
        }
        if (options.length < 2) {
          await showUiModal({
            title: 'Aviso',
            message: 'Cada pergunta precisa ter ao menos duas opções preenchidas.',
            variant: 'warning',
          });
          return;
        }

        const allowMultiple = !!card.querySelector('.vote-multi-toggle')?.checked;
        const limitType = card.querySelector('.vote-limit-type')?.value || 'none';
        const limitValue = parseInt(card.querySelector('.vote-limit-value')?.value || '0', 10) || 0;

        questions.push({
          id: card.dataset.qid || createId('q'),
          type: 'options',
          text: qText,
          options,
          allowMultiple,
          limitType,
          limitValue,
        });
      }

      if (isEdit && currentVote?.id) {
        const stop = startLoading('Salvando votação...');
        const res = await adminFetch(`/api/votacao/admin/votacoes/${encodeURIComponent(currentVote.id)}`, {
          method: 'PUT',
          body: JSON.stringify({ questions }),
        });
        stop();
        if (!res.ok) {
          await showUiModal({ title: 'Erro', message: 'Erro ao salvar.', variant: 'danger' });
          return;
        }
      } else {
        if (!themeId) {
          await showUiModal({ title: 'Erro', message: 'Tema não encontrado.', variant: 'danger' });
          return;
        }
        const stop = startLoading('Gerando votação...');
        const res = await adminFetch('/api/votacao/admin/votacoes', {
          method: 'POST',
          body: JSON.stringify({ tema: themeId, questions }),
        });
        stop();
        if (!res.ok) {
          await showUiModal({ title: 'Erro', message: 'Erro ao criar votação.', variant: 'danger' });
          return;
        }
        currentVote = await res.json();
      }

      if (isEdit) {
        if (msg) {
          msg.textContent = 'Informações atualizadas com sucesso.';
          msg.classList.remove('d-none');
        }
        return;
      }

      if (msg) msg.classList.remove('d-none');
      if (msgLink) {
        msgLink.href = `${location.origin}/votacao.html`;
        msgLink.textContent = `${location.origin}/votacao.html`;
      }
      if (successModalLink) {
        successModalLink.href = `${location.origin}/votacao.html`;
        successModalLink.textContent = `${location.origin}/votacao.html`;
      }
      successModal?.show();
      successModalEl?.addEventListener('hidden.bs.modal', () => {
        window.location.href = '/index.html?votacao=1';
      }, { once: true });
    });
  };

  // ===== Público =====
  const initPublicPage = () => {
    const container = document.getElementById('votePublicContainer');
    const loginForm = document.getElementById('voteLoginForm');
    const loginMsg = document.getElementById('voteLoginMsg');
    const loginCard = document.getElementById('voteLoginCard');
    const cpfInput = document.getElementById('voteCpf');
    const modules = document.getElementById('voteModules');
    const moduleGrid = document.getElementById('voteModuleGrid');
    const formWrap = document.getElementById('voteFormWrap');
    const form = document.getElementById('votePublicForm');
    const questionsWrap = document.getElementById('votePublicQuestions');
    const successMsg = document.getElementById('votePublicMsg');
    const backBtn = document.getElementById('voteBackBtn');
    const formTitle = document.getElementById('voteFormTitle');
    const userMenu = document.getElementById('voteUserMenu');
    const userName = document.getElementById('voteUserName');
    const userLogout = document.getElementById('voteUserLogout');
    const userAvatar = document.getElementById('voteUserAvatar');
    const userAvatarWrap = userAvatar?.closest('.vote-user-avatar');
    const userIntro = document.getElementById('voteUserIntro');
    const userIntroName = document.getElementById('voteUserIntroName');
    const userIntroTitularidade = document.getElementById('voteUserIntroTitularidade');
    const userIntroRepresentatividade = document.getElementById('voteUserIntroRepresentatividade');
    const userIntroId = document.getElementById('voteUserIntroId');
    const userIntroAvatar = document.getElementById('voteUserIntroAvatar');
    const userIntroAvatarWrap = userIntroAvatar?.closest('.vote-user-intro-avatar');
    const formModalEl = document.getElementById('voteFormModal');
    const formModalBody = document.getElementById('voteFormModalBody');
    const formModalTitle = document.getElementById('voteFormModalTitle');
    const deniedModalEl = document.getElementById('voteDeniedModal');
    const deniedBody = document.getElementById('voteDeniedBody');
    const unavailableModalEl = document.getElementById('voteUnavailableModal');

    if (!container || !loginForm || !moduleGrid) return;

    const deniedModal = deniedModalEl && window.bootstrap ? bootstrap.Modal.getOrCreateInstance(deniedModalEl) : null;
    const unavailableModal = unavailableModalEl && window.bootstrap ? bootstrap.Modal.getOrCreateInstance(unavailableModalEl) : null;
    const formModal = formModalEl && window.bootstrap ? bootstrap.Modal.getOrCreateInstance(formModalEl) : null;

    const setModuleBackground = (enabled) => {
      document.body?.classList.toggle('vote-module-bg', !!enabled);
    };

    let currentUser = null;
    let currentVote = null;
    let startedAt = 0;
    let pollTimer = null;
    let currentThemeId = null;
    let lastThemes = null;

    const PHOTO_DIR = '/imagens/fotos-conselheiros';
    const PHOTO_MANIFEST_URL = `${PHOTO_DIR}/manifest.json`;
    const DEFAULT_USER_PHOTO = `${PHOTO_DIR}/padrao.svg`;
    const photoCache = new Map();
    let photoIndexPromise = null;

    const REGION_DIR = REGION_IMAGE_DIR;
    const DEFAULT_REGION_URL = REGION_IMAGE_DEFAULT;

    const stripDiacritics = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const normalizeToken = (value) =>
      stripDiacritics(value)
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

    // Região e Pró-Gestão vêm do UF/município já salvo na opção.

    const parseCityUfFromText = (text) => {
      const raw = String(text || '').trim();
      if (!raw) return { city: '', uf: '' };
      const match = raw.match(/^(.+?)[\s\-\/]+([A-Za-z]{2})$/);
      if (match) {
        return { city: match[1].trim(), uf: match[2].trim() };
      }
      return { city: raw, uf: '' };
    };

    const toTitleCase = (value) =>
      String(value || '')
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(' ');

    const formatCityUfTitle = (city, uf) => {
      const c = toTitleCase(city);
      const u = String(uf || '').toUpperCase();
      if (!c || !u) return c || u || '';
      return `${c} / ${u}`;
    };

    const formatRegionTitle = (region) => {
      if (!region) return '';
      return `Região ${toTitleCase(region)}`;
    };

    const formatVoteTitle = (title) => {
      if (!title) return 'Questionário';
      const year = new Date().getFullYear();
      return String(title).replace(/^\d{4}/, String(year));
    };

    const formatProGestaoLabel = (value) => {
      const num = parseInt(String(value || ''), 10);
      if (!Number.isFinite(num) || num <= 0) return '';
      const roman = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }[num] || String(num);
      return `Pró-Gestão ${roman}`;
    };

    const normalizeNameKey = (value) =>
      stripDiacritics(value)
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

    const loadPhotoIndex = async () => {
      if (photoIndexPromise) return photoIndexPromise;
      photoIndexPromise = (async () => {
        const map = new Map();
        const res = await fetch(PHOTO_MANIFEST_URL, { cache: 'no-cache' });
        if (!res.ok) return map;
        const list = await res.json().catch(() => []);
        if (!Array.isArray(list)) return map;
        list.forEach((file) => {
          if (typeof file !== 'string') return;
          const key = normalizeNameKey(file);
          if (key) map.set(key, file);
        });
        return map;
      })();
      return photoIndexPromise;
    };

    const resolvePhotoUrlByName = async (name) => {
      const key = normalizeNameKey(name);
      if (!key) return DEFAULT_USER_PHOTO;
      if (photoCache.has(key)) return photoCache.get(key);
      const index = await loadPhotoIndex();
      let filename = index.get(key);
      if (!filename) {
        const nameTokens = new Set(key.split(' ').filter(Boolean));
        let bestKey = '';
        index.forEach((_file, idxKey) => {
          const idxTokens = idxKey.split(' ').filter(Boolean);
          if (idxTokens.length < 2) return;
          const allPresent = idxTokens.every((t) => nameTokens.has(t));
          if (allPresent && idxKey.length > bestKey.length) bestKey = idxKey;
        });
        if (bestKey) filename = index.get(bestKey);
      }
      const safeName = filename ? encodeURIComponent(filename) : '';
      const url = filename ? `${PHOTO_DIR}/${safeName}` : DEFAULT_USER_PHOTO;
      photoCache.set(key, url);
      return url;
    };

    const resolveUserPhoto = async (user) => {
      if (!user) return DEFAULT_USER_PHOTO;
      const direct = user.foto || user.photo || user.photoUrl || user.fotoUrl;
      if (direct) {
        const raw = String(direct).trim();
        if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) return raw;
        return `${PHOTO_DIR}/${encodeURIComponent(raw)}`;
      }
      const nameForPhoto = user.nomeCompleto || user.nome;
      if (nameForPhoto) return resolvePhotoUrlByName(nameForPhoto);
      return DEFAULT_USER_PHOTO;
    };

    const setUserAvatar = (user) => {
      if (!userAvatar || !userAvatarWrap) return;
      if (!user) {
        userAvatar.removeAttribute('src');
        userAvatarWrap.classList.add('is-fallback');
        return;
      }
      resolveUserPhoto(user).then((url) => {
        userAvatar.src = url || DEFAULT_USER_PHOTO;
        userAvatarWrap.classList.remove('is-fallback');
      });
      userAvatar.onerror = () => {
        if (userAvatar.src !== DEFAULT_USER_PHOTO) {
          userAvatar.src = DEFAULT_USER_PHOTO;
          return;
        }
        userAvatarWrap.classList.add('is-fallback');
      };
    };

    const setIntroAvatar = (user) => {
      if (!userIntroAvatar || !userIntroAvatarWrap) return;
      if (!user) {
        userIntroAvatar.removeAttribute('src');
        userIntroAvatarWrap.classList.add('is-fallback');
        return;
      }
      resolveUserPhoto(user).then((url) => {
        userIntroAvatar.src = url || DEFAULT_USER_PHOTO;
        userIntroAvatarWrap.classList.remove('is-fallback');
      });
      userIntroAvatar.onerror = () => {
        if (userIntroAvatar.src !== DEFAULT_USER_PHOTO) {
          userIntroAvatar.src = DEFAULT_USER_PHOTO;
          return;
        }
        userIntroAvatarWrap.classList.add('is-fallback');
      };
    };

    const setUserMenu = (user) => {
      if (!userMenu || !userName) return;
      if (!user) {
        userMenu.classList.add('d-none');
        userName.textContent = '';
        setUserAvatar(null);
        return;
      }
      userName.textContent = user.nome || 'Usuário';
      userMenu.classList.remove('d-none');
      setUserAvatar(user);
    };

    const showUserIntro = (user) => {
      if (!userIntro) return Promise.resolve();
      if (userIntroName) userIntroName.textContent = user?.nome || 'Usuário';
      if (userIntroTitularidade) {
        userIntroTitularidade.textContent = user?.titularidade || '';
        userIntroTitularidade.classList.toggle('d-none', !user?.titularidade);
      }
      if (userIntroRepresentatividade) {
        userIntroRepresentatividade.textContent = user?.representatividade || '';
        userIntroRepresentatividade.classList.toggle('d-none', !user?.representatividade);
      }
      if (userIntroId) {
        userIntroId.textContent = user?.numerodeinscricao || '';
        userIntroId.classList.toggle('d-none', !user?.numerodeinscricao);
      }
      setIntroAvatar(user);
      userIntro.classList.remove('d-none');
      requestAnimationFrame(() => userIntro.classList.add('is-visible'));
      return new Promise((resolve) => {
        setTimeout(() => {
          userIntro.classList.remove('is-visible');
          setTimeout(() => {
            userIntro.classList.add('d-none');
            resolve();
          }, 350);
        }, 2000);
      });
    };

    const formatCpf = (value) => {
      const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
      const parts = [];
      if (digits.length > 0) parts.push(digits.slice(0, 3));
      if (digits.length >= 4) parts.push(digits.slice(3, 6));
      if (digits.length >= 7) parts.push(digits.slice(6, 9));
      let formatted = parts.join('.');
      if (digits.length >= 10) formatted += `-${digits.slice(9, 11)}`;
      return formatted;
    };

    cpfInput?.addEventListener('input', () => {
      cpfInput.value = formatCpf(cpfInput.value);
      loginMsg.classList.add('d-none');
      loginMsg.textContent = '';
    });

    const renderModules = (themes) => {
      if (!moduleGrid) return;
      moduleGrid.innerHTML = themes.map((t) => {
        const theme = THEMES.find((x) => x.id === t.id) || {};
        const isDisabled = !t.active;
        return `
          <div class="col-12 col-md-6 col-lg-4">
            <div class="voting-theme-card ${isDisabled ? 'is-disabled' : ''}" data-theme="${t.id}">
              <div class="voting-theme-icon"><i class="bi ${theme.icon || 'bi-ballot-check'}" aria-hidden="true"></i></div>
              <div>
                <div class="voting-theme-text">${t.name}</div>
                <div class="voting-theme-sub">${isDisabled ? 'Indisponível' : 'Ativo'}</div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    };

    const fetchThemes = async () => {
      const res = await apiFetch('/api/votacao/temas');
      if (!res.ok) return null;
      return res.json();
    };

    const buildRotativosOptions = (q) => {
      const options = q.options || [];
      const isMulti = !!q.allowMultiple;
      const inputType = isMulti ? 'checkbox' : 'radio';
      const cols = Math.min(4, Math.max(1, options.length));
      const cards = options.map((opt) => {
        const base = (typeof opt === 'string') ? { text: opt } : opt;
        const parsed = parseCityUfFromText(base?.text || '');
        const city = base?.city || parsed.city || '';
        const uf = base?.uf || parsed.uf || '';
        const regionKey = normalizeRegionKey(base?.region) || getRegionKeyByUf(uf);
        const proGestao = base?.proGestao || base?.pro_gestao || simulateProGestao(city, uf);
        const title = formatCityUfTitle(city, uf);
        const region = formatRegionLabel(regionKey);
        const proLabel = formatProGestaoLabel(proGestao);
        const labelId = `${q.id}_${base?.id || opt?.id}`;
        return `
          <label class="vote-flag-card" for="${labelId}">
            <span class="vote-flag-select">
              <input class="form-check-input" type="${inputType}" name="${q.id}" id="${labelId}" value="${base?.id || opt?.id}">
            </span>
            <span class="vote-flag-media">
              <img src="${resolveRegionImageUrl(regionKey)}" alt="Região de ${title || 'município'}">
            </span>
            <span class="vote-flag-text">
              <span class="vote-flag-name">${title || 'Município'}</span>
              ${region ? `<span class="vote-flag-region">${region}</span>` : ''}
              ${proLabel ? `<span class="vote-flag-pro">${proLabel}</span>` : ''}
            </span>
          </label>
        `;
      });
      return `
        <div class="vote-flag-grid" style="--vote-cols:${cols}">
          ${cards.join('')}
        </div>
      `;
    };

    const startPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        const themes = await fetchThemes();
        if (themes && themes.length) {
          lastThemes = themes;
          renderModules(themes);
        }
      }, 2000);
    };

    const showDenied = async (msg) => {
      await showUiModal({
        title: 'Aviso',
        message: msg || 'Desculpe! Ação não permitida.',
        variant: 'denied',
      });
    };

    const applyPreviousAnswers = (answers) => {
      if (!Array.isArray(answers)) return;
      answers.forEach((ans) => {
        if (ans.type === 'text') {
          const area = questionsWrap.querySelector(`textarea[name="${ans.questionId}"]`);
          if (area) area.value = ans.value || '';
          return;
        }
        const ids = Array.isArray(ans.optionIds) ? ans.optionIds : [];
        ids.forEach((oid) => {
          const input = document.getElementById(`${ans.questionId}_${oid}`);
          if (input) input.checked = true;
        });
      });
    };

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const cpf = String(cpfInput?.value || '').replace(/\D/g, '');
      if (cpf.length !== 11) {
        loginMsg.classList.remove('d-none');
        loginMsg.textContent = 'CPF inválido. Verifique e tente novamente.';
        return;
      }
      const stop = startLoading('Validando CPF...');
      const res = await apiFetch('/api/votacao/login', {
        method: 'POST',
        body: JSON.stringify({ cpf }),
      });
      stop();
      const data = await res.json();
      if (!data.ok) {
        await showDenied('Desculpe! Ação não permitida');
        return;
      }
      loginMsg.classList.add('d-none');
      loginMsg.textContent = '';
      currentUser = data.user;
      sessionStorage.setItem(USER_KEY, JSON.stringify(currentUser));
      setUserMenu(currentUser);
      loginCard?.classList.add('d-none');
      await showUserIntro(currentUser);
      modules?.classList.remove('d-none');
      startPolling();
      const themes = await fetchThemes();
      if (themes && themes.length) {
        lastThemes = themes;
        renderModules(themes);
      }
    });

    moduleGrid.addEventListener('click', async (event) => {
      const card = event.target.closest('.voting-theme-card');
      if (!card || card.classList.contains('is-disabled')) {
        if (card) await showUiModal({ title: 'Aviso', message: 'Votação indisponível.', variant: 'warning' });
        return;
      }
      const themeId = card.dataset.theme;
      currentThemeId = themeId;
      const stop = startLoading('Carregando questionário...');
      const res = await apiFetch(`/api/votacao/temas/${encodeURIComponent(themeId)}/latest?cpf=${encodeURIComponent(currentUser?.cpf || '')}`);
      stop();
      if (!res.ok) return showUiModal({ title: 'Aviso', message: 'Votação indisponível.', variant: 'warning' });
      const data = await res.json();
      if (!data.active || !data.vote) return showUiModal({ title: 'Aviso', message: 'Votação indisponível.', variant: 'warning' });
      currentVote = data.vote;
      startedAt = Date.now();
      const pendingAnswers = Array.isArray(data.previousAnswers) ? data.previousAnswers : [];
      formWrap?.classList.remove('d-none');
      setModuleBackground(true);
      successMsg?.classList.add('d-none');
      questionsWrap.innerHTML = (currentVote.questions || []).map((q, index) => {
        if (q.type === 'text') {
          return `
            <div class="card vote-public-card p-3">
              <div class="fw-semibold mb-2">${index + 1}. ${q.text || 'Pergunta'}</div>
              <textarea class="form-control" name="${q.id}" rows="3" required></textarea>
            </div>
          `;
        }
        const isRotativos = currentThemeId === 'membros-rotativos';
        const isMulti = !!q.allowMultiple;
        const options = isRotativos ? '' : (q.options || []).map((opt) => `
          <div class="form-check">
            <input class="form-check-input" type="${isMulti ? 'checkbox' : 'radio'}" name="${q.id}" id="${q.id}_${opt.id}" value="${opt.id}">
            <label class="form-check-label" for="${q.id}_${opt.id}">${opt.text || 'Opção'}</label>
          </div>
        `).join('');
        return `
          <div class="card vote-public-card p-3 ${isRotativos ? 'vote-public-rotativos' : ''}" data-qid="${q.id}" data-multi="${isMulti ? '1' : '0'}" data-limit-type="${q.limitType || 'none'}" data-limit-value="${q.limitValue || ''}">
            <div class="fw-semibold mb-2">${index + 1}. ${q.text || 'Pergunta'}</div>
            ${isRotativos ? `<div class="vote-flag-grid-wrap">${options}</div>` : `<div class="vstack gap-2">${options}</div>`}
          </div>
        `;
      }).join('');
      if (currentThemeId === 'membros-rotativos') {
        const cards = Array.from(questionsWrap.querySelectorAll('.vote-public-rotativos'));
        const jobs = cards.map(async (cardEl) => {
          const qid = cardEl.dataset.qid;
          const q = (currentVote.questions || []).find((item) => item.id === qid);
          if (!q) return;
          const grid = await buildRotativosOptions(q);
          const wrap = cardEl.querySelector('.vote-flag-grid-wrap');
          if (wrap) wrap.innerHTML = grid;
        });
        Promise.all(jobs).then(() => applyPreviousAnswers(pendingAnswers));
      }
      const displayTitle = formatVoteTitle(currentVote.title);
      if (formTitle) formTitle.textContent = displayTitle;
      if (formModalTitle) formModalTitle.textContent = displayTitle;
      if (formModalBody && formWrap && formWrap.parentElement !== formModalBody) {
        formModalBody.appendChild(formWrap);
      }
      formModal?.show();
      if (currentThemeId !== 'membros-rotativos') {
        applyPreviousAnswers(pendingAnswers);
      }
    });

    backBtn?.addEventListener('click', () => {
      formModal?.hide();
    });

    formModalEl?.addEventListener('hidden.bs.modal', () => {
      formWrap?.classList.add('d-none');
      setModuleBackground(false);
    });

    userLogout?.addEventListener('click', () => {
      sessionStorage.removeItem(USER_KEY);
      currentUser = null;
      currentVote = null;
      setModuleBackground(false);
      setUserMenu(null);
      loginCard?.classList.remove('d-none');
      modules?.classList.add('d-none');
      formWrap?.classList.add('d-none');
      successMsg?.classList.add('d-none');
      if (cpfInput) cpfInput.value = '';
    });

    questionsWrap?.addEventListener('change', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== 'checkbox') return;
      const card = target.closest('.vote-public-card');
      if (!card) return;
      const limitType = card.dataset.limitType || 'none';
      const limitValue = parseInt(card.dataset.limitValue || '0', 10) || 0;
      if (limitType === 'none' || limitValue <= 0) return;
      const checked = card.querySelectorAll('input[type="checkbox"]:checked').length;
      if (checked > limitValue) {
        target.checked = false;
        const msg = limitType === 'equal'
          ? `Selecione exatamente ${limitValue} opção(ões).`
          : `Selecione no máximo ${limitValue} opção(ões).`;
        await showUiModal({ title: 'Aviso', message: msg, variant: 'warning' });
      }
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!currentVote || !currentUser) return;

      const answers = [];
      const questionCards = Array.from(questionsWrap.querySelectorAll('.vote-public-card'));
      for (const card of questionCards) {
        const qid = card.dataset.qid || card.querySelector('textarea')?.name;
        const isMulti = card.dataset.multi === '1';
        const limitType = card.dataset.limitType || 'none';
        const limitValue = parseInt(card.dataset.limitValue || '0', 10) || 0;

        if (card.querySelector('textarea')) {
          const val = (card.querySelector('textarea')?.value || '').trim();
          if (!val) {
            await showUiModal({ title: 'Aviso', message: 'Responda todas as perguntas.', variant: 'warning' });
            return;
          }
          answers.push({ questionId: qid, type: 'text', value: val });
          continue;
        }

        const selected = Array.from(card.querySelectorAll('input:checked')).map((el) => el.value);
        if (!selected.length) {
          await showUiModal({ title: 'Aviso', message: 'Responda todas as perguntas.', variant: 'warning' });
          return;
        }

        if (isMulti && limitType !== 'none' && limitValue > 0) {
          if (limitType === 'equal' && selected.length !== limitValue) {
            await showUiModal({ title: 'Aviso', message: `Selecione exatamente ${limitValue} opção(ões).`, variant: 'warning' });
            return;
          }
          if (limitType === 'max' && selected.length > limitValue) {
            await showUiModal({ title: 'Aviso', message: `Selecione no máximo ${limitValue} opção(ões).`, variant: 'warning' });
            return;
          }
        }

        answers.push({ questionId: qid, type: 'options', optionIds: selected });
      }

      const stop = startLoading('Enviando voto...');
      const res = await apiFetch('/api/votacao/votar', {
        method: 'POST',
        body: JSON.stringify({
          voteId: currentVote.id,
          cpf: currentUser.cpf,
          answers,
          durationMs: Date.now() - startedAt,
        }),
      });
      stop();

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (String(err.error || '').includes('VOTACAO_INDISPONIVEL')) {
          await showUiModal({ title: 'Aviso', message: 'Votação indisponível.', variant: 'warning' });
          return;
        }
        await showDenied('Desculpe! Ação não permitida');
        return;
      }

      const data = await res.json();
      successMsg.textContent = `${data.nome || currentUser.nome}, seu voto foi enviado com sucesso!`;
      successMsg?.classList.remove('d-none');
      await showUiModal({
        title: 'Sucesso',
        message: successMsg.textContent,
        variant: 'success',
      });
    });

    try {
      const cached = JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
      if (cached?.cpf) {
        currentUser = cached;
        setUserMenu(currentUser);
        loginCard?.classList.add('d-none');
        modules?.classList.remove('d-none');
        startPolling();
        fetchThemes().then((themes) => {
          if (themes && themes.length) {
            lastThemes = themes;
            renderModules(themes);
          }
        });
      }
    } catch {}
  };

  initAdminModule();
  initBuilderPage();
  initPublicPage();
})();



