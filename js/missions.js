// ═══════════════════════════════════════════════════════════════
//  MISSIONS.JS — кометы, экспедиции, колонии
// ═══════════════════════════════════════════════════════════════

const MISS = {
  comets: [], expeditions: [],
  selectedDistance: 1,
  lastCometAt: 0, lastExpeditionAt: 0,
};

// ─── Генератор имён ─────────────────────────────────────────────
// (Удалено дублирование, используем реализацию из config.js)

// ─── Стоимости ──────────────────────────────────────────────────
function cometCost() {
  let ice = 0;
  for (let i = 0; i < S.planets.length; i++) {
    if (S.planets[i].type === 'iceGiant' && !S.planets[i].forming) ice++;
  }
  if (ice === 0) return 0;

  // ★ Цена = 10 минут текущего дохода (минимум 500K).
  // Растёт с числом ледяных гигантов.
  const baseCost = Math.max(500000, dustPerSec() * 600);
  const iceMult = 1 + ice * 0.3;
  return Math.floor(baseCost * iceMult);
}

function expeditionEnergyCost() {
  const cfg = MISSIONS_CFG;
  let lifeCount = 0;
  for (let i = 0; i < S.planets.length; i++) {
    if (PLANET_TYPES[S.planets[i].type].civ && !S.planets[i].forming) lifeCount++;
  }
  // ★ Цена = 5 минут текущего дохода энергии (минимум 3000).
  const baseCost = Math.max(cfg.expeditionCostBase, energyPerSec() * 300);
  const lifeMult = 1 + lifeCount * 0.4;
  const systemMult = Math.pow(cfg.expeditionCostRatio, S.systems - 1);
  return Math.floor(baseCost * lifeMult * systemMult);
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

// ★ Общие параметры дальности миссий (цена/время/награда)
function missionDistanceOptions() {
  const cfg = MISSIONS_CFG;
  const baseCost = energyPerSec() * 120;
  const defs = [
    { mult: 1, name: 'Ближняя', desc: 'Короткий полёт, низкая цена' },
    { mult: 2, name: 'Средняя', desc: 'Баланс цены и награды' },
    { mult: 3, name: 'Дальняя', desc: 'Долгий полёт, большая награда' },
  ];
  return defs.map(function(d) {
    return {
      mult: d.mult,
      name: d.name,
      desc: d.desc,
      flightMin: (cfg.expeditionFlightMin * d.mult) / 60000,
      cost: Math.floor(baseCost * d.mult),
      reward: Math.floor(dustPerSec() * 3600 * 2 * d.mult),
    };
  });
}

function openCometDialog() {
  const options = missionDistanceOptions();
  const choices = options.map(function(o) {
    const canAfford = (S.energy || 0) >= o.cost;
    return {
      id: 'dist_' + o.mult,
      name: o.name + ' миссия',
      desc: o.desc,
      stats: '⏱ ' + o.flightMin.toFixed(0) + ' мин · ⚡ ' + fmt(o.cost) + ' · +' + fmt(o.reward) + ' ✦',
      color: '#3d6dd4', icon: '🚀', disabled: !canAfford,
    };
  });
  if (typeof setModal === 'function') {
    const handlers = {};
    options.forEach(function(o) {
      handlers['dist_' + o.mult] = function() {
        MISS.selectedDistance = o.mult;
        launchExpedition(o.mult);
        if (typeof closeEvolutionModal === 'function') closeEvolutionModal();
      };
    });
    setModal(buildModal('Дальность миссии',
      'Чем дальше летит корабль — тем дороже и выгоднее.', choices), handlers);
  }
}

// Старый выбор размера кометы (сохранён отдельно)
function openCometSizeDialog() {
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
  let reward = Math.floor(cfg.cometRewardBase *
    (1 + S.planets.length * cfg.cometRewardPerPlanet) *
    check.ice * (0.3 + sizePct * 3));
  if (S.activeEvent && typeof EVENT_CFG !== 'undefined' && Array.isArray(EVENT_CFG.types)) {
    const evt = EVENT_CFG.types.find(t => t.id === S.activeEvent.id);
    if (evt && evt.dustCometMult) reward = Math.floor(reward * evt.dustCometMult);
  }

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
      originSeed: icePlanet ? icePlanet.seed : null,   // от какой планеты ушла
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
  if (typeof playSFX === 'function') playSFX('sfx_comet');
  if (typeof addEvent === 'function') {
    addEvent('comet_spawn',
      'Запущена комета (' + Math.round(sizePct * 100) + '%) · возврат через ' +
      fmtTime(flightMs / 1000));
  }
  if (typeof trackDaily === 'function') trackDaily('d_dust', 100000); // Условно
  if (!S.stats) S.stats = {};
  S.stats.comets = (S.stats.comets || 0) + 1;
  if (typeof checkAchievements === 'function') checkAchievements();
  return true;
}

// ─── ЭКСПЕДИЦИИ ─────────────────────────────────────────────────
function canLaunchExpedition(distanceMultiplier) {
  const mult = Math.max(1, Math.min(3, parseInt(distanceMultiplier) || 1));
  if (S.civLevel < 6) return { ok: false, reason: 'Нужен цив. 6' };
  const cost = Math.floor(energyPerSec() * 120 * mult);
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

function launchExpedition(distanceMultiplier) {
  const cfg = MISSIONS_CFG;
  const mult = Math.max(1, Math.min(3, parseInt(distanceMultiplier) || 1));
  const check = canLaunchExpedition(mult);
  if (!check.ok) { toast('Экспедиция недоступна', check.reason); return false; }
  S.energy -= check.cost;
  MISS.lastExpeditionAt = Date.now();

  // ─── Время полёта и награда зависят от дальности ───
  const flightMs = Math.floor(cfg.expeditionFlightMin * mult);
  const reward = Math.floor(dustPerSec() * 3600 * 2 * mult);
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
      originSeed: civPlanet ? civPlanet.seed : null,   // от какой планеты ушла
    });
  }

  MISS.expeditions.push({
    id: Math.random().toString(36).slice(2),
    startAt: Date.now(), flightTime: flightMs,
    reward: reward, fail: Math.random() < cfg.expeditionFailChance,
    hasColony: Math.random() < cfg.colonyChance,
  });
    // Трофейный контракт при успешной экспедиции (ролл при возврате)
  MISS.expeditions[MISS.expeditions.length - 1].nightMode = (S.nightConfig && S.nightConfig.mode) || 'balanced';
    toast('🚀 Экспедиция запущена',
    'Возврат через ' + fmtTime(flightMs / 1000) +
    ' · цена ' + fmt(check.cost) + '⚡');
  if (typeof playSFX === 'function') playSFX('sfx_expedition');
  if (typeof addEvent === 'function') {
    addEvent('comet_spawn',
      'Запущена экспедиция · возврат через ' + fmtTime(flightMs / 1000));
  }
  if (!S.stats) S.stats = {};
  S.stats.expeditions = (S.stats.expeditions || 0) + 1;
  if (typeof checkAchievements === 'function') checkAchievements();
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
        S.energy -= eCost;
        S.civLevel -= cCost;

        // Слот 0 — placeholder для родной
        if (S.otherSystems.length === 0 || S.otherSystems[0] === undefined) {
          S.otherSystems[0] = null;
        }

        // ★ Колония всегда даёт ОБИТАЕМУЮ систему (G/K + жизнь)
        const newSys = generateRandomSystem({ isColony: true });
        const newIdx = S.otherSystems.length;
        S.otherSystems.push(newSys);
        S.systems++;
        S.totalSystemsCreated = (S.totalSystemsCreated || 1) + 1;
        toast('Колония основана',
          newSys.name + ' · ' + STAR_TYPES[newSys.starType].name);

        // Автопереключение
        if (typeof switchToSystem === 'function') switchToSystem(newIdx);

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
      if (c.fail) {
        toast('☄️ Комета потеряна', 'Не вернулась');
        if (typeof addEvent === 'function') addEvent('comet_lost', 'Комета потеряна в пути');
      } else {
        S.dust += c.reward; S.dustTotal += c.reward;
        toast('☄️ Комета вернулась', '+' + fmt(c.reward));
        if (typeof playSFX === 'function') playSFX('sfx_comet');
        if (typeof addEvent === 'function') addEvent('comet_arrive', 'Комета вернулась · +' + fmt(c.reward) + ' ✦');
      }
      MISS.comets.splice(i, 1);
    }
  }
  for (let i = MISS.expeditions.length - 1; i >= 0; i--) {
    const e = MISS.expeditions[i];
    if (now - e.startAt >= e.flightTime) {
      if (e.fail) {
        toast('🚀 Экспедиция потеряна', 'Корабль не вернулся');
        if (typeof addEvent === 'function') addEvent('comet_lost', 'Экспедиция потеряна');
      } else {
        S.dust += e.reward; S.dustTotal += e.reward;
        toast('🚀 Экспедиция вернулась', '+' + fmt(e.reward));
        if (typeof playSFX === 'function') playSFX('sfx_system_form');
        if (typeof addEvent === 'function') addEvent('comet_arrive', 'Экспедиция вернулась · +' + fmt(e.reward) + ' ✦');
        if (e.hasColony) setTimeout(offerColony, 800);
      }
      // Ролл на трофейный контракт
        tryRollTrophy(e.nightMode || 'balanced');
      MISS.expeditions.splice(i, 1);
    }
  }
}

