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
    { id: 'pro-gestao', name: 'PR� GEST�O', title: 'Pr� Gest�o', icon: 'bi-patch-check' },
  ];

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
      const stop = startLoading('Carregando vota��es...');
      const res = await adminFetch(`/api/votacao/admin/temas/${encodeURIComponent(themeId)}/votacoes`);
      stop();
      if (!res.ok) throw new Error('Falha ao carregar vota��es');
      return res.json();
    };

    const renderList = (votes = []) => {
      if (!elList || !elEmptyState) return;
      elEmptyState.classList.toggle('d-none', votes.length > 0);
      elList.innerHTML = votes.map((vote) => {
        const status = vote.active ? 'Ativa' : 'Inativa';
        const linkUrl = `${location.origin}/votacao.html`;
        const toggleClass = vote.active ? 'btn-success' : 'btn-danger';
        const toggleLabel = vote.active ? 'Desativar' : 'Ativar';
        return `
          <div class="card voting-card" data-id="${vote.id}">
            <div class="card-body d-flex flex-wrap align-items-center gap-3">
              <div class="flex-grow-1">
                <div class="text-muted small">${status}</div>
                <div class="h6 mb-1">${vote.title || 'Sem t�tulo'}</div>
                <div class="small text-muted">Atualizada em ${formatDate(vote.updatedAt || vote.createdAt)}</div>
              </div>
              <div class="voting-actions" role="group" aria-label="A��es">
                <button type="button" class="btn btn-warning btn-sm" data-action="edit">
                  <i class="bi bi-pencil-square" aria-hidden="true"></i> Editar
                </button>
                <button type="button" class="btn btn-danger btn-sm" data-action="delete">
                  <i class="bi bi-trash" aria-hidden="true"></i> Excluir
                </button>
                <button type="button" class="btn btn-info btn-sm" data-action="link" data-link="${linkUrl}">
                  <i class="bi bi-link-45deg" aria-hidden="true"></i> Link
                </button>
                <button type="button" class="btn btn-primary btn-sm" data-action="results">
                  <i class="bi bi-eye" aria-hidden="true"></i> Ver
                </button>
                <button type="button" class="btn ${toggleClass} btn-sm" data-action="toggle" data-active="${vote.active ? '1' : '0'}">${toggleLabel}</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    };

    const renderResults = (payload) => {
      if (!payload || !elResultsMeta || !elResultsBody || !elResultsTitle) return;
      elResultsTitle.textContent = payload.title || 'Vis�o geral das respostas';
      elResultsMeta.innerHTML = `
        <div class="voting-meta-item">
          <div class="small text-muted">Total de respostas</div>
          <div class="fw-semibold">${payload.total}</div>
        </div>
        <div class="voting-meta-item">
          <div class="small text-muted">Tempo m�dio</div>
          <div class="fw-semibold">${msToTime(payload.avgDurationMs)}</div>
        </div>
      `;

      const questions = payload.questions || [];
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
        const rows = (q.options || []).map((opt) => `
          <div class="voting-option-row">
            <span>${opt.text || 'Op��o'}</span>
            <span class="voting-option-count">${counts[opt.id] || 0}</span>
          </div>
        `).join('');
        return `
          <div class="voting-question">
            <h6>${index + 1}. ${q.text || 'Pergunta'}</h6>
            <div class="vstack gap-2 mt-2">
              ${rows || '<div class="text-muted">Sem op��es cadastradas.</div>'}
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
        elAuthMsg.textContent = 'Senha inv�lida.';
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
            title: 'Confirmar exclus�o',
            message: 'Tem certeza que deseja excluir esta vota��o?',
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

    const themeMeta = themeId ? THEMES.find((t) => t.id === themeId) : null;
    if (titleInput && themeMeta) {
      titleInput.value = `${new Date().getFullYear()} - ${themeMeta.title}`;
    }

    const createId = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const updateNumbers = () => {
      const cards = Array.from(builder.querySelectorAll('.vote-question-card'));
      cards.forEach((card, idx) => {
        const badge = card.querySelector('.vote-q-number');
        if (badge) badge.textContent = `${idx + 1}.`;
      });
    };

    const createOptionEl = (option) => {
      const wrap = document.createElement('div');
      wrap.className = 'vote-option-input';
      wrap.dataset.oid = option.id;
      wrap.innerHTML = `
        <input type="text" class="form-control vote-option-text" placeholder="Op��o" value="${option.text || ''}" />
        <button type="button" class="btn btn-danger btn-sm vote-remove-option">Remover</button>
      `;
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
        <button type="button" class="btn btn-success btn-sm mt-3 vote-add-option">Adicionar op��o</button>
        <div class="form-check form-switch mt-3">
          <input class="form-check-input vote-multi-toggle" type="checkbox" ${question.allowMultiple ? 'checked' : ''}>
          <label class="form-check-label">Permitir v�rias respostas</label>
        </div>
        <div class="vote-multi-limits mt-2 ${question.allowMultiple ? '' : 'd-none'}">
          <div class="row g-2 align-items-end">
            <div class="col-12 col-md-6">
              <label class="form-label">Limite de respostas</label>
              <select class="form-select vote-limit-type">
                <option value="none">Sem limite</option>
                <option value="equal">Igual a</option>
                <option value="max">No m�ximo</option>
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
          titleInput.value = currentVote.title || '';
          if (saveBtn) saveBtn.textContent = 'Salvar';
          (currentVote.questions || []).forEach((q) => addQuestion(q.type || 'options'));
          const cards = Array.from(builder.querySelectorAll('.vote-question-card'));
          cards.forEach((card, idx) => {
            const q = currentVote.questions[idx];
            if (!q) return;
            card.dataset.qid = q.id;
            card.dataset.type = q.type || 'options';
            card.querySelector('.vote-question-text').value = q.text || '';
            if (q.type === 'options') {
              const optionsWrap = card.querySelector('.vote-options');
              optionsWrap.innerHTML = '';
              (q.options || []).forEach((opt) => optionsWrap.appendChild(createOptionEl(opt)));
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

      const removeOptionBtn = event.target.closest('.vote-remove-option');
      if (removeOptionBtn) {
        const optionRow = event.target.closest('.vote-option-input');
        const optionsWrap = event.target.closest('.vote-options');
        if (optionsWrap && optionsWrap.children.length <= 2) {
          await showUiModal({
            title: 'Aviso',
            message: 'Cada pergunta precisa ter pelo menos duas op��es.',
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
            message: '� necess�rio manter ao menos uma pergunta.',
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
        const options = optionEls.map((optEl) => ({
          id: optEl.dataset.oid || createId('o'),
          text: (optEl.querySelector('.vote-option-text')?.value || '').trim(),
        })).filter((opt) => opt.text);
        if (options.length < 2) {
          await showUiModal({
            title: 'Aviso',
            message: 'Cada pergunta precisa ter ao menos duas op��es preenchidas.',
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
        const stop = startLoading('Salvando vota��o...');
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
          await showUiModal({ title: 'Erro', message: 'Tema n�o encontrado.', variant: 'danger' });
          return;
        }
        const stop = startLoading('Gerando vota��o...');
        const res = await adminFetch('/api/votacao/admin/votacoes', {
          method: 'POST',
          body: JSON.stringify({ tema: themeId, questions }),
        });
        stop();
        if (!res.ok) {
          await showUiModal({ title: 'Erro', message: 'Erro ao criar vota��o.', variant: 'danger' });
          return;
        }
        currentVote = await res.json();
      }

      if (isEdit) {
        if (msg) {
          msg.textContent = 'Informa��es atualizadas com sucesso.';
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

  // ===== P�blico =====
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
    const deniedModalEl = document.getElementById('voteDeniedModal');
    const deniedBody = document.getElementById('voteDeniedBody');
    const unavailableModalEl = document.getElementById('voteUnavailableModal');

    if (!container || !loginForm || !moduleGrid) return;

    const deniedModal = deniedModalEl && window.bootstrap ? bootstrap.Modal.getOrCreateInstance(deniedModalEl) : null;
    const unavailableModal = unavailableModalEl && window.bootstrap ? bootstrap.Modal.getOrCreateInstance(unavailableModalEl) : null;

    let currentUser = null;
    let currentVote = null;
    let startedAt = 0;
    let pollTimer = null;

    const setUserMenu = (user) => {
      if (!userMenu || !userName) return;
      if (!user) {
        userMenu.classList.add('d-none');
        userName.textContent = '';
        return;
      }
      userName.textContent = user.nome || 'Usu�rio';
      userMenu.classList.remove('d-none');
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
                <div class="voting-theme-sub">${isDisabled ? 'Indispon�vel' : 'Ativo'}</div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    };

    const fetchThemes = async () => {
      const res = await apiFetch('/api/votacao/temas');
      if (!res.ok) return [];
      return res.json();
    };

    const startPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        const themes = await fetchThemes();
        renderModules(themes);
      }, 2000);
    };

    const showDenied = async (msg) => {
      await showUiModal({
        title: 'Aviso',
        message: msg || 'Desculpe! A��o n�o permitida.',
        variant: 'denied',
      });
    };

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const cpf = String(cpfInput?.value || '').replace(/\D/g, '');
      if (cpf.length !== 11) {
        loginMsg.classList.remove('d-none');
        loginMsg.textContent = 'CPF inv�lido. Verifique e tente novamente.';
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
        await showDenied('Desculpe! A��o n�o permitida');
        return;
      }
      loginMsg.classList.add('d-none');
      loginMsg.textContent = '';
      currentUser = data.user;
      sessionStorage.setItem(USER_KEY, JSON.stringify(currentUser));
      setUserMenu(currentUser);
      loginCard?.classList.add('d-none');
      modules?.classList.remove('d-none');
      startPolling();
      const themes = await fetchThemes();
      renderModules(themes);
    });

    moduleGrid.addEventListener('click', async (event) => {
      const card = event.target.closest('.voting-theme-card');
      if (!card || card.classList.contains('is-disabled')) {
        if (card) await showUiModal({ title: 'Aviso', message: 'Vota��o indispon�vel.', variant: 'warning' });
        return;
      }
      const themeId = card.dataset.theme;
      const stop = startLoading('Carregando question�rio...');
      const res = await apiFetch(`/api/votacao/temas/${encodeURIComponent(themeId)}/latest?cpf=${encodeURIComponent(currentUser?.cpf || '')}`);
      stop();
      if (!res.ok) return showUiModal({ title: 'Aviso', message: 'Vota��o indispon�vel.', variant: 'warning' });
      const data = await res.json();
      if (!data.active || !data.vote) return showUiModal({ title: 'Aviso', message: 'Vota��o indispon�vel.', variant: 'warning' });
      currentVote = data.vote;
      startedAt = Date.now();
      formWrap?.classList.remove('d-none');
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
        const isMulti = !!q.allowMultiple;
        const inputType = isMulti ? 'checkbox' : 'radio';
        const options = (q.options || []).map((opt) => `
          <div class="form-check">
            <input class="form-check-input" type="${inputType}" name="${q.id}" id="${q.id}_${opt.id}" value="${opt.id}">
            <label class="form-check-label" for="${q.id}_${opt.id}">${opt.text || 'Op��o'}</label>
          </div>
        `).join('');
        return `
          <div class="card vote-public-card p-3" data-qid="${q.id}" data-multi="${isMulti ? '1' : '0'}" data-limit-type="${q.limitType || 'none'}" data-limit-value="${q.limitValue || ''}">
            <div class="fw-semibold mb-2">${index + 1}. ${q.text || 'Pergunta'}</div>
            <div class="vstack gap-2">${options}</div>
          </div>
        `;
      }).join('');
      if (formTitle) formTitle.textContent = currentVote.title || 'Question�rio';
      if (Array.isArray(data.previousAnswers)) {
        data.previousAnswers.forEach((ans) => {
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
      }
    });

    backBtn?.addEventListener('click', () => {
      formWrap?.classList.add('d-none');
    });

    userLogout?.addEventListener('click', () => {
      sessionStorage.removeItem(USER_KEY);
      currentUser = null;
      currentVote = null;
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
          ? `Selecione exatamente ${limitValue} op��o(�es).`
          : `Selecione no m�ximo ${limitValue} op��o(�es).`;
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
            await showUiModal({ title: 'Aviso', message: `Selecione exatamente ${limitValue} op��o(�es).`, variant: 'warning' });
            return;
          }
          if (limitType === 'max' && selected.length > limitValue) {
            await showUiModal({ title: 'Aviso', message: `Selecione no m�ximo ${limitValue} op��o(�es).`, variant: 'warning' });
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
          await showUiModal({ title: 'Aviso', message: 'Vota��o indispon�vel.', variant: 'warning' });
          return;
        }
        await showDenied('Desculpe! A��o n�o permitida');
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
        fetchThemes().then(renderModules);
      }
    } catch {}
  };

  initAdminModule();
  initBuilderPage();
  initPublicPage();
})();


