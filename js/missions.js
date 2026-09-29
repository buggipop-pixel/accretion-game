// ═══════════════════════════════════════════════════════════════
//  MISSIONS.JS — кометы, экспедиции, колонии
//  Кнопка «Система» удалена. Новая система появляется:
//   • автоматически при 8 планетах через эволюцию,
//   • или через 5% шанс колонии при возврате экспедиции.
// ═══════════════════════════════════════════════════════════════

const MISS = {
  comets: [], expeditions: [],
  lastCometAt: 0, lastExpeditionAt: 0,
};

// ─── Генератор имён систем ──────────────────────────────────────
const SYS_PREFIXES = ['Альфа','Бета','Гамма','Дельта','Эпсилон','Дзета','Эта',
  'Тета','Йота','Каппа','Лямбда','Мю','Ню','Кси','Омикрон','Пи','Ро','Сигма',
  'Тау','Ипсилон','Фи','Хи','Пси','Омега'];
const SYS_NAMES = ['Кентавра','Центавра','Ориона','Лебедя','Лира','Дракона',
  'Феникса','Кита','Гидры','Пегаса','Кассиопеи','Персея','Андромеды',
  'Волопаса','Геркулеса','Змееносца','Ворона','Орла','Павлина','Журавля',
  'Тукана','Единорога'];
const SYS_SUFFIXES = ['',' I',' II',' III',' IV',' V',' A',' B'];

function generateSystemName() {
  const prefix = SYS_PREFIXES[Math.floor(Math.random() * SYS_PREFIXES.length)];
  const name = SYS_NAMES[Math.floor(Math.random() * SYS_NAMES.length)];
  const suffix = SYS_SUFFIXES[Math.floor(Math.random() * SYS_SUFFIXES.length)];
  return prefix + ' ' + name + suffix;
}

// ─── Стоимости ──────────────────────────────────────────────────
function cometCost() {
  let ice = 0;
  for (let i = 0; i < S.planets.length; i++) {
    if (S.planets[i].type === 'iceGiant' && !S.planets[i].forming) ice++;
  }
  return Math.floor(500000 / Math.max(1, ice));
}

function expeditionEnergyCost() { return Math.floor(5000 * Math.pow(2, S.systems - 1)); }
function colonyEnergyCost() { return Math.floor(50000 * Math.pow(2, S.systems - 1)); }
function colonyCivCost() { return Math.floor(50 * Math.pow(1.8, S.systems - 1)); }

// ─── КОМЕТЫ ─────────────────────────────────────────────────────
function canLaunchComet() {
  let ice = 0;
  for (let i = 0; i < S.planets.length; i++) {
    if (S.planets[i].type === 'iceGiant' && !S.planets[i].forming) ice++;
  }
  if (ice === 0) return { ok: false, reason: 'Нужен ледяной гигант' };
  const cost = cometCost();
  if (S.dust < cost) return { ok: false, reason: 'Нужно ' + fmt(cost) };
  const now = Date.now();
  if (now - MISS.lastCometAt < 30000) {
    const left = Math.ceil((30000 - (now - MISS.lastCometAt)) / 1000);
    return { ok: false, reason: 'Кд ' + left + 'с' };
  }
  return { ok: true, cost: cost, ice: ice };
}

function openCometDialog() {
  const check = canLaunchComet();
  if (!check.ok) { toast('Комета недоступна', check.reason); return; }
  const maxDust = S.dust;
  const sizes = [
    { id: 'small',  name: 'Малая комета',  pct: 0.15, desc: 'Быстрая, малая награда' },
    { id: 'medium', name: 'Средняя комета', pct: 0.40, desc: 'Баланс скорости и награды' },
    { id: 'large',  name: 'Большая комета', pct: 0.70, desc: 'Медленная, большая награда' },
  ];
  const choices = [];
  for (let i = 0; i < sizes.length; i++) {
    const s = sizes[i];
    const cost = Math.floor(maxDust * s.pct);
    const flightSec = Math.round(60 * (0.5 + s.pct * 1.5));
    const canAfford = cost >= 100000 && cost <= maxDust;
    choices.push({
      id: s.id, name: s.name, desc: s.desc,
      stats: 'Стоимость: ' + fmt(cost) + ' ✦ · полёт ~' + flightSec + 'с',
      color: '#3d6dd4', icon: '☄️', disabled: !canAfford,
    });
  }
  if (typeof setModal === 'function') {
    const handlers = {};
    for (let i = 0; i < sizes.length; i++) {
      (function(sz) {
        handlers[sz.id] = function() {
          launchComet(sz.pct);
          if (typeof closeEvolutionModal === 'function') closeEvolutionModal();
        };
      })(sizes[i]);
    }
    setModal(buildModal('Запуск кометы',
      'Больше размер — дольше полёт и выше награда.', choices), handlers);
  }
}

