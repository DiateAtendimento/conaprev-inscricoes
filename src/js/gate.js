import { EVENTO } from './config.js';

/** =============================
 *  Config do “portão” (gate)
 *  ============================= */
const MAINTENANCE_MODE = true;               // enquanto true, todos veem o gate
const RELEASE_AT = EVENTO.INICIO;            // ou defina data/hora específica
const PREVIEW_TOKEN = 'CONAPREV83_DEV';      // use ?preview=CONAPREV83_DEV para liberar

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
  mountGate();
} else {
  document.getElementById('app')?.classList.remove('d-none');
  import('./main.js');
}

/* ===== Render do Gate (tema preto + logo MPS central) ===== */
function mountGate(){
  const root = document.getElementById('gate-root');
  root.innerHTML = `
    <section class="gate-wrap">
      <header class="gate-header">
        <img src="/imagens/logo-mps.svg" alt="Ministério da Previdência Social" class="gate-logo" />
      </header>

      <main class="gate-main">
        <div class="gate-card">
          <div class="gate-left">
            <h1>Nosso website está em construção</h1>
            <p>Estamos preparando o sistema de inscrições da 83ª reunião do CONAPREV.
               Volte no horário abaixo para realizar sua inscrição.</p>
          </div>

          <div class="gate-right">
            <div class="gate-count" role="timer" aria-live="polite">
              <div class="gate-box">
                <div id="gDays" class="gate-num">07</div>
                <div class="gate-lab">Dias</div>
              </div>
              <div class="gate-sep">:</div>
              <div class="gate-box">
                <div id="gHours" class="gate-num">07</div>
                <div class="gate-lab">Horas</div>
              </div>
              <div class="gate-sep">:</div>
              <div class="gate-box">
                <div id="gMinutes" class="gate-num">09</div>
                <div class="gate-lab">Minutos</div>
              </div>
              <div class="gate-sep">:</div>
              <div class="gate-box">
                <div id="gSeconds" class="gate-num">52</div>
                <div class="gate-lab">Segundos</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </section>
  `;

  // Timer
  const dEl = document.getElementById('gDays');
  const hEl = document.getElementById('gHours');
  const mEl = document.getElementById('gMinutes');
  const sEl = document.getElementById('gSeconds');
  const target = new Date(RELEASE_AT).getTime();

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
