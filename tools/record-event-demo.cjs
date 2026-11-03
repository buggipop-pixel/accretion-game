// Запись короткого демо-ролика случайного события через headless Chrome.
// Запуск: node tools/record-event-demo.cjs
// Результат: demo/accretion-weekly-event.mp4
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8123;
const CDP_PORT = 9222;
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FFMPEG = process.env.FFMPEG_PATH || 'C:\\Program Files\\Lian-Li\\L-Connect 3\\x64\\ffmpeg.exe';
const FRAMES_DIR = path.join(ROOT, '.demo-frames');
const PROFILE_DIR = path.join(ROOT, '.demo-chrome-profile');
const OUT_DIR = path.join(ROOT, 'demo');
const OUT_FILE = path.join(OUT_DIR, 'accretion-weekly-event.mp4');
const FPS = 12;
const DURATION_SEC = 8;
const WIDTH = 720;
const HEIGHT = 1280;

function insideRoot(p) {
  const r = path.resolve(p);
  return r === ROOT || r.startsWith(ROOT + path.sep);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon'
};

function startStaticServer() {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.resolve(ROOT, '.' + urlPath);
    if (!insideRoot(filePath) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForJson(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (e) { /* not ready */ }
    await sleep(150);
  }
  throw new Error('CDP не ответил: ' + url);
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message || 'CDP error'));
        else p.resolve(msg.result);
      } else if (msg.method) {
        const list = this.handlers.get(msg.method) || [];
        for (const fn of list) fn(msg.params);
      }
    };
  }
  open() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }
  send(method, params) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
  close() { try { this.ws.close(); } catch (e) {} }
}

async function evalJs(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error('JS: ' + (result.exceptionDetails.text || 'exception') + ' ' + JSON.stringify(result.exceptionDetails.exception && result.exceptionDetails.exception.description || ''));
  }
  return result.result ? result.result.value : undefined;
}

const INJECT_STATE = `(function(){
  // Закрываем обучение/гид, чтобы сразу видеть игру.
  var loreBtn = document.querySelector('.lore-btn');
  if (loreBtn) loreBtn.click();
  document.querySelectorAll('.guide-overlay, .lore-overlay').forEach(function(el){ el.remove(); });
  var tut = document.getElementById('tutorialOverlay');
  if (tut) tut.style.display = 'none';

  S.stage = 'system';
  S.starType = 'G';
  S.systemType = 'single';
  S.systemName = 'Родная';
  S.planets = [
    { type: 'lava',       baseOrbitR: 1.05, orbitR: 92,  mass: 1.1, radius: 7,  forming: false },
    { type: 'rocky',      baseOrbitR: 1.35, orbitR: 120, mass: 1.4, radius: 8,  forming: false },
    { type: 'superEarth', baseOrbitR: 1.75, orbitR: 155, mass: 2.1, radius: 10, forming: false },
    { type: 'gasGiant',   baseOrbitR: 2.30, orbitR: 205, mass: 5.0, radius: 16, forming: false },
    { type: 'iceGiant',   baseOrbitR: 2.95, orbitR: 262, mass: 3.2, radius: 13, forming: false },
    { type: 'rocky',      baseOrbitR: 3.60, orbitR: 320, mass: 1.8, radius: 9,  forming: false }
  ];
  S.otherSystems = [];
  S.activeSystemIdx = 0;
  S.systems = 1;
  S.totalSystemsCreated = 1;
  S.primeSystem = null;
  S.systemIncomeBonus = 0;
  S.dust = 1840000;
  S.dustTotal = 9200000;
  S.energy = 142000;
  S.civLevel = 31;
  S.metalAmount = 8600;
  S.storageLevels = { dust: 4, energy: 3, civ: 3 };
  S.storageProgress = { dust: 0, energy: 0, civ: 0 };
  S.boosters = { incomeUntil: 0 };
  S.invasionDebuff = null;
  S.invasions = [];
  S.activeWorldEvents = [];
  S.activeRandomEvent = null;
  S.lastDailyEventDay = RandomEvents.dayIndex();
  S.lastWeeklyEventWeek = RandomEvents.weekIndex();
  S.dailyReward = { day: 2, lastClaimed: Date.now() };
  S.firstNightShieldUsed = true;
  S.shieldUntil = Date.now() + 86400000;
  S.tutorialStep = 0;
  S.tutorialDone = true;
  if (!S.seenLore) S.seenLore = [];
  ['cloud','system','gameguide'].forEach(function(id){ if (S.seenLore.indexOf(id) === -1) S.seenLore.push(id); });
  S.settings = { brightness: 1, sound: false };
  S.panX = 0; S.panY = 0; S.zoom = 1; S.rotation = 0; S.tiltX = 0; S.tiltY = 0;
  document.querySelectorAll('.modal.show').forEach(function(m){ m.classList.remove('show'); });
  if (typeof updateUI === 'function') updateUI();
  if (typeof updateSystemSwitcher === 'function') updateSystemSwitcher();
  if (typeof updateQuestPanel === 'function') updateQuestPanel();
  if (typeof renderMissionButtons === 'function') renderMissionButtons();
  window.dispatchEvent(new Event('resize'));

  // Фейковый курсор для «живого» клика по кнопке.
  var c = document.getElementById('__demoCursor');
  if (!c) {
    c = document.createElement('div');
    c.id = '__demoCursor';
    c.style.cssText = 'position:fixed;left:520px;top:1080px;width:38px;height:38px;border-radius:50%;border:2px solid rgba(255,255,255,.9);background:radial-gradient(circle,rgba(255,255,255,.35),rgba(255,255,255,0) 70%);box-shadow:0 0 18px rgba(185,168,255,.8);z-index:99999;pointer-events:none;transition:left .5s cubic-bezier(.22,.61,.36,1),top .5s cubic-bezier(.22,.61,.36,1),transform .12s ease;';
    document.body.appendChild(c);
  }
  return { stage: S.stage, planets: S.planets.length, dust: S.dust };
})()`;

