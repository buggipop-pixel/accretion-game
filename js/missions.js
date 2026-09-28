// MISSIONS.JS — кометы, экспедиции, колонии
const MISS = {
  comets: [],
  expeditions: [],
  lastCometAt: 0,
  lastExpeditionAt: 0,
};

function canLaunchComet() {
  const iceGiants = S.planets.filter(p => p.type === 'iceGiant' && !p.forming).length;
  if (iceGiants === 0) return { ok: false, reason: 'Нужен ледяной гигант' };
  const cost = cometCost();
  if (S.dust < cost) return { ok: false, reason: 'Нужно ' + fmt(cost) + ' пыли' };
  if (Date.now() - MISS.lastCometAt < 30000) {
    const left = Math.ceil((30000 - (Date.now() - MISS.lastCometAt)) / 1000);
    return { ok: false, reason: 'Кд ' + left + 'с' };
  }
  return { ok: true, cost, iceGiants };
}

function launchComet() {
  const check = canLaunchComet();
  if (!check.ok) return false;
  S.dust -= check.cost;
  MISS.lastCometAt = Date.now();

  const icePlanet = S.planets.find(p => p.type === 'iceGiant' && !p.forming);
  const reward = Math.floor(500000 * (1 + S.planets.length * 0.3) * check.iceGiants);
  const flightTime = 60000 + Math.random() * 60000;

  MISS.comets.push({
    id: Math.random().toString(36).slice(2),
    startAt: Date.now(), flightTime, reward,
    fail: Math.random() < 0.25,
    phase: 'outbound',
  });

  toast('☄️ Комета запущена', 'Возврат через ' + fmtTime(flightTime / 1000));
  return true;
}

function canLaunchExpedition() {
  if (S.civLevel < 6) return { ok: false, reason: 'Нужен цив. уровень 6' };
  const cost = expeditionEnergyCost();
  if (S.energy < cost) return { ok: false, reason: 'Нужно ' + fmt(cost) + '⚡' };
  if (Date.now() - MISS.lastExpeditionAt < 60000) {
    const left = Math.ceil((60000 - (Date.now() - MISS.lastExpeditionAt)) / 1000);
    return { ok: false, reason: 'Кд ' + left + 'с' };
  }
  if (MISS.expeditions.length >= 1) return { ok: false, reason: 'В пути' };
  return { ok: true, cost };
}

function expeditionEnergyCost() {
  return Math.floor(5000 * Math.pow(2, S.systems - 1));
}

function launchExpedition() {
  const check = canLaunchExpedition();
  if (!check.ok) return false;
  S.energy -= check.cost;
  MISS.lastExpeditionAt = Date.now();

  const flightTime = 120000 + Math.random() * 180000;
  const reward = Math.floor(1000000 * (1 + S.planets.length * 0.4) * S.systems);

  MISS.expeditions.push({
    id: Math.random().toString(36).slice(2),
    startAt: Date.now(), flightTime, reward,
    fail: Math.random() < 0.15,
    hasColony: Math.random() < 0.05,
    phase: 'outbound',
  });

  toast('🚀 Экспедиция запущена', 'Возврат через ' + fmtTime(flightTime / 1000));
  return true;
}

function updateMissions() {
  const now = Date.now();
  for (let i = MISS.comets.length - 1; i >= 0; i--) {
    const c = MISS.comets[i];
    if (now - c.startAt >= c.flightTime) {
      if (c.fail) toast('☄️ Комета потеряна', '');
      else {
        S.dust += c.reward; S.dustTotal += c.reward;
        toast('☄️ Комета вернулась', '+' + fmt(c.reward) + ' пыли');
      }
      MISS.comets.splice(i, 1);
    }
  }
  for (let i = MISS.expeditions.length - 1; i >= 0; i--) {
    const e = MISS.expeditions[i];
    if (now - e.startAt >= e.flightTime) {
      if (e.fail) toast('🚀 Экспедиция потеряна', '');
      else {
        S.dust += e.reward; S.dustTotal += e.reward;
        toast('🚀 Экспедиция вернулась', '+' + fmt(e.reward));
        if (e.hasColony) setTimeout(offerColony, 800);
      }
      MISS.expeditions.splice(i, 1);
    }
  }
}

function colonyEnergyCost() { return Math.floor(50000 * Math.pow(2, S.systems - 1)); }
function colonyCivCost() { return Math.floor(50 * Math.pow(1.8, S.systems - 1)); }

function offerColony() {
  if (document.getElementById('modal').classList.contains('show')) return;
  const eCost = colonyEnergyCost();
  const cCost = colonyCivCost();
  const can = S.energy >= eCost && S.civLevel >= cCost;
  showModal('Обнаружена система',
    'Экспедиция нашла пригодную для жизни систему. Освоить?',
    [{
      id: 'colonize', name: 'Освоить',
      desc: can ? '+50% к доходу' : 'Не хватает ресурсов',
      stats: '⚡ ' + fmt(eCost) + (S.energy >= eCost ? ' ✓' : ' ✗') +
             ' · 🧬 ' + cCost + (S.civLevel >= cCost ? ' ✓' : ' ✗'),
      color: '#2eaa77', icon: '🌍', disabled: !can,
      run: () => {
        S.energy -= eCost; S.civLevel -= cCost;
        S.systems++; S.totalSystemsCreated = (S.totalSystemsCreated || 1) + 1;
        toast('Колония основана', 'Всего: ' + S.systems);
      }
    }, {
      id: 'skip', name: 'Отказаться',
      desc: 'Сохранить ресурсы', stats: '',
      color: '#6b6b6b', icon: '✕',
      run: () => toast('Отказ', 'Ресурсы сохранены')
    }]
  );
}

function renderMissionButtons() {
  const container = document.getElementById('missionButtons');
  if (!container) return;
  const cometCheck = canLaunchComet();
  const expCheck = canLaunchExpedition();
  let html = '';

  if (cometCheck.ok) {
    html += '<button class="mission-btn comet" id="btnComet">' +
      '<div class="mb-icon">☄️</div><div>Комета</div>' +
      '<div class="mb-cost">' + fmt(cometCheck.cost) + ' пыли</div></button>';
  } else if (cometCheck.reason !== 'Нужен ледяной гигант') {
    html += '<button class="mission-btn disabled" disabled>' +
      '<div class="mb-icon">☄️</div><div>Комета</div>' +
      '<div class="mb-cost">' + cometCheck.reason + '</div></button>';
  }

  if (expCheck.ok) {
    html += '<button class="mission-btn exp" id="btnExp">' +
      '<div class="mb-icon">🚀</div><div>Экспедиция</div>' +
      '<div class="mb-cost">' + fmt(expCheck.cost) + ' ⚡</div></button>';
  } else if (expCheck.reason !== 'Нужен цив. уровень 6') {
    html += '<button class="mission-btn disabled" disabled>' +
      '<div class="mb-icon">🚀</div><div>Экспедиция</div>' +
      '<div class="mb-cost">' + expCheck.reason + '</div></button>';
  }

  container.innerHTML = html;
  document.getElementById('btnComet')?.addEventListener('click', launchComet);
  document.getElementById('btnExp')?.addEventListener('click', launchExpedition);
}

window.updateMissions = updateMissions;
window.renderMissionButtons = renderMissionButtons;
window.launchComet = launchComet;
window.launchExpedition = launchExpedition;
window.offerColony = offerColony;
window.MISS = MISS;
