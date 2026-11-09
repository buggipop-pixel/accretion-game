// Быстрый зонд: один кадр игры в 640x360 из разных состояний.
// Запуск: node tools/telegram-gif/probe.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8134;
const CDP_PORT = 9234;
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE_DIR = path.join(ROOT, '.tg-gif-profile');
const OUT_DIR = path.join(ROOT, 'tmp', 'probe');

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

const WIDTH = 640, HEIGHT = 360;

// Проходим стартовые карточки (лор, ник, дневная награда) и запускаем цикл.
const BOOT = `(function(){
  var lb = document.querySelector('.lore-btn');
  if (lb) lb.click();
  var ni = document.getElementById('nicknameInput');
  if (ni && !ni.value) ni.value = 'Пилот';
  try { if (typeof saveNickname === 'function' && !S.playerName) saveNickname(); } catch (e) {}
  document.querySelectorAll('.modal.show').forEach(function(m){ m.classList.remove('show'); m.style.display='none'; });
  document.querySelectorAll('.lore-overlay,.guide-overlay').forEach(function(e){ e.remove(); });
  var tut = document.getElementById('tutorialOverlay'); if (tut) tut.style.display='none';
  var toasts = document.getElementById('toasts'); if (toasts) toasts.style.display='none';
  return { started: !!window.__gameStarted };
})()`;

const SETUP = `(function(){
  document.querySelectorAll('.modal.show').forEach(function(m){ m.classList.remove('show'); m.style.display='none'; });
  document.querySelectorAll('.lore-overlay,.guide-overlay').forEach(function(e){ e.remove(); });
  var toasts = document.getElementById('toasts'); if (toasts) toasts.style.display='none';
  var planets = [
    { type:'lava',       seed:11 },
    { type:'rocky',      seed:12 },
    { type:'superEarth', seed:13 },
    { type:'gasGiant',   seed:14 },
    { type:'iceGiant',   seed:15 },
    { type:'rocky',      seed:16 }
  ];
  S.stage = 'system'; S.starType = 'G'; S.systemType = 'single'; S.systemName = 'Родная';
  S.planets = planets.map(function(p, i){
    return { type:p.type, baseOrbitR:1.0 + i*0.5, orbitR:92 + i*45, mass:1 + i, radius:7 + i*2,
             forming:false, seed:p.seed, angle:(i * 1.2) };
  });
  S.otherSystems = []; S.activeSystemIdx = 0; S.systems = 1; S.totalSystemsCreated = 1;
  S.dust = 1840000; S.dustTotal = 9200000; S.energy = 142000; S.civLevel = 31; S.metalAmount = 8600;
  S.tutorialDone = true; S.tutorialStep = 0; S.playerName = 'Пилот';
  S.panX = 0; S.panY = 0; S.zoom = 1; S.rotation = 0;
  S.activeRandomEvent = null; S.activeWorldEvents = []; S.invasions = [];
  if (typeof updateUI === 'function') updateUI();
  window.dispatchEvent(new Event('resize'));
  return { stage: S.stage, planets: S.planets.length, started: !!window.__gameStarted };
})()`;

async function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
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
    await sleep(1200);

    console.log('SETUP:', JSON.stringify(await evalJs(cdp, SETUP)));
    await sleep(1500);

    const shot = async (name) => {
      const s = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      fs.writeFileSync(path.join(OUT_DIR, name + '.png'), Buffer.from(s.data, 'base64'));
      console.log('saved', name, s.data.length);
    };

    await shot('01-system');

    // галактика
    await evalJs(cdp, `(function(){
      S.stage = 'galaxy';
      S.systems = 60; S.totalSystemsCreated = 60;
      S.galaxies = 3; S.galaxyForm = 'spiral'; S.galaxyZoomLevel = 4;
      S.zoom = 1; S.panX = 0; S.panY = 0;
      if (typeof updateUI === 'function') updateUI();
      window.dispatchEvent(new Event('resize'));
      return S.stage;
    })()`);
    await sleep(2500);
    await shot('02-galaxy');

    // приближение
    await evalJs(cdp, `(function(){ S.zoom = 2.4; if (typeof updateUI === 'function') updateUI(); window.dispatchEvent(new Event('resize')); return S.zoom; })()`);
    await sleep(1600);
    await shot('03-galaxy-zoom');

    // карточка события-босса
    await evalJs(cdp, `(function(){ S.stage='system'; S.zoom=1; if (typeof RandomEvents !== 'undefined' && RandomEvents.fireDaily) RandomEvents.fireDaily(); else if (typeof triggerRandomEvent === 'function') triggerRandomEvent(); if (typeof updateUI==='function') updateUI(); window.dispatchEvent(new Event('resize')); return true; })()`);
    await sleep(1800);
    await shot('04-event');
  } finally {
    if (cdp) cdp.close();
    try { chrome.kill(); } catch (e) {}
    server.close();
  }
}

main().catch((err) => { console.error('Ошибка:', err && err.stack || err); process.exit(1); });
