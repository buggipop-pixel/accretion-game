// ═══════════════════════════════════════════════════════════════
//  MISSIONS.JS — кометы, экспедиции, колонии
//  Комета: пыль. Экспедиция: энергия (цив.6+). Колония: энергия+цив.
//  Новая система: энергия + цив-очки (цив.8+).
// ═══════════════════════════════════════════════════════════════

const MISS = {
  comets: [],
  expeditions: [],
  lastCometAt: 0,
  lastExpeditionAt: 0,
};

// ─── Стоимости ──────────────────────────────────────────────────

// Комета: пыль, зависит от числа ледяных гигантов
function cometCost() {
  const ice = S.planets.filter(p => p.type === 'iceGiant' && !p.forming).length;
  const base = 500000;
  return Math.floor(base / Math.max(1, ice));
}

// Экспедиция: энергия, растёт с числом систем
function expeditionEnergyCost() {
  return Math.floor(5000 * Math.pow(2, S.systems - 1));
}

// Колония: энергия + цив-очки
function colonyEnergyCost() {
  return Math.floor(50000 * Math.pow(2, S.systems - 1));
}
function colonyCivCost() {
  return Math.floor(50 * Math.pow(1.8, S.systems - 1));
}

// Новая система: дороже колонии, требует цив. 8+
function newSystemEnergyCost() {
  return Math.floor(150000 * Math.pow(2.5, S.systems - 1));
}
function newSystemCivCost() {
  return Math.floor(80 * Math.pow(1.8, S.systems - 1));
}

// ─── КОМЕТЫ ─────────────────────────────────────────────────────

function canLaunchComet() {
  const ice = S.planets.filter(p => p.type === 'iceGiant' && !p.forming).length;
  if (ice === 0) return { ok: false, reason: 'Нужен ледяной гигант' };
  const cost = cometCost();
  if (S.dust < cost) return { ok: false, reason: 'Нужно ' + fmt(cost) };
  const now = Date.now();
  if (now - MISS.lastCometAt < 30000) {
    const left = Math.ceil((30000 - (now - MISS.lastCometAt)) / 1000);
    return { ok: false, reason: 'Кд ' + left + 'с' };
  }
  return { ok: true, cost, ice };
}

function launchComet() {
  const check = canLaunchComet();
  if (!check.ok) {
    if (typeof toast === 'function') toast('Комета недоступна', check.reason);
    return false;
  }
  S.dust -= check.cost;
  MISS.lastCometAt = Date.now();

  const flightTime = 60000 + Math.random() * 60000;
  const reward = Math.floor(500000 * (1 + S.planets.length * 0.3) * check.ice);

  // ★ Находим ледяной гигант как источник
  const icePlanet = S.planets.find(function(p) {
    return p.type === 'iceGiant' && !p.forming;
  });
  let startX = 0, startY = 0;
  if (icePlanet) {
    const angle = icePlanet.angle;
    startX = Math.cos(angle) * icePlanet.orbitR;
    startY = Math.sin(angle) * icePlanet.orbitR * 0.5;
  }

  // ★ Спавним визуальную комету в PART.passing
  if (typeof PART !== 'undefined' && PART.passing) {
    const W = window.CANVAS_W || 400;
    const H = window.CANVAS_H || 700;
    const z = S.zoom || 1;
    const halfW = W / (2 * z);
    const halfH = H / (2 * z);
    // Летит от края экрана через всю сцену
    const side = Math.floor(Math.random() * 4);
    let vx, vy, x, y;
    const speed = 60 + Math.random() * 40;
    if (side === 0) { x = (Math.random()*2-1)*halfW; y = -halfH - 40; vx = (Math.random()-0.5)*30; vy = speed; }
    else if (side === 1) { x = halfW + 40; y = (Math.random()*2-1)*halfH; vx = -speed; vy = (Math.random()-0.5)*30; }
    else if (side === 2) { x = (Math.random()*2-1)*halfW; y = halfH + 40; vx = (Math.random()-0.5)*30; vy = -speed; }
    else { x = -halfW - 40; y = (Math.random()*2-1)*halfH; vx = speed; vy = (Math.random()-0.5)*30; }

    PART.passing.push({
      x: x, y: y, vx: vx, vy: vy,
      type: 'comet',
      size: 0.5 + Math.random() * 0.5,
      tailLen: 18,
      alpha: 1, age: 0, trail: [],
      missionId: 'comet_' + Date.now(),
    });
  }

  MISS.comets.push({
    id: Math.random().toString(36).slice(2),
    startAt: Date.now(),
    flightTime,
    reward,
    fail: Math.random() < 0.25,
  });

  if (typeof toast === 'function') {
    toast('☄️ Комета запущена', 'Возврат через ' + fmtTime(flightTime / 1000));
  }
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
  if (!S.planets.some(p => PLANET_TYPES[p.type].civ && !p.forming)) {
    return { ok: false, reason: 'Нужна планета с жизнью' };
  }
  return { ok: true, cost };
}

  // ★ Спавним визуальный корабль
  if (typeof PART !== 'undefined' && PART.passing) {
    const W = window.CANVAS_W || 400;
    const H = window.CANVAS_H || 700;
    const z = S.zoom || 1;
    const halfW = W / (2 * z);
    const halfH = H / (2 * z);
    const side = Math.floor(Math.random() * 4);
    let vx, vy, x, y;
    const speed = 50 + Math.random() * 40;
    if (side === 0) { x = (Math.random()*2-1)*halfW; y = -halfH - 40; vx = (Math.random()-0.5)*20; vy = speed; }
    else if (side === 1) { x = halfW + 40; y = (Math.random()*2-1)*halfH; vx = -speed; vy = (Math.random()-0.5)*20; }
    else if (side === 2) { x = (Math.random()*2-1)*halfW; y = halfH + 40; vx = (Math.random()-0.5)*20; vy = -speed; }
    else { x = -halfW - 40; y = (Math.random()*2-1)*halfH; vx = speed; vy = (Math.random()-0.5)*20; }

    PART.passing.push({
      x: x, y: y, vx: vx, vy: vy,
      type: 'ship',
      size: 0.4 + Math.random() * 0.4,
      tailLen: 10,
      alpha: 1, age: 0, trail: [],
      missionId: 'exp_' + Date.now(),
    });
  }

  MISS.expeditions.push({
    id: Math.random().toString(36).slice(2),
    startAt: Date.now(),
    flightTime,
    reward,
    fail: Math.random() < 0.15,
    hasColony: Math.random() < 0.05,
  });

  if (typeof toast === 'function') {
    toast('🚀 Экспедиция запущена', 'Возврат через ' + fmtTime(flightTime / 1000));
  }
  return true;
}

