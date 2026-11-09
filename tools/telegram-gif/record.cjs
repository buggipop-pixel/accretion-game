// Запись GIF 640x360 для Telegram — кинематографичный кадр системы + брендинг.
// Запуск:
//   node tools/telegram-gif/record.cjs --still        (только контрольные кадры)
//   node tools/telegram-gif/record.cjs                (собрать demo/accretion-telegram.gif)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8135;
const CDP_PORT = 9235;
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FFMPEG = process.env.FFMPEG_PATH || 'C:\\Program Files\\Lian-Li\\L-Connect 3\\x64\\ffmpeg.exe';
const PROFILE_DIR = path.join(ROOT, '.tg-gif-profile');
const FRAMES_DIR = path.join(ROOT, '.tg-gif-frames');
const OUT_DIR = path.join(ROOT, 'demo');
const OUT_FILE = path.join(OUT_DIR, 'accretion-telegram.gif');

const WIDTH = 640;
const HEIGHT = 360;
const FPS = 12;
const DURATION = 8;
const STILL = process.argv.includes('--still');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.ico': 'image/x-icon'
};

function insideRoot(p) { const r = path.resolve(p); return r === ROOT || r.startsWith(ROOT + path.sep); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function startStaticServer() {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.resolve(ROOT, '.' + urlPath);
    if (!insideRoot(filePath) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

async function waitForJson(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const res = await fetch(url); if (res.ok) return await res.json(); } catch (e) { /* not ready */ }
    await sleep(150);
  }
  throw new Error('CDP не ответил: ' + url);
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl); this.nextId = 0;
    this.pending = new Map(); this.handlers = new Map();
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const p = this.pending.get(msg.id); if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message || 'CDP error'));
        else p.resolve(msg.result);
      } else if (msg.method) {
        (this.handlers.get(msg.method) || []).forEach((fn) => fn(msg.params));
      }
    };
  }
  open() { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); }
  send(method, params) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  on(method, fn) { if (!this.handlers.has(method)) this.handlers.set(method, []); this.handlers.get(method).push(fn); }
  close() { try { this.ws.close(); } catch (e) {} }
}

async function evalJs(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) {
    throw new Error('JS: ' + (result.exceptionDetails.text || 'exception') + ' ' +
      JSON.stringify((result.exceptionDetails.exception && result.exceptionDetails.exception.description) || ''));
  }
  return result.result ? result.result.value : undefined;
}

// ── Проходим стартовые карточки и запускаем цикл ─────────────────────
const BOOT = `(function(){
  var lb = document.querySelector('.lore-btn');
  if (lb) lb.click();
  var ni = document.getElementById('nicknameInput');
  if (ni && !ni.value) ni.value = 'Пилот';
  try { if (typeof saveNickname === 'function' && !S.playerName) saveNickname(); } catch (e) {}
  document.querySelectorAll('.modal.show').forEach(function(m){ m.classList.remove('show'); m.style.display='none'; });
  document.querySelectorAll('.lore-overlay,.guide-overlay').forEach(function(e){ e.remove(); });
  var tut = document.getElementById('tutorialOverlay'); if (tut) tut.style.display='none';
  return { started: !!window.__gameStarted };
})()`;

// ── Сцена: красивая система, интерфейс игры скрыт, сверху наш оверлей ─
const SCENE = `(function(){
  document.querySelectorAll('.modal.show').forEach(function(m){ m.classList.remove('show'); m.style.display='none'; });
  document.querySelectorAll('.lore-overlay,.guide-overlay').forEach(function(e){ e.remove(); });
  var toasts = document.getElementById('toasts'); if (toasts) toasts.style.display='none';

  var planets = [
    { type:'rocky',      seed:12, orbitR: 50,  radius: 7,  mass: 1.2 },
    { type:'lava',       seed:11, orbitR: 70,  radius: 8,  mass: 1.4 },
    { type:'superEarth', seed:13, orbitR: 92,  radius: 10, mass: 2.1 },
    { type:'gasGiant',   seed:14, orbitR:118,  radius: 17, mass: 5.0, hasRing: true },
    { type:'iceGiant',   seed:15, orbitR:144,  radius: 13, mass: 3.2 },
    { type:'rocky',      seed:16, orbitR:168,  radius: 9,  mass: 1.7 }
  ];
  S.stage = 'system'; S.starType = 'G'; S.systemType = 'single'; S.systemName = 'Родная';
  S.planets = planets.map(function(p, i){
    return { type:p.type, baseOrbitR: p.orbitR/100, orbitR:p.orbitR, mass:p.mass, radius:p.radius,
             forming:false, seed:p.seed, hasRing: !!p.hasRing, angle:(i * 0.9) };
  });
  S.otherSystems = []; S.activeSystemIdx = 0; S.systems = 1; S.totalSystemsCreated = 1;
  S.dust = 1840000; S.dustTotal = 9200000; S.energy = 142000; S.civLevel = 31; S.metalAmount = 8600;
  S.tutorialDone = true; S.tutorialStep = 0; S.playerName = 'Пилот';
  S.panX = 42; S.panY = -16; S.zoom = 1.0; S.rotation = 0;
  S.activeRandomEvent = null; S.activeWorldEvents = []; S.invasions = [];
  // Чистим остатки сохранения: корабли миссий, следы престижа, флот.
  S.cosmicTrail = null;
  S.fleetActive = false;
  S.fleet = { interceptor: 0, cruiser: 0, dreadnought: 0 };
  if (typeof FLEET_VIS !== 'undefined') { FLEET_VIS.phase = 'idle'; FLEET_VIS.targetId = null; FLEET_VIS.startedAt = 0; }
  if (typeof MISS !== 'undefined' && MISS) { MISS.comets = []; MISS.expeditions = []; MISS.colonies = []; }
  if (typeof updateUI === 'function') updateUI();
  window.dispatchEvent(new Event('resize'));

  // Прячем игровой HUD — оставляем только космос и наш брендинг.
  if (!document.getElementById('__tgGifStyle')) {
    var st = document.createElement('style');
    st.id = '__tgGifStyle';
    st.textContent = [
      '.hud{display:none !important;}',
      'html,body{overflow:hidden !important;background:#04020c !important;}',
      'body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:5;',
      'background:radial-gradient(120% 90% at 50% 55%, rgba(4,2,12,0) 40%, rgba(4,2,12,.55) 78%, rgba(4,2,12,.9) 100%);}'
    ].join('');
    document.head.appendChild(st);
  }
  return { stage: S.stage, planets: S.planets.length, started: !!window.__gameStarted };
})()`;

