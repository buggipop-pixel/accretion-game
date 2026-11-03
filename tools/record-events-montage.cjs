// Нарезка из трёх случайных событий: Левиафан, Неделя Золотого века, бой флота с вторжением.
// Запуск: node tools/record-events-montage.cjs
// Результат: demo/accretion-events-montage.mp4
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8124;
const CDP_PORT = 9223;
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FFMPEG = process.env.FFMPEG_PATH || 'C:\\Program Files\\Lian-Li\\L-Connect 3\\x64\\ffmpeg.exe';
const FRAMES_DIR = path.join(ROOT, '.demo-montage-frames');
const PROFILE_DIR = path.join(ROOT, '.demo-montage-profile');
const OUT_DIR = path.join(ROOT, 'demo');
const OUT_FILE = path.join(OUT_DIR, 'accretion-events-montage.mp4');
const FPS = 12;
const DURATION_SEC = 16;
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

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
    throw new Error('JS: ' + (result.exceptionDetails.text || 'exception') + ' ' +
      JSON.stringify(result.exceptionDetails.exception && result.exceptionDetails.exception.description || ''));
  }
  return result.result ? result.result.value : undefined;
}

const INJECT_BASE = `(function(){
  var loreBtn = document.querySelector('.lore-btn');
  if (loreBtn) loreBtn.click();
  document.querySelectorAll('.guide-overlay, .lore-overlay').forEach(function(el){ el.remove(); });
  var tut = document.getElementById('tutorialOverlay');
  if (tut) tut.style.display = 'none';

  if (!document.getElementById('__demoStyle')) {
    var st = document.createElement('style');
    st.id = '__demoStyle';
    st.textContent = [
      '#__demoCaption{position:fixed;left:50%;bottom:150px;transform:translateX(-50%) translateY(10px);z-index:99998;pointer-events:none;text-align:center;opacity:0;transition:opacity .35s ease,transform .35s ease;background:rgba(8,5,20,.82);border:1px solid rgba(185,168,255,.45);border-radius:14px;padding:10px 22px;box-shadow:0 10px 40px rgba(0,0,0,.55);backdrop-filter:blur(6px);max-width:80vw;}',
      '#__demoCaption.show{opacity:1;transform:translateX(-50%) translateY(0);}',
      '#__demoCaption .t{font-size:16px;font-weight:800;color:#fff;letter-spacing:.01em;}',
      '#__demoCaption .s{font-size:11px;color:#b9a8ff;margin-top:2px;}',
      '#__demoFade{position:fixed;inset:0;background:#02010a;opacity:0;pointer-events:none;z-index:100000;}'
    ].join('');
    document.head.appendChild(st);
  }
  if (!document.getElementById('__demoCaption')) {
    var cap = document.createElement('div');
    cap.id = '__demoCaption';
    cap.innerHTML = '<div class="t"></div><div class="s"></div>';
    document.body.appendChild(cap);
  }
  if (!document.getElementById('__demoFade')) {
    var fade = document.createElement('div');
    fade.id = '__demoFade';
    document.body.appendChild(fade);
  }
  if (!document.getElementById('__demoCursor')) {
    var c = document.createElement('div');
    c.id = '__demoCursor';
    c.style.cssText = 'position:fixed;left:520px;top:1080px;width:38px;height:38px;border-radius:50%;border:2px solid rgba(255,255,255,.9);background:radial-gradient(circle,rgba(255,255,255,.35),rgba(255,255,255,0) 70%);box-shadow:0 0 18px rgba(185,168,255,.8);z-index:99999;pointer-events:none;transition:left .5s cubic-bezier(.22,.61,.36,1),top .5s cubic-bezier(.22,.61,.36,1),transform .12s ease;';
    document.body.appendChild(c);
  }

  window.__demoCaption = function(title, sub){
    var el = document.getElementById('__demoCaption');
    if (!el) return;
    el.querySelector('.t').textContent = title || '';
    el.querySelector('.s').textContent = sub || '';
    el.classList.add('show');
  };
  window.__demoHideCaption = function(){
    var el = document.getElementById('__demoCaption');
    if (el) el.classList.remove('show');
  };
  window.__demoFade = function(){
    var f = document.getElementById('__demoFade');
    if (!f) return;
    f.style.transition = 'none';
    f.style.opacity = '1';
    requestAnimationFrame(function(){
      f.style.transition = 'opacity .35s ease';
      f.style.opacity = '0';
    });
  };
  window.__demoCursorTo = function(x, y){
    var c = document.getElementById('__demoCursor');
    if (!c) return;
    c.style.left = (x - 19) + 'px';
    c.style.top = (y - 19) + 'px';
  };
  window.__demoCursorToButton = function(sel){
    var c = document.getElementById('__demoCursor');
    var btn = document.querySelector(sel);
    if (!c || !btn) return false;
    var r = btn.getBoundingClientRect();
    window.__demoCursorTo(r.left + r.width / 2, r.top + r.height / 2);
    return true;
  };
  window.__demoClick = function(){
    var c = document.getElementById('__demoCursor');
    if (c) { c.style.transform = 'scale(.82)'; setTimeout(function(){ c.style.transform = 'scale(1)'; }, 140); }
  };
  window.__demoReset = function(){
    document.querySelectorAll('.modal.show').forEach(function(m){ m.classList.remove('show'); });
    S.activeRandomEvent = null;
    S.activeWorldEvents = [];
    S.invasions = [];
    S.fleetActive = false;
    S.fleet = { interceptor: 0, cruiser: 0, dreadnought: 0 };
    if (typeof FLEET_VIS !== 'undefined') { FLEET_VIS.phase = 'idle'; FLEET_VIS.targetId = null; FLEET_VIS.startedAt = 0; }
    if (typeof updateEventUI === 'function') updateEventUI();
    if (typeof updateUI === 'function') updateUI();
  };

  S.stage = 'system';
  S.starType = 'G';
  S.systemType = 'single';
  S.systemName = 'Родная';
  S.planets = [
    { type: 'lava',       baseOrbitR: 1.05, orbitR: 92,  mass: 1.1, radius: 7,  forming: false, seed: 11 },
    { type: 'rocky',      baseOrbitR: 1.35, orbitR: 120, mass: 1.4, radius: 8,  forming: false, seed: 12 },
    { type: 'superEarth', baseOrbitR: 1.75, orbitR: 155, mass: 2.1, radius: 10, forming: false, seed: 13 },
    { type: 'gasGiant',   baseOrbitR: 2.30, orbitR: 205, mass: 5.0, radius: 16, forming: false, seed: 14 },
    { type: 'iceGiant',   baseOrbitR: 2.95, orbitR: 262, mass: 3.2, radius: 13, forming: false, seed: 15 },
    { type: 'rocky',      baseOrbitR: 3.60, orbitR: 320, mass: 1.8, radius: 9,  forming: false, seed: 16 }
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
  S.nightConfig = { mode: 'balanced', defenseEnabled: true, cometHours: 0, expeditionPercent: 0 };
  S.nightDefenseLevel = 5;
  S.nightDefenseExpiresAt = Date.now() + 3600000;
  S.metalCap = 1e9;
  S.stats = { comets: 0, expeditions: 0, invasionsDefeated: 0, clicks: 0, planets: 0, dailyClaims: 0 };
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
  return { stage: S.stage, planets: S.planets.length, makeShips: typeof makeShips };
})()`;

