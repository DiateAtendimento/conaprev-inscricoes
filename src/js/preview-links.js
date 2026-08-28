(() => {
  const params = new URLSearchParams(window.location.search);
  const preview = params.get('preview');
  if (preview !== 'CONAPREV86_DEV') return;

  const preservePreview = () => {
    document.querySelectorAll('a[href]').forEach((anchor) => {
      const rawHref = anchor.getAttribute('href');
      if (!rawHref || rawHref.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(rawHref)) return;

      let url;
      try { url = new URL(rawHref, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin || /\.pdf$/i.test(url.pathname)) return;

      url.searchParams.set('preview', preview);
      anchor.href = `${url.pathname}${url.search}${url.hash}`;
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', preservePreview, { once: true });
  } else {
    preservePreview();
  }
})();
