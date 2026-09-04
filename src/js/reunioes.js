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

  const meetingUrl = (id) => `/reuniao.html?id=${encodeURIComponent(id)}`;
  const cover = (item, large = false) => item.cover
    ? `<img src="${item.cover}" alt="${item.number} Reunião do CONAPREV em ${item.city}" loading="lazy">`
    : `<div class="meeting-placeholder meeting-placeholder--${item.theme}" role="img" aria-label="Identidade visual da ${item.number} Reunião em ${item.city}"><span>${item.number}</span><strong>CONAPREV</strong><small>${item.city}</small>${large ? '<i class="bi bi-images" aria-hidden="true"></i>' : ''}</div>`;

  const grid = document.getElementById('meetingsGrid');
  if (grid) {
    grid.innerHTML = meetings.map((item) => `<article class="meeting-card"><a class="meeting-card__visual" href="${meetingUrl(item.id)}">${cover(item)}</a><div class="meeting-card__body"><span class="meeting-card__eyebrow">Reunião Ordinária</span><h3>${item.number} Reunião do CONAPREV</h3><p><i class="bi bi-calendar3" aria-hidden="true"></i>${item.date}</p><p><i class="bi bi-geo-alt" aria-hidden="true"></i>${item.city}</p><a class="meeting-card__link" href="${meetingUrl(item.id)}"><span>Ver reunião</span><i class="bi bi-arrow-right" aria-hidden="true"></i></a></div></article>`).join('');
  }

  const detail = document.getElementById('meetingDetailContent');
  if (!detail) return;
  const id = new URLSearchParams(location.search).get('id') || '85';
  const item = meetings.find((meeting) => meeting.id === id);
  if (!item) {
    detail.innerHTML = '<section class="meeting-not-found"><i class="bi bi-exclamation-circle"></i><h1>Reunião não encontrada</h1><p>O registro solicitado não está disponível.</p><a href="/reunioes.html">Consultar reuniões</a></section>';
    return;
  }

  document.title = `${item.number} Reunião do CONAPREV`;
  const files = [
    { icon: 'bi-easel2', label: 'Apresentações', url: item.presentations },
    { icon: 'bi-file-earmark-text', label: 'Atas', url: item.minutes }
  ];
  const gallery = item.photos.length
    ? `<div class="meeting-gallery">${item.photos.map((photo, index) => `<button type="button" data-gallery-index="${index}"><img src="${photo.src}" alt="${photo.alt}" loading="lazy"></button>`).join('')}</div>`
    : '<div class="meeting-gallery-empty"><i class="bi bi-images"></i><strong>Galeria em atualização</strong><span>As fotografias oficiais serão incluídas quando disponibilizadas.</span></div>';

  detail.innerHTML = `<header class="meeting-detail__heading"><div class="meeting-number-icon"><i class="bi bi-calendar-event"></i></div><div><span>Reunião Ordinária</span><h1>${item.number} Reunião do CONAPREV</h1><p><i class="bi bi-calendar3"></i>${item.date}<i class="bi bi-geo-alt"></i>${item.city}</p></div></header><div class="meeting-detail__layout"><section class="meeting-gallery-section"><h2><i class="bi bi-images"></i> Fotos da reunião</h2>${gallery}</section><aside class="meeting-summary"><section><h2><i class="bi bi-file-earmark-text"></i> Resumo da reunião</h2><p>${item.summary}</p><a class="meeting-official-link" href="${item.officialUrl}" target="_blank" rel="noopener">Consultar fonte oficial <i class="bi bi-box-arrow-up-right"></i></a></section><section class="meeting-files"><h2><i class="bi bi-folder2-open"></i> Arquivos da reunião</h2><div>${files.map((file) => file.url ? `<a href="${file.url}" target="_blank" rel="noopener"><i class="bi ${file.icon}"></i><strong>${file.label}</strong><span>Abrir no Google Drive <i class="bi bi-box-arrow-up-right"></i></span></a>` : `<div class="meeting-file-disabled" aria-label="${file.label}: link ainda não disponibilizado"><i class="bi ${file.icon}"></i><strong>${file.label}</strong><span>Link em atualização</span></div>`).join('')}</div></section></aside></div>`;

  const dialog = document.getElementById('meetingGalleryDialog');
  const dialogImage = document.getElementById('meetingGalleryImage');
  const dialogCaption = document.getElementById('meetingGalleryCaption');
  detail.querySelectorAll('[data-gallery-index]').forEach((button) => button.addEventListener('click', () => {
    const photo = item.photos[Number(button.dataset.galleryIndex)];
    if (!photo || !dialog) return;
    dialogImage.src = photo.src; dialogImage.alt = photo.alt; dialogCaption.textContent = photo.alt; dialog.showModal();
  }));
  dialog?.querySelector('[data-gallery-close]')?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
})();