const SCENE_LEVIATHAN = `(function(){
  window.__demoReset();
  window.__demoFade();
  window.__demoCaption('1 / 3 · Космический Левиафан', 'босс дня · тапы + урон флота');
  window.__demoCursorTo(520, 1080);
  S.fleetActive = true;
  S.fleet = { interceptor: 12, cruiser: 8, dreadnought: 6 };
  S.nightDefenseLevel = 5;
  S.nightDefenseExpiresAt = Date.now() + 3600000;
  RandomEvents.fireDaily(RandomEvents.eventById('leviathan'));
  return !!S.activeRandomEvent;
})()`;

const SCENE_TAPS = `(function(){
  window.__demoCursorToButton('#evtTapBtn');
  setTimeout(function(){ window.__demoClick(); }, 250);
  setTimeout(function(){ if (typeof tapRandomEvent === 'function') tapRandomEvent(); }, 320);
  setTimeout(function(){ window.__demoClick(); if (typeof tapRandomEvent === 'function') tapRandomEvent(); }, 700);
  setTimeout(function(){ window.__demoClick(); if (typeof tapRandomEvent === 'function') tapRandomEvent(); }, 1050);
  return true;
})()`;

const SCENE_WEEKLY = `(function(){
  window.__demoReset();
  window.__demoFade();
  window.__demoCaption('2 / 3 · Неделя Золотого века', 'еженедельное убер-событие · весь доход ×2');
  window.__demoCursorTo(520, 1080);
  RandomEvents.fireWeekly(RandomEvents.eventById('week_golden_age'));
  return true;
})()`;

