// src/js/gate.js  (substitui o import fixo)
let EVENTO = { INICIO: '2025-09-22T08:00:00-03:00' }; // default seguro
try {
  const mod = await import('./config.js');
  if (mod?.EVENTO?.INICIO) EVENTO = mod.EVENTO;
} catch (e) {
  console.warn('[gate] config.js não encontrado; usando defaults');
}


/** =============================
 *  Config do “portão” (gate)
 *  ============================= */
const MAINTENANCE_MODE = false; // enquanto true, todos veem o gate (bypass via preview continua funcionando)

// ⚠️ Data/hora exata da liberação das inscrições (fuso São Paulo -03:00)
const RELEASE_AT = EVENTO?.INICIO || '2025-09-22T08:00:00-03:00';


// token para preview do app (grava cookie). Use: ?preview=CONAPREV83_DEV
const PREVIEW_TOKEN = 'CONAPREV83_DEV';

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
  mountGate();
} else {
  document.getElementById('app')?.classList.remove('d-none');
  import('./main.js'); // carrega sua aplicação
}

/* ===== Render do Gate (tema preto, logos no topo, texto à esquerda e contador à direita) ===== */
function mountGate(){
  const root = document.getElementById('gate-root');
  const release = new Date(RELEASE_AT);

  root.innerHTML = `
    <header class="py-4 border-bottom border-dark-subtle">
      <div class="container d-flex justify-content-center align-items-center gap-3">
        <img src="/imagens/logo-mps.svg" alt="Ministério da Previdência Social" style="height:40px" />
        <div style="width:1px;height:28px;background:#2b2b2b"></div>
        <img src="/imagens/logo-conaprev.svg" alt="CONAPREV" style="height:40px" />
      </div>
    </header>

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
          <p class="text-secondary mb-0">
            Se você é da equipe e precisa testar, use:
            <code>?preview=${PREVIEW_TOKEN}</code> &nbsp;|&nbsp; para limpar: <code>?preview=clear</code>.
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
    if(t <= 0){
      // chegou a hora → recarrega pra liberar a app automaticamente
      location.reload();
      return;
    }
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