function launchComet(sizePct) {
  const check = canLaunchComet();
  if (!check.ok) { toast('Комета недоступна', check.reason); return false; }
  if (sizePct === undefined) sizePct = 0.4;
  const cost = Math.floor(S.dust * sizePct);
  if (cost < 100000 || cost > S.dust) { toast('Не хватает пыли'); return false; }
  S.dust -= cost;
  MISS.lastCometAt = Date.now();

  const baseFlight = 60000, baseReward = 500000;
  const flightTime = Math.floor(baseFlight * (0.5 + sizePct * 1.5));
  const reward = Math.floor(baseReward * (1 + S.planets.length * 0.3) *
                            check.ice * (0.3 + sizePct * 3));

  let icePlanet = null;
  for (let i = 0; i < S.planets.length; i++) {
    if (S.planets[i].type === 'iceGiant' && !S.planets[i].forming) {
      icePlanet = S.planets[i]; break;
    }
  }

  if (typeof PART !== 'undefined' && PART.passing) {
    let startX = 0, startY = 0;
    if (icePlanet && typeof getPlanetWorldPos === 'function') {
      const pos = getPlanetWorldPos(icePlanet, performance.now() / 1000);
      startX = pos.x;
      startY = pos.y;
    }
    const dirAngle = Math.random() * Math.PI * 2;
    const speed = 40 + sizePct * 40;
    PART.passing.push({
      x: startX, y: startY,
      vx: Math.cos(dirAngle) * speed,
      vy: Math.sin(dirAngle) * speed * 0.6,
      type: 'comet',
      size: 0.4 + sizePct * 1.2,
      tailLen: Math.round(10 + sizePct * 20),
      alpha: 1, age: 0, trail: [],
    });
  }

  MISS.comets.push({
    id: Math.random().toString(36).slice(2),
    startAt: Date.now(), flightTime: flightTime,
    reward: reward, fail: Math.random() < 0.25, size: sizePct,
  });
  toast('☄️ Комета запущена',
    'Размер: ' + Math.round(sizePct * 100) + '% · возврат через ' +
    fmtTime(flightTime / 1000));
  return true;
}

// ─── ЭКСПЕДИЦИИ ─────────────────────────────────────────────────
function canLaunchExpedition() {
  if (S.civLevel < 6) return { ok: false, reason: 'Нужен цив. 6' };
  const cost = expeditionEnergyCost();
  if (S.energy < cost) return { ok: false, reason: 'Нужно ' + fmt(cost) + '⚡' };
  const now = Date.now();
  if (now - MISS.lastExpeditionAt < 60000) {
    const left = Math.ceil((60000 - (now - MISS.lastExpeditionAt)) / 1000);
    return { ok: false, reason: 'Кд ' + left + 'с' };
  }
  if (MISS.expeditions.length >= 1) return { ok: false, reason: 'В пути' };
  let hasCiv = false;
  for (let i = 0; i < S.planets.length; i++) {
    if (PLANET_TYPES[S.planets[i].type].civ && !S.planets[i].forming) {
      hasCiv = true; break;
    }
  }
  if (!hasCiv) return { ok: false, reason: 'Нужна планета с жизнью' };
  return { ok: true, cost: cost };
}

