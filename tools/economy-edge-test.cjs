// ═══════════════════════════════════════════════════════════════
//  ECONOMY EDGE TEST — граничные случаи «дохода со всех систем»
//  Запуск:  node tools/economy-edge-test.cjs
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
const storage = Object.create(null);

function makeElement() {
  return {
    style: {}, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    innerHTML: '', textContent: '', value: '', children: [],
    appendChild: noop, removeChild: noop, remove: noop,
    setAttribute: noop, getAttribute: () => null,
    addEventListener: noop, removeEventListener: noop,
    querySelector: () => makeElement(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
    focus: noop, blur: noop, play: noop, pause: noop,
  };
}

const mockDocument = {
  getElementById: () => makeElement(),
  querySelector: () => makeElement(),
  querySelectorAll: () => [],
  createElement: (tag) => {
    const el = makeElement();
    if (tag === 'canvas') {
      el.width = 800; el.height = 600;
      el.getContext = () => ({
        canvas: { width: 800, height: 600 },
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
        getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
        createRadialGradient: () => ({ addColorStop: noop }),
        createLinearGradient: () => ({ addColorStop: noop }),
      });
    }
    return el;
  },
  addEventListener: noop, removeEventListener: noop,
  body: makeElement(), documentElement: makeElement(),
  visibilityState: 'visible', hidden: false, cookie: '',
};

const localStorageMock = {
  getItem: (k) => (k in storage ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { for (const k in storage) delete storage[k]; },
};

const context = { console, document: mockDocument, localStorage: localStorageMock, sessionStorage: localStorageMock };
context.window = context; context.self = context; context.globalThis = context;
context.top = context; context.parent = context;
context.addEventListener = noop; context.removeEventListener = noop; context.dispatchEvent = noop;
context.performance = { now: () => Date.now() };
context.requestAnimationFrame = () => 0; context.cancelAnimationFrame = noop;
context.setTimeout = () => 0; context.clearTimeout = noop;
context.setInterval = () => 0; context.clearInterval = noop;
context.fetch = () => Promise.reject(new Error('offline'));
context.navigator = { userAgent: 'node', language: 'ru-RU', languages: ['ru-RU'] };
context.location = { href: 'http://localhost/', origin: 'http://localhost', reload: noop, assign: noop, replace: noop };
context.alert = noop; context.confirm = () => false; context.prompt = () => '';
context.Audio = function Audio() { return { play: noop, pause: noop, currentTime: 0, volume: 1, loop: false, src: '' }; };
context.Image = function Image() { const i = makeElement(); i.src = ''; i.complete = true; return i; };
context.toast = noop; context.updateUI = noop; context.playSFX = noop; context.addEvent = noop;
context.offerColony = noop; context.showModal = noop; context.hideModal = noop;

vm.createContext(context);
['config.js', 'state.js', 'physics.js', 'economy.js', 'prime.js', 'invasions.js', 'prestige.js', 'missions.js'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), context, { filename: f });
});
vm.runInContext(`
  window.PLANET_TYPES = PLANET_TYPES; window.STAR_TYPES = STAR_TYPES;
  window.SYSTEM_TYPES = SYSTEM_TYPES; window.CFG = CFG; window.STAGES = STAGES;
  window.getOrbitR = getOrbitR; window.planetMass = planetMass; window.planetDiameter = planetDiameter;
`, context);

const w = context.window;
const S = w.S;

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name + (extra !== undefined ? '  [' + extra + ']' : '')); }
}

function makePlanet(type, orbitIdx, extra) {
  const orbitR = context.getOrbitR(orbitIdx);
  return Object.assign({
    type, angle: 0, speed: 0.2, baseOrbitR: orbitR, orbitR,
    driftPhase: 0, rotation: 0, seed: Math.random() * 1e6,
    forming: false, formUntil: 0,
    mass: context.planetMass(type), diameter: context.planetDiameter(type),
    moons: [], precession: 0, trueAnomaly: 0,
  }, extra || {});
}

function resetGalaxy() {
  S.stage = 'galaxy';
  S.galaxyMultiplier = 1;
  S.primeSystem = null;
  S.starType = 'G';
  S.systemType = 'single';
  S.systemIncomeBonus = 0;
  S.techLevels = { astro: 0, cyber: 0, quantum: 0, eng: 0 };
  S.storageLevels = { dust: 1, energy: 1, civ: 1 };
  S.civLevel = 10;
  S.metalAmount = 0;
  S.dust = 0;
  S.energy = 0;
  S.boosters = {};
  S.invasionDebuff = null;
  S.activeEvent = null;
  S.invasions = [];
  S.otherSystems = [null];
  S.systems = 1;
  S.activeSystemIdx = 0;
  S.planets = [makePlanet('lava', 0)];
}