// ── Брендинг-оверлей на странице ─────────────────────────────────────
const OVERLAY = `(function(){
  if (document.getElementById('__tgBrand')) return 'exists';
  var el = document.createElement('div');
  el.id = '__tgBrand';
  el.innerHTML = [
    '<div class="tg-glow"></div>',
    '<div class="tg-scrim"></div>',
    '<div class="tg-copy">',
    '  <div class="tg-label">MINI APP · TELEGRAM</div>',
    '  <div class="tg-title">АККРЕЦИЯ</div>',
    '  <div class="tg-sub">Эволюция космоса: от пыли до галактики</div>',
    '  <div class="tg-chips">',
    '    <span class="tg-chip">6 фаз</span>',
    '    <span class="tg-chip">11 прайм-объектов</span>',
    '    <span class="tg-chip">офлайн</span>',
    '  </div>',
    '</div>'
  ].join('');
  document.body.appendChild(el);
  var st = document.createElement('style');
  st.textContent = [
    '#__tgBrand{position:fixed;inset:0;pointer-events:none;z-index:10;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}',
    '#__tgBrand .tg-glow{position:absolute;inset:0;mix-blend-mode:screen;',
    'background:radial-gradient(42% 58% at 16% 84%, rgba(124,80,255,.30) 0%, rgba(124,80,255,0) 70%),',
    'radial-gradient(38% 50% at 88% 12%, rgba(90,120,255,.14) 0%, rgba(90,120,255,0) 70%);}',
    '#__tgBrand .tg-scrim{position:absolute;left:0;right:0;bottom:0;height:58%;',
    'background:linear-gradient(to top, rgba(3,1,10,.92) 0%, rgba(3,1,10,.72) 38%, rgba(3,1,10,0) 100%);}',
    '#__tgBrand .tg-copy{position:absolute;left:34px;bottom:26px;opacity:0;transform:translateY(10px);',
    'transition:opacity .7s ease, transform .7s cubic-bezier(.22,.61,.36,1);}',
    '#__tgBrand.show .tg-copy{opacity:1;transform:translateY(0);}',
    '#__tgBrand .tg-label{font-size:10px;letter-spacing:.22em;color:#9d8ce0;font-weight:700;margin-bottom:6px;}',
    '#__tgBrand .tg-title{font-size:44px;line-height:.95;font-weight:800;letter-spacing:.02em;',
    'background:linear-gradient(100deg,#ffffff 10%,#d7c8ff 55%,#9d6bff 100%);-webkit-background-clip:text;background-clip:text;color:transparent;',
    'filter:drop-shadow(0 0 18px rgba(140,95,255,.45));}',
    '#__tgBrand .tg-sub{margin-top:8px;font-size:13px;color:#cfc2ff;opacity:.92;letter-spacing:.01em;}',
    '#__tgBrand .tg-chips{margin-top:12px;display:flex;gap:6px;}',
    '#__tgBrand .tg-chip{font-size:10px;font-weight:600;color:#e6ddff;padding:4px 9px;border-radius:999px;',
    'background:rgba(124,92,255,.16);border:1px solid rgba(157,140,224,.38);backdrop-filter:blur(4px);}'
  ].join('');
  document.head.appendChild(st);
  return 'ok';
})()`;