// ─── Единый диалог миссий ───────────────────────────────────────
function openMissionDialog(distance) {
  const cometCheck = canLaunchComet();
  const selected = Math.max(1, Math.min(3, parseInt(distance) || MISS.selectedDistance || 1));

  // Проверяем, есть ли вообще планеты, способные запускать миссии
  let hasCapablePlanet = false;
  for (let i = 0; i < S.planets.length; i++) {
    const pt = PLANET_TYPES[S.planets[i].type];
    if (S.planets[i].type === 'iceGiant' || (pt && pt.civ)) {
      hasCapablePlanet = true;
      break;
    }
  }

  if (!hasCapablePlanet) {
    toast('Миссии недоступны', 'Нужны ледяные гиганты или обитаемые планеты');
    return;
  }

  // Если планеты есть, но ресурсов не хватает — всё равно открываем модалку,
  // чтобы игрок видел причину (кнопки будут disabled с текстом стоимости)
  const options = missionDistanceOptions();
  const choices = [
    {
      id: 'comet', name: 'Комета',
      desc: 'Выбери размер и запусти комету',
      stats: cometCheck.ok ? 'Стоимость от ' + fmt(cometCheck.cost) + ' ✦'
                           : (cometCheck.reason || 'Недоступна'),
      color: '#3d6dd4', icon: '☄️', disabled: !cometCheck.ok,
    },
  ];
  const handlers = { comet: function() { openCometSizeDialog(); } };
  options.forEach(function(o) {
    const check = canLaunchExpedition(o.mult);
    const isSelected = o.mult === selected;
    choices.push({
      id: 'exp_' + o.mult,
      name: 'Экспедиция · ' + o.name + (isSelected ? ' ✓' : ''),
      desc: o.desc,
      stats: check.ok
        ? '⏱ ' + o.flightMin.toFixed(0) + ' мин · ⚡ ' + fmt(check.cost) + ' · +' + fmt(o.reward) + ' ✦'
        : (check.reason || 'Недоступна'),
      color: '#2f9e6e', icon: '🚀', disabled: !check.ok,
    });
    handlers['exp_' + o.mult] = function() {
      MISS.selectedDistance = o.mult;
      launchExpedition(o.mult);
      if (typeof closeEvolutionModal === 'function') closeEvolutionModal();
    };
  });
  if (typeof setModal === 'function') {
    setModal(buildModal('Миссии', 'Выбери дальность миссии', choices), handlers);
  }
}

