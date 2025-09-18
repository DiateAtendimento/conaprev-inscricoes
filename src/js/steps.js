/* steps.js — fluxo de inscrição multi-perfil + backend real */

(() => {
  // ====== CONFIGURAR AQUI SUAS ROTAS REAIS ======
  const ROUTES = window.APP_ROUTES ?? {
    base: '/backend',
    lookupCpf: (cpf) => `/backend/pessoas?cpf=${encodeURIComponent(cpf)}`,
    createInscricao: `/backend/inscricoes`,
    resendEmail: (id) => `/backend/inscricoes/${id}/reenviar-email`,
    comprovantePdf: (id) => `/backend/inscricoes/${id}/comprovante.pdf`,
  };

  const defaultHeaders = { 'Content-Type': 'application/json' };

  // ====== Estado do fluxo ======
  const modalEl = document.getElementById('modalInscricao');
  if (!modalEl) {
    console.error('Faltou o HTML do modal #modalInscricao no index.html');
    return;
  }
  const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });

  const STEP_MIN = 1, STEP_MAX = 6;
  let state = {
    perfil: null,
    step: 1,
    data: {},
    idInscricao: null,
    protocolo: null,
    pdfUrl: null,
  };

  // Campos específicos (passo 3) por perfil
  const perfilSchemas = {
    Conselheiro: [
      { name: 'representa', label: 'Representa Conselho de', type: 'select', required: true,
        options: ['Estadual','Municipal','Outro'] },
      { name: 'portaria', label: 'Portaria/Delegação (link ou nº)', type: 'text' },
      { name: 'obs', label: 'Observações ao organizador', type: 'textarea' },
    ],
    CNRPPS: [
      { name: 'confirmCnrpps', label: 'Sou membro da CNRPPS', type: 'checkbox', required: true },
      { name: 'eixo', label: 'Eixo/Comissão', type: 'text' },
    ],
    Palestrante: [
      { name: 'instituicao', label: 'Instituição', type: 'text', required: true },
      { name: 'tema', label: 'Tema/Eixo', type: 'text', required: true },
      { name: 'titulo', label: 'Título da palestra', type: 'text', required: true },
      { name: 'linkMaterial', label: 'Link do material (Drive/OneDrive)', type: 'url' },
      { name: 'necessidades', label: 'Necessidades técnicas', type: 'textarea' },
    ],
    COPAJURE: [
      { name: 'equipe', label: 'Equipe/Função', type: 'select', required: true,
        options: ['Jurídico','Credenciamento','Logística','TI','Sala','Palco','Comunicação'] },
      { name: 'turnos', label: 'Dias/turnos (descreva)', type: 'textarea' },
      { name: 'tamanho', label: 'Tamanho da camiseta/crachá', type: 'select',
        options: ['PP','P','M','G','GG','XG'] },
    ],
    Staff: [
      { name: 'area', label: 'Área de apoio', type: 'select', required: true,
        options: ['Credenciamento','Sala','Palco','TI','Comunicação','Logística'] },
      { name: 'disponibilidade', label: 'Disponibilidade (dias/turnos)', type: 'textarea', required: true },
      { name: 'tamanho', label: 'Tamanho da camiseta/crachá', type: 'select',
        options: ['PP','P','M','G','GG','XG'] },
    ],
  };

  // ====== Helpers DOM/UX ======
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
            <div class="spinner-border text-light" role="status"></div>
          </div>`;
        document.body.appendChild(mask);
      }
    } else {
      mask?.remove();
    }
  }

  // ====== Navegação de passos ======
  function renderStep() {
    $('#miStepLabel').textContent = `Passo ${state.step} de ${STEP_MAX}`;
    $all('.mi-stepper .mi-step').forEach(s => {
      const n = Number(s.dataset.step);
      s.classList.toggle('is-active', n === state.step);
      s.classList.toggle('is-done', n < state.step);
    });
    $all('.mi-pane').forEach(p => p.classList.toggle('active', Number(p.dataset.step) === state.step));
    $('#miBtnVoltar').disabled = state.step === STEP_MIN;
    $('#miBtnAvancar').textContent = state.step < STEP_MAX ? 'Avançar' : 'Concluir';
  }

  function renderPerfilFields(perfil) {
    const box = $('#miPerfilContainer');
    box.innerHTML = '';
    (perfilSchemas[perfil] || []).forEach(f => {
      const col = document.createElement('div');
      col.className = 'col-12 col-md-6';
      const id = `mi_${f.name}`;
      let control = '';
      if (f.type === 'select') {
        const opts = (f.options||[]).map(o => `<option value="${o}">${o}</option>`).join('');
        control = `<select id="${id}" name="${f.name}" class="form-select" ${f.required?'required':''}>
                     <option value="">—</option>${opts}
                   </select>`;
      } else if (f.type === 'textarea') {
        control = `<textarea id="${id}" name="${f.name}" rows="3" class="form-control" ${f.required?'required':''}></textarea>`;
      } else if (f.type === 'checkbox') {
        control = `<div class="form-check mt-2">
            <input class="form-check-input" type="checkbox" id="${id}" name="${f.name}" ${f.required?'required':''}>
            <label class="form-check-label" for="${id}">${f.label}</label>
          </div>`;
      } else {
        control = `<input id="${id}" name="${f.name}" type="${f.type||'text'}" class="form-control" ${f.required?'required':''}>`;
      }
      col.innerHTML = (f.type === 'checkbox')
        ? control
        : `<label class="form-label" for="${id}">${f.label}${f.required?' *':''}</label>${control}
           ${f.required?'<div class="invalid-feedback">Campo obrigatório.</div>':''}`;
      box.appendChild(col);
    });
  }

  function readForm() {
    const form = $('#miForm');
    const data = new FormData(form);
    const obj = {};
    data.forEach((v,k) => {
      if (obj[k] !== undefined) {
        obj[k] = Array.isArray(obj[k]) ? [...obj[k], v] : [obj[k], v];
      } else {
        obj[k] = v;
      }
    });
    // checkboxes do passo 3
    (perfilSchemas[state.perfil]||[])
      .filter(f => f.type === 'checkbox')
      .forEach(f => obj[f.name] = $('#mi_'+f.name)?.checked || false);
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

  // ====== Rascunho local (sempre CPF LIMPO) ======
  function cpfDigits(str) {
    return String(str || '').replace(/\D/g, '');
  }
  function draftKey(cpf = $('#miCpf').value) {
    const keyCpf = cpfDigits(cpf);
    return `inscricao:${state.perfil}:${keyCpf}`;
  }
  function saveDraft() {
    const d = readForm();
    state.data = { ...state.data, ...d };
    localStorage.setItem(draftKey(), JSON.stringify(state.data));
  }
  function loadDraft(cpf) {
    const key = draftKey(cpf);
    const raw = localStorage.getItem(key);
    if (!raw) return;
    state.data = JSON.parse(raw);
    Object.entries(state.data).forEach(([k,v]) => {
      const el = document.querySelector(`[name="${k}"]`);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!v;
      else if (Array.isArray(v)) el.value = v[0];
      else el.value = v;
    });
  }

  function renderReview() {
    const d = { ...state.data, ...readForm() };
    const lines = Object.entries(d)
      .filter(([k,v]) => String(v).trim() !== '')
      .map(([k,v]) => `<div class="d-flex">
        <div class="me-2 text-secondary text-capitalize" style="min-width:180px">${k}</div>
        <div class="fw-semibold flex-grow-1">${Array.isArray(v)?v.join(', '):v}</div>
      </div>`);
    $('#miReview').innerHTML = lines.join('');
  }

  // ====== Integrações com backend ======
  async function apiLookupCpf(cpf) {
    blockUI(true);
    try {
      const res = await fetch(ROUTES.lookupCpf(cpf), { headers: defaultHeaders, method: 'GET' });
      if (!res.ok) throw new Error('Falha ao consultar CPF');
      const data = await res.json();
      return data || null;
    } finally {
      blockUI(false);
    }
  }

  async function apiCreateInscricao(payload) {
    blockUI(true);
    try {
      const res = await fetch(ROUTES.createInscricao, {
        method: 'POST',
        headers: defaultHeaders,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err?.message || `Erro ${res.status}`);
      }
      return await res.json();
    } finally {
      blockUI(false);
    }
  }

  async function apiReenviarEmail(id) {
    blockUI(true);
    try {
      const res = await fetch(ROUTES.resendEmail(id), {
        method: 'POST',
        headers: defaultHeaders
      });
      if (!res.ok) throw new Error('Não foi possível reenviar o e-mail.');
      return true;
    } finally {
      blockUI(false);
    }
  }

  async function safeJson(res) {
    try { return await res.json(); } catch { return null; }
  }

  // ====== Eventos de UI ======
  $('#miBtnAvancar').addEventListener('click', async () => {
    if (!validateStep()) return;

    saveDraft();

    if (state.step === 4) renderReview();

    // Passo 5 => envia
    if (state.step === 5) {
      try {
        const payload = {
          perfil: state.perfil,
          ...state.data,
          ...readForm(),
        };
        const resp = await apiCreateInscricao(payload);
        state.idInscricao = resp.id;
        state.protocolo  = resp.protocolo;
        state.pdfUrl     = resp.pdfUrl || (resp.id ? ROUTES.comprovantePdf(resp.id) : null);

        $('#miProtocolo').textContent = state.protocolo || '—';
        if (state.pdfUrl) $('#miBtnBaixar').href = state.pdfUrl;
        else $('#miBtnBaixar').classList.add('disabled');

        // Só atualiza status se existir no DOM
        const miStatus = document.getElementById('miStatus');
        if (miStatus) miStatus.textContent = 'Inscrição confirmada';

        showToast('Inscrição registrada com sucesso!', 'success');

        state.step = 6;
        renderStep();
        return;
      } catch (e) {
        console.error(e);
        showToast(e.message || 'Erro ao concluir a inscrição', 'danger');
        return;
      }
    }

    if (state.step < STEP_MAX) {
      state.step++;
      renderStep();
    }
  });

  $('#miBtnVoltar').addEventListener('click', () => {
    if (state.step > STEP_MIN) {
      state.step--;
      renderStep();
    }
  });

  $('#miBtnReenviar').addEventListener('click', async () => {
    if (!state.idInscricao) return;
    try {
      await apiReenviarEmail(state.idInscricao);
      showToast('E-mail reenviado!', 'success');
    } catch (e) {
      showToast(e.message || 'Falha ao reenviar e-mail', 'danger');
    }
  });

  // Busca CPF (debounced)
  let cpfTimer;
  $('#miCpf').addEventListener('input', (e) => {
    const v = e.target.value;
    clearTimeout(cpfTimer);
    cpfTimer = setTimeout(async () => {
      const clean = v.replace(/\D/g, '');
      if (clean.length !== 11) return;
      try {
        const found = await apiLookupCpf(clean);
        if (found) {
          const map = {
            nome: 'miNome', email: 'miEmail', cel: 'miCel',
            uf: 'miUf', orgao: 'miOrgao', vinculo: 'miVinculo'
          };
          Object.entries(map).forEach(([k,id]) => {
            if (found[k] && document.getElementById(id)) {
              document.getElementById(id).value = found[k];
            }
          });
          // carrega rascunho local com CPF LIMPO
          loadDraft(clean);
          showToast('Dados pré-carregados pelo CPF.', 'info');
        }
      } catch {
        // silencioso (CPF não encontrado, segue preenchendo)
      }
    }, 500);
  }, { passive: true });

  // Abrir modal a partir dos cards
  $all('.select-profile').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.profile-card');
      const perfil = card?.dataset.profile || 'Conselheiro';
      state = { perfil, step: 1, data: {}, idInscricao: null, protocolo: null, pdfUrl: null };

      document.getElementById('miPerfil').textContent = perfil;
      renderPerfilFields(perfil);

      // reset visual/validações
      document.getElementById('miForm').reset();
      $all('#miForm .was-validated').forEach(el => el.classList.remove('was-validated'));

      renderStep();
      modal.show();
    });
  });

})();
