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
    { id: 'comite-compensacao', name: 'COMITÊ DA COMPENSAÇÃO PREVIDENCIÁRIA', title: 'Comitê da compensação previdenciária', icon: 'bi-shield-check' },
    { id: 'certificacao-profissional', name: 'CERTIFICAÇÃO PROFISSIONAL', title: 'Certificação profissional', icon: 'bi-award' },
    { id: 'pro-gestao', name: 'PRÓ GESTÃO', title: 'Pró Gestão', icon: 'bi-patch-check' },
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

  // ===== Admin =====
  const initAdminModule = () => {
    const elButton = document.getElementById('liveVotingBtn');
    const elAuthModal = document.getElementById('votingAuthModal');
    const elAuthForm = document.getElementById('votingAuthForm');
    const elAuthPass = document.getElementById('votingAuthPass');
    const elAuthMsg = document.getElementById('votingAuthMsg');
    const elAdminModal = document.getElementById('votingAdminModal');
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
      const res = await adminFetch('/api/votacao/admin/temas');
      if (!res.ok) throw new Error('Falha ao carregar temas');
      return res.json();
    };

    const fetchVotes = async (themeId) => {
      const res = await adminFetch(`/api/votacao/admin/temas/${encodeURIComponent(themeId)}/votacoes`);
      if (!res.ok) throw new Error('Falha ao carregar votações');
      return res.json();
    };

    const renderList = (votes = []) => {
      if (!elList || !elEmptyState) return;
      elEmptyState.classList.toggle('d-none', votes.length > 0);
      elList.innerHTML = votes.map((vote) => {
        const status = vote.active ? 'Ativa' : 'Inativa';
        return `
          <div class="card voting-card" data-id="${vote.id}">
            <div class="card-body d-flex flex-wrap align-items-center gap-3">
              <div class="flex-grow-1">
                <div class="text-muted small">${status}</div>
                <div class="h6 mb-1">${vote.title || 'Sem título'}</div>
                <div class="small text-muted">Atualizada em ${formatDate(vote.updatedAt || vote.createdAt)}</div>
              </div>
              <div class="btn-group btn-group-sm voting-actions" role="group" aria-label="Ações">
                <button type="button" class="btn btn-outline-secondary" data-action="edit">Editar</button>
                <button type="button" class="btn btn-outline-danger" data-action="delete">Excluir</button>
                <button type="button" class="btn btn-outline-primary" data-action="results"><i class="bi bi-eye"></i></button>
                <button type="button" class="btn btn-outline-success" data-action="toggle" data-active="${vote.active ? '1' : '0'}">${vote.active ? 'Desativar' : 'Ativar'}</button>
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
            <span>${opt.text || 'Opção'}</span>
            <span class="voting-option-count">${counts[opt.id] || 0}</span>
          </div>
        `).join('');
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

    elCreateBtn?.addEventListener('click', () => {
      if (!selectedTheme) return alert('Selecione um tema.');
      openCreateTab(selectedTheme.id);
    });
    elEmptyCreateBtn?.addEventListener('click', () => {
      if (!selectedTheme) return alert('Selecione um tema.');
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
          const ok = confirm('Tem certeza que deseja excluir esta votação?');
          if (ok) {
            await adminFetch(`/api/votacao/admin/votacoes/${encodeURIComponent(voteId)}`, { method: 'DELETE' });
            const votes = await fetchVotes(selectedTheme?.id || '');
            renderList(votes);
          }
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
      }
    });
  };

  // ===== Builder =====
  const initBuilderPage = () => {
    const form = document.getElementById('voteCreateForm');
    const builder = document.getElementById('voteBuilder');
    const titleInput = document.getElementById('voteTitle');
    const addQuestionBtn = document.getElementById('voteAddQuestion');
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
        <input type="text" class="form-control vote-option-text" placeholder="Opção" value="${option.text || ''}" />
        <button type="button" class="btn btn-outline-secondary btn-sm vote-remove-option" aria-label="Remover opção">
          <i class="bi bi-x"></i>
        </button>
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
        <button type="button" class="btn btn-outline-secondary btn-sm mt-3 vote-add-option">Adicionar opção</button>
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
          <div class="d-flex flex-wrap align-items-center gap-2">
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

    builder.addEventListener('click', (event) => {
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
          alert('Cada pergunta precisa ter pelo menos duas opções.');
          return;
        }
        optionRow?.remove();
      }

      const removeQuestionBtn = event.target.closest('.vote-remove-question');
      if (removeQuestionBtn) {
        if (builder.children.length <= 1) {
          alert('É necessário manter ao menos uma pergunta.');
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
        if (!qText) return alert('Preencha todas as perguntas.');

        if (qType === 'text') {
          questions.push({ id: card.dataset.qid || createId('q'), type: 'text', text: qText });
          continue;
        }

        const optionEls = Array.from(card.querySelectorAll('.vote-option-input'));
        const options = optionEls.map((optEl) => ({
          id: optEl.dataset.oid || createId('o'),
          text: (optEl.querySelector('.vote-option-text')?.value || '').trim(),
        })).filter((opt) => opt.text);
        if (options.length < 2) return alert('Cada pergunta precisa ter ao menos duas opções preenchidas.');

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
        const res = await adminFetch(`/api/votacao/admin/votacoes/${encodeURIComponent(currentVote.id)}`, {
          method: 'PUT',
          body: JSON.stringify({ questions }),
        });
        if (!res.ok) return alert('Erro ao salvar.');
      } else {
        if (!themeId) return alert('Tema não encontrado.');
        const res = await adminFetch('/api/votacao/admin/votacoes', {
          method: 'POST',
          body: JSON.stringify({ tema: themeId, questions }),
        });
        if (!res.ok) return alert('Erro ao criar votação.');
        currentVote = await res.json();
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

    const showDenied = (msg) => {
      if (deniedBody) deniedBody.textContent = msg || 'Desculpe! Ação não permitida.';
      deniedModal?.show();
    };

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const cpf = String(cpfInput?.value || '').replace(/\D/g, '');
      if (cpf.length !== 11) {
        loginMsg.classList.remove('d-none');
        loginMsg.textContent = 'CPF inválido.';
        return;
      }
      const res = await apiFetch('/api/votacao/login', {
        method: 'POST',
        body: JSON.stringify({ cpf }),
      });
      const data = await res.json();
      if (!data.ok) {
        showDenied('Desculpe! Ação não permitida');
        return;
      }
      currentUser = data.user;
      sessionStorage.setItem(USER_KEY, JSON.stringify(currentUser));
      loginCard?.classList.add('d-none');
      modules?.classList.remove('d-none');
      startPolling();
      const themes = await fetchThemes();
      renderModules(themes);
    });

    moduleGrid.addEventListener('click', async (event) => {
      const card = event.target.closest('.voting-theme-card');
      if (!card || card.classList.contains('is-disabled')) {
        if (card) unavailableModal?.show();
        return;
      }
      const themeId = card.dataset.theme;
      const res = await apiFetch(`/api/votacao/temas/${encodeURIComponent(themeId)}/latest`);
      if (!res.ok) return unavailableModal?.show();
      const data = await res.json();
      if (!data.active || !data.vote) return unavailableModal?.show();
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
            <label class="form-check-label" for="${q.id}_${opt.id}">${opt.text || 'Opção'}</label>
          </div>
        `).join('');
        return `
          <div class="card vote-public-card p-3" data-qid="${q.id}" data-multi="${isMulti ? '1' : '0'}" data-limit-type="${q.limitType || 'none'}" data-limit-value="${q.limitValue || ''}">
            <div class="fw-semibold mb-2">${index + 1}. ${q.text || 'Pergunta'}</div>
            <div class="vstack gap-2">${options}</div>
          </div>
        `;
      }).join('');
      if (formTitle) formTitle.textContent = currentVote.title || 'Questionário';
    });

    backBtn?.addEventListener('click', () => {
      formWrap?.classList.add('d-none');
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
          if (!val) return alert('Responda todas as perguntas.');
          answers.push({ questionId: qid, type: 'text', value: val });
          continue;
        }

        const selected = Array.from(card.querySelectorAll('input:checked')).map((el) => el.value);
        if (!selected.length) return alert('Responda todas as perguntas.');

        if (isMulti && limitType !== 'none' && limitValue > 0) {
          if (limitType === 'equal' && selected.length !== limitValue) {
            return alert(`Selecione exatamente ${limitValue} opção(ões).`);
          }
          if (limitType === 'max' && selected.length > limitValue) {
            return alert(`Selecione no máximo ${limitValue} opção(ões).`);
          }
        }

        answers.push({ questionId: qid, type: 'options', optionIds: selected });
      }

      const res = await apiFetch('/api/votacao/votar', {
        method: 'POST',
        body: JSON.stringify({
          voteId: currentVote.id,
          cpf: currentUser.cpf,
          answers,
          durationMs: Date.now() - startedAt,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (String(err.error || '').includes('VOTACAO_INDISPONIVEL')) return unavailableModal?.show();
        return showDenied('Desculpe! Ação não permitida');
      }

      const data = await res.json();
      formWrap?.classList.add('d-none');
      successMsg.textContent = `${data.nome || currentUser.nome}, seu voto foi enviado com sucesso!`;
      successMsg?.classList.remove('d-none');
    });

    try {
      const cached = JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
      if (cached?.cpf) {
        currentUser = cached;
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