// ─── КНОПКИ МИССИЙ ──────────────────────────────────────────────
function renderMissionButtons() {
  const container = document.getElementById('missionButtons');
  if (!container) return;

  const cometCheck = canLaunchComet();
  const expCheck = canLaunchExpedition();

  // Проверяем, есть ли хоть одна планета для миссий
  let hasCapablePlanet = false;
  for (let i = 0; i < S.planets.length; i++) {
    const pt = PLANET_TYPES[S.planets[i].type];
    if (S.planets[i].type === 'iceGiant' || (pt && pt.civ)) {
      hasCapablePlanet = true;
      break;
    }
  }

  let html = '';

  // ★ Единая кнопка миссий
  if (hasCapablePlanet) {
    // Кнопка активна, даже если ресурсов нет. Показываем подсказку.
    const allReady = cometCheck.ok || expCheck.ok;
    html += '<button class="mission-btn missions" data-action="missions" data-distance="' + (MISS.selectedDistance || 1) + '">' +
      '<div class="mb-icon">🚀</div><div>Миссии</div>' +
      '<div class="mb-cost">' + (allReady ? 'Доступны' : 'Мало ресурсов') + '</div></button>';
  } else {
    // Нет подходящих планет вообще
    html += '<button class="mission-btn disabled" disabled>' +
      '<div class="mb-icon">🚀</div><div>Миссии</div>' +
      '<div class="mb-cost">Нет подходящих планет</div></button>';
  }

  // ─── Магазин систем (фаза «Галактика» или заполненная фаза «Система») ───
  const canBuySystems = (S.stage === 'galaxy') || (S.stage === 'system' && S.planets.length >= 8);

  if (canBuySystems && typeof systemShopCosts === 'function') {
    const shopCosts = systemShopCosts();
    const canBuy = S.dust >= shopCosts.dust;
    if (canBuy) {
      html += '<button class="mission-btn sys" data-action="sys">' +
        '<div class="mb-icon">🌌</div><div>Новая система</div>' +
        '<div class="mb-cost">' + fmt(shopCosts.dust) + ' ✦ ✓</div></button>';
    } else {
      html += '<button class="mission-btn disabled" disabled>' +
        '<div class="mb-icon">🌌</div><div>Новая система</div>' +
        '<div class="mb-cost">' + fmt(shopCosts.dust) + ' ✦</div></button>';
    }
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
      if (action === 'missions') openMissionDialog(parseInt(btn.dataset.distance) || 1);
      else if (action === 'sys' && typeof openSystemShop === 'function') openSystemShop();
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else { attach(); }
})();
// ═══════════════════════════════════════════════════════════════
//  ТРОФЕЙНЫЕ КОНТРАКТЫ
// ═══════════════════════════════════════════════════════════════