// ─── НОВАЯ СИСТЕМА (напрямую за энергию + цив) ──────────────────

function canCreateSystem() {
  if (S.civLevel < 8) return { ok: false, reason: 'Нужен цив. 8' };
  const eCost = newSystemEnergyCost();
  const cCost = newSystemCivCost();
  if (S.energy < eCost) return { ok: false, reason: 'Нужно ' + fmt(eCost) + '⚡' };
  if (S.civLevel < cCost) return { ok: false, reason: 'Нужно ' + cCost + '🧬' };
  return { ok: true, eCost, cCost };
}

function createNewSystem() {
  const check = canCreateSystem();
  if (!check.ok) {
    if (typeof toast === 'function') toast('Система недоступна', check.reason);
    return false;
  }
  S.energy -= check.eCost;
  S.civLevel -= check.cCost;

  const newName = prompt('Имя новой системы:',
    'Система ' + (S.systems + 1));
  const finalName = (newName || 'Система ' + (S.systems + 1)).trim().slice(0, 16);

  S.otherSystems.push({
    name: finalName,
    starType: 'G',
    systemType: 'single',
    planets: [],
  });
  S.systems++;
  S.totalSystemsCreated = (S.totalSystemsCreated || 1) + 1;

  if (typeof toast === 'function') {
    toast('Система основана', finalName + ' · Всего: ' + S.systems);
  }
  return true;
}

// ─── ОБНОВЛЕНИЕ МИССИЙ ──────────────────────────────────────────

function updateMissions() {
  const now = Date.now();

  // Кометы
  for (let i = MISS.comets.length - 1; i >= 0; i--) {
    const c = MISS.comets[i];
    if (now - c.startAt >= c.flightTime) {
      if (c.fail) {
        if (typeof toast === 'function') toast('☄️ Комета потеряна', 'Не вернулась');
      } else {
        S.dust += c.reward;
        S.dustTotal += c.reward;
        if (typeof toast === 'function') {
          toast('☄️ Комета вернулась', '+' + fmt(c.reward));
        }
      }
      MISS.comets.splice(i, 1);
    }
  }

  // Экспедиции
  for (let i = MISS.expeditions.length - 1; i >= 0; i--) {
    const e = MISS.expeditions[i];
    if (now - e.startAt >= e.flightTime) {
      if (e.fail) {
        if (typeof toast === 'function') toast('🚀 Экспедиция потеряна', 'Корабль не вернулся');
      } else {
        S.dust += e.reward;
        S.dustTotal += e.reward;
        if (typeof toast === 'function') {
          toast('🚀 Экспедиция вернулась', '+' + fmt(e.reward));
        }
        if (e.hasColony) {
          setTimeout(offerColony, 800);
        }
      }
      MISS.expeditions.splice(i, 1);
    }
  }
}

// ─── КОЛОНИЯ ────────────────────────────────────────────────────

