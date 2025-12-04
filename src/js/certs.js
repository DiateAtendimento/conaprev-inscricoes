// /src/js/certs.js
// Fluxo de emissÇ£o de certificado: coleta CPF, chama a API e trata bloqueios/avisos.
(() => {
  const apiBase = window.API_BASE || "";
  const evento = window.EVENTO || {};

  const btnAbrir = document.getElementById("btnEmitirCert");
  const modalEl = document.getElementById("emitirCertModal");
  const loadingEl = document.getElementById("certLoadingModal");
  const timerEl = document.getElementById("certTimerModal");
  const msgEl = document.getElementById("certMessageModal");

  if (!btnAbrir || !modalEl || !loadingEl || !timerEl || !msgEl) return;

  const certModal = new bootstrap.Modal(modalEl);
  const loadingModal = new bootstrap.Modal(loadingEl, { backdrop: "static", keyboard: false });
  const timerModal = new bootstrap.Modal(timerEl, { backdrop: "static", keyboard: false });
  const messageModal = new bootstrap.Modal(msgEl);

  const cpfInput = document.getElementById("cpfCertInput");
  const emitirBtn = document.getElementById("emitirCertBtn");
  const emitirSpinner = document.getElementById("emitirCertSpinner");
  const emitirText = document.getElementById("emitirCertBtnText");
  const timerSpan = document.getElementById("certTimer");

  function setBtnLoading(isLoading) {
    if (!emitirBtn) return;
    emitirBtn.disabled = !!isLoading;
    emitirSpinner?.classList.toggle("d-none", !isLoading);
    if (emitirText) emitirText.textContent = isLoading ? "Gerando..." : "Emitir certificado";
  }

  function showMessage(title, html) {
    const t = document.getElementById("certMessageTitle");
    const b = document.getElementById("certMessageBody");
    if (t) t.textContent = title || "Aviso";
    if (b) b.innerHTML = html || "";
    messageModal.show();
  }

  function abrirTemporizador(ms) {
    if (!timerSpan) return;
    let restante = Number(ms) || 0;
    const update = () => {
      const totalSec = Math.max(0, Math.floor(restante / 1000));
      const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
      const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
      const s = String(totalSec % 60).padStart(2, "0");
      timerSpan.textContent = `${h}:${m}:${s}`;
      if (restante <= 0) {
        timerModal.hide();
        showMessage("Certificado disponÇ­vel", "<strong>Pronto!</strong> Agora vocÃª pode emitir o certificado.");
        return;
      }
      restante -= 1000;
      setTimeout(update, 1000);
    };
    timerModal.show();
    update();
  }

  function formatarDataHora(str) {
    const dt = new Date(str || "");
    if (isNaN(dt.getTime())) return null;
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yyyy = dt.getFullYear();
    const hh = String(dt.getHours()).padStart(2, "0");
    const mi = String(dt.getMinutes()).padStart(2, "0");
    return { dd, mm, yyyy, hh, mi };
  }

  async function emitirCertificado(cpf) {
    const resp = await fetch(`${apiBase}/api/certificado/emitir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cpf })
    });
    if (!resp.ok) {
      let errText = "Erro ao emitir certificado.";
      try {
        const data = await resp.json();
        errText = data?.error || errText;
      } catch (_e) {
        errText = await resp.text();
      }
      throw new Error(errText || "Erro ao emitir certificado.");
    }
    return await resp.blob();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "certificado_conaprev.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function tratarErro(raw) {
    const msg = String(raw || "").replace(/^Error:\s*/, "");

    if (msg.startsWith("EVENTO_NAO_TERMINOU|")) {
      const inicio = formatarDataHora(evento?.INICIO);
      const fim = formatarDataHora(evento?.FIM);
      const hoje = new Date();
      const aindaNaoComecou = inicio && hoje < new Date(evento.INICIO);
      if (aindaNaoComecou && inicio) {
        showMessage(
          "Evento ainda nÃ£o comeÃ§ou",
          `O evento inicia em ${inicio.dd}/${inicio.mm}/${inicio.yyyy} Ã s ${inicio.hh}:${inicio.mi}.<br>` +
          `O certificado ficarÃ¡ disponÃ­vel 24h apÃ³s o tÃ©rmino.`
        );
      } else if (fim) {
        showMessage(
          "Evento ainda nÃ£o terminou",
          `O evento termina em ${fim.dd}/${fim.mm}/${fim.yyyy} Ã s ${fim.hh}:${fim.mi}.<br>` +
          `O certificado ficarÃ¡ disponÃ­vel 24h apÃ³s o tÃ©rmino.`
        );
      } else {
        showMessage("Evento em andamento", "O certificado ficarÃ¡ disponÃ­vel apÃ³s o tÃ©rmino do evento.");
      }
      return;
    }

    if (msg.startsWith("CERTIFICADO_NAO_LIBERADO|")) {
      const ms = parseInt(msg.split("|")[1], 10);
      abrirTemporizador(isNaN(ms) ? 0 : ms);
      return;
    }

    if (msg.startsWith("NAO_CONSTA_PRESENCA")) {
      showMessage(
        "PresenÃ§a nÃ£o encontrada",
        "Seu nÃºmero de inscriÃ§Ã£o nÃ£o consta nas listas de presenÃ§a (Dia1/Dia2). Verifique no credenciamento."
      );
      return;
    }

    showMessage("Erro ao emitir", msg || "NÃ£o foi possÃ­vel emitir o certificado.");
  }

  btnAbrir.addEventListener("click", (e) => {
    e.preventDefault();
    if (cpfInput) cpfInput.value = "";
    certModal.show();
    setTimeout(() => cpfInput?.focus(), 150);
  });

  emitirBtn?.addEventListener("click", async () => {
    const cpf = String(cpfInput?.value || "").replace(/\D/g, "");
    if (cpf.length !== 11) {
      showMessage("CPF invÃ¡lido", "Digite um CPF vÃ¡lido (11 dÃ­gitos, somente nÃºmeros).");
      return;
    }
    setBtnLoading(true);
    certModal.hide();
    loadingModal.show();
    try {
      const pdf = await emitirCertificado(cpf);
      downloadBlob(pdf, "certificado_conaprev.pdf");
    } catch (err) {
      tratarErro(err?.message || err);
    } finally {
      setBtnLoading(false);
      loadingModal.hide();
    }
  });

  // Enter envia o form
  cpfInput?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      emitirBtn?.click();
    }
  });
})();