console.log('\n─── 1. Пустой/свежий сейв не падает ───');
resetGalaxy();
S.planets = [];
S.otherSystems = [];
S.systems = 1;
assert('forEachOwnedSystem не падает на пустом сейве', (() => {
  try { let n = 0; w.forEachOwnedSystem(() => n++); return n >= 1; } catch (e) { return false; }
})());
assert('metalsPerSec() = 0 без планет', w.metalsPerSec() === 0);
assert('metalsCap() = 750 на 1-м уровне хранилища', w.metalsCap() === 750, w.metalsCap());
S.otherSystems = {};
assert('otherSystems = {}(старый сейв) не ломает обход', (() => {
  try { w.planetRate(); return true; } catch (e) { return false; }
})());
S.otherSystems = [null];

console.log('\n─── 2. Металлы: активная система без лавы ───');
resetGalaxy();
S.planets = [makePlanet('rocky', 0), makePlanet('iceGiant', 1)];
S.otherSystems = [null, { name: 'P', starType: 'G', systemType: 'single', planets: [makePlanet('lava', 0), makePlanet('lava', 1)] }];
S.systems = 2;
const m1 = w.metalsPerSec();
assert('лавы нет в активной, но есть в другой системе → доход есть', m1 > 0, m1);
assert('ровно 2 лавы × 0.15 = 0.3', Math.abs(m1 - 0.3) < 1e-9, m1);

console.log('\n─── 3. Нет двойного учёта активной системы ───');
resetGalaxy();
S.planets = [makePlanet('lava', 0)];
// эмулируем состояние после switchToSystem: слот активной содержит копию
S.activeSystemIdx = 1;
S.otherSystems = [
  { name: 'Home', starType: 'G', systemType: 'single', planets: [makePlanet('rocky', 0)] },
  { name: 'Stale', starType: 'G', systemType: 'single', planets: [makePlanet('lava', 0)] }, // стейл-копия активной
];
S.systems = 2;
const m2 = w.metalsPerSec();
assert('стейл-копия активной не считается дважды', Math.abs(m2 - 0.15) < 1e-9, m2);

console.log('\n─── 4. «Застрявшее» forming в неактивной системе ───');
resetGalaxy();
S.planets = [makePlanet('rocky', 0)];
S.otherSystems = [null, {
  name: 'F', starType: 'G', systemType: 'single',
  planets: [makePlanet('lava', 0, { forming: true, formUntil: Date.now() - 60000 })],
}];
S.systems = 2;
assert('forming с прошедшим formUntil даёт доход', w.metalsPerSec() > 0, w.metalsPerSec());
S.otherSystems[1].planets[0].formUntil = Date.now() + 60000;
assert('forming в процессе — не даёт доход', w.metalsPerSec() === 0, w.metalsPerSec());

console.log('\n─── 5. Повреждённая система не даёт доход ───');
resetGalaxy();
S.planets = [makePlanet('rocky', 0)];
S.otherSystems = [null, {
  name: 'D', starType: 'G', systemType: 'single',
  planets: [makePlanet('lava', 0)], damagedUntil: Date.now() + 3600000,
}];
S.systems = 2;
assert('damagedUntil в будущем → 0 металлов', w.metalsPerSec() === 0, w.metalsPerSec());
S.otherSystems[1].damagedUntil = Date.now() - 1000;
assert('damagedUntil истёк → доход вернулся', w.metalsPerSec() > 0);

console.log('\n─── 6. Прайм-бонусы всех систем + потолок ───');
resetGalaxy();
S.planets = [makePlanet('rocky', 0)];
S.primeSystem = null;
S.otherSystems = [null];
for (let i = 0; i < 100; i++) {
  S.otherSystems.push({ name: 'B' + i, starType: 'G', systemType: 'single', planets: [],
    isPrime: true, primeData: { objectKey: 'superBH', bonus: { dustMult: 1.0 } } });
}
S.systems = S.otherSystems.length;
const pm = w.primeBonusMult('dust');
assert('потолок прайм-бонуса = ×2.5 (cap 150%)', Math.abs(pm - 2.5) < 1e-9, pm);
resetGalaxy();
S.primeSystem = { objectKey: 'blackHole', bonus: { dustMult: 0.25 } };
assert('один прайм: 1 + 0.25×0.2 = 1.05', Math.abs(w.primeBonusMult('dust') - 1.05) < 1e-9, w.primeBonusMult('dust'));

console.log('\n─── 7. Доход не зависит от открытой системы ───');
resetGalaxy();
S.planets = [makePlanet('lava', 0)];
S.otherSystems = [null,
  { name: 'A', starType: 'G', systemType: 'single', planets: [makePlanet('lava', 0)] },
  { name: 'B', starType: 'K', systemType: 'binary', planets: [makePlanet('gasGiant', 0)] }];
S.systems = 3;
const d0 = w.dustPerSec();
w.switchToSystem(1);
const d1 = w.dustPerSec();
w.switchToSystem(2);
const d2 = w.dustPerSec();
assert('пыль одинакова во всех трёх системах', Math.abs(d0 - d1) < 1e-6 && Math.abs(d1 - d2) < 1e-6, d0 + ' / ' + d1 + ' / ' + d2);

