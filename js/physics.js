// ═══════════════════════════════════════════════════════════════
//  PHYSICS.JS — миграция планет и рассеивание газа
// ═══════════════════════════════════════════════════════════════

// ─── Рассеивание газа ───────────────────────────────────────────
// ρ_gas(t) = ρ_0 · e^(-t/τ),  τ ≈ 5 минут
const GAS = {
  tau: 300,          // 5 минут до полного рассеивания
  initTime: null,    // когда началось
};

function initGas() {
  GAS.initTime = performance.now() / 1000;
}

// Возвращает 0..1 — сколько газа осталось
function gasDensity() {
  if (GAS.initTime === null) initGas();
  const t = performance.now() / 1000 - GAS.initTime;
  return Math.exp(-t / GAS.tau);
}

// Сколько осталось газа в процентах (для UI)
function gasPercent() {
  return Math.round(gasDensity() * 100);
}

// ─── Миграция I типа ────────────────────────────────────────────
// da/dt = -k / a² · gas
// Планета сползает к звезде, пока есть газ
// Скорость обратно пропорциональна r² — далёкие почти не движутся

function migrationRate(planet) {
  const r = planet.orbitR || 100;
  if (r < 55) return 0;         // не мигрирует внутрь 0.55 а.е.
  const gas = gasDensity();
  if (gas < 0.01) return 0;      // газ рассеялся — миграция стоп
  // Скорость: k / (r²/10000), где k = 0.4
  const k = 0.4;
  return -k * gas * 10000 / (r * r);
}

window.initGas = initGas;
window.gasDensity = gasDensity;
window.gasPercent = gasPercent;
window.migrationRate = migrationRate;
