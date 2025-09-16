// Carrega EVENTO.INICIO se existir em config.js, senão usa default
let EVENTO = { INICIO: '2025-09-22T08:00:00-03:00' };
try {
  const mod = await import('./config.js');
  if (mod?.EVENTO?.INICIO) EVENTO = mod.EVENTO;
} catch {
  console.warn('[gate] config.js não encontrado; usando defaults');
}

/** =============================
 *  Config do “portão” (gate)
 *  ============================= */
const MAINTENANCE_MODE = true;                 // todos veem o gate (bypass via preview funciona)
const RELEASE_AT = EVENTO.INICIO;              // data/hora de liberação
const PREVIEW_TOKEN = 'CONAPREV83_DEV';        // ?preview=CONAPREV83_DEV (salva cookie)

/* Helpers cookie/query */
function setCookie(name, value, days=7){
  const d = new Date(); d.setTime(d.getTime() + (days*24*60*60*1000));
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
}
function getCookie(name){
  return document.cookie.split('; ').reduce((acc, c) => {
    const [k,v] = c.split('='); if(k===name) acc = decodeURIComponent(v||''); return acc;
  }, '');
}
function parseQuery(){ return Object.fromEntries(new URLSearchParams(location.search).entries()); }

/* Query para liberar/limpar preview */
const q = parseQuery();
if(q.preview){
  if(q.preview === 'clear'){ setCookie('conaprev_preview','',-1); history.replaceState({},'',location.pathname); }
  else if(q.preview === PREVIEW_TOKEN){ setCookie('conaprev_preview', PREVIEW_TOKEN, 7); history.replaceState({},'',location.pathname); }
}

const hasBypass = getCookie('conaprev_preview') === PREVIEW_TOKEN;
const now = Date.now();
const releaseTs = new Date(RELEASE_AT).getTime();
const shouldGate = (MAINTENANCE_MODE || now < releaseTs) && !hasBypass;

/* Modo gate vs. app */
if(shouldGate){
  document.body.classList.add('gate-active');
  mountGate({ showHints: hasBypass });
} else {
  document.getElementById('app')?.classList.remove('d-none');
  import('./main.js'); // carrega sua aplicação
}

/* ===== Render do Gate ===== */
function mountGate({ showHints } = { showHints:false }){
  const root = document.getElementById('gate-root');
  const release = new Date(RELEASE_AT);

  root.innerHTML = `
    <header class="py-4"><!-- sem border-bottom --></header>

    <main class="container py-5">
      <div class="row g-4 align-items-center">
        <!-- Texto à esquerda -->
        <div class="col-12 col-lg-6">
          <h1 class="fw-semibold" style="font-size:clamp(24px,3vw,36px);line-height:1.2;">
            Aguarde, falta pouco para a liberação das inscrições da
            <strong>83ª Reunião Ordinária do CONAPREV</strong>.
          </h1>
          <p class="text-secondary mt-2">
            Abertura prevista para <strong>${pad(release.getDate())}/${pad(release.getMonth()+1)}/${release.getFullYear()}</strong>
            às <strong>${pad(release.getHours())}:${pad(release.getMinutes())}</strong> (horário de Brasília).
          </p>
          <p class="text-secondary mb-0 ${showHints ? '' : 'd-none'}">
            Se você é da equipe e precisa testar, use:
            <code>?preview=${PREVIEW_TOKEN}</code> | para limpar: <code>?preview=clear</code>.
          </p>
        </div>

        <!-- Contador à direita -->
        <div class="col-12 col-lg-6">
          <div class="d-flex align-items-stretch gap-2 justify-content-lg-end justify-content-center">
            <div class="gate-tile">
              <div id="gDays" class="gate-num">00</div>
              <div class="gate-lab">Dias</div>
            </div>
            <div class="gate-sep d-none d-lg-flex align-items-center">:</div>
            <div class="gate-tile">
              <div id="gHours" class="gate-num">00</div>
              <div class="gate-lab">Hrs</div>
            </div>
            <div class="gate-sep d-none d-lg-flex align-items-center">:</div>
            <div class="gate-tile">
              <div id="gMinutes" class="gate-num">00</div>
              <div class="gate-lab">Min</div>
            </div>
            <div class="gate-sep d-none d-lg-flex align-items-center">:</div>
            <div class="gate-tile">
              <div id="gSeconds" class="gate-num">00</div>
              <div class="gate-lab">Sec</div>
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

  function tick(){
    const t = target - Date.now();
    if(t <= 0){ location.reload(); return; }
    const s = Math.floor(t/1000);
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    dEl.textContent = String(days).padStart(2,'0');
    hEl.textContent = String(hours).padStart(2,'0');
    mEl.textContent = String(minutes).padStart(2,'0');
    sEl.textContent = String(seconds).padStart(2,'0');
    setTimeout(tick, 1000);
  }
  tick();
}

function pad(n){ return String(n).padStart(2,'0'); }
