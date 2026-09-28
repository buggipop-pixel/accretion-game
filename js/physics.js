// ═══════════════════════════════════════════════════════════════
//  PHYSICS.JS — научные формулы в игровом масштабе
//  Ссылки: Hayashi 1981, Safronov 1969, Ida & Lin 2004
// ═══════════════════════════════════════════════════════════════

// ─── Масштаб игры ───────────────────────────────────────────────
// Опорный радиус = 1 а.е. = 100 px на экране
// Температура на 1 а.е. = 280 К (T0)
// Снеговая линия = 2.7 а.е. = 270 px
// Кеплеровский период на 1 а.е. = T_ref секунд

const PHYS = {
  refRadius: 100,        // 1 а.е. = 100 px
  refTemp: 280,          // T(1 а.е.) = 280 К
  snowLine: 270,         // 2.7 а.е. = снеговая линия
  tempExp: 0.5,          // T ∝ r^(-1/2)
  densityExp: 1.5,       // Σ ∝ r^(-3/2)
  refPeriod: 8,          // сек на 1 а.е. — оборот вокруг звезды
  minTemp: 20,           // минимальная температура для рендера
  maxTemp: 400,
};

// ─── Температура на расстоянии r (пикс) ─────────────────────────
function tempAt(r) {
  if (r < 1) r = 1;
  return PHYS.refTemp * Math.pow(PHYS.refRadius / r, PHYS.tempExp);
}

// ─── Поверхностная плотность диска Σ(r) ─────────────────────────
// В игре нормализуем к 1 на снеговой линии
function sigmaAt(r) {
  if (r < 1) r = 1;
  return Math.pow(PHYS.refRadius / r, PHYS.densityExp);
}

// ─── Кеплеровская тангенциальная скорость ───────────────────────
// v_kep ∝ 1/√r. На опорном радиусе = 1.
function keplerSpeedAt(r) {
  if (r < 10) r = 10;
  return Math.sqrt(PHYS.refRadius / r);
}

// ─── Кеплеровский период ────────────────────────────────────────
function keplerPeriodAt(r) {
  if (r < 10) r = 10;
  return PHYS.refPeriod * Math.pow(r / PHYS.refRadius, 1.5);
}

// ─── Зона по температуре ────────────────────────────────────────
// Определяет, какой тип планеты возможен на этом радиусе
function zoneAt(r) {
  const t = tempAt(r);
  if (t > 1000) return 'lava';       // < 0.1 а.е. — раскалённая
  if (t > 400)  return 'hot';        // 0.1–0.5 а.е. — горячая
  if (t > 170)  return 'rocky';      // 0.5–2.7 а.е. — каменистая
  if (t > 80)   return 'ice';        // 2.7–10 а.е. — ледяная
  return 'gas';                      // > 10 а.е. — газовый гигант
}

// ─── Escape-скорость для тела ───────────────────────────────────
// v_esc = √(2GM/R). В игровом масштабе: v_esc ≈ √(mass / radius)
function escapeVelocity(mass, radius) {
  if (radius <= 0) return 0;
  return Math.sqrt(2 * mass / radius) * 0.5;
}

// ─── Относительная скорость двух планет на разных орбитах ──────
// v_rel ≈ |v_kep(r1) - v_kep(r2)| (упрощённо)
function relativeVelocity(r1, r2) {
  return Math.abs(keplerSpeedAt(r1) - keplerSpeedAt(r2));
}

// ─── Критерий слияния (Safronov / Ida-Lin) ─────────────────────
// Слияние происходит, если:
//   |r_ij| < R_i + R_j + гравитационный фокус
//   И v_rel < v_esc
function shouldMerge(p1, p2) {
  const r1 = p1.orbitR || 100;
  const r2 = p2.orbitR || 100;
  const gap = Math.abs(r1 - r2);
  const sumRadii = (p1.diameter + p2.diameter) * 8; // радиус в px

  // Гравитационный фокус: R_focus = R * √(1 + v_esc²/v_rel²)
  const vRel = relativeVelocity(r1, r2);
  const vEsc = escapeVelocity(p1.mass + p2.mass, p1.diameter + p2.diameter);
  const focusFactor = vRel > 0.01 ? Math.sqrt(1 + (vEsc * vEsc) / (vRel * vRel)) : 1;
  const captureDistance = sumRadii * Math.min(4, focusFactor);

  if (gap > captureDistance) return false;
  if (vRel > vEsc * 1.2) return 'bounce'; // слишком быстро — отскок
  return 'merge';
}

// ─── Формула Сафронова: скорость аккреции ───────────────────────
// dM/dt = πR² · Σ · Ω · (1 + v_esc²/v_rel²)
// В игровом масштабе — сколько пыли планета "съедает" в секунду
function safronovAccretion(planet) {
  const r = planet.orbitR || 100;
  const R = planet.diameter * 8;   // радиус в px
  const sigma = sigmaAt(r);
  const omega = 1 / keplerPeriodAt(r); // угловая скорость

  // Гравитационный фокус
  const vRel = Math.max(0.1, 1);    // упрощённо
  const vEsc = escapeVelocity(planet.mass, planet.diameter);
  const focus = 1 + (vEsc * vEsc) / (vRel * vRel);

  // πR² · Σ · Ω · focus — в игровых единицах
  return Math.PI * R * R * sigma * omega * focus * 0.001;
}

// ─── Миграция I типа ────────────────────────────────────────────
// da/dt = -k / a². Планета сползает к звезде, если в диске есть газ
function migrationRate(planet) {
  const r = planet.orbitR || 100;
  if (r < 40) return 0;             // не мигрирует внутрь 0.4 а.е.
  const gasFactor = S.gasDensity != null ? S.gasDensity : 1;
  return -0.5 * gasFactor / (r * r / 100);
}

// ─── Рассеивание газа ───────────────────────────────────────────
// ρ_gas(t) = ρ_0 · e^(-t/τ). τ ≈ 5 игровых минут
const GAS_DECAY_TAU = 300; // секунд
let gasStartTime = null;

function initGas() {
  gasStartTime = performance.now() / 1000;
}

function tickGas() {
  if (gasStartTime === null) initGas();
  const t = performance.now() / 1000 - gasStartTime;
  S.gasDensity = Math.exp(-t / GAS_DECAY_TAU);
  return S.gasDensity;
}

// ─── Экспорт ────────────────────────────────────────────────────
window.PHYS = PHYS;
window.tempAt = tempAt;
window.sigmaAt = sigmaAt;
window.keplerSpeedAt = keplerSpeedAt;
window.keplerPeriodAt = keplerPeriodAt;
window.zoneAt = zoneAt;
window.escapeVelocity = escapeVelocity;
window.relativeVelocity = relativeVelocity;
window.shouldMerge = shouldMerge;
window.safronovAccretion = safronovAccretion;
window.migrationRate = migrationRate;
window.initGas = initGas;
window.tickGas = tickGas;