function tryRollTrophy(nightMode) {
  const chance = TROPHY_CFG.dropChanceByMode[nightMode] || TROPHY_CFG.dropChanceByMode.default;
  if (Math.random() >= chance) return null;
  const contract = generateTrophy();
  if (!contract) return null;
  grantTrophy(contract);
  return contract;
}
window.tryRollTrophy = tryRollTrophy;

function rollRarity() {
  const weights = TROPHY_CFG.rarityWeights;
  const r = Math.random();
  let acc = 0;
  for (const key in weights) {
    acc += weights[key];
    if (r < acc) return key;
  }
  return 'common';
}

function generateTrophy() {
  const rarity = rollRarity();
  const rw = TROPHY_CFG.rewards[rarity];
  if (!rw) return null;

  const id = Math.random().toString(36).slice(2);
  const createdAt = Date.now();

  // Случайный тип награды
  const types = [];
  if (rw.systemDiscount) types.push('system_discount');
  if (rw.systemFree) types.push('system_free');
  if (rw.shieldHours) types.push('shield');
  if (rw.defenseDiscount) types.push('defense_discount');
  if (rw.freeDefenseLevel) types.push('defense_level');

  if (types.length === 0) return null;
  const type = types[Math.floor(Math.random() * types.length)];

  let value = 0;
  if (type === 'system_discount') {
    value = rw.systemDiscount[0] + Math.random() * (rw.systemDiscount[1] - rw.systemDiscount[0]);
  } else if (type === 'shield') {
    value = Math.floor(rw.shieldHours[0] + Math.random() * (rw.shieldHours[1] - rw.shieldHours[0] + 1));
  } else if (type === 'defense_discount') {
    value = rw.defenseDiscount[0] + Math.random() * (rw.defenseDiscount[1] - rw.defenseDiscount[0]);
  } else if (type === 'defense_level') {
    value = Math.floor(rw.freeDefenseLevel[0] + Math.random() * (rw.freeDefenseLevel[1] - rw.freeDefenseLevel[0] + 1));
  } else if (type === 'system_free') {
    value = 1;
  }

  return { id, type, rarity, value, createdAt };
}

