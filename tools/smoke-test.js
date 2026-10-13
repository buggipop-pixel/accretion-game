// Временный smoke-тест: загружает все модули игры по порядку (как браузер)
// и прогоняет игровой цикл, проверяя отсутствие ReferenceError/TypeError.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);

function makeClassList() {
  const set = new Set();
  return {
    add: c => set.add(c), remove: c => set.delete(c),
    contains: c => set.has(c),
    toggle: c => (set.has(c) ? set.delete(c) : set.add(c)),
    _set: set,
  };
}

let ctxCalls = 0;
function makeCtx() {
  const store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => { ctxCalls++; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

const elements = new Map();
function makeElement(id) {
  const target = {
    id,
    dataset: {}, style: {},
    classList: makeClassList(),
    clientWidth: 800, clientHeight: 600,
    width: 800, height: 600,
    innerHTML: '', textContent: '', value: '',
    disabled: false, title: '',
  };
  const el = new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'getContext') return () => makeCtx();
      if (k === 'getBoundingClientRect') return () => ({ left: 0, top: 0, width: 800, height: 600 });
      if (k === 'querySelector') return () => makeElement(id + ' > child');
      if (k === 'querySelectorAll') return () => [];
      if (k === 'closest') return () => null;
      if (k === 'animate') return () => ({ onfinish: null });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return el;
}

const documentStub = {
  readyState: 'complete',
  hidden: false,
  body: makeElement('body'),
  documentElement: makeElement('html'),
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  },
  querySelector(sel) { return makeElement(sel); },
  querySelectorAll() { return []; },
  createElement(tag) { return makeElement(tag); },
  addEventListener() {},
};

let rafCallback = null;
const store = new Map();

const sandbox = {
  console,
  document: documentStub,
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  },
  performance: { now: () => Date.now() },
  requestAnimationFrame: cb => { rafCallback = cb; return 1; },
  cancelAnimationFrame: () => {},
  setTimeout: (fn, ms) => setTimeout(fn, 0),
  clearTimeout,
  setInterval: () => 0,
  clearInterval: () => {},
  Math, Date, JSON, Object, Array, Number, String, Boolean, isNaN, parseInt, parseFloat,
  Uint8ClampedArray, Map, Set, Promise, Infinity, NaN, undefined,
  prompt: () => null,
  confirm: () => false,
  alert: () => {},
  addEventListener() {},
  innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const context = vm.createContext(sandbox);

let failed = false;
function step(name, fn) {
  try {
    const r = fn();
    console.log('OK   ' + name + (r !== undefined ? ' → ' + r : ''));
  } catch (e) {
    failed = true;
    console.log('FAIL ' + name + ' → ' + e.constructor.name + ': ' + e.message);
    console.log('     ' + String(e.stack).split('\n')[1].trim());
  }
}

// ─── Загрузка модулей в порядке index.html ───
console.log('Скрипты: ' + scripts.join(' → '));
const sources = scripts.map(s => fs.readFileSync(path.join(ROOT, s), 'utf8'));
step('загрузка всех модулей', () => {
  // Собираем в один скрипт: в браузере classic-скрипты делят одно глобальное
  // лексическое окружение, поэтому const из config.js виден в missions.js.
  const bundle = sources.map((src, i) => '/* === ' + scripts[i] + ' === */\n' + src).join('\n;\n');
  vm.runInContext(bundle, context, { filename: 'bundle.js' });
  return 'ok';
});

const S = sandbox.S;
step('S создан', () => typeof S === 'object' && S !== null);
step('MISSIONS_CFG определён', () => typeof sandbox.MISSIONS_CFG === 'object');
step('STORAGE_CFG определён', () => typeof sandbox.STORAGE_CFG === 'object');
step('престиж подключён (initPrestige)', () => typeof sandbox.initPrestige === 'function');
step('вторжения подключены (tickInvasions)', () => typeof sandbox.tickInvasions === 'function');

// ─── Готовим «среднюю» систему ───
step('подготовка системы (8 планет, G, single)', () => {
  S.stage = 'system';
  S.starType = 'G';
  S.systemType = 'single';
  const sys = sandbox.generateRandomSystem({ isColony: false });
  S.planets = sys.planets;
  while (S.planets.length < 8) S.planets.push(sys.planets[0]);
  S.planets.forEach(p => { p.forming = false; });
  return S.planets.length + ' планет';
});

