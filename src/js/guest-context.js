(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('origem') !== 'convidados') return;
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

    if (url.pathname === '/index.html' || url.pathname === '/') {
      url.pathname = '/insc-conv-pat.html';
      url.searchParams.delete('origem');
      if (url.hash === '#inscricoes' || url.hash === '#inicio') url.hash = '#home';
    } else if (url.pathname === '/quem-e-quem.html') {
      url.searchParams.set('perfis', 'Convidado,Apoiador');
      url.searchParams.set('origem', 'convidados');
    } else if (
      url.pathname === '/composicao.html' ||
      url.pathname === '/reunioes.html' ||
      url.pathname.startsWith('/reunioes/') ||
      url.pathname === '/sobre-evento.html' ||
      url.pathname === '/contato.html'
    ) {
      url.searchParams.set('origem', 'convidados');
    }

    if (preview === 'CONAPREV86_DEV' && !/\.pdf$/i.test(url.pathname)) {
      url.searchParams.set('preview', preview);
    }

    anchor.href = `${url.pathname}${url.search}${url.hash}`;
  }

  function applyGuestContext(root = document) {
    root.querySelectorAll?.('a[href]').forEach(contextualizeLink);

    root.querySelectorAll?.('.public-nav a').forEach((anchor) => {
      if (anchor.textContent.trim().toLocaleLowerCase('pt-BR') === 'início') anchor.remove();
    });

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