function grantTrophy(contract) {
  if (!S.trophyContracts) S.trophyContracts = [];

  const labels = {
    system_discount: '🎫 Скидка ' + Math.round(contract.value * 100) + '% на систему',
    system_free: '🎫 Бесплатное основание системы',
    shield: '🎫 Щит на ' + contract.value + ' ч',
    defense_discount: '🎫 Скидка ' + Math.round(contract.value * 100) + '% на апгрейд обороны',
    defense_level: '🎫 Автооборона Ур.' + contract.value + ' на 12 ч',
  };

  // Временные эффекты (щит, оборона) активируются сразу
  if (contract.type === 'shield') {
    const hours = contract.value;
    const until = Date.now() + hours * 3600 * 1000;
    if (!S.shieldUntil || S.shieldUntil < until) S.shieldUntil = until;
    if (!S.activeTrophyEffects) S.activeTrophyEffects = [];
    S.activeTrophyEffects.push({ type: 'shield', value: hours, expiresAt: until });
    toast('🎫 Трофей: Щит', 'Активен ' + hours + ' ч');
  } else if (contract.type === 'defense_level') {
    const hours = (contract.rarity === 'epic') ? 24 : 12;
    const until = Date.now() + hours * 3600 * 1000;
    if (!S.activeTrophyEffects) S.activeTrophyEffects = [];
    S.activeTrophyEffects.push({ type: 'defense_level', value: contract.value, expiresAt: until });
    toast('🎫 Трофей: Оборона Ур.' + contract.value, 'Активна ' + hours + ' ч');
  } else {
    // Скидки — копятся
    S.trophyContracts.push(contract);
    toast(labels[contract.type] || '🎫 Трофей', 'Используется в магазине');
  }

  if (typeof saveGame === 'function') saveGame();
}
window.grantTrophy = grantTrophy;

// Получить активную скидку на систему (макс. из всех контрактов)
function getActiveSystemDiscount() {
  if (!S.trophyContracts) return 0;
  let max = 0;
  for (let i = 0; i < S.trophyContracts.length; i++) {
    const c = S.trophyContracts[i];
    if (c.type === 'system_free') return 1.0;
    if (c.type === 'system_discount' && c.value > max) max = c.value;
  }
  return max;
}
window.getActiveSystemDiscount = getActiveSystemDiscount;

// Израсходовать контракт на систему
function consumeSystemContract() {
  if (!S.trophyContracts) return 0;
  for (let i = 0; i < S.trophyContracts.length; i++) {
    const c = S.trophyContracts[i];
    if (c.type === 'system_free') {
      S.trophyContracts.splice(i, 1);
      return 1.0;
    }
  }
  for (let i = 0; i < S.trophyContracts.length; i++) {
    const c = S.trophyContracts[i];
    if (c.type === 'system_discount') {
      S.trophyContracts.splice(i, 1);
      return c.value;
    }
  }
  return 0;
}
window.consumeSystemContract = consumeSystemContract;

// Получить скидку на апгрейд обороны
function getDefenseDiscount() {
  if (!S.trophyContracts) return 0;
  let max = 0;
  for (let i = 0; i < S.trophyContracts.length; i++) {
    const c = S.trophyContracts[i];
    if (c.type === 'defense_discount' && c.value > max) max = c.value;
  }
  return max;
}
window.getDefenseDiscount = getDefenseDiscount;

function consumeDefenseContract() {
  if (!S.trophyContracts) return 0;
  for (let i = 0; i < S.trophyContracts.length; i++) {
    const c = S.trophyContracts[i];
    if (c.type === 'defense_discount') {
      S.trophyContracts.splice(i, 1);
      return c.value;
    }
  }
  return 0;
}
window.consumeDefenseContract = consumeDefenseContract;
window.updateMissions = updateMissions;
window.renderMissionButtons = renderMissionButtons;
window.canLaunchComet = canLaunchComet;
window.canLaunchExpedition = canLaunchExpedition;
window.launchComet = launchComet;
window.openCometDialog = openCometDialog;
window.openCometSizeDialog = openCometSizeDialog;
window.missionDistanceOptions = missionDistanceOptions;
window.openMissionDialog = openMissionDialog;
window.launchExpedition = launchExpedition;
window.offerColony = offerColony;
window.cometCost = cometCost;
window.generateSystemName = generateSystemName;
window.MISS = MISS;
