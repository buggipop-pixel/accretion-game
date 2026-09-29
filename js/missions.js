// ═══════════════════════════════════════════════════════════════
//  MISSIONS.JS — кометы, экспедиции, колонии
// ═══════════════════════════════════════════════════════════════

const MISS = {
  comets: [],
  expeditions: [],
  lastCometAt: 0,
  lastExpeditionAt: 0,
};

// ─── Стоимости ──────────────────────────────────────────────────
function cometCost() {
  const ice = S.planets.filter(function(p) {
    return p.type === 'iceGiant' && !p.forming;
  }).length;
  const base = 500000;
  return Math.floor(base / Math.max(1, ice));
}

function expeditionEnergyCost() {
  return Math.floor(5000 * Math.pow(2, S.systems - 1));
}

function colonyEnergyCost() {
  return Math.floor(50000 * Math.pow(2, S.systems - 1));
}
function colonyCivCost() {
  return Math.floor(50 * Math.pow(1.8, S.systems - 1));
}

function newSystemEnergyCost() {
  return Math.floor(150000 * Math.pow(2.5, S.systems - 1));
}
function newSystemCivCost() {
  return Math.floor(80 * Math.pow(1.8, S.systems - 1));
}

// ─── КОМЕТЫ ─────────────────────────────────────────────────────
function canLaunchComet() {
  const ice = S.planets.filter(function(p) {
    return p.type === 'iceGiant' && !p.forming;
  }).length;
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

  // ★ Спавним визуальную комету
  if (typeof PART !== 'undefined' && PART.passing) {
    const W = window.CANVAS_W || 400;
    const H = window.CANVAS_H || 700;
    const z = S.zoom || 1;
    const halfW = W / (2 * z), halfH = H / (2 * z);
    const side = Math.floor(Math.random() * 4);
    let vx, vy, x, y;
    const speed = 60 + Math.random() * 40;
    if (side === 0) { x = (Math.random() * 2 - 1) * halfW; y = -halfH - 40; vx = (Math.random() - 0.5) * 30; vy = speed; }
    else if (side === 1) { x = halfW + 40; y = (Math.random() * 2 - 1) * halfH; vx = -speed; vy = (Math.random() - 0.5) * 30; }
    else if (side === 2) { x = (Math.random() * 2 - 1) * halfW; y = halfH + 40; vx = (Math.random() - 0.5) * 30; vy = -speed; }
    else { x = -halfW - 40; y = (Math.random() * 2 - 1) * halfH; vx = speed; vy = (Math.random() - 0.5) * 30; }

    PART.passing.push({
      x: x, y: y, vx: vx, vy: vy,
      type: 'comet',
      size: 0.5 + Math.random() * 0.5,
      tailLen: 18,
      alpha: 1, age: 0, trail: [],
    });
  }

  MISS.comets.push({
    id: Math.random().toString(36).slice(2),
    startAt: Date.now(),
    flightTime: flightTime,
    reward: reward,
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
  const hasCiv = S.planets.some(function(p) {
    return PLANET_TYPES[p.type].civ && !p.forming;
  });
  if (!hasCiv) return { ok: false, reason: 'Нужна планета с жизнью' };
  return { ok: true, cost: cost };
}

function launchExpedition() {
  const check = canLaunchExpedition();
  if (!check.ok) {
    if (typeof toast === 'function') toast('Экспедиция недоступна', check.reason);
    return false;
  }
  S.energy -= check.cost;
  MISS.lastExpeditionAt = Date.now();

  const flightTime = 120000 + Math.random() * 180000;
  const reward = Math.floor(1000000 * (1 + S.planets.length * 0.4) * S.systems);

  // ★ Спавним визуальный корабль
  if (typeof PART !== 'undefined' && PART.passing) {
    const W = window.CANVAS_W || 400;
    const H = window.CANVAS_H || 700;
    const z = S.zoom || 1;
    const halfW = W / (2 * z), halfH = H / (2 * z);
    const side = Math.floor(Math.random() * 4);
    let vx, vy, x, y;
    const speed = 50 + Math.random() * 40;
    if (side === 0) { x = (Math.random() * 2 - 1) * halfW; y = -halfH - 40; vx = (Math.random() - 0.5) * 20; vy = speed; }
    else if (side === 1) { x = halfW + 40; y = (Math.random() * 2 - 1) * halfH; vx = -speed; vy = (Math.random() - 0.5) * 20; }
    else if (side === 2) { x = (Math.random() * 2 - 1) * halfW; y = halfH + 40; vx = (Math.random() - 0.5) * 20; vy = -speed; }
    else { x = -halfW - 40; y = (Math.random() * 2 - 1) * halfH; vx = speed; vy = (Math.random() - 0.5) * 20; }

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
    startAt: Date.now(),
    flightTime: flightTime,
    reward: reward,
    fail: Math.random() < 0.15,
    hasColony: Math.random() < 0.05,
  });

  if (typeof toast === 'function') {
    toast('🚀 Экспедиция запущена', 'Возврат через ' + fmtTime(flightTime / 1000));
  }
  return true;
}

// ─── НОВАЯ СИСТЕМА ──────────────────────────────────────────────
function createNewSystem() {
  const check = canCreateSystem();
  if (!check.ok) {
    if (typeof toast === 'function') toast('Система недоступна', check.reason);
    return false;
  }
  S.energy -= check.eCost;
  S.civLevel -= check.cCost;

  const newName = prompt('Имя новой системы:', 'Система ' + (S.systems + 1));
  if (newName === null) {
    // Отмена — возвращаем ресурсы
    S.energy += check.eCost;
    S.civLevel += check.cCost;
    return false;
  }
  const finalName = (newName || 'Система ' + (S.systems + 1)).trim().slice(0, 16);

  // ★ Гарантируем слот 0 (placeholder для родной системы)
  if (S.otherSystems.length === 0 || S.otherSystems[0] === undefined) {
    S.otherSystems[0] = null;
  }

  // ★ Добавляем новую систему в конец
  const newIdx = S.otherSystems.length;
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

  // ★ Переключаемся на новую систему
  if (typeof switchToSystem === 'function') {
    switchToSystem(newIdx);
  }
  return true;
}

// ─── ОБНОВЛЕНИЕ ─────────────────────────────────────────────────
function updateMissions() {
  const now = Date.now();

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
        if (e.hasColony) setTimeout(offerColony, 800);
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
      run: function() {
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
      run: function() {
        if (typeof toast === 'function') toast('Отказ', 'Ресурсы сохранены');
      },
    },
  ];

  if (typeof setModal === 'function') {
    setModal(
      buildModal('Обнаружена система',
        'Экспедиция нашла пригодную для жизни систему. Освоить её?',
        choices),
      buildHandlers(choices, function(id) {
        const c = choices.find(function(x) { return x.id === id; });
        if (c && c.run) c.run();
        if (typeof closeEvolutionModal === 'function') closeEvolutionModal();
      })
    );
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

  if (sysCheck.ok) {
    html += '<button class="mission-btn sys" data-action="sys">' +
      '<div class="mb-icon">🌌</div><div>Система</div>' +
      '<div class="mb-cost">' + fmt(sysCheck.eCost) + '⚡ ' +
        sysCheck.cCost + '🧬</div></button>';
  }

  // ★ Обновляем только если структура изменилась
  const newKey = html;
  if (container.dataset.key !== newKey) {
    container.innerHTML = html;
    container.dataset.key = newKey;
  }
}

// ★ ОДИН обработчик на контейнер — устанавливается один раз
(function setupMissionButtonsDelegation() {
  function attach() {
    const container = document.getElementById('missionButtons');
    if (!container) { setTimeout(attach, 200); return; }
    container.addEventListener('click', function(e) {
      const btn = e.target.closest('.mission-btn');
      if (!btn || btn.disabled) return;
      const action = btn.dataset.action;
      if (action === 'comet') launchComet();
      else if (action === 'exp') launchExpedition();
      else if (action === 'sys') createNewSystem();
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();

// ─── Экспорт ────────────────────────────────────────────────────
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
