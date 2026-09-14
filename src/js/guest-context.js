(() => {
  const ENVIRONMENT_KEY = 'conaprev:environment';
  const GUEST_ENVIRONMENT = 'convidados';
  const params = new URLSearchParams(window.location.search);
  const isGuestEntry = /^\/insc-conv-pat(?:\.html)?\/?$/.test(window.location.pathname);
  const isGuestRoute = /^\/convidados(?:\/|$)/.test(window.location.pathname);
  const hasGuestParam = params.get('origem') === GUEST_ENVIRONMENT;
  let hasStoredGuestContext = false;
  try {
    hasStoredGuestContext = sessionStorage.getItem(ENVIRONMENT_KEY) === GUEST_ENVIRONMENT;
    if (isGuestEntry || isGuestRoute || hasGuestParam) {
      sessionStorage.setItem(ENVIRONMENT_KEY, GUEST_ENVIRONMENT);
      hasStoredGuestContext = true;
    }
  } catch (_) {
    hasStoredGuestContext = false;
  }
  if (!isGuestEntry && !isGuestRoute && !hasGuestParam && !hasStoredGuestContext) return;
  const preview = params.get('preview');

  const isSameOrigin = (url) => url.origin === window.location.origin;

  function contextualizeLink(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) return;

    const rawHref = anchor.getAttribute('href');
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) return;

    let url;
    try {
      url = new URL(rawHref, window.location.href);
    } catch (_) {
      return;
    }

    if (!isSameOrigin(url)) return;

    if (url.pathname === '/index.html' || url.pathname === '/index' || url.pathname === '/' || /^\/insc-conv-pat(?:\.html)?\/?$/.test(url.pathname)) {
      url.pathname = '/insc-conv-pat.html';
      url.searchParams.set('origem', GUEST_ENVIRONMENT);
      if (url.hash === '#inscricoes' || url.hash === '#inicio') url.hash = '#home';
    } else if (url.pathname === '/quem-e-quem.html' || url.pathname === '/quem-e-quem' || url.pathname === '/convidados/inscritos') {
      url.pathname = '/convidados/inscritos';
      url.searchParams.delete('perfis');
      url.searchParams.set('origem', GUEST_ENVIRONMENT);
    } else if (url.pathname === '/composicao.html' || url.pathname === '/composicao' || url.pathname === '/convidados/composicao') {
      url.pathname = '/convidados/composicao';
      url.searchParams.set('origem', GUEST_ENVIRONMENT);
    } else if (url.pathname === '/reunioes.html' || url.pathname === '/reunioes' || url.pathname === '/convidados/reunioes') {
      url.pathname = '/convidados/reunioes';
      url.searchParams.set('origem', GUEST_ENVIRONMENT);
    } else if (url.pathname.startsWith('/reunioes/')) {
      url.pathname = `/convidados${url.pathname}`;
      url.searchParams.set('origem', GUEST_ENVIRONMENT);
    } else if (url.pathname === '/sobre-evento.html' || url.pathname === '/sobre-evento' || url.pathname === '/convidados/informacoes') {
      url.pathname = '/convidados/informacoes';
      url.searchParams.set('origem', GUEST_ENVIRONMENT);
    } else if (url.pathname === '/contato.html' || url.pathname === '/contato' || url.pathname === '/convidados/contato') {
      url.pathname = '/convidados/contato';
      url.searchParams.set('origem', GUEST_ENVIRONMENT);
    } else if (url.pathname === '/hospedagem.html' || url.pathname === '/hospedagem' || url.pathname === '/convidados/hospedagem') {
      url.pathname = '/convidados/hospedagem';
      url.searchParams.set('origem', GUEST_ENVIRONMENT);
    }

    if (preview === 'CONAPREV86_DEV' && !/\.pdf$/i.test(url.pathname)) {
      url.searchParams.set('preview', preview);
    }

    anchor.href = `${url.pathname}${url.search}${url.hash}`;
  }

  function applyGuestContext(root = document) {
    root.querySelectorAll?.('a[href]').forEach(contextualizeLink);

    root.querySelectorAll?.('#liveVotingBtn, #adminAccessBtn, [data-guest-hidden="true"]').forEach((element) => {
      element.remove();
    });
  }

  function start() {
    document.documentElement.classList.add('guest-context');
    applyGuestContext();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.matches?.('a[href]')) contextualizeLink(node);
          applyGuestContext(node);
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