console.log('\n─── 8. Офлайн начисляет металлы ───');
resetGalaxy();
S.planets = [makePlanet('lava', 0)];
S.lastTick = Date.now() - 2 * 3600 * 1000; // 2 часа
S.metalAmount = 0;
const out = w.applyOfflineProgress();
assert('офлайн вернул результат', !!out);
assert('офлайн начислил металлы', out && out.metalsEarned > 0, out && out.metalsEarned);
assert('металлы не превысили кап', S.metalAmount <= w.metalsCap() + 1, S.metalAmount + ' / ' + w.metalsCap());

console.log('\n─── 9. NaN-защита ───');
resetGalaxy();
S.planets = [{ type: 'lava', forming: false, baseOrbitR: NaN, orbitR: NaN, mass: NaN }];
S.otherSystems = [null];
assert('битая планета не даёт NaN в пыли', !isNaN(w.dustPerSec()));
assert('битая планета не даёт NaN в металлах', !isNaN(w.metalsPerSec()));
assert('кап металлов — конечное число', isFinite(w.metalsCap()));

console.log('\n─── 10. Динамические цены: оборона ───');
resetGalaxy();
S.planets = [makePlanet('rocky', 0)];
S.systems = 1;
const defPoor = w.defenseActivationCost(3);
assert('оборона: не ниже базовой цены', defPoor >= 750, defPoor);
assert('оборона ур.0 = 0', w.defenseActivationCost(0) === 0);
S.otherSystems = [null, { name: 'L', starType: 'G', systemType: 'single',
  planets: [makePlanet('lava', 0), makePlanet('lava', 1)] }];
S.systems = 2;
const defRich = w.defenseActivationCost(3);
assert('оборона дорожает вместе с доходом', defRich > defPoor, defPoor + ' → ' + defRich);
assert('оборона ур.5 дороже ур.3', w.defenseActivationCost(5) > w.defenseActivationCost(3));

console.log('\n─── 11. Динамические цены: верфь ───');
assert('верфь: перехватчик не ниже базовой', w.fleetShipPrice('interceptor') >= 500, w.fleetShipPrice('interceptor'));
assert('верфь: дредноут >= базовой', w.fleetShipPrice('dreadnought') >= 8000, w.fleetShipPrice('dreadnought'));
assert('верфь: дредноут дороже перехватчика', w.fleetShipPrice('dreadnought') > w.fleetShipPrice('interceptor'));
assert('верфь: неизвестный корабль = 0', w.fleetShipPrice('nope') === 0);

console.log('\n─── 12. Содержание флота ───');
resetGalaxy();
S.planets = [makePlanet('lava', 0), makePlanet('lava', 1)];
S.otherSystems = [null];
S.nightConfig = { mode: 'balanced', defenseEnabled: true, cometHours: 0, expeditionPercent: 0 };
S.nightDefenseLevel = 5;
S.nightDefenseExpiresAt = Date.now() + 3600 * 1000;
S.fleet = { interceptor: 0, cruiser: 0, dreadnought: 2 };
S.fleetActive = false;
assert('резерв: содержание 0', w.fleetUpkeepShare() === 0);
assert('резерв: потенциал > 0', w.fleetUpkeepShare(true) > 0, w.fleetUpkeepShare(true));
S.fleetActive = true;
const share = w.fleetUpkeepShare();
assert('активен: содержание > 0', share > 0, share);
assert('2 дредноута = вес 16 → 24% дохода', Math.abs(share - 16 * 0.015) < 1e-9, share);
S.fleet = { interceptor: 0, cruiser: 0, dreadnought: 100 };
assert('кап содержания = 60%', Math.abs(w.fleetUpkeepShare() - 0.6) < 1e-9, w.fleetUpkeepShare());
S.fleet = { interceptor: 0, cruiser: 0, dreadnought: 2 };
S.metalAmount = 1000;
const paid = w.payFleetUpkeep(1);
assert('содержание списывается', paid > 0 && S.metalAmount < 1000, paid + ' / ' + S.metalAmount);
S.metalAmount = 0;
S.fleetActive = true;
w.payFleetUpkeep(1);
assert('нет металла → флот в резерв', S.fleetActive === false);

console.log('\n─── 13. Экспедиция: цена в металле ───');
resetGalaxy();
S.planets = [makePlanet('lava', 0), makePlanet('superEarth', 1)];
S.civLevel = 50;
const ec = w.expeditionCost ? w.expeditionCost(1) : null;
assert('expeditionCost() существует', !!ec);
if (ec) {
  assert('экспедиция: энергия > 0', ec.energy > 0, ec.energy);
  assert('экспедиция: металл не ниже 200', ec.metals >= 200, ec.metals);
  assert('экспедиция: дальше — дороже', w.expeditionCost(3).metals > ec.metals);
}

console.log('\n════════════════════════════════════════');
console.log('ИТОГО: Пройдено ' + pass + ', Провалено ' + fail);
console.log('════════════════════════════════════════');
process.exit(fail === 0 ? 0 : 1);
