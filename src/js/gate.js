// gate.js � cron�metro/bloqueio de abertura

// L� a data de libera��o do objeto global definido em config.js
const EVENTO = window.EVENTO || { INICIO: '2025-09-22T08:00:00-03:00' };

/** =============================
 *  Config do �port�o� (gate)
 *  ============================= */
const MAINTENANCE_MODE = true;          // todos veem o gate (a menos que usem o preview)
const RELEASE_AT       = EVENTO.INICIO; // data/hora de libera��o
const PREVIEW_TOKEN    = 'CONAPREV84_DEV'; // ?preview=CONAPREV84_DEV (salva cookie)

/* Helpers cookie/query */
function setCookie(name, value, days = 7) {
  const d = new Date();
  d.setTime(d.getTime() + (days * 86400000));
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
}
function getCookie(name) {
  return document.cookie.split('; ').reduce((acc, c) => {
    const [k, v] = c.split('=');
    if (k === name) acc = decodeURIComponent(v || '');
    return acc;
  }, '');
}
function parseQuery() {
  return Object.fromEntries(new URLSearchParams(location.search).entries());
}

/* Query para liberar/limpar preview (sem exibir mensagem na UI) */
const q = parseQuery();
if (q.preview) {
  if (q.preview === 'clear') {
    setCookie('conaprev_preview', '', -1);
    history.replaceState({}, '', location.pathname);
  } else if (q.preview === PREVIEW_TOKEN) {
    setCookie('conaprev_preview', PREVIEW_TOKEN, 7);
    history.replaceState({}, '', location.pathname);
  }
}

const hasBypass  = getCookie('conaprev_preview') === PREVIEW_TOKEN;
const releaseTs  = new Date(RELEASE_AT).getTime();
const shouldGate = (MAINTENANCE_MODE || Date.now() < releaseTs) && !hasBypass;

/* For�a fundo preto real: desativa o body::before do tema enquanto o gate estiver ativo */
function ensureBlackBackground() {
  const id = 'gate-force-black-style';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    body.gate-active { background:#000 !important; color:#fff !important; }
    body.gate-active::before { display:none !important; }
  `;
  document.head.appendChild(style);
}

/* Modo gate vs. app */
if (shouldGate) {
  ensureBlackBackground();
  document.body.classList.add('gate-active');
  mountGate();     // n�o mostra dicas de preview
} else {
  document.getElementById('app')?.classList.remove('d-none');
  // Se voc� tiver um main.js de app, pode carregar aqui.
  // import('./main.js');
}

/* ===== Render do Gate ===== */
function mountGate() {
  const root = document.getElementById('gate-root');
  if (!root) return;

  const release = new Date(RELEASE_AT);

  root.innerHTML = `
    <header class="py-4"><!-- vazio no gate --></header>

    <main class="container py-5">
      <div class="row g-4 align-items-center">
        <!-- Texto à esquerda -->
        <div class="col-12 col-lg-6">
          <h1 class="fw-semibold" style="font-size:clamp(24px,3vw,36px);line-height:1.2;">
            Aguarde, falta pouco para a liberação das inscrições da
            <strong>84ª Reunião Ordinária do CONAPREV</strong>.
          </h1>
          <p class="text-secondary mt-2">
            Abertura prevista para <strong>${pad(release.getDate())}/${pad(release.getMonth() + 1)}/${release.getFullYear()}</strong>
            às <strong>${pad(release.getHours())}:${pad(release.getMinutes())}</strong> (horário de Brasília).
          </p>
        </div>

        <!-- Contador à direita -->
        <div class="col-12 col-lg-6">
          <div class="d-flex align-items-stretch gap-2 justify-content-lg-end justify-content-center">
            <div class="gate-box">
              <div id="gDays" class="gate-num">00</div>
              <div class="gate-lab">DIAS</div>
            </div>
            <div class="gate-sep d-none d-lg-flex align-items-center">:</div>
            <div class="gate-box">
              <div id="gHours" class="gate-num">00</div>
              <div class="gate-lab">HRS</div>
            </div>
            <div class="gate-sep d-none d-lg-flex align-items-center">:</div>
            <div class="gate-box">
              <div id="gMinutes" class="gate-num">00</div>
              <div class="gate-lab">MIN</div>
            </div>
            <div class="gate-sep d-none d-lg-flex align-items-center">:</div>
            <div class="gate-box">
              <div id="gSeconds" class="gate-num">00</div>
              <div class="gate-lab">SEC</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  `;

  // Timer
  const dEl = document.getElementById('gDays');
  const hEl = document.getElementById('gHours');
  const mEl = document.getElementById('gMinutes');
  const sEl = document.getElementById('gSeconds');
  const target = releaseTs;

  function tick() {
    const t = target - Date.now();
    if (t <= 0) {
      // chegou a hora: recarrega para entrar no app
      location.reload();
      return;
    }
    const s = Math.floor(t / 1000);
    const days    = Math.floor(s / 86400);
    const hours   = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    dEl.textContent = String(days).padStart(2, '0');
    hEl.textContent = String(hours).padStart(2, '0');
    mEl.textContent = String(minutes).padStart(2, '0');
    sEl.textContent = String(seconds).padStart(2, '0');
    setTimeout(tick, 1000);
  }
  tick();
}

function pad(n) { return String(n).padStart(2, '0'); }

