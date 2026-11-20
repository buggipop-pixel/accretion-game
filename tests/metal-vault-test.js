// ═══════════════════════════════════════════════════════════════
//  METAL VAULT TEST — «⚙ Хранилище металла» (items 6–7 UI)
//  Запуск:  node tests/metal-vault-test.js
//  Проверяем без браузера:
//    • тап по ячейке «МЕТАЛЛЫ» реально ведёт в openMetalVault;
//    • экран собирает шапку, Верфь, бустер, оборону и витрину;
//    • цена бустера = 0.5 часа металлодобычи (priceHours);
//    • пустая витрина показывает подсказку про трофеи.
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function assert(name, cond, extra) {
  if (cond) { console.log('✅ ' + name); passed++; }
  else {
    console.error('❌ ' + name + (extra ? ' → ' + extra : ''));
    failed++;
  }
}

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// Вырезаем функцию по имени из исходника (баланс фигурных скобок).
function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return null;
  const brace = src.indexOf('{', start);
  if (brace < 0) return null;
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

// ─── 1. Разметка и подключение ───────────────────────────────
console.log('— Разметка и подключение —');
const html = read('index.html');
const uiSrc = read('js/ui.js');
const premiumSrc = read('js/premium.js');

assert('index.html: есть ячейка «МЕТАЛЛЫ» (data-res="metals")', /class="storage-cell[^"]*"\s+data-res="metals"/.test(html));
assert('index.html: ячейка металлов помечена как тапаемая', /storage-cell--vault/.test(html));
assert('index.html: сохранён id metalsVal', /id="metalsVal"/.test(html));
assert('index.html: у ячейки есть роль кнопки и tabindex', /data-res="metals"[^>]*role="button"/.test(html) && /data-res="metals"[^>]*tabindex="0"/.test(html));
assert('js/ui.js: клик по .storage-cell[data-res="metals"] открывает openMetalVault',
  /\.storage-cell\[data-res="metals"\]/.test(uiSrc) && /openMetalVault\(\)/.test(uiSrc));
assert('js/premium.js: есть function openMetalVault', /function openMetalVault\(\)/.test(premiumSrc));
assert('js/premium.js: openMetalVault доступен через window.*', /window\.openMetalVault\s*=\s*openMetalVault/.test(premiumSrc));

// ─── 1b. Оборона и ежедневка в ui.js (интеграции task-4) ────
console.log('— Оборона и ежедневные награды —');
const saveNightSrc = extractFunction(uiSrc, 'saveNightConfig');
assert('saveNightConfig: функция найдена', !!saveNightSrc);
if (saveNightSrc) {
  assert('saveNightConfig: часы берутся из defenseActivationHours(selDefLvl)',
    /defenseActivationHours\(selDefLvl\)/.test(saveNightSrc) && !/const hours = Number\(INVASION_CFG\.defenseHours\)/.test(saveNightSrc));
  assert('saveNightConfig: в тосте видны часы уровня', /на \$\{appliedDefenseHours\}ч/.test(saveNightSrc));
}
const openNightSrc = extractFunction(uiSrc, 'openNightMode');
assert('openNightMode: предпросмотр часов пер-уровневый', !!openNightSrc && /defenseHoursFor\(lvl\)/.test(openNightSrc) && /defenseHoursFor\(4\)/.test(openNightSrc));
const claimSrc = extractFunction(uiSrc, 'claimDailyReward');
assert('claimDailyReward: функция найдена', !!claimSrc);
if (claimSrc) {
  assert('claimDailyReward: оборона по rw.level/rw.hours', /Number\(rw\.level\)/.test(claimSrc) && /Number\(rw\.hours\)/.test(claimSrc));
  assert('claimDailyReward: щит тоже по rw.hours', /shieldHours = Number\(rw\.hours\)/.test(claimSrc));
  assert('claimDailyReward: трофей рероллится до rare+', /attempt < 8/.test(claimSrc) && /rarity !== 'common'/.test(claimSrc));
}

// ─── 2. Цена бустера = 0.5 часа добычи ──────────────────────
console.log('— Цена бустера —');
const boosterSrc = extractFunction(premiumSrc, 'boosterPriceMetals');
assert('boosterPriceMetals: функция найдена', !!boosterSrc);
if (boosterSrc) {
  const ctx = {
    PREMIUM_CFG: { booster: { costMetals: 600, priceHours: 0.5 } },
    metalsPerSec: () => 1,
    window: {},
  };
  vm.createContext(ctx);
  vm.runInContext(boosterSrc, ctx);
  assert('boosterPriceMetals: 1 ⚙/с → 1800 ⚙ (0.5 ч)', ctx.boosterPriceMetals() === 1800, String(ctx.boosterPriceMetals()));

  ctx.metalsPerSec = () => 0;
  assert('boosterPriceMetals: не ниже базовой цены (600 ⚙)', ctx.boosterPriceMetals() === 600, String(ctx.boosterPriceMetals()));

  ctx.PREMIUM_CFG = { booster: { costMetals: 600 } };
  ctx.metalsPerSec = () => 1;
  assert('boosterPriceMetals: без priceHours в конфиге берётся 0.5 ч', ctx.boosterPriceMetals() === 1800, String(ctx.boosterPriceMetals()));
}

// ─── 3. Сам экран: собираем HTML с моками ───────────────────
console.log('— Экран «Хранилище металла» —');
const vaultSrc = extractFunction(premiumSrc, 'openMetalVault');
assert('openMetalVault: функция найдена', !!vaultSrc);

