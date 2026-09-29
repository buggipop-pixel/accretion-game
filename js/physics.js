// ═══════════════════════════════════════════════════════════════
//  PHYSICS.JS — кеплеровская динамика, миграция, слияния
// ═══════════════════════════════════════════════════════════════

// ─── Температура и зоны ─────────────────────────────────────────
function tempAt(rAe) {
  if (rAe < 0.01) rAe = 0.01;
  return PHYS.refTemp * Math.sqrt(1 / rAe);
}

function zoneAt(rAe) {
  const t = tempAt(rAe);
  if (t > 1000) return 'lava';
  if (t > 400)  return 'hot';
  if (t > 170)  return 'rocky';
  if (t > 80)   return 'ice';
  return 'gas';
}

// ─── Escape-скорость ────────────────────────────────────────────
function escapeVelocity(mass, radius) {
  if (radius <= 0) return 0;
  return Math.sqrt(2 * mass / radius) * 0.5;
}

function relativeVelocity(r1, r2) {
  const v1 = 1 / Math.sqrt(Math.max(10, r1) / 100);
  const v2 = 1 / Math.sqrt(Math.max(10, r2) / 100);
  return Math.abs(v1 - v2);
}

function shouldMerge(p1, p2) {
  const r1 = p1.orbitR || 100;
  const r2 = p2.orbitR || 100;
  const gap = Math.abs(r1 - r2);
  const sumRadii = (p1.diameter + p2.diameter) * 8;
  const vRel = relativeVelocity(r1, r2);
  const vEsc = escapeVelocity(p1.mass + p2.mass, p1.diameter + p2.diameter);
  const focus = vRel > 0.01 ? Math.sqrt(1 + (vEsc*vEsc)/(vRel*vRel)) : 1;
  const captureDist = sumRadii * Math.min(4, focus);

  if (gap > captureDist) return null;
  if (vRel > vEsc * 1.2) return 'bounce';
  return 'merge';
}

// ─── Формула Сафронова ──────────────────────────────────────────
function safronovAccretion(planet) {
  const r = planet.orbitR || 100;
  const R = planet.diameter * 8;
  const sigma = Math.pow(100 / Math.max(1, r), 1.5);
  const omega = 1 / (PHYS.refPeriod * Math.pow(r / 100, 1.5));
  const vRel = Math.max(0.1, 1);
  const vEsc = escapeVelocity(planet.mass, planet.diameter);
  const focus = 1 + (vEsc * vEsc) / (vRel * vRel);
  return Math.PI * R * R * sigma * omega * focus * 0.001;
}

// ─── Миграция I типа ────────────────────────────────────────────
const GAS = { tau: 300, initTime: null };

function initGas() { GAS.initTime = performance.now() / 1000; }

function gasDensity() {
  if (GAS.initTime === null) initGas();
  const t = performance.now() / 1000 - GAS.initTime;
  return Math.exp(-t / GAS.tau);
}

function gasPercent() { return Math.round(gasDensity() * 100); }

function migrationRate(planet) {
  const r = planet.orbitR || 100;
  if (r < 55) return 0;
  const gas = gasDensity();
  if (gas < 0.01) return 0;
  return -0.4 * gas * 10000 / (r * r);
}

function resetGas() { GAS.initTime = performance.now() / 1000; }

window.tempAt = tempAt;
window.zoneAt = zoneAt;
window.shouldMerge = shouldMerge;
window.safronovAccretion = safronovAccretion;
window.initGas = initGas;
window.gasDensity = gasDensity;
window.gasPercent = gasPercent;
window.migrationRate = migrationRate;
window.resetGas = resetGas;
