(() => {
  'use strict';

  const meetings = [
    {
      id: '85', number: '85ª', date: '4 e 5 de agosto de 2026', city: 'Gramado/RS', theme: 'gramado',
      cover: '/imagens/bg/bg-desktop.png',
      summary: 'A reunião reuniu representantes da área previdenciária de todo o país para discutir diretrizes, governança, modernização e sustentabilidade dos Regimes Próprios de Previdência Social.',
      officialUrl: 'https://ipeprev.rs.gov.br/2026-69974ce34f58e', presentations: '', minutes: '',
      photos: [{ src: '/imagens/bg/bg-desktop.png', alt: 'Imagem ilustrativa da cidade de Gramado, sede da 85ª Reunião' }]
    },
    {
      id: '84', number: '84ª', date: '30 e 31 de março de 2026', city: 'Goiânia/GO', theme: 'goiania', cover: '',
      summary: 'Organizada pelo Governo de Goiás e pela Goiás Previdência, a reunião tratou da gestão dos RPPS, do compartilhamento de dados, de investimentos e da composição das representações do CONAPREV.',
      officialUrl: 'https://www.gov.br/previdencia/pt-br/assuntos/rpps/acontece-na-srpps/abril-de-2026', presentations: '', minutes: '', photos: []
    },
    {
      id: '83', number: '83ª', date: '2 e 3 de dezembro de 2025', city: 'Macapá/AP', theme: 'macapa', cover: '',
      summary: 'A reunião abordou sustentabilidade financeira, governança, controle interno, integridade da gestão e temas relacionados à reforma previdenciária nos RPPS.',
      officialUrl: 'https://amprev.ap.gov.br/noticia/amprev-se-reune-com-comissao-do-conaprev-para-alinhar-preparativos-da-83a-reuniao-ordinaria-em-macapa-nos-dias-02-e-03-de-dezembro', presentations: '', minutes: '', photos: []
    },
    {
      id: '82', number: '82ª', date: '12 e 13 de agosto de 2025', city: 'São Paulo/SP', theme: 'saopaulo', cover: '',
      summary: 'Realizada na sede da B3, a reunião promoveu o diálogo entre dirigentes dos RPPS e aprovou iniciativas voltadas ao intercâmbio técnico e ao fortalecimento da gestão previdenciária.',
      officialUrl: 'https://www.gov.br/previdencia/pt-br/assuntos/rpps/destaques/conaprev-lanca-programa-de-intercambio-tecnico-para-fortalecer-a-gestao-dos-regimes-previdenciarios', presentations: '', minutes: '', photos: []
    }
  ];

  const meetingUrl = (id) => `/reunioes/${encodeURIComponent(id)}`;
  const cover = (item, large = false) => item.cover
    ? `<img src="${item.cover}" alt="${item.number} Reunião do CONAPREV em ${item.city}" loading="lazy">`
    : `<div class="meeting-placeholder meeting-placeholder--${item.theme}" role="img" aria-label="Identidade visual da ${item.number} Reunião em ${item.city}"><span>${item.number}</span><strong>CONAPREV</strong><small>${item.city}</small>${large ? '<i class="bi bi-images" aria-hidden="true"></i>' : ''}</div>`;

  const grid = document.getElementById('meetingsGrid');
  if (grid) {
    grid.innerHTML = meetings.map((item) => `<article class="meeting-card"><a class="meeting-card__visual" href="${meetingUrl(item.id)}">${cover(item)}</a><div class="meeting-card__body"><span class="meeting-card__eyebrow">Reunião Ordinária</span><h3>${item.number} Reunião do CONAPREV</h3><p><i class="bi bi-calendar3" aria-hidden="true"></i>${item.date}</p><p><i class="bi bi-geo-alt" aria-hidden="true"></i>${item.city}</p><a class="meeting-card__link" href="${meetingUrl(item.id)}"><span>Ver reunião</span><i class="bi bi-arrow-right" aria-hidden="true"></i></a></div></article>`).join('');
  }

  const detail = document.getElementById('meetingDetailContent');
  if (!detail) return;
  const pathMeeting = location.pathname.match(/\/reunioes\/(\d+)\/?$/)?.[1];
  const id = new URLSearchParams(location.search).get('id') || pathMeeting || '85';
  const item = meetings.find((meeting) => meeting.id === id);
  if (!item) {
    detail.innerHTML = '<section class="meeting-not-found"><i class="bi bi-exclamation-circle"></i><h1>Reunião não encontrada</h1><p>O registro solicitado não está disponível.</p><a href="/reunioes.html">Consultar reuniões</a></section>';
    return;
  }

  document.title = `${item.number} Reunião do CONAPREV`;
  const files = [
    { icon: 'bi-easel2', label: 'Apresentações', type: 'presentations' },
    { icon: 'bi-file-earmark-text', label: 'Atas', type: 'minutes' }
  ];

  detail.innerHTML = `<header class="meeting-detail__heading"><div class="meeting-number-icon"><i class="bi bi-calendar-event"></i></div><div><span>Reunião Ordinária</span><h1>${item.number} Reunião do CONAPREV</h1><p><i class="bi bi-calendar3"></i>${item.date}<i class="bi bi-geo-alt"></i>${item.city}</p></div></header><div class="meeting-detail__layout"><section class="meeting-gallery-section"><h2><i class="bi bi-images"></i> Fotos da reunião</h2><div id="meetingGallery" aria-live="polite"><div class="meeting-loading"><span class="spinner-border" aria-hidden="true"></span><strong>Carregando fotos...</strong></div></div></section><aside class="meeting-summary"><section><h2><i class="bi bi-file-earmark-text"></i> Resumo da reunião</h2><p>${item.summary}</p></section><section class="meeting-files"><h2><i class="bi bi-folder2-open"></i> Arquivos da reunião</h2><div>${files.map((file) => `<button type="button" data-files-type="${file.type}" data-files-label="${file.label}"><i class="bi ${file.icon}"></i><strong>${file.label}</strong><span>Consultar arquivos <i class="bi bi-arrow-right"></i></span></button>`).join('')}</div></section></aside></div>`;

  const dialog = document.getElementById('meetingGalleryDialog');
  const dialogImage = document.getElementById('meetingGalleryImage');
  const dialogCaption = document.getElementById('meetingGalleryCaptionText');
  const dialogCounter = document.getElementById('meetingGalleryCounter');
  const galleryRoot = document.getElementById('meetingGallery');
  const filesDialog = document.getElementById('meetingFilesDialog');
  const filesTitle = document.getElementById('meetingFilesTitle');
  const filesContent = document.getElementById('meetingFilesContent');
  const filesFooter = document.getElementById('meetingFilesFooter');
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const endpoint = (type) => `/.netlify/functions/drive-files?meeting=${encodeURIComponent(item.id)}&type=${encodeURIComponent(type)}`;
  const photoUrl = (fileId, size = 900) => `/.netlify/functions/drive-image?meeting=${encodeURIComponent(item.id)}&file=${encodeURIComponent(fileId)}&size=${size}`;
  const documentUrl = (type, fileId) => `/.netlify/functions/drive-document?meeting=${encodeURIComponent(item.id)}&type=${encodeURIComponent(type)}&file=${encodeURIComponent(fileId)}`;
  const visiblePhotoLimit = 25;
  let galleryPhotos = [];
  let galleryIndex = 0;

  function showGalleryPhoto(index) {
    if (!galleryPhotos.length || !dialog || !dialogImage || !dialogCaption || !dialogCounter) return;
    galleryIndex = (index + galleryPhotos.length) % galleryPhotos.length;
    const photo = galleryPhotos[galleryIndex];
    const name = photo.name || 'Foto da reunião';
    dialogImage.src = photoUrl(photo.id, 1600);
    dialogImage.alt = name;
    dialogCaption.textContent = name;
    dialogCounter.textContent = `${galleryIndex + 1} de ${galleryPhotos.length}`;
  }

  function openGallery(index = 0) {
    if (!galleryPhotos.length || !dialog) return;
    showGalleryPhoto(index);
    if (!dialog.open) dialog.showModal();
  }

  async function requestFiles(type) {
    const response = await fetch(endpoint(type), { headers: { accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'DRIVE_ERROR');
    return data;
  }

  async function loadPhotos() {
    try {
      const data = await requestFiles('photos');
      if (!data.files?.length) {
        galleryPhotos = [];
        galleryRoot.innerHTML = '<div class="meeting-gallery-empty"><i class="bi bi-images"></i><strong>Nenhuma foto disponível para esta reunião.</strong><span>Novas fotos aparecerão automaticamente quando forem adicionadas ao acervo.</span></div>';
        return;
      }
      galleryPhotos = data.files;
      const visiblePhotos = galleryPhotos.slice(0, visiblePhotoLimit);
      galleryRoot.innerHTML = `<div class="meeting-gallery">${visiblePhotos.map((photo, index) => `<button type="button" data-gallery-index="${index}" aria-label="Visualizar ${escapeHtml(photo.name)}"><img src="${photoUrl(photo.id)}" alt="${escapeHtml(photo.name)}" loading="lazy" decoding="async"></button>`).join('')}</div><div class="meeting-gallery-actions"><button type="button" data-gallery-all><i class="bi bi-images" aria-hidden="true"></i> Ver todas as fotos</button></div>`;
      galleryRoot.querySelectorAll('[data-gallery-index]').forEach((button) => button.addEventListener('click', () => openGallery(Number(button.dataset.galleryIndex))));
      galleryRoot.querySelector('[data-gallery-all]')?.addEventListener('click', () => openGallery(0));
    } catch {
      galleryRoot.innerHTML = '<div class="meeting-gallery-empty meeting-gallery-error"><i class="bi bi-exclamation-circle"></i><strong>Não foi possível carregar as fotos neste momento.</strong><button type="button" data-retry-photos>Tentar novamente</button></div>';
      galleryRoot.querySelector('[data-retry-photos]')?.addEventListener('click', loadPhotos);
    }
  }

  async function openFiles(type, label) {
    if (!filesDialog || !filesTitle || !filesContent || !filesFooter) return;
    filesTitle.textContent = `${label} — ${item.number} Reunião do CONAPREV`;
    filesContent.innerHTML = `<div class="meeting-loading"><span class="spinner-border" aria-hidden="true"></span><strong>Carregando ${label.toLocaleLowerCase('pt-BR')}...</strong></div>`;
    filesFooter.innerHTML = '';
    if (!filesDialog.open) filesDialog.showModal();
    try {
      const data = await requestFiles(type);
      if (!data.files?.length) {
        const empty = type === 'minutes' ? 'Nenhuma ata disponível.' : 'Nenhuma apresentação disponível.';
        filesContent.innerHTML = `<div class="meeting-dialog-state"><i class="bi bi-folder2-open"></i><strong>${empty}</strong></div>`;
      } else {
        filesContent.innerHTML = `<ul>${data.files.map((file) => `<li><i class="bi bi-file-earmark"></i><div><strong>${escapeHtml(file.name)}</strong><span>${escapeHtml(file.mimeType)}</span></div><a href="${documentUrl(type, file.id)}" target="_blank" rel="noopener noreferrer" aria-label="Visualizar ${escapeHtml(file.name)}"><i class="bi bi-eye"></i></a></li>`).join('')}</ul>`;
      }
    } catch {
      filesContent.innerHTML = '<div class="meeting-dialog-state meeting-dialog-state--error"><i class="bi bi-exclamation-circle"></i><strong>Não foi possível carregar os arquivos neste momento.</strong><button type="button" data-retry-files>Tentar novamente</button></div>';
      filesContent.querySelector('[data-retry-files]')?.addEventListener('click', () => openFiles(type, label));
    }
  }

  detail.querySelectorAll('[data-files-type]').forEach((button) => button.addEventListener('click', () => openFiles(button.dataset.filesType, button.dataset.filesLabel)));
  dialog?.querySelector('[data-gallery-close]')?.addEventListener('click', () => dialog.close());
  dialog?.querySelector('[data-gallery-prev]')?.addEventListener('click', () => showGalleryPhoto(galleryIndex - 1));
  dialog?.querySelector('[data-gallery-next]')?.addEventListener('click', () => showGalleryPhoto(galleryIndex + 1));
  dialog?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') showGalleryPhoto(galleryIndex - 1);
    if (event.key === 'ArrowRight') showGalleryPhoto(galleryIndex + 1);
  });
  dialog?.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  filesDialog?.querySelector('[data-files-close]')?.addEventListener('click', () => filesDialog.close());
  filesDialog?.addEventListener('click', (event) => { if (event.target === filesDialog) filesDialog.close(); });
  loadPhotos();
})();