if (vaultSrc) {
  const now = Date.now();
  const card = { innerHTML: '' };
  const modal = { classList: { add: () => {}, remove: () => {} } };

  const S = {
    metalAmount: 5000,
    energy: 100000,
    civLevel: 50,
    fleet: { interceptor: 2, cruiser: 0, dreadnought: 0 },
    boosters: { incomeUntil: now + 3600000 },
    boosterDay: 0,
    nightDefenseExpiresAt: now + 7200000,
    nightDefenseLevel: 3,
    primeParts: 6,
    primeCrafts: 0,
    trophyContracts: [],
    activeTrophyEffects: [],
  };

  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    document: {
      getElementById: (id) => (id === 'modalCard' ? card : (id === 'modal' ? modal : null)),
    },
    S,
    FLEET_CFG: {
      ships: {
        interceptor: { name: 'Перехватчик', costMetals: 500, costEnergy: 1000, costCiv: 5 },
        cruiser: { name: 'Крейсер', costMetals: 2000, costEnergy: 4000, costCiv: 20 },
        dreadnought: { name: 'Дредноут', costMetals: 8000, costEnergy: 16000, costCiv: 80 },
      },
    },
    PREMIUM_CFG: { booster: { hours: 2, costMetals: 600, incomeMult: 2, priceHours: 0.5 } },
    PRIME_PART_TOTAL: 10,
    PRIME_PART_PER_SYSTEM: 5,
    PRIME_MAX_CRAFTS: 2,
    INVASION_CFG: { repelDefensePerLevel: 0.1, defenseRenewalCapMult: 3, defenseHours: 10 },
    fmt: (n) => String(Math.round(Number(n) || 0)),
    metalsPerSec: () => 2,
    getResourceCap: () => 250000,
    eventMult: () => 1,
    fleetUpkeepPerSec: () => 0,
    fleetShipTotal: () => 2,
    fleetDps: () => 8,
    fleetShipPrice: (key) => ctx.FLEET_CFG.ships[key].costMetals,
    shipCount: (key) => S.fleet[key] || 0,
    boosterPriceMetals: () => 1800,
    serverDayIndex: () => 999,
    activeDefenseLevel: () => 3,
    defenseActivationHours: (lvl) => ({ 1: 10, 2: 10, 3: 10, 4: 8, 5: 6 }[lvl] || 10),
    defenseActivationCost: (lvl) => 1000 * lvl,
    defenseRenewalMult: () => 1.35,
    playSFX: () => {},
    window: {},
  };
  vm.createContext(ctx);
  vm.runInContext(vaultSrc, ctx);

  ctx.openMetalVault();
  let out = card.innerHTML;

  assert('Экран: заголовок «⚙ Хранилище металла»', out.includes('⚙ Хранилище металла'));
  assert('Шапка: баланс, доход и лимит', out.includes('Металлы: 5000 ⚙') && out.includes('Доход: +') && out.includes('Лимит: 250000 ⚙'));
  assert('Секция «Верфь» со списком кораблей', out.includes('🚀 Верфь') && out.includes('Перехватчик') && out.includes('Крейсер') && out.includes('Дредноут'));
  assert('Верфь: кнопки покупки через buyShip', out.includes("buyShip('interceptor', 1)") && out.includes("buyShip('cruiser', 1)"));
  assert('Верфь: кнопка открытия существующей Верфи', out.includes('openShipyard()'));
  assert('Секция «Бустер дохода» с ценой и кнопкой', out.includes('Бустер дохода') && out.includes('1800 ⚙') && out.includes('buyIncomeBooster()'));
  assert('Секция «Активная оборона» с кнопкой', out.includes('Активная оборона') && out.includes('openNightMode()'));
  assert('Оборона: честные часы по уровням (8 ч / 6 ч)', out.includes('ур.4 — 8 ч') && out.includes('ур.5 — 6 ч'));
  assert('Оборона: упомянут рост цены и потолок', out.includes('Повторная активация') && out.includes('×1.35') && out.includes('потолок ×3'));
  assert('Секция «Витрина» с кусками Прайма', out.includes('🏆 Витрина') && out.includes('6 / 10') && out.includes('Собрать за 🧩5'));
  assert('Витрина: кнопка сборки через craftPrimeFromParts', out.includes('craftPrimeFromParts()'));
  assert('Витрина: пусто → подсказка про трофеи', out.includes('Пока нет трофеев — выпадают за активную оборону во вторжениях.'));
  assert('Есть кнопка ❌ закрытия', out.includes('✕ Закрыть'));
  assert('Никаких alert/confirm/prompt', !/\b(alert|confirm|prompt)\s*\(/.test(vaultSrc));

  // Трофеи: контракт-скидка + активный эффект щита.
  S.trophyContracts = [{ type: 'system_discount', value: 0.25, rarity: 'rare' }];
  S.activeTrophyEffects = [{ type: 'shield', value: 4, expiresAt: now + 5400000 }];
  ctx.openMetalVault();
  out = card.innerHTML;
  assert('Трофеи: контракт-скидка виден', out.includes('🎫 Скидка на систему') && out.includes('25% к цене системы'));
  assert('Трофеи: активный эффект с остатком срока', out.includes('🛡 Щит') && out.includes('Активно ещё'));
  assert('Трофеи: пустая подсказка больше не показывается', !out.includes('Пока нет трофеев'));
  assert('Трофеи: редкость подписана', out.includes('rare'));

  // Достижения: кнопка становится недоступной без кусков.
  S.primeParts = 0;
  ctx.openMetalVault();
  out = card.innerHTML;
  assert('Прайм: без кусков кнопка «Собрать» disabled', /onclick="craftPrimeFromParts\(\)"\s+disabled/.test(out));
}

console.log('========================================');
console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
if (failed > 0) process.exit(1);
