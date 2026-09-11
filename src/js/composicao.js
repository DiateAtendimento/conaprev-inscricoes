(() => {
  'use strict';

  const FALLBACK_PHOTO = '/imagens/fotos-conselheiros/padrao.svg';
  const PHOTO_DIR = '/imagens/fotos-conselheiros';
  const CATEGORY_TITLES = {
    diretoriaExecutiva: 'Diretoria Executiva',
    estados: 'Representantes por Estado',
    associacoes: 'Associações',
    conselhosConfederacoesForuns: 'Conselhos, Confederações e Fóruns',
    entidadesFechadas: 'Entidades Fechadas de Previdência Complementar',
    uniao: 'União'
  };

  const els = {
    detail: document.getElementById('compositionDetail'),
    detailTitle: document.getElementById('compositionDetailTitle'),
    detailClose: document.getElementById('compositionDetailClose'),
    generic: document.getElementById('compositionGenericContent'),
    states: document.getElementById('compositionStatesContent'),
    map: document.getElementById('compositionMap'),
    select: document.getElementById('compositionStateSelect'),
    statePanel: document.getElementById('compositionStatePanel'),
    dialog: document.getElementById('compositionDialog'),
    dialogClose: document.getElementById('compositionDialogClose'),
    dialogPhoto: document.getElementById('compositionDialogPhoto'),
    dialogType: document.getElementById('compositionDialogType'),
    dialogName: document.getElementById('compositionDialogName'),
    dialogEntity: document.getElementById('compositionDialogEntity'),
    dialogRole: document.getElementById('compositionDialogRole'),
    dialogBiography: document.getElementById('compositionDialogBiography')
  };

  let composition = null;
  let biographies = new Map();
  let photos = new Map();
  let selectedUf = '';
  let lastProfileTrigger = null;

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  const normalize = (value) => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim().replace(/\s+/g, ' ').toLowerCase();

  function findByFlexibleName(map, name) {
    const key = normalize(name);
    if (map.has(key)) return map.get(key);
    const tokens = key.split(' ').filter(token => token.length > 2);
    let best = null;
    let score = 0;
    map.forEach((value, candidate) => {
      const candidateTokens = candidate.split(' ').filter(token => token.length > 2);
      const matches = candidateTokens.filter(token => tokens.includes(token)).length;
      const ratio = matches / Math.max(tokens.length, candidateTokens.length, 1);
      if (matches >= 2 && ratio > score) { score = ratio; best = value; }
    });
    return best;
  }

  function photoFor(name) {
    const key = normalize(name);
    const exact = photos.get(key);
    const candidates = exact ? [] : [...photos.entries()].filter(([photoKey]) => (
      photoKey.startsWith(`${key} `) || key.startsWith(`${photoKey} `)
    ));
    const file = exact || (candidates.length === 1 ? candidates[0][1] : null);
    return file ? `${PHOTO_DIR}/${encodeURIComponent(file)}` : FALLBACK_PHOTO;
  }

  function bioFor(name) {
    return findByFlexibleName(biographies, name) || null;
  }

  function personCard(person, context = '') {
    if (!person?.nome) return '<div class="composition-person composition-person--empty"><i class="bi bi-person-dash"></i><div><span>Vaga</span><strong>Representante não informado</strong></div></div>';
    const bio = bioFor(person.nome);
    const entity = person.representatividade || person.instituicao || context || '';
    return `<article class="composition-person">
      <img src="${photoFor(person.nome)}" alt="Foto de ${escapeHtml(person.nome)}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_PHOTO}'">
      <div class="composition-person__copy"><span>${escapeHtml(person.tipo || 'Representante')}</span><h4>${escapeHtml(person.nome)}</h4>${entity ? `<p>${escapeHtml(entity)}</p>` : ''}${bio ? `<button type="button" class="composition-profile-link" data-profile-name="${escapeHtml(person.nome)}">Ver perfil <i class="bi bi-arrow-up-right"></i></button>` : ''}</div>
    </article>`;
  }

  function municipalityFlagFor(localidade) {
    const slug = normalize(localidade).replace(/\s+/g, '-');
    return slug ? `/imagens/fotos-bandeiras-municipios/${slug}.jpg` : '';
  }

  function pairCard(item) {
    const institution = item.instituicao || item.localidade || 'Representação';
    const visual = item.logo || (item.localidade ? municipalityFlagFor(item.localidade) : '');
    const visualLabel = item.localidade ? `Bandeira de ${institution}` : `Logo ${institution}`;
    const logo = visual ? `<img class="composition-institution__logo" src="${escapeHtml(visual)}" alt="${escapeHtml(visualLabel)}" loading="lazy">` : `<span class="composition-institution__monogram" aria-hidden="true">${escapeHtml(institution.slice(0, 3))}</span>`;
    return `<article class="composition-institution"><header>${logo}<div><span>Instituição</span><h3>${escapeHtml(institution)}</h3>${item.representatividade ? `<p>${escapeHtml(item.representatividade)}</p>` : ''}</div></header><div class="composition-institution__people">${personCard(item.titular, institution)}${personCard(item.suplente, institution)}</div></article>`;
  }

  function bindProfileButtons(root) {
    root.querySelectorAll('[data-profile-name]').forEach(button => {
      button.addEventListener('click', () => openProfile(button.dataset.profileName, button));
    });
  }

  function renderPeople(people) {
    els.generic.innerHTML = `<div class="composition-people-grid">${(people || []).map(person => personCard(person)).join('')}</div>`;
    bindProfileButtons(els.generic);
  }

  function renderInstitutions(items) {
    els.generic.innerHTML = `<div class="composition-institution-grid">${(items || []).map(pairCard).join('')}</div>`;
    bindProfileButtons(els.generic);
  }

  function renderAssociations() {
    els.generic.innerHTML = `<div class="composition-subnav" role="tablist" aria-label="Tipos de associação"><button type="button" class="active" data-association="nacionais" role="tab" aria-selected="true"><i class="bi bi-globe-americas"></i><span><strong>Associações nacionais</strong><small>Representações de alcance nacional</small></span></button><button type="button" data-association="municipais" role="tab" aria-selected="false"><i class="bi bi-buildings"></i><span><strong>Associações municipais</strong><small>Representações estaduais e municipais</small></span></button></div><div id="compositionAssociationGrid"></div>`;
    const grid = document.getElementById('compositionAssociationGrid');
    const show = (key) => {
      grid.innerHTML = `<div class="composition-institution-grid">${composition.associacoes[key].map(pairCard).join('')}</div>`;
      bindProfileButtons(grid);
      els.generic.querySelectorAll('[data-association]').forEach(button => {
        const active = button.dataset.association === key;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
      });
    };
    els.generic.querySelectorAll('[data-association]').forEach(button => button.addEventListener('click', () => show(button.dataset.association)));
    show('nacionais');
  }

  async function ensureMap() {
    if (els.map.querySelector('svg')) return;
    try {
      const response = await fetch('/imagens/mapa-brasil.svg', { cache: 'force-cache' });
      if (!response.ok) throw new Error('Mapa indisponível');
      els.map.innerHTML = await response.text();
      els.map.querySelectorAll('.map-state').forEach(state => {
        state.setAttribute('aria-pressed', 'false');
        state.addEventListener('click', () => selectState(state.dataset.uf));
        state.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectState(state.dataset.uf);
          }
        });
      });
    } catch (error) {
      els.map.innerHTML = '<div class="composition-empty-state"><i class="bi bi-exclamation-circle"></i><h3>Mapa temporariamente indisponível</h3><p>Use a lista de estados para continuar.</p></div>';
    }
  }

  function stateGroup(title, items, emptyLabel) {
    const content = items.length ? items.map(pairCard).join('') : `<div class="composition-state-vacancy"><i class="bi bi-person-dash"></i>${escapeHtml(emptyLabel)}</div>`;
    return `<section class="composition-state-group"><h4>${escapeHtml(title)}</h4><div class="composition-state-group__content">${content}</div></section>`;
  }

  function renderState(uf) {
    const state = composition.estados[uf];
    if (!state) return;
    const estadual = [{ instituicao: `Estado de ${state.nome}`, titular: state.estadual?.titular, suplente: state.estadual?.suplente }];
    els.statePanel.innerHTML = `<header class="composition-state-header"><img src="${escapeHtml(state.bandeira)}" alt="Bandeira de ${escapeHtml(state.nome)}"><div><span>${escapeHtml(uf)}</span><h3>${escapeHtml(state.nome)}</h3><p>Região ${escapeHtml(state.regiao)}</p></div></header>
      ${stateGroup('Conselheiros estaduais', estadual, 'Representação estadual não informada')}
      ${stateGroup('Conselheiros municipais', state.municipal || [], 'Representação municipal não informada')}
      ${stateGroup('Conselheiros regionais', state.regional || [], 'Representação regional não informada')}`;
    bindProfileButtons(els.statePanel);
  }

  function selectState(uf) {
    if (!composition?.estados?.[uf]) return;
    selectedUf = uf;
    els.select.value = uf;
    els.map.querySelectorAll('.map-state').forEach(state => {
      const active = state.dataset.uf === uf;
      state.classList.toggle('is-selected', active);
      state.setAttribute('aria-pressed', String(active));
    });
    renderState(uf);
  }

  async function renderStates() {
    els.select.innerHTML = '<option value="">Escolha uma UF</option>' + Object.entries(composition.estados)
      .sort((a, b) => a[1].nome.localeCompare(b[1].nome, 'pt-BR'))
      .map(([uf, state]) => `<option value="${uf}">${escapeHtml(state.nome)} (${uf})</option>`).join('');
    await ensureMap();
    if (selectedUf) selectState(selectedUf);
  }

  async function openSection(key) {
    els.detail.hidden = false;
    els.detailTitle.textContent = CATEGORY_TITLES[key] || 'Composição';
    els.generic.hidden = key === 'estados';
    els.states.hidden = key !== 'estados';
    document.querySelectorAll('[data-section]').forEach(button => button.classList.toggle('active', button.dataset.section === key));
    if (key === 'diretoriaExecutiva') renderPeople(composition.diretoriaExecutiva);
    if (key === 'associacoes') renderAssociations();
    if (key === 'conselhosConfederacoesForuns') renderInstitutions(composition.conselhosConfederacoesForuns);
    if (key === 'entidadesFechadas') renderInstitutions(composition.entidadesFechadas);
    if (key === 'uniao') renderInstitutions(composition.uniao);
    if (key === 'estados') await renderStates();
    els.detail.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  function openProfile(name, trigger) {
    const bio = bioFor(name);
    if (!bio) return;
    lastProfileTrigger = trigger;
    els.dialogPhoto.src = photoFor(name);
    els.dialogPhoto.alt = `Foto de ${name}`;
    els.dialogType.textContent = 'Representante';
    els.dialogName.textContent = name;
    els.dialogEntity.textContent = bio.role || 'CONAPREV';
    els.dialogRole.textContent = bio.role || 'Atuação institucional no CONAPREV.';
    els.dialogBiography.textContent = bio.biography || 'Currículo não informado.';
    els.dialog.showModal();
    els.dialogClose.focus();
  }

  function closeProfile() {
    els.dialog.close();
    lastProfileTrigger?.focus();
  }

  async function init() {
    try {
      const [compositionResponse, biographyResponse, manifestResponse] = await Promise.all([
        fetch('/data/composicao.json', { cache: 'no-cache' }),
        fetch('/data/quem-e-quem.json', { cache: 'no-cache' }),
        fetch('/imagens/fotos-conselheiros/manifest.json', { cache: 'force-cache' })
      ]);
      if (!compositionResponse.ok) throw new Error('Não foi possível carregar a composição.');
      composition = await compositionResponse.json();
      const biographyData = biographyResponse.ok ? await biographyResponse.json() : {};
      const biographyList = Array.isArray(biographyData) ? biographyData : (biographyData.people || biographyData.pessoas || biographyData.participants || []);
      biographyList.forEach(person => biographies.set(normalize(person.name || person.nome), person));
      const manifest = manifestResponse.ok ? await manifestResponse.json() : [];
      (Array.isArray(manifest) ? manifest : []).forEach(file => photos.set(normalize(file), file));
      document.querySelectorAll('[data-section]').forEach(button => button.addEventListener('click', () => openSection(button.dataset.section)));
      els.select.addEventListener('change', () => { if (els.select.value) selectState(els.select.value); });
      els.detailClose.addEventListener('click', () => {
        els.detail.hidden = true;
        document.querySelectorAll('[data-section]').forEach(button => button.classList.remove('active'));
      });
      els.dialogClose.addEventListener('click', closeProfile);
      els.dialog.addEventListener('click', event => { if (event.target === els.dialog) closeProfile(); });
      els.dialog.addEventListener('cancel', event => { event.preventDefault(); closeProfile(); });
    } catch (error) {
      document.querySelector('.composition-category-grid').insertAdjacentHTML('afterend', `<div class="composition-load-error" role="alert"><i class="bi bi-exclamation-triangle"></i>${escapeHtml(error.message)}</div>`);
    }
  }

  init();
})();