// ─── БЛОКЕР 1: падение цикла на цив. 6 ───
step('renderMissionButtons при civLevel = 6.5 (был краш)', () => {
  S.civLevel = 6.5;
  S.energy = 1e9;
  sandbox.renderMissionButtons();
  return 'без исключений';
});
step('canLaunchExpedition()', () => JSON.stringify(sandbox.canLaunchExpedition()));
step('launchExpedition()', () => String(sandbox.launchExpedition()));
step('updateMissions() по завершении полёта', () => {
  sandbox.MISS.expeditions.forEach(e => { e.startAt = Date.now() - e.flightTime - 1000; });
  sandbox.updateMissions();
  return 'полётов осталось: ' + sandbox.MISS.expeditions.length;
});

// ─── БЛОКЕР 1б: кометы ───
step('комета: openCometDialog()', () => {
  S.dust = 5000000;
  sandbox.openCometDialog();
  return 'модалка построена';
});
step('комета: launchComet(0.4)', () => String(sandbox.launchComet(0.4)));
step('комета: награда через updateMissions()', () => {
  const before = S.dust;
  sandbox.MISS.comets.forEach(c => { c.fail = false; c.startAt = Date.now() - c.flightTime - 1000; });
  sandbox.updateMissions();
  return 'пыль: ' + Math.round(before) + ' → ' + Math.round(S.dust);
});

// ─── БЛОКЕР 2: вторжения ───
step('tickInvasions() + спавн вторжения', () => {
  let spawned = 0;
  for (let i = 0; i < 4000 && spawned === 0; i++) {
    S.lastInvasionCheck = Date.now() - 60 * 60 * 1000; // час назад → шлюз открыт
    sandbox.tickInvasions(1);
    spawned = (S.invasions || []).length;
  }
  return 'вторжений: ' + spawned;
});
step('isPlanetInvaded() работает', () => String(typeof sandbox.isPlanetInvaded === 'function' && sandbox.isPlanetInvaded(S.planets[0])));
step('tryHitInvasionShip() не падает', () => String(sandbox.tryHitInvasionShip(400, 300)));
step('drawInvasions() не падает', () => { sandbox.drawInvasions(makeCtx(), 1); return 'ok'; });

// ─── Игровой цикл ───
step('300 кадров главного цикла', () => {
  rafCallback = null;
  sandbox.start();
  let frames = 0;
  for (let i = 0; i < 300; i++) {
    const cb = rafCallback;
    rafCallback = null;
    if (!cb) break;
    cb(1000 + i * 16);
    frames++;
  }
  return frames + ' кадров отрисовано';
});

// ─── Хранилище ───
step('капы хранилища', () => {
  S.storageLevels = { dust: 3, energy: 2, civ: 2 };
  return 'dust=' + sandbox.getResourceCap('dust') + ' energy=' + sandbox.getResourceCap('energy') + ' civ=' + Math.round(sandbox.getResourceCap('civ'));
});
step('модалка апгрейда хранилища', () => {
  S.dust = 1e12; S.energy = 1e12; S.civLevel = 1000;
  ['dust', 'energy', 'civ'].forEach(r => { sandbox.openStorageModal(r); });
  return 'ok';
});
step('вкидывание пыли: +10%, затем всё → уровень', () => {
  S.storageLevels = { dust: 1, energy: 1, civ: 1 };
  S.storageProgress = { dust: 0, energy: 0, civ: 0 };
  S.dust = 1e6;
  sandbox.pourStorage('dust', 0.1);
  const afterTen = S.storageProgress.dust;
  sandbox.pourStorage('dust', 'max');
  return 'после +10%: ' + afterTen + ', уровень: ' + S.storageLevels.dust +
         ', прогресс: ' + S.storageProgress.dust;
});
step('цена системы укладывается в кап (30 мин дохода)', () => {
  S.stage = 'galaxy'; S.systems = 3;
  S.storageLevels = { dust: 1, energy: 1, civ: 1 };
  const cost = sandbox.systemCost(S.systems - 1);
  const cap = sandbox.getResourceCap('dust');
  return 'цена=' + cost + ' кап=' + cap + ' → ' + (cap >= cost ? 'достижимо ✓' : 'ТУПИК ✗');
});
step('цели фаз достижимы с апгрейдами хранилища', () => {
  S.stage = 'protostar'; S.planets = [];
  S.storageLevels = { dust: 2, energy: 1, civ: 1 };
  const cap2 = sandbox.getResourceCap('dust');
  return 'цель фазы III = 200000, кап ур.2 = ' + cap2 + ' → ' + (cap2 >= 200000 ? '✓' : '✗');
});

