(() => {
  const releaseAt = new Date('2026-09-01T08:00:00-03:00').getTime();
  const hasPreview = new URLSearchParams(window.location.search).get('preview') === 'CONAPREV86_DEV';
  if (Date.now() < releaseAt && !hasPreview) window.location.replace('/index.html');
})();
