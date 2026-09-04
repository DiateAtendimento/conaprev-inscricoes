(() => {
  'use strict';

  const PROFILE_NAMES = ['Conselheiro', 'CNRPPS', 'Palestrante', 'COPAJURE', 'Staff'];
  const PROFILE_LABELS = {
    Conselheiro: 'Conselheiros',
    CNRPPS: 'CNRPPS',
    Palestrante: 'Palestrantes',
    COPAJURE: 'COPAJURE',
    Staff: 'Staff',
  };
  const PHOTO_SOURCES = [
    { manifest: '/imagens/fotos-conselheiros/manifest.json', directory: '/imagens/fotos-conselheiros' },
    { manifest: '/imagens/fotos-palestrantes/manifest.json', directory: '/imagens/fotos-palestrantes' },
    { manifest: '/imagens/fotos-staff/manifest.json', directory: '/imagens/fotos-staff' },
  ];
  const DEFAULT_PHOTO = '/imagens/fotos-conselheiros/padrao.svg';
  const API_BASE = (window.API_BASE && String(window.API_BASE).trim())
    || ((location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3000'
      : 'https://conaprev-inscricoes.onrender.com');

  const grid = document.getElementById('peopleGrid');
  const status = document.getElementById('peopleStatus');
  const count = document.getElementById('peopleCount');
  const search = document.getElementById('peopleSearch');
  const profile = document.getElementById('peopleProfile');
  const dialog = document.getElementById('peopleDialog');
  const closeDialog = document.getElementById('peopleDialogClose');
  const profileButtons = [...document.querySelectorAll('.people-profile-overview [data-profile]')];
  let people = [];

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function nameWithoutExtension(filename) {
    return String(filename || '').replace(/\.[^.]+$/, '');
  }

  function registrationEntity(item) {
    return String(item?.sigladaentidade || item?.ufsigla || '').trim();
  }

  function catalogMatch(catalog, registeredName) {
    const key = normalize(registeredName);
    if (!key) return null;
    if (catalog.has(key)) return catalog.get(key);

    // Aceita nomes abreviados somente quando todos os termos informados coincidem.
    const candidates = [...catalog.entries()].filter(([catalogKey]) => {
      const shorter = catalogKey.length < key.length ? catalogKey : key;
      const longer = catalogKey.length < key.length ? key : catalogKey;
      return shorter.split(' ').length >= 2 && longer.startsWith(`${shorter} `);
    });
    return candidates.length === 1 ? candidates[0][1] : null;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Falha ao carregar ${url}`);
    return response.json();
  }

  async function loadPhotoIndex() {
    const results = await Promise.allSettled(PHOTO_SOURCES.map(async source => ({
      ...source,
      files: await fetchJson(source.manifest),
    })));
    const index = new Map();
    results.forEach((result) => {
      if (result.status !== 'fulfilled' || !Array.isArray(result.value.files)) return;
      result.value.files.forEach((filename) => {
        if (!/\.(?:png|jpe?g|webp|svg)$/i.test(filename) || /^(?:padrao|manifest)\b/i.test(filename)) return;
        const key = normalize(nameWithoutExtension(filename));
        if (!key || index.has(key)) return;
        index.set(key, `${result.value.directory}/${encodeURIComponent(filename).replace(/%2F/gi, '/')}`);
      });
    });
    return index;
  }

  function resolvePhoto(index, name) {
    const key = normalize(name);
    if (index.has(key)) return index.get(key);
    const candidates = [...index.entries()].filter(([photoKey]) => photoKey.startsWith(`${key} `) || key.startsWith(`${photoKey} `));
    return candidates.length === 1 ? candidates[0][1] : DEFAULT_PHOTO;
  }

  async function loadRegistrations() {
    const results = await Promise.allSettled(PROFILE_NAMES.map(async profileName => {
      const list = await fetchJson(`${API_BASE}/api/inscricoes/galeria?perfil=${encodeURIComponent(profileName)}`);
      return Array.isArray(list) ? list.map(item => ({ ...item, perfil: profileName })) : [];
    }));
    const successful = results.filter(result => result.status === 'fulfilled');
    if (!successful.length) throw new Error('Nenhuma lista de inscrições pôde ser consultada.');
    return successful.flatMap(result => result.value);
  }

  function deduplicate(items) {
    const unique = new Map();
    items.forEach((item) => {
      const nameKey = normalize(item.nome);
      if (!nameKey) return;
      const key = `${normalize(item.perfil)}:${nameKey}`;
      if (!unique.has(key)) unique.set(key, item);
    });
    return [...unique.values()];
  }

  function createCard(person, index) {
    const article = document.createElement('article');
    article.className = 'person-card';
    article.style.setProperty('--person-delay', `${Math.min(index * 45, 360)}ms`);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'person-card__button';
    button.setAttribute('aria-label', `Ver perfil de ${person.name}`);

    const photoWrap = document.createElement('span');
    photoWrap.className = 'person-card__photo';
    const image = document.createElement('img');
    image.src = person.photo;
    image.alt = `Foto de ${person.name}`;
    image.loading = 'lazy';
    image.addEventListener('error', () => { image.src = DEFAULT_PHOTO; }, { once: true });
    photoWrap.appendChild(image);

    const content = document.createElement('span');
    content.className = 'person-card__content';
    const tag = document.createElement('span');
    tag.className = 'people-profile-tag';
    tag.textContent = person.profile;
    const name = document.createElement('strong');
    name.textContent = person.name;
    const role = document.createElement('span');
    role.className = 'person-card__role';
    role.textContent = person.role || person.entity || 'Participante da 86ª Reunião';
    const more = document.createElement('span');
    more.className = 'person-card__more';
    more.innerHTML = 'Conhecer perfil <i class="bi bi-arrow-up-right" aria-hidden="true"></i>';
    content.append(tag, name, role, more);
    button.append(photoWrap, content);
    button.addEventListener('click', () => openPerson(person));
    article.appendChild(button);
    return article;
  }

  function openPerson(person) {
    document.getElementById('peopleDialogPhoto').src = person.photo;
    document.getElementById('peopleDialogPhoto').alt = `Foto de ${person.name}`;
    document.getElementById('peopleDialogProfile').textContent = person.profile;
    document.getElementById('peopleDialogName').textContent = person.name;
    document.getElementById('peopleDialogEntity').textContent = person.entity;
    document.getElementById('peopleDialogRole').textContent = person.role || person.entity || 'Participante da 86ª Reunião Ordinária do CONAPREV.';
    const biographyTitle = document.getElementById('peopleDialogBiographyTitle');
    const biography = document.getElementById('peopleDialogBiography');
    const hasBiography = Boolean(person.biography);
    biographyTitle.hidden = !hasBiography;
    biography.hidden = !hasBiography;
    biography.textContent = person.biography;
    dialog.showModal();
  }

  function render() {
    const term = normalize(search.value);
    const selectedProfile = profile.value;
    const filtered = people.filter(person => {
      const searchable = normalize([person.name, person.entity, person.role, person.profile].join(' '));
      return (!term || searchable.includes(term)) && (!selectedProfile || person.profile === selectedProfile);
    });

    grid.replaceChildren(...filtered.map(createCard));
    profileButtons.forEach(button => button.classList.toggle('is-active', button.dataset.profile === selectedProfile));
    count.textContent = `${filtered.length} ${filtered.length === 1 ? 'pessoa' : 'pessoas'}`;
    status.hidden = filtered.length > 0;
    if (!filtered.length) {
      status.className = 'people-status is-empty';
      status.textContent = people.length
        ? 'Nenhuma pessoa corresponde aos filtros selecionados.'
        : 'Ainda não há inscrições disponíveis para estes perfis.';
    }
  }

  function populateProfiles() {
    PROFILE_NAMES.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = PROFILE_LABELS[name] || name;
      profile.appendChild(option);
    });
    profileButtons.forEach((button) => {
      const profileName = button.dataset.profile;
      const profileCount = people.filter(person => person.profile === profileName).length;
      const counter = button.querySelector('strong');
      if (counter) counter.textContent = String(profileCount);
    });
  }

  async function initialize() {
    try {
      const [documentData, registrations, photoIndex] = await Promise.all([
        fetchJson('/data/quem-e-quem.json'),
        loadRegistrations(),
        loadPhotoIndex(),
      ]);
      const catalog = new Map((documentData.people || []).map(person => [normalize(person.name), person]));
      people = deduplicate(registrations)
        .map(registration => {
          const documentPerson = catalogMatch(catalog, registration.nome);
          const documentBiography = String(documentPerson?.biography || '').trim();
          return {
            name: String(registration.nome || documentPerson?.name || '').trim(),
            profile: String(registration.perfil || 'Participante'),
            entity: registrationEntity(registration),
            role: String(documentPerson?.role || '').trim(),
            biography: documentBiography,
            photo: resolvePhoto(photoIndex, registration.nome),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

      status.hidden = true;
      populateProfiles();
      render();
    } catch (error) {
      console.error('[Inscritos]', error);
      count.textContent = 'Indisponível';
      status.className = 'people-status is-error';
      status.textContent = 'Não foi possível carregar os participantes agora. Tente novamente em instantes.';
    }
  }

  search.addEventListener('input', render);
  profile.addEventListener('change', render);
  profileButtons.forEach(button => button.addEventListener('click', () => {
    profile.value = profile.value === button.dataset.profile ? '' : button.dataset.profile;
    render();
  }));
  closeDialog.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  initialize();
})();