// ─── Престиж ───
step('checkPrestigeAvailability при 5 системах', () => {
  S.systems = 5; S.prestigeLevel = 0;
  return String(sandbox.checkPrestigeAvailability());
});
step('лестница престижа из PRESTIGE_CFG', () => String(sandbox.prestigeRequirements()));
step('performSupernova(1) — полный сброс', () => {
  S.otherSystems = [null, { name: 'X', starType: 'G', systemType: 'single', planets: [] }];
  S.activeSystemIdx = 1;
  S.stage = 'galaxy';
  S.starType = 'G'; S.systemType = 'binary';
  S.storageLevels = { dust: 3, energy: 2, civ: 2 };
  S.metalAmount = 1000;
  sandbox.MISS.comets.push({ id: 'x', startAt: Date.now(), flightTime: 1, reward: 1, fail: false, size: 0.4 });
  S.invasions = [{ id: 'i', planetSeed: 1, ships: [], spawnedAt: 0 }];
  sandbox.performSupernova(1);
  return 'stage=' + S.stage + ' star=' + S.starType + ' sysType=' + S.systemType +
         ' systems=' + S.systems + ' other=' + S.otherSystems.length +
         ' activeIdx=' + S.activeSystemIdx + ' galaxies=' + S.galaxies +
         ' mult=' + S.galaxyMultiplier + ' form=' + S.galaxyForm +
         ' comets=' + sandbox.MISS.comets.length + ' invasions=' + S.invasions.length +
         ' storage=' + JSON.stringify(S.storageLevels) + ' metals=' + S.metalAmount;
});
step('галактический вид: все 4 формы дают координаты', () => {
  S.galaxyForm = 'spiral';
  const out = [];
  ['spiral', 'elliptical', 'irregular', 'ring'].forEach(f => {
    S.galaxyForm = f;
    const p = sandbox.galaxySystemPos(0, 6, 1);
    out.push(f + '=' + Math.round(p.x) + ',' + Math.round(p.y));
  });
  S.galaxyForm = 'spiral';
  return out.join(' ');
});

// ─── Сохранение/загрузка ───
step('save → load (персистентность)', () => {
  S.prestigeLevel = 3; S.galaxies = 4; S.galaxyMultiplier = 8; S.galaxyForm = 'ring';
  S.invasions = [{ id: 1, planetSeed: 42, ships: [], spawnedAt: 0, robberyEndsAt: 0, destructionEndsAt: 0, hp: 100, stolen: 0 }];
  sandbox.MISS.lastCometAt = 12345;
  sandbox.saveGame();
  S.prestigeLevel = 0; S.galaxies = 1; S.galaxyMultiplier = 1; S.invasions = [];
  sandbox.MISS.lastCometAt = 0;
  sandbox.loadGame();
  return 'prestige=' + S.prestigeLevel + ' galaxies=' + S.galaxies + ' mult=' + S.galaxyMultiplier +
         ' form=' + S.galaxyForm + ' invasions=' + S.invasions.length + ' lastCometAt=' + sandbox.MISS.lastCometAt;
});

step('металлы накапливаются в цикле', () => {
  S.stage = 'system'; S.starType = 'G'; S.systemType = 'single';
  S.planets = [{
    type: 'lava', forming: false, orbitR: 120, baseOrbitR: 120,
    angle: 0, speed: 0.1, seed: 999, mass: 1.5, diameter: 0.9, moons: [], precession: 0,
  }];
  S.metalAmount = 0;
  let t = 100000;
  for (let i = 0; i < 60; i++) {
    const cb = rafCallback;
    rafCallback = null;
    if (!cb) break;
    t += 16;
    cb(t);
  }
  return 'металлы за ~1 сек: ' + S.metalAmount.toFixed(2) + ' (ожидается ~0.5)';
});

step('панель квестов собирается', () => {
  const panel = sandbox.document.getElementById('questsPanel');
  panel.classList.add('open');
  sandbox.updateQuestPanel();
  return panel.innerHTML.length > 0
    ? 'HTML собран (' + panel.innerHTML.length + ' символов)'
    : 'пусто';
});