const MOVE_CURSOR_TO_BUTTON = `(function(){
  var c = document.getElementById('__demoCursor');
  var btn = document.querySelector('#weeklyBody .stars-btn');
  if (!c || !btn) return false;
  var r = btn.getBoundingClientRect();
  c.style.left = (r.left + r.width / 2 - 19) + 'px';
  c.style.top = (r.top + r.height / 2 - 19) + 'px';
  return true;
})()`;

const CLICK_EFFECT = `(function(){
  var c = document.getElementById('__demoCursor');
  if (c) { c.style.transform = 'scale(.82)'; setTimeout(function(){ c.style.transform = 'scale(1)'; }, 140); }
  return true;
})()`;

async function main() {
  if (!insideRoot(FRAMES_DIR) || !insideRoot(PROFILE_DIR) || !insideRoot(OUT_DIR)) {
    throw new Error('Небезопасные пути для очистки');
  }
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const server = await startStaticServer();
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--mute-audio',
    '--force-device-scale-factor=1',
    '--window-size=' + WIDTH + ',' + HEIGHT,
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + PROFILE_DIR,
    '--host-resolver-rules=MAP cdn.jsdelivr.net ~NOTFOUND, MAP unpkg.com ~NOTFOUND',
    '--autoplay-policy=no-user-gesture-required',
    'about:blank'
  ], { stdio: 'ignore' });

  let cdp = null;
  try {
    const list = await waitForJson('http://127.0.0.1:' + CDP_PORT + '/json/list', 15000);
    const page = list.find((t) => t.type === 'page');
    if (!page) throw new Error('Не найден page target');
    cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: true,
      screenWidth: WIDTH, screenHeight: HEIGHT
    });

    const loaded = new Promise((resolve) => cdp.on('Page.loadEventFired', resolve));
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
    await Promise.race([loaded, sleep(12000)]);
    await sleep(1800);

    await evalJs(cdp, INJECT_STATE);
    await sleep(1200);

    fs.writeFileSync(path.join(FRAMES_DIR, 'meta.json'), JSON.stringify({ fps: FPS, width: WIDTH, height: HEIGHT }));

    let frame = 0;
    const startedAt = Date.now();
    const totalFrames = FPS * DURATION_SEC;
    let closed = false;
    let moved = false;

    while (frame < totalFrames) {
      const target = startedAt + (frame * 1000 / FPS);
      const wait = target - Date.now();
      if (wait > 0) await sleep(wait);
      const elapsed = (Date.now() - startedAt) / 1000;

      // 1.0s — событие недели появляется
      if (!moved && elapsed >= 1.0) {
        moved = true;
        await evalJs(cdp, `(function(){ RandomEvents.fireWeekly(RandomEvents.eventById('week_golden_age')); return true; })()`);
      }
      // 4.8s — курсор идёт к кнопке «Принять вызов»
      if (moved && !closed && elapsed >= 4.8) {
        await evalJs(cdp, MOVE_CURSOR_TO_BUTTON);
      }
      // 5.4s — клик и закрытие модалки
      if (moved && !closed && elapsed >= 5.4) {
        closed = true;
        await evalJs(cdp, CLICK_EFFECT);
        await evalJs(cdp, 'closeWeeklyModal(); true');
      }

      const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88, fromSurface: true });
      fs.writeFileSync(path.join(FRAMES_DIR, 'frame_' + String(frame).padStart(4, '0') + '.jpg'), Buffer.from(shot.data, 'base64'));
      frame++;
    }

    console.log('Кадров записано:', frame);
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
    server.close();
    await sleep(500);
  }

  // Кодирование MP4 + лёгкий эмбиент.
  const filter = 'fade=t=in:st=0:d=0.5,fade=t=out:st=' + (DURATION_SEC - 0.8) + ':d=0.8';
  const ffArgs = [
    '-y',
    '-framerate', String(FPS),
    '-i', path.join(FRAMES_DIR, 'frame_%04d.jpg'),
    '-f', 'lavfi', '-i', 'sine=frequency=110:sample_rate=44100:duration=' + DURATION_SEC,
    '-f', 'lavfi', '-i', 'sine=frequency=164.81:sample_rate=44100:duration=' + DURATION_SEC,
    '-filter_complex',
    '[0:v]' + filter + ',format=yuv420p[v];' +
    '[1:a][2:a]amix=inputs=2:duration=longest,lowpass=f=500,volume=0.035,afade=t=in:st=0:d=1,afade=t=out:st=' + (DURATION_SEC - 2) + ':d=2[a]',
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-c:a', 'aac', '-b:a', '96k',
    '-movflags', '+faststart',
    '-shortest',
    OUT_FILE
  ];
  const enc = spawn(FFMPEG, ffArgs, { stdio: 'inherit' });
  const code = await new Promise((resolve) => enc.on('close', resolve));
  if (code !== 0) throw new Error('ffmpeg завершился с кодом ' + code);
  console.log('Готово:', OUT_FILE);
}

main().catch((err) => {
  console.error('Ошибка записи:', err && err.stack || err);
  process.exit(1);
});