function launchExpedition() {
  const check = canLaunchExpedition();
  if (!check.ok) { toast('Экспедиция недоступна', check.reason); return false; }
  S.energy -= check.cost;
  MISS.lastExpeditionAt = Date.now();
  const flightTime = 120000 + Math.random() * 180000;
  const reward = Math.floor(1000000 * (1 + S.planets.length * 0.4) * S.systems);

  if (typeof PART !== 'undefined' && PART.passing) {
    const W = window.CANVAS_W || 400, H = window.CANVAS_H || 700;
    const z = S.zoom || 1;
    const halfW = W / (2 * z), halfH = H / (2 * z);
    const side = Math.floor(Math.random() * 4);
    let vx, vy, x, y;
    const speed = 50 + Math.random() * 40;
    if (side === 0) { x = (Math.random()*2-1)*halfW; y = -halfH-40; vx = (Math.random()-0.5)*20; vy = speed; }
    else if (side === 1) { x = halfW+40; y = (Math.random()*2-1)*halfH; vx = -speed; vy = (Math.random()-0.5)*20; }
    else if (side === 2) { x = (Math.random()*2-1)*halfW; y = halfH+40; vx = (Math.random()-0.5)*20; vy = -speed; }
    else { x = -halfW-40; y = (Math.random()*2-1)*halfH; vx = speed; vy = (Math.random()-0.5)*20; }
    PART.passing.push({
      x: x, y: y, vx: vx, vy: vy,
      type: 'ship',
      size: 0.4 + Math.random() * 0.4,
      tailLen: 10,
      alpha: 1, age: 0, trail: [],
    });
  }

  MISS.expeditions.push({
    id: Math.random().toString(36).slice(2),
    startAt: Date.now(), flightTime: flightTime,
    reward: reward, fail: Math.random() < 0.15,
    hasColony: Math.random() < 0.05,
  });
  toast('🚀 Экспедиция запущена', 'Возврат через ' + fmtTime(flightTime / 1000));
  return true;
}

// ─── КОЛОНИЯ ────────────────────────────────────────────────────
function offerColony() {
  const modal = document.getElementById('modal');
  if (modal && modal.classList.contains('show')) return;
  const eCost = colonyEnergyCost();
  const cCost = colonyCivCost();
  const canE = S.energy >= eCost, canC = S.civLevel >= cCost;
  const can = canE && canC;
  const choices = [
    { id: 'colonize', name: 'Освоить систему',
      desc: can ? '+50% к глобальному доходу' : 'Не хватает ресурсов',
      stats: '⚡ ' + fmt(eCost) + (canE ? ' ✓' : ' ✗') + ' · 🧬 ' +
             cCost + (canC ? ' ✓' : ' ✗'),
      color: '#2eaa77', icon: '🌍', disabled: !can },
    { id: 'skip', name: 'Отказаться', desc: 'Сохранить ресурсы',
      stats: '', color: '#6b6b6b', icon: '✕' },
  ];
  if (typeof setModal === 'function') {
    const handlers = {
      colonize: function() {
        S.energy -= eCost; S.civLevel -= cCost;
        S.systems++; S.totalSystemsCreated = (S.totalSystemsCreated || 1) + 1;
        toast('Колония основана', 'Всего систем: ' + S.systems);
        if (typeof closeEvolutionModal === 'function') closeEvolutionModal();
      },
      skip: function() {
        toast('Отказ', 'Ресурсы сохранены');
        if (typeof closeEvolutionModal === 'function') closeEvolutionModal();
      },
    };
    setModal(buildModal('Обнаружена система',
      'Экспедиция нашла пригодную для жизни систему. Освоить её?',
      choices), handlers);
  }
}

// ─── ОБНОВЛЕНИЕ МИССИЙ ──────────────────────────────────────────
function updateMissions() {
  const now = Date.now();
  for (let i = MISS.comets.length - 1; i >= 0; i--) {
    const c = MISS.comets[i];
    if (now - c.startAt >= c.flightTime) {
      if (c.fail) toast('☄️ Комета потеряна', 'Не вернулась');
      else {
        S.dust += c.reward; S.dustTotal += c.reward;
        toast('☄️ Комета вернулась', '+' + fmt(c.reward));
      }
      MISS.comets.splice(i, 1);
    }
  }
  for (let i = MISS.expeditions.length - 1; i >= 0; i--) {
    const e = MISS.expeditions[i];
    if (now - e.startAt >= e.flightTime) {
      if (e.fail) toast('🚀 Экспедиция потеряна', 'Корабль не вернулся');
      else {
        S.dust += e.reward; S.dustTotal += e.reward;
        toast('🚀 Экспедиция вернулась', '+' + fmt(e.reward));
        if (e.hasColony) setTimeout(offerColony, 800);
      }
      MISS.expeditions.splice(i, 1);
    }
  }
}