// ─── Баланс хранилища: каждый уровень дороже ───
step('стоимость апгрейдов растёт по уровням', () => {
  const caps = [1, 2, 3, 4, 5, 6].map(l => sandbox.STORAGE_CFG.getDustFlatCap(l));
  const costs = [1, 2, 3, 4, 5, 6].map(l => sandbox.STORAGE_CFG.getUpgradeCost('dust', l));
  const shares = costs.map((c, i) => (c / caps[i]).toFixed(2));
  const ok = costs.every((c, i) => c <= caps[i]) &&
             shares.every((s, i) => i === 0 || Number(s) > Number(shares[i - 1]));
  return 'доля капа: ' + shares.join(' → ') + (ok ? ' ✓ строго сложнее' : ' ✗ не монотонно');
});
step('апгрейды энергии/цивилизации влезают в кап пыли', () => {
  const out = [];
  let ok = true;
  for (let l = 1; l <= 6; l++) {
    const maxDustCap = sandbox.STORAGE_CFG.getDustFlatCap(7);
    const e = sandbox.STORAGE_CFG.getUpgradeCost('energy', l);
    const c = sandbox.STORAGE_CFG.getUpgradeCost('civ', l);
    if (e > maxDustCap || c > maxDustCap) ok = false;
    out.push('ур.' + l + ': ⚡' + e.toExponential(1) + ' 🧬' + c.toExponential(1));
  }
  return out.join(' | ') + (ok ? ' ✓' : ' ✗');
});

// ─── Мини-игра assemble: раскладка и слияния ───
step('шары стоят на месте и не сливаются сами', () => {
  sandbox.startMinigame('assemble', () => {});
  const before = sandbox.MG.fieldParticles.length;
  let minDist = Infinity;
  const ps = sandbox.MG.fieldParticles;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      minDist = Math.min(minDist, Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y));
    }
    if (ps[i].vx !== 0 || ps[i].vy !== 0) return '✗ у шара ненулевая скорость';
  }
  for (let i = 0; i < 180; i++) sandbox.updateMinigame(0.016, i * 0.016);
  const after = sandbox.MG.fieldParticles.length;
  sandbox.endMinigame(false);
  return before + ' шаров, мин. дистанция ' + minDist.toFixed(0) + ' → через 180 кадров ' +
         after + (before === after ? ' ✓ не сливаются' : ' ✗ слились сами');
});
step('Земля: путь 1 — четыре одиночных разных цвета', () => {
  sandbox.startMinigame('assemble', () => {});
  sandbox.MG.fieldParticles = ['ice', 'lava', 'stone', 'gas'].map((c, i) => ({
    x: 0, y: 0, vx: 0, vy: 0, r: 18, colors: [c], mass: 1, fixed: false,
  }));
  for (let i = 0; i < 6; i++) sandbox.updateMinigame(0.016, i * 0.016);
  const res = sandbox.MG.result;
  sandbox.endMinigame(false);
  return 'result=' + res + (res === 'superEarth' ? ' ✓ Земля' : ' ✗');
});
step('Земля: путь 2 — два двойных шара (красный+синий, жёлтый+зелёный)', () => {
  sandbox.startMinigame('assemble', () => {});
  sandbox.MG.fieldParticles = [
    { x: -20, y: 0, vx: 0, vy: 0, r: 24, colors: ['lava', 'ice'], mass: 2, fixed: false },
    { x: 20, y: 0, vx: 0, vy: 0, r: 24, colors: ['gas', 'stone'], mass: 2, fixed: false },
  ];
  sandbox.updateMinigame(0.016, 1);
  const res = sandbox.MG.result;
  const colors = sandbox.MG.fieldParticles[0] ? sandbox.MG.fieldParticles[0].colors.join('+') : '-';
  sandbox.endMinigame(false);
  return 'result=' + res + ' (цвета: ' + colors + ')' + (res === 'superEarth' ? ' ✓ Земля' : ' ✗');
});
step('Лава-планета: 4 одинаковых шара', () => {
  sandbox.startMinigame('assemble', () => {});
  sandbox.MG.fieldParticles = [0, 1, 2, 3].map(() => ({
    x: 0, y: 0, vx: 0, vy: 0, r: 18, colors: ['lava'], mass: 1, fixed: false,
  }));
  for (let i = 0; i < 6; i++) sandbox.updateMinigame(0.016, i * 0.016);
  const res = sandbox.MG.result;
  sandbox.endMinigame(false);
  return 'result=' + res + (res === 'lava' ? ' ✓' : ' ✗');
});

