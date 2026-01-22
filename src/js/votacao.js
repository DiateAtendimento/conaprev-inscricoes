// /src/js/votacao.js
(() => {
  const STORAGE_KEY = 'conaprev.votacoes.v1';
  const SESSION_KEY = 'votacao.admin.session';
  const ADMIN_PASS = window.VOTACAO_ADMIN_PASS || '1234';

  const loadVotes = () => {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  };

  const saveVotes = (votes) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(votes || []));
  };

  const createId = (prefix) => {
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${Date.now().toString(36)}_${rand}`;
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

  const buildVoteLink = (id) => `${location.origin}/votacao.html?id=${encodeURIComponent(id)}`;

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    }
  };

  const getVoteById = (id) => loadVotes().find((vote) => vote.id === id);

  const upsertVote = (vote) => {
    const votes = loadVotes();
    const idx = votes.findIndex((item) => item.id === vote.id);
    if (idx >= 0) votes[idx] = vote;
    else votes.unshift(vote);
    saveVotes(votes);
  };

  const deleteVote = (id) => {
    const votes = loadVotes().filter((vote) => vote.id !== id);
    saveVotes(votes);
  };

  const getSearchParam = (name) => new URLSearchParams(window.location.search).get(name);

  const initAdminModule = () => {
    const elButton = document.getElementById('liveVotingBtn');
    const elAuthModal = document.getElementById('votingAuthModal');
    const elAuthForm = document.getElementById('votingAuthForm');
    const elAuthPass = document.getElementById('votingAuthPass');
    const elAuthMsg = document.getElementById('votingAuthMsg');
    const elAdminModal = document.getElementById('votingAdminModal');
    const elCreateBtn = document.getElementById('votingCreateBtn');
    const elEmptyCreateBtn = document.getElementById('votingEmptyCreateBtn');
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

    const openCreateTab = (id) => {
      const url = id ? `/votacao-criar.html?edit=${encodeURIComponent(id)}` : '/votacao-criar.html';
      window.open(url, '_blank');
    };

    const renderList = () => {
      const votes = loadVotes().sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
      if (elEmptyState) elEmptyState.classList.toggle('d-none', votes.length > 0);
      if (!elList) return;
      elList.innerHTML = votes.map((vote) => {
        const responses = Array.isArray(vote.responses) ? vote.responses.length : 0;
        const questions = Array.isArray(vote.questions) ? vote.questions.length : 0;
        return `
          <div class="card voting-card" data-id="${vote.id}">
            <div class="card-body d-flex flex-wrap align-items-center gap-3">
              <div class="flex-grow-1">
                <div class="text-muted small">Votação</div>
                <div class="h5 mb-1">${vote.title || 'Sem título'}</div>
                <div class="small text-muted">Perguntas: ${questions} · Respostas: ${responses}</div>
              </div>
              <div class="btn-group btn-group-sm voting-actions" role="group" aria-label="Ações">
                <button type="button" class="btn btn-outline-secondary" data-action="edit">Editar</button>
                <button type="button" class="btn btn-outline-danger" data-action="delete">Excluir</button>
                <button type="button" class="btn btn-outline-primary" data-action="copy">Copiar link</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    };

    const renderResults = (vote) => {
      if (!vote || !elResultsMeta || !elResultsBody || !elResultsTitle) return;
      const responses = Array.isArray(vote.responses) ? vote.responses : [];
      const lastResponse = responses.length ? responses[responses.length - 1].submittedAt : null;

      elResultsTitle.textContent = vote.title || 'Visão geral das respostas';
      elResultsMeta.innerHTML = `
        <div class="voting-meta-item">
          <div class="small text-muted">Total de respostas</div>
          <div class="fw-semibold">${responses.length}</div>
        </div>
        <div class="voting-meta-item">
          <div class="small text-muted">Última resposta</div>
          <div class="fw-semibold">${formatDate(lastResponse)}</div>
        </div>
      `;

      if (!vote.questions || !vote.questions.length) {
        elResultsBody.innerHTML = '<div class="text-muted">Nenhuma pergunta cadastrada.</div>';
        return;
      }

      elResultsBody.innerHTML = vote.questions.map((question, index) => {
        const options = Array.isArray(question.options) ? question.options : [];
        const counts = {};
        let removedCount = 0;
        options.forEach((opt) => { counts[opt.id] = 0; });

        responses.forEach((resp) => {
          const answer = (resp.answers || []).find((a) => a.questionId === question.id);
          if (!answer) return;
          if (counts.hasOwnProperty(answer.optionId)) counts[answer.optionId] += 1;
          else removedCount += 1;
        });

        const optionRows = options.map((opt) => `
          <div class="voting-option-row">
            <span>${opt.text || 'Opção'}</span>
            <span class="voting-option-count">${counts[opt.id] || 0}</span>
          </div>
        `).join('');

        const removedRow = removedCount > 0
          ? `
            <div class="voting-option-row">
              <span>Opção removida</span>
              <span class="voting-option-count">${removedCount}</span>
            </div>
          `
          : '';

        return `
          <div class="voting-question">
            <h6>${index + 1}. ${question.text || 'Pergunta sem título'}</h6>
            <div class="vstack gap-2 mt-2">
              ${optionRows || '<div class="text-muted">Sem opções cadastradas.</div>'}
              ${removedRow}
            </div>
          </div>
        `;
      }).join('');
    };

    elButton.addEventListener('click', (event) => {
      event.preventDefault();
      if (localStorage.getItem(SESSION_KEY)) {
        renderList();
        adminModal?.show();
        return;
      }
      authModal?.show();
    });

    elAuthForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const pass = (elAuthPass?.value || '').trim();
      if (!pass) return;
      if (pass !== ADMIN_PASS) {
        elAuthMsg?.classList.remove('d-none');
        elAuthMsg.textContent = 'Senha inválida.';
        return;
      }
      localStorage.setItem(SESSION_KEY, 'ok');
      elAuthMsg?.classList.add('d-none');
      elAuthPass.value = '';
      authModal?.hide();
      renderList();
      adminModal?.show();
    });

    elCreateBtn?.addEventListener('click', () => openCreateTab());
    elEmptyCreateBtn?.addEventListener('click', () => openCreateTab());

    elAdminModal?.addEventListener('shown.bs.modal', () => {
      renderList();
    });

    elList?.addEventListener('click', async (event) => {
      const card = event.target.closest('.voting-card');
      if (!card) return;
      const voteId = card.dataset.id;
      const actionBtn = event.target.closest('[data-action]');
      if (!voteId) return;

      if (actionBtn) {
        const action = actionBtn.dataset.action;
        if (action === 'edit') {
          openCreateTab(voteId);
        }
        if (action === 'delete') {
          const ok = confirm('Tem certeza que deseja excluir esta votação?');
          if (ok) {
            deleteVote(voteId);
            renderList();
          }
        }
        if (action === 'copy') {
          const link = buildVoteLink(voteId);
          const copied = await copyText(link);
          actionBtn.textContent = copied ? 'Link copiado' : 'Copiar link';
          setTimeout(() => { actionBtn.textContent = 'Copiar link'; }, 1800);
        }
        return;
      }

      const vote = getVoteById(voteId);
      renderResults(vote);
      resultsModal?.show();
    });
  };

  const initBuilderPage = () => {
    const form = document.getElementById('voteCreateForm');
    const builder = document.getElementById('voteBuilder');
    const titleInput = document.getElementById('voteTitle');
    const addQuestionBtn = document.getElementById('voteAddQuestion');
    const saveBtn = document.getElementById('voteSaveBtn');
    const msg = document.getElementById('voteCreateMsg');
    const msgLink = document.getElementById('voteCreateLink');

    if (!form || !builder || !titleInput) return;

    const editId = getSearchParam('edit');
    let currentVote = editId ? getVoteById(editId) : null;

    const createOptionEl = (option) => {
      const wrap = document.createElement('div');
      wrap.className = 'vote-option-input';
      wrap.dataset.oid = option.id;
      wrap.innerHTML = `
        <input type="text" class="form-control vote-option-text" placeholder="Opção" value="${option.text || ''}" />
        <button type="button" class="btn btn-outline-secondary btn-sm vote-remove-option">Remover</button>
      `;
      return wrap;
    };

    const createQuestionEl = (question) => {
      const card = document.createElement('div');
      card.className = 'card vote-question-card';
      card.dataset.qid = question.id;
      card.innerHTML = `
        <div class="card-body">
          <div class="d-flex flex-wrap align-items-center gap-2">
            <label class="form-label mb-0">Pergunta</label>
            <input type="text" class="form-control flex-grow-1 vote-question-text" placeholder="Digite a pergunta" value="${question.text || ''}" />
            <button type="button" class="btn btn-outline-danger btn-sm vote-remove-question">Remover</button>
          </div>
          <div class="vote-options vstack gap-2 mt-3"></div>
          <button type="button" class="btn btn-outline-secondary btn-sm mt-3 vote-add-option">Adicionar opção</button>
        </div>
      `;
      const optionsWrap = card.querySelector('.vote-options');
      (question.options || []).forEach((opt) => {
        optionsWrap.appendChild(createOptionEl(opt));
      });
      return card;
    };

    const addQuestion = (question) => {
      const data = question || {
        id: createId('q'),
        text: '',
        options: [
          { id: createId('o'), text: '' },
          { id: createId('o'), text: '' },
        ],
      };
      builder.appendChild(createQuestionEl(data));
    };

    const hydrate = () => {
      builder.innerHTML = '';
      if (currentVote && currentVote.questions) {
        currentVote.questions.forEach((q) => addQuestion(q));
      } else {
        addQuestion();
      }
      if (saveBtn) saveBtn.textContent = currentVote ? 'Salvar' : 'Iniciar votação';
    };

    hydrate();

    addQuestionBtn?.addEventListener('click', () => addQuestion());

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
      }
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const title = titleInput.value.trim();
      if (!title) {
        alert('Informe um título para a votação.');
        return;
      }

      const questions = [];
      const questionEls = Array.from(builder.querySelectorAll('.vote-question-card'));
      for (const questionEl of questionEls) {
        const questionText = (questionEl.querySelector('.vote-question-text')?.value || '').trim();
        if (!questionText) {
          alert('Preencha todas as perguntas antes de salvar.');
          return;
        }
        const optionEls = Array.from(questionEl.querySelectorAll('.vote-option-input'));
        const options = optionEls.map((optEl) => ({
          id: optEl.dataset.oid || createId('o'),
          text: (optEl.querySelector('.vote-option-text')?.value || '').trim(),
        })).filter((opt) => opt.text);

        if (options.length < 2) {
          alert('Cada pergunta precisa ter pelo menos duas opções preenchidas.');
          return;
        }

        questions.push({
          id: questionEl.dataset.qid || createId('q'),
          text: questionText,
          options,
        });
      }

      const now = Date.now();
      if (currentVote) {
        currentVote = {
          ...currentVote,
          title,
          questions,
          updatedAt: now,
          responses: Array.isArray(currentVote.responses) ? currentVote.responses : [],
        };
        upsertVote(currentVote);
      } else {
        currentVote = {
          id: createId('vote'),
          title,
          questions,
          createdAt: now,
          updatedAt: now,
          responses: [],
        };
        upsertVote(currentVote);
      }

      if (msg) {
        msg.classList.remove('d-none');
        msg.textContent = currentVote && currentVote.updatedAt && currentVote.createdAt === currentVote.updatedAt
          ? 'Votação criada com sucesso.'
          : 'Alterações salvas com sucesso.';
      }
      if (msgLink) {
        msgLink.href = buildVoteLink(currentVote.id);
        msgLink.textContent = buildVoteLink(currentVote.id);
      }
      if (!editId && saveBtn) saveBtn.textContent = 'Salvar';
    });
  };

  const initPublicPage = () => {
    const container = document.getElementById('votePublicContainer');
    const title = document.getElementById('votePublicTitle');
    const questionsWrap = document.getElementById('votePublicQuestions');
    const form = document.getElementById('votePublicForm');
    const successMsg = document.getElementById('votePublicMsg');
    const errorMsg = document.getElementById('votePublicError');

    if (!container || !questionsWrap || !form) return;

    const id = getSearchParam('id');
    const vote = id ? getVoteById(id) : null;

    if (!vote) {
      if (errorMsg) errorMsg.classList.remove('d-none');
      form.classList.add('d-none');
      return;
    }

    if (title) title.textContent = vote.title || 'Votação Ao vivo';

    questionsWrap.innerHTML = vote.questions.map((question, index) => {
      const options = (question.options || []).map((opt) => `
        <div class="form-check">
          <input class="form-check-input" type="radio" name="${question.id}" id="${question.id}_${opt.id}" value="${opt.id}">
          <label class="form-check-label" for="${question.id}_${opt.id}">${opt.text || 'Opção'}</label>
        </div>
      `).join('');

      return `
        <div class="card vote-public-card p-3">
          <div class="fw-semibold mb-2">${index + 1}. ${question.text || 'Pergunta'}</div>
          <div class="vstack gap-2">${options}</div>
        </div>
      `;
    }).join('');

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const answers = [];
      for (const question of vote.questions) {
        const selected = form.querySelector(`input[name="${question.id}"]:checked`);
        if (!selected) {
          alert('Responda todas as perguntas antes de enviar.');
          return;
        }
        answers.push({ questionId: question.id, optionId: selected.value });
      }

      const votes = loadVotes();
      const idx = votes.findIndex((item) => item.id === vote.id);
      if (idx >= 0) {
        votes[idx].responses = Array.isArray(votes[idx].responses) ? votes[idx].responses : [];
        votes[idx].responses.push({
          id: createId('resp'),
          submittedAt: Date.now(),
          answers,
        });
        votes[idx].updatedAt = Date.now();
        saveVotes(votes);
      }

      form.classList.add('d-none');
      if (successMsg) successMsg.classList.remove('d-none');
    });
  };

  initAdminModule();
  initBuilderPage();
  initPublicPage();
})();
