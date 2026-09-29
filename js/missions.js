// ═══════════════════════════════════════════════════════════════
//  MISSIONS.JS — кометы, экспедиции, колонии
// ═══════════════════════════════════════════════════════════════

const MISS = {
  comets: [], expeditions: [],
  lastCometAt: 0, lastExpeditionAt: 0,
};

// ─── Генератор имён ─────────────────────────────────────────────
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

function expeditionEnergyCost() {
  const cfg = MISSIONS_CFG;
  return Math.floor(cfg.expeditionCostBase * Math.pow(cfg.expeditionCostRatio, S.systems - 1));
}

function colonyEnergyCost() {
  const cfg = MISSIONS_CFG;
  return Math.floor(cfg.colonyEnergyCost * Math.pow(cfg.colonyEnergyRatio, S.systems - 1));
}
function colonyCivCost() {
  const cfg = MISSIONS_CFG;
  return Math.floor(cfg.colonyCivCost * Math.pow(cfg.colonyCivRatio, S.systems - 1));
}

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
  const cfg = MISSIONS_CFG;
  const sizes = [
    { id: 'small',  name: 'Малая комета',   pct: 0.15, desc: 'Быстрая, малая награда' },
    { id: 'medium', name: 'Средняя комета', pct: 0.40, desc: 'Баланс скорости и награды' },
    { id: 'large',  name: 'Большая комета', pct: 0.70, desc: 'Медленная, большая награда' },
  ];
  const choices = [];
  for (let i = 0; i < sizes.length; i++) {
    const s = sizes[i];
    const cost = Math.floor(maxDust * s.pct);
    const flightMult = cfg.cometFlightMinMult + (cfg.cometFlightMaxMult - cfg.cometFlightMinMult) * s.pct;
    const flightMs = cfg.cometFlightBase * flightMult;
    const flightMin = (flightMs / 60000).toFixed(1);
    const canAfford = cost >= 100000 && cost <= maxDust;
    choices.push({
      id: s.id, name: s.name, desc: s.desc,
      stats: 'Стоимость: ' + fmt(cost) + ' ✦ · полёт ~' + flightMin + ' мин',
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
  const cfg = MISSIONS_CFG;
  const check = canLaunchComet();
  if (!check.ok) { toast('Комета недоступна', check.reason); return false; }
  if (sizePct === undefined) sizePct = 0.4;
  const cost = Math.floor(S.dust * sizePct);
  if (cost < 100000 || cost > S.dust) { toast('Не хватает пыли'); return false; }
  S.dust -= cost;
  MISS.lastCometAt = Date.now();

  // ─── Время полёта: 5–15 минут ───
  const flightMult = cfg.cometFlightMinMult +
    (cfg.cometFlightMaxMult - cfg.cometFlightMinMult) * sizePct;
  const flightMs = Math.floor(cfg.cometFlightBase * flightMult * (0.9 + Math.random() * 0.2));

  // ─── Награда ───
  const reward = Math.floor(cfg.cometRewardBase *
    (1 + S.planets.length * cfg.cometRewardPerPlanet) *
    check.ice * (0.3 + sizePct * 3));

  // ─── Находим ледяной гигант для старта ───
  let icePlanet = null;
  for (let i = 0; i < S.planets.length; i++) {
    if (S.planets[i].type === 'iceGiant' && !S.planets[i].forming) {
      icePlanet = S.planets[i]; break;
    }
  }

  // ─── Спавним комету из позиции планеты с полётом наружу ───
  if (typeof PART !== 'undefined' && PART.passing) {
    let startX = 0, startY = 0;
    if (icePlanet && typeof getPlanetWorldPos === 'function') {
      const pos = getPlanetWorldPos(icePlanet, performance.now() / 1000);
      startX = pos.x;
      startY = pos.y;
    }
    // Направление — радиально наружу от звезды + лёгкий разброс
    const baseAngle = Math.atan2(startY, startX);
    const jitter = (Math.random() - 0.5) * 0.6;
    const finalAngle = baseAngle + jitter;
    const speed = 50 + sizePct * 30;

    PART.passing.push({
      x: startX, y: startY,
      vx: Math.cos(finalAngle) * speed,
      vy: Math.sin(finalAngle) * speed,
      type: 'comet',
      size: 0.4 + sizePct * 1.2,
      tailLen: Math.round(12 + sizePct * 22),
      alpha: 1, age: 0, trail: [],
      immune: true,   // ★ Не наносит урон своей системе
      missionId: 'comet_' + Math.random().toString(36).slice(2),
    });
  }

  MISS.comets.push({
    id: Math.random().toString(36).slice(2),
    startAt: Date.now(), flightTime: flightMs,
    reward: reward, fail: Math.random() < cfg.cometFailChance, size: sizePct,
  });
  toast('☄️ Комета запущена',
    'Размер: ' + Math.round(sizePct * 100) + '% · возврат через ' +
    fmtTime(flightMs / 1000));
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
  const cfg = MISSIONS_CFG;
  const check = canLaunchExpedition();
  if (!check.ok) { toast('Экспедиция недоступна', check.reason); return false; }
  S.energy -= check.cost;
  MISS.lastExpeditionAt = Date.now();

  // ─── Время полёта: 10–20 минут ───
  const flightMs = Math.floor(
    cfg.expeditionFlightMin +
    Math.random() * (cfg.expeditionFlightMax - cfg.expeditionFlightMin));

  const reward = Math.floor(cfg.expeditionRewardBase *
    (1 + S.planets.length * cfg.expeditionRewardPerPlanet) * S.systems);

  // ─── Находим планету с жизнью для старта ───
  let civPlanet = null;
  for (let i = 0; i < S.planets.length; i++) {
    if (PLANET_TYPES[S.planets[i].type].civ && !S.planets[i].forming) {
      civPlanet = S.planets[i]; break;
    }
  }

  // ─── Спавним корабль с полётом наружу ───
  if (typeof PART !== 'undefined' && PART.passing) {
    let startX = 0, startY = 0;
    if (civPlanet && typeof getPlanetWorldPos === 'function') {
      const pos = getPlanetWorldPos(civPlanet, performance.now() / 1000);
      startX = pos.x;
      startY = pos.y;
    }
    const baseAngle = Math.atan2(startY, startX);
    const jitter = (Math.random() - 0.5) * 0.6;
    const finalAngle = baseAngle + jitter;
    const speed = 45 + Math.random() * 15;

    PART.passing.push({
      x: startX, y: startY,
      vx: Math.cos(finalAngle) * speed,
      vy: Math.sin(finalAngle) * speed,
      type: 'ship',
      size: 0.5,
      tailLen: 12,
      alpha: 1, age: 0, trail: [],
      immune: true,
      missionId: 'exp_' + Math.random().toString(36).slice(2),
    });
  }

  MISS.expeditions.push({
    id: Math.random().toString(36).slice(2),
    startAt: Date.now(), flightTime: flightMs,
    reward: reward, fail: Math.random() < cfg.expeditionFailChance,
    hasColony: Math.random() < cfg.colonyChance,
  });
  toast('🚀 Экспедиция запущена',
    'Возврат через ' + fmtTime(flightMs / 1000) +
    ' · цена ' + fmt(check.cost) + '⚡');
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

// ─── Делегирование кликов ───────────────────────────────────────
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