const SCENE_WEEKLY_CLICK = `(function(){
  window.__demoCursorToButton('#weeklyBody .stars-btn');
  setTimeout(function(){ window.__demoClick(); closeWeeklyModal(); }, 550);
  return true;
})()`;

const SCENE_BATTLE = `(function(){
  window.__demoReset();
  window.__demoFade();
  window.__demoCaption('3 / 3 · Битва с вторжением', 'флот вступает в бой с вражеской эскадрой');
  window.__demoCursorTo(560, 1080);
  S.nightDefenseLevel = 5;
  S.nightDefenseExpiresAt = Date.now() + 3600000;
  S.fleetActive = true;
  S.fleet = { interceptor: 4, cruiser: 2, dreadnought: 2 };
  S.dust = 1840000;
  S.energy = 142000;
  S.civLevel = 31;
  S.metalAmount = 8600;
  FLEET_CFG.invaderShipHp = 50;
  var inv = {
    id: 'demo-inv', tierKey: 'raid', targetType: 'system', systemIdx: 0,
    ships: makeShips(6),
    spawnedAt: Date.now(), robberyEndsAt: Date.now() + 45 * 60 * 1000,
    destructionEndsAt: Date.now() + 60 * 60 * 1000,
    hp: 200, maxHp: 200, stolen: 0, drainedEnergy: 0, drainedCiv: 0,
    defenseBroken: false, notified: false, fleetShots: []
  };
  S.invasions = [inv];
  FLEET_VIS.phase = 'fight';
  FLEET_VIS.targetId = inv.id;
  FLEET_VIS.startedAt = Date.now();
  S.zoom = 1.5; S.panX = 0; S.panY = 0;
  if (typeof toast === 'function') toast('⚔️ Вторжение', 'Флот вступает в бой');
  if (typeof updateEventUI === 'function') updateEventUI();
  return S.invasions.length;
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

    const injected = await evalJs(cdp, INJECT_BASE);
    console.log('Состояние:', JSON.stringify(injected));
    await sleep(1200);

    const startedAt = Date.now();
    const totalFrames = FPS * DURATION_SEC;
    const done = {};
    let frame = 0;

    const at = (key, seconds, fn) => {
      if (!done[key] && (frame / FPS) >= seconds) {
        done[key] = true;
        return fn();
      }
      return null;
    };

    while (frame < totalFrames) {
      const target = startedAt + (frame * 1000 / FPS);
      const wait = target - Date.now();
      if (wait > 0) await sleep(wait);
      const videoSec = frame / FPS;

      if (frame === 0 && !done.intro) {
        done.intro = true;
        await evalJs(cdp, `window.__demoCaption('СЛУЧАЙНЫЕ СОБЫТИЯ', 'ежедневные · еженедельные · мировые'); true`);
      }
      await at('leviathan', 1.1, () => evalJs(cdp, SCENE_LEVIATHAN));
      await at('taps', 3.0, () => evalJs(cdp, SCENE_TAPS));
      await at('weekly', 5.4, () => evalJs(cdp, SCENE_WEEKLY));
      await at('weeklyClick', 7.8, () => evalJs(cdp, SCENE_WEEKLY_CLICK));
      await at('battle', 10.6, () => evalJs(cdp, SCENE_BATTLE));

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

  const ffArgs = [
    '-y',
    '-framerate', String(FPS),
    '-i', path.join(FRAMES_DIR, 'frame_%04d.jpg'),
    '-f', 'lavfi', '-i', 'sine=frequency=110:sample_rate=44100:duration=' + DURATION_SEC,
    '-f', 'lavfi', '-i', 'sine=frequency=164.81:sample_rate=44100:duration=' + DURATION_SEC,
    '-filter_complex',
    '[0:v]fade=t=in:st=0:d=0.4,fade=t=out:st=' + (DURATION_SEC - 0.8) + ':d=0.8,format=yuv420p[v];' +
    '[1:a][2:a]amix=inputs=2:duration=longest,lowpass=f=500,volume=0.032,afade=t=in:st=0:d=1,afade=t=out:st=' + (DURATION_SEC - 2) + ':d=2[a]',
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