// ─── КНОПКИ МИССИЙ ──────────────────────────────────────────────
// Кнопки: только Комета и Экспедиция.
// Никаких «Система» — системы приходят автоматически.
function renderMissionButtons() {
  const container = document.getElementById('missionButtons');
  if (!container) return;
  const cometCheck = canLaunchComet();
  const expCheck = canLaunchExpedition();
  let html = '';

  if (cometCheck.ok) {
    html += '<button class="mission-btn comet" data-action="comet">' +
      '<div class="mb-icon">☄️</div><div>Комета</div>' +
      '<div class="mb-cost">' + fmt(cometCheck.cost) + ' ✦</div></button>';
  } else if (cometCheck.reason !== 'Нужен ледяной гигант') {
    html += '<button class="mission-btn disabled" disabled>' +
      '<div class="mb-icon">☄️</div><div>Комета</div>' +
      '<div class="mb-cost">' + cometCheck.reason + '</div></button>';
  }

  if (expCheck.ok) {
    html += '<button class="mission-btn exp" data-action="exp">' +
      '<div class="mb-icon">🚀</div><div>Экспедиция</div>' +
      '<div class="mb-cost">' + fmt(expCheck.cost) + ' ⚡</div></button>';
  } else if (expCheck.reason !== 'Нужен цив. 6' &&
             expCheck.reason !== 'Нужна планета с жизнью') {
    html += '<button class="mission-btn disabled" disabled>' +
      '<div class="mb-icon">🚀</div><div>Экспедиция</div>' +
      '<div class="mb-cost">' + expCheck.reason + '</div></button>';
  }

  if (container.dataset.key !== html) {
    container.innerHTML = html;
    container.dataset.key = html;
  }
}

// Делегирование кликов — устанавливается один раз
(function setupDelegation() {
  function attach() {
    const container = document.getElementById('missionButtons');
    if (!container) { setTimeout(attach, 200); return; }
    if (container.dataset.delegated === '1') return;
    container.dataset.delegated = '1';
    container.addEventListener('click', function(e) {
      const btn = e.target.closest('.mission-btn');
      if (!btn || btn.disabled) return;
      const action = btn.dataset.action;
      if (action === 'comet') openCometDialog();
      else if (action === 'exp') launchExpedition();
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else { attach(); }
})();
// ═══════════════════════════════════════════════════════════════
//  ПАРАМЕТРЫ МИССИЙ — кометы, экспедиции, колонии
//  Меняйте здесь, чтобы настроить длительность и стоимость
// ═══════════════════════════════════════════════════════════════
const MISSIONS_CFG = {
  // ─── КОМЕТЫ ───
  cometFlightBase: 600000,         // База полёта (мс) = 10 мин
  cometFlightMinMult: 0.5,         // Множитель для малой кометы (5 мин)
  cometFlightMaxMult: 1.5,         // Множитель для большой (15 мин)
  cometRewardBase: 500000,
  cometRewardPerPlanet: 0.3,
  cometFailChance: 0.25,

  // ─── ЭКСПЕДИЦИИ ───
  expeditionFlightMin: 600000,     // 10 мин
  expeditionFlightMax: 1200000,    // 20 мин
  expeditionCostBase: 3000,        // При 1 системе
  expeditionCostRatio: 1.5,        // Множитель за каждую систему
  expeditionRewardBase: 1000000,
  expeditionRewardPerPlanet: 0.4,
  expeditionFailChance: 0.15,

  // ─── КОЛОНИЯ ───
  colonyChance: 0.03,              // 3% шанс найти систему
  colonyEnergyCost: 50000,
  colonyEnergyRatio: 2.0,
  colonyCivCost: 50,
  colonyCivRatio: 1.8,

  // ─── УРОН ОТ ПРОЛЕТАЮЩИХ КОМЕТ ───
  cometDamageChance: 0.35,         // 35% шанс разрушения при попадании
  cometDamageRange: 2.5,           // Радиус столкновения = sumRadii × 2.5
};

// ─── ЛИМИТЫ АКТИВНОЙ ИГРЫ ───────────────────────────────────────
// Пассив медленный (часы/дни), актив — быстрее
const BALANCE = {
  // Множитель клика (чем выше, тем выгоднее активная игра)
  clickBonus: 1.0,
  // Множитель пассивного дохода от планет
  passiveBonus: 1.0,
  // Дополнительный множитель за активные действия в час
  activeBonus: 1.5,
};

// ─── Экспорт ────────────────────────────────────────────────────
window.MISSIONS_CFG = MISSIONS_CFG;
window.BALANCE = BALANCE;
window.updateMissions = updateMissions;
window.renderMissionButtons = renderMissionButtons;
window.canLaunchComet = canLaunchComet;
window.canLaunchExpedition = canLaunchExpedition;
window.launchComet = launchComet;
window.openCometDialog = openCometDialog;
window.launchExpedition = launchExpedition;
window.offerColony = offerColony;
window.cometCost = cometCost;
window.generateSystemName = generateSystemName;
window.MISS = MISS;
