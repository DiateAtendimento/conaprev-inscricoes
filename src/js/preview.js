// frontend/src/js/preview.js
(() => {
  const params = new URLSearchParams(window.location.search);
  const isPreviewApp = params.get("preview") === "app";
  // flag global simples que outros scripts enxergam
  window.__PREVIEW_APP__ = isPreviewApp;

  // opcional: coloca uma â€œpistaâ€ no <html> pra CSS se quiser
  document.documentElement.setAttribute("data-preview", isPreviewApp ? "app" : "countdown");

  // alterna visÃµes quando o DOM estiver pronto
  document.addEventListener("DOMContentLoaded", () => {
    const viewCountdown = document.getElementById("view-countdown");
    const viewApp = document.getElementById("view-app");
    if (viewCountdown && viewApp) {
      if (isPreviewApp) {
        viewCountdown.classList.add("hidden");
        viewApp.classList.remove("hidden");
      } else {
        viewApp.classList.add("hidden");
        viewCountdown.classList.remove("hidden");
      }
    }
  });
})();
