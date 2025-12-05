// /src/js/certs.js
// Fluxo: trava até 08/12/2025 14h (salvo modo dev) e, quando liberado, redireciona para o Apps Script.

(() => {
  const CERT_LIBERACAO = "2025-12-08T14:00:00-03:00"; // 08/12/2025 14h BRT
  const CERT_DEV_FLAG = "certDevMode";
  const releaseAt = new Date(CERT_LIBERACAO).getTime();

  // Habilita/desabilita modo dev via query (?certdev=1 / ?certdev=0)
  (() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("certdev") === "1") localStorage.setItem(CERT_DEV_FLAG, "1");
    if (params.get("certdev") === "0") localStorage.removeItem(CERT_DEV_FLAG);
  })();

  const isCertDevMode = () =>
    localStorage.getItem(CERT_DEV_FLAG) === "1" || window.CERT_DEV_MODE === true;

  const isCertLiberado = () =>
    isCertDevMode() || (releaseAt && Date.now() >= releaseAt);

  const btnAbrir = document.getElementById("btnEmitirCert");
  const msgEl = document.getElementById("certMessageModal");

  if (!btnAbrir) return;

  const messageModal = msgEl ? new bootstrap.Modal(msgEl) : null;

  function showMessage(title, html) {
    if (messageModal && msgEl) {
      const t = document.getElementById("certMessageTitle");
      const b = document.getElementById("certMessageBody");
      if (t) t.textContent = title || "Aviso";
      if (b) b.innerHTML = html || "";
      messageModal.show();
    } else {
      // fallback simples se o modal não existir
      alert((title ? title + ":\n\n" : "") + (html || ""));
    }
  }

  function avisarLiberacao() {
    showMessage(
      "Certificado indisponível",
      "O certificado estará disponível para emissão em <strong>08/12/2025 (segunda-feira) às 14h</strong>, horário de Brasília."
    );
  }

  // Clique no botão de emitir certificado
  btnAbrir.addEventListener("click", (e) => {
    e.preventDefault();

    if (!isCertLiberado()) {
      avisarLiberacao();     // mostra o modal/mensagem de bloqueio
      return;
    }

    // Se já estiver liberado ou em modo dev, redireciona para o Apps Script
    window.location.href =
      "https://script.google.com/macros/s/AKfycbz0_BIDWG_ZCx3SieUkWEzHyh4Xf_VHXI3nA0kjkjyKZhDWqyPA7xn2vtzZjWmn97ycYg/exec";
  });
})();