function offerColony() {
  const modal = document.getElementById('modal');
  if (modal && modal.classList.contains('show')) return;

  const eCost = colonyEnergyCost();
  const cCost = colonyCivCost();
  const canE = S.energy >= eCost;
  const canC = S.civLevel >= cCost;
  const can = canE && canC;

  const choices = [
    {
      id: 'colonize',
      name: 'Освоить систему',
      desc: can ? '+50% к глобальному доходу' : 'Не хватает ресурсов',
      stats: '⚡ ' + fmt(eCost) + (canE ? ' ✓' : ' ✗') +
             ' · 🧬 ' + cCost + (canC ? ' ✓' : ' ✗'),
      color: '#2eaa77',
      icon: '🌍',
      disabled: !can,
      run: () => {
        S.energy -= eCost;
        S.civLevel -= cCost;
        S.systems++;
        S.totalSystemsCreated = (S.totalSystemsCreated || 1) + 1;
        if (typeof toast === 'function') {
          toast('Колония основана', 'Всего систем: ' + S.systems);
        }
      },
    },
    {
      id: 'skip',
      name: 'Отказаться',
      desc: 'Сохранить ресурсы',
      stats: 'Ничего не изменится',
      color: '#6b6b6b',
      icon: '✕',
      run: () => {
        if (typeof toast === 'function') toast('Отказ', 'Ресурсы сохранены');
      },
    },
  ];

  if (typeof setModal === 'function') {
    setModal(
      buildModal('Обнаружена система',
        'Экспедиция нашла пригодную для жизни систему. Освоить её?',
        choices),
      buildHandlers(choices, (id) => {
        const c = choices.find(x => x.id === id);
        if (c && c.run) c.run();
        if (typeof closeEvolutionModal === 'function') closeEvolutionModal();
      })
    );
  } else {
    // Fallback — простой confirm
    if (can && confirm('Освоить новую систему?')) {
      S.energy -= eCost;
      S.civLevel -= cCost;
      S.systems++;
      S.totalSystemsCreated = (S.totalSystemsCreated || 1) + 1;
      if (typeof toast === 'function') toast('Колония основана', 'Всего: ' + S.systems);
    }
  }
}

// ─── КНОПКИ МИССИЙ ──────────────────────────────────────────────

function renderMissionButtons() {
  const container = document.getElementById('missionButtons');
  if (!container) return;

  const cometCheck = canLaunchComet();
  const expCheck = canLaunchExpedition();
  const sysCheck = canCreateSystem();

  let html = '';

  // Комета
  if (cometCheck.ok) {
    html += '<button class="mission-btn comet" id="btnComet">' +
      '<div class="mb-icon">☄️</div><div>Комета</div>' +
      '<div class="mb-cost">' + fmt(cometCheck.cost) + ' ✦</div></button>';
  } else if (cometCheck.reason !== 'Нужен ледяной гигант') {
    html += '<button class="mission-btn disabled" disabled>' +
      '<div class="mb-icon">☄️</div><div>Комета</div>' +
      '<div class="mb-cost">' + cometCheck.reason + '</div></button>';
  }

  // Экспедиция
  if (expCheck.ok) {
    html += '<button class="mission-btn exp" id="btnExp">' +
      '<div class="mb-icon">🚀</div><div>Экспедиция</div>' +
      '<div class="mb-cost">' + fmt(expCheck.cost) + ' ⚡</div></button>';
  } else if (expCheck.reason !== 'Нужен цив. 6' &&
             expCheck.reason !== 'Нужна планета с жизнью') {
    html += '<button class="mission-btn disabled" disabled>' +
      '<div class="mb-icon">🚀</div><div>Экспедиция</div>' +
      '<div class="mb-cost">' + expCheck.reason + '</div></button>';
  }

  // Новая система (только если доступна)
  if (sysCheck.ok) {
    html += '<button class="mission-btn sys" id="btnSys">' +
      '<div class="mb-icon">🌌</div><div>Система</div>' +
      '<div class="mb-cost">' + fmt(sysCheck.eCost) + '⚡ ' +
        sysCheck.cCost + '🧬</div></button>';
  }

  container.innerHTML = html;

  const btnComet = document.getElementById('btnComet');
  if (btnComet) btnComet.addEventListener('click', launchComet);

  const btnExp = document.getElementById('btnExp');
  if (btnExp) btnExp.addEventListener('click', launchExpedition);

  const btnSys = document.getElementById('btnSys');
  if (btnSys) btnSys.addEventListener('click', createNewSystem);
}

// ─── ЭКСПОРТ ────────────────────────────────────────────────────
window.updateMissions = updateMissions;
window.renderMissionButtons = renderMissionButtons;
window.canLaunchComet = canLaunchComet;
window.canLaunchExpedition = canLaunchExpedition;
window.canCreateSystem = canCreateSystem;
window.launchComet = launchComet;
window.launchExpedition = launchExpedition;
window.createNewSystem = createNewSystem;
window.offerColony = offerColony;
window.cometCost = cometCost;
window.MISS = MISS;