const SHOW_BRAND = `(function(){ var el=document.getElementById('__tgBrand'); if(el) el.classList.add('show'); return true; })()`;

// Лёгкий «налёт» кинематографичности: пуш-ин камеры.
const PUSH = `(function(){ S.zoom = 0.95; return S.zoom; })()`;

async function main() {
  if (!insideRoot(FRAMES_DIR) || !insideRoot(OUT_DIR)) throw new Error('Небезопасные пути');
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const server = await startStaticServer();
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--hide-scrollbars', '--mute-audio', '--force-device-scale-factor=1',
    '--window-size=' + WIDTH + ',' + HEIGHT,
    '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + PROFILE_DIR,
    '--autoplay-policy=no-user-gesture-required', 'about:blank'
  ], { stdio: 'ignore' });

  let cdp = null;
  try {
    const list = await waitForJson('http://127.0.0.1:' + CDP_PORT + '/json/list', 15000);
    const page = list.find((t) => t.type === 'page');
    cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true,
      screenWidth: WIDTH, screenHeight: HEIGHT
    });
    const loaded = new Promise((resolve) => cdp.on('Page.loadEventFired', resolve));
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
    await Promise.race([loaded, sleep(12000)]);
    await sleep(2600);
    console.log('BOOT:', JSON.stringify(await evalJs(cdp, BOOT).catch((e) => e.message)));
    await sleep(1400);
    console.log('BOOT2:', JSON.stringify(await evalJs(cdp, BOOT).catch((e) => e.message)));
    await sleep(1000);
    console.log('SCENE:', JSON.stringify(await evalJs(cdp, SCENE)));
    console.log('OVERLAY:', JSON.stringify(await evalJs(cdp, OVERLAY)));
    await sleep(1500);
    await evalJs(cdp, PUSH);
    await sleep(600);

    const shot = async (name, type) => {
      const s = await cdp.send('Page.captureScreenshot', { format: type || 'png', fromSurface: true, quality: type === 'jpeg' ? 92 : undefined });
      const buf = Buffer.from(s.data, 'base64');
      if (name) fs.writeFileSync(path.join(FRAMES_DIR, name), buf);
      return buf;
    };

    if (STILL) {
      await evalJs(cdp, SHOW_BRAND);
      await sleep(900);
      await shot('still-a.png');
      await sleep(2600);
      await shot('still-b.png');
      console.log('Stills готовы:', FRAMES_DIR);
      return;
    }

    // ── Запись ───────────────────────────────────────────────────────
    await evalJs(cdp, SHOW_BRAND);
    const startedAt = Date.now();
    const totalFrames = FPS * DURATION;
    for (let frame = 0; frame < totalFrames; frame++) {
      const target = startedAt + (frame * 1000) / FPS;
      const wait = target - Date.now();
      if (wait > 0) await sleep(wait);
      // Медленный пуш-ин камеры: 0.95 → 1.14 за весь клип
      const zoom = 0.95 + (0.19 * frame) / totalFrames;
      await evalJs(cdp, `(function(){ S.zoom = ${zoom.toFixed(4)}; return true; })()`);
      const buf = await shot(null, 'jpeg');
      fs.writeFileSync(path.join(FRAMES_DIR, 'frame_' + String(frame).padStart(4, '0') + '.jpg'), buf);
      if (frame % 12 === 0) console.log('frame', frame, '/', totalFrames);
    }
  } finally {
    if (cdp) cdp.close();
    try { chrome.kill(); } catch (e) {}
    server.close();
  }

  if (STILL) return;
  await sleep(300);

  // ── GIF: палитра + сглаживание + фейды ─────────────────────────────
  const fadeOutStart = Math.max(0, DURATION - 0.85);
  const vf = [
    'fps=' + FPS,
    'scale=' + WIDTH + ':' + HEIGHT + ':flags=lanczos',
    // Сначала в yuv420p: у JPEG полный диапазон, иначе fade даёт белые кадры.
    'format=yuv420p',
    'fade=t=in:st=0:d=0.45',
    'fade=t=out:st=' + fadeOutStart.toFixed(2) + ':d=0.8',
    'split[a][b];[a]palettegen=max_colors=192:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle'
  ].join(',');
  const args = [
    '-y', '-hide_banner', '-loglevel', 'warning',
    '-framerate', String(FPS),
    '-i', path.join(FRAMES_DIR, 'frame_%04d.jpg'),
    '-vf', vf,
    '-loop', '0',
    OUT_FILE
  ];
  console.log('ffmpeg...', args.join(' '));
  const enc = spawn(FFMPEG, args, { stdio: 'inherit' });
  const code = await new Promise((resolve) => enc.on('close', resolve));
  if (code !== 0) throw new Error('ffmpeg завершился с кодом ' + code);
  const stat = fs.statSync(OUT_FILE);
  console.log('Готово:', OUT_FILE, (stat.size / 1048576).toFixed(2) + ' МБ');
}

main().catch((err) => { console.error('Ошибка:', err && err.stack || err); process.exit(1); });