// ─── Частицы: заполняют весь экран ───
step('пыль заполняет всю видимую область', () => {
  sandbox.window.CANVAS_W = 520;
  sandbox.window.CANVAS_H = 1290;
  sandbox.window.CANVAS_CX = 260;
  sandbox.window.CANVAS_CY = 645;
  S.zoom = 1;
  S.zoom = 1;
  sandbox.initParticles();
  const p = sandbox.PART.particles;
  const half = 1290 / 2;
  let maxY = 0, midY = 0;
  p.forEach(pt => {
    maxY = Math.max(maxY, Math.abs(pt.y));
    if (Math.abs(pt.y) < half * 0.4) midY++;
  });
  return p.length + ' частиц, макс |y| = ' + Math.round(maxY) + ' (половина экрана ' +
         Math.round(half) + '), в центральной зоне ' +
         Math.round(midY / p.length * 100) + '%' +
         (maxY > half * 0.9 ? ' ✓ заполняет экран' : ' ✗ всё сжато к центру');
});
step('новая частица появляется за краем экрана', () => {
  sandbox.window.CANVAS_H = 1290;
  S.zoom = 1;
  const e = sandbox.makeEdgeParticle();
  const onEdge = Math.abs(Math.abs(e.y) - 645) < 45 || Math.abs(Math.abs(e.x) - 260) < 45;
  return 'x=' + Math.round(e.x) + ' y=' + Math.round(e.y) + (onEdge ? ' ✓ на краю' : ' ✗');
});

step('в мини-игре кнопка «Эволюция» скрыта', () => {
  const btn = sandbox.document.getElementById('evolveBtn');
  btn.classList.add('show');
  sandbox.startMinigame('mass', () => {});
  const hidden = !btn.classList.contains('show');
  sandbox.endMinigame(false);
  return hidden ? 'скрыта ✓' : 'осталась видимой ✗';
});

// ─── Магазин систем (фаза «Галактика») ───
step('магазин систем: шкалы, шансы и бонусы', () => {
  S.stage = 'galaxy'; S.systems = 3;
  S.dust = 1e12; S.energy = 1e9; S.civLevel = 5000;
  S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };
  const costs = sandbox.systemShopCosts();
  const base = sandbox.systemShopOutcome();
  const pure = 'обит.' + Math.round(base.colony * 100) + '% газ.' +
    Math.round(base.gas * 100) + '% лёд.' + Math.round(base.ice * 100) + '%';
  sandbox.pourSystemShop('dust', 'max');
  sandbox.pourSystemShop('energy', 'max');
  sandbox.pourSystemShop('civ', 'max');
  const full = sandbox.systemShopOutcome();
  const fullStr = 'обит.' + Math.round(full.colony * 100) + '% газ.' +
    Math.round(full.gas * 100) + '% лёд.' + Math.round(full.ice * 100) + '%';
  const okPure = base.colony === 0 && Math.round(base.gas * 100) === 30 &&
                 Math.round(base.ice * 100) === 70;
  const okFull = Math.round(full.colony * 100) === 60 &&
                 Math.round(full.gas * 100) === 30 &&
                 Math.round(full.ice * 100) === 10;
  return 'цены ✦' + costs.dust + ' ⚡' + costs.energy + ' 🧬' + costs.civ +
    ' | только пыль: ' + pure + (okPure ? ' ✓' : ' ✗') +
    ' | всё: ' + fullStr + (okFull ? ' ✓' : ' ✗') +
    ' · +' + full.extraPlanets + ' планет, +' + Math.round(full.incomeBonus * 100) + '% дохода';
});
step('магазин систем: создание и автопереход', () => {
  const before = S.systems;
  const rateBefore = sandbox.dustPerSec();
  const ok = sandbox.createSystemFromShop();
  const sys = S.otherSystems[S.otherSystems.length - 1];
  return 'ok=' + ok + ', систем ' + before + '→' + S.systems +
    ', активная=' + S.activeSystemIdx + ', планет в новой=' + (sys ? sys.planets.length : '-') +
    ', бонус=' + (sys ? sys.incomeBonus : '-') + ', доход ' + Math.round(rateBefore) +
    '→' + Math.round(sandbox.dustPerSec()) + ', шкалы=' + JSON.stringify(S.systemShopProgress);
});
step('магазин: без заполненной пыли система не создаётся', () => {
  S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };
  const ok = sandbox.createSystemFromShop();
  return String(ok) + (ok === false ? ' ✓ отказ' : ' ✗');
});

console.log('\n' + (failed ? '❌ ЕСТЬ ОШИБКИ' : '✅ Все проверки прошли'));
process.exit(failed ? 1 : 0);
