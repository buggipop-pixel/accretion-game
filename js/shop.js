// ═══════════════════════════════════════════════════════════════
//  SHOP.JS — магазин новых звёздных систем (фаза «Галактика»)
//  Три шкалы:
//    ✦ пыль        — обязательна (базовая система)
//    ⚡ энергия     — опционально: +2 планеты и +50% дохода системы
//    🧬 цивилизация — опционально: выше шанс обитаемой системы
//  После заполнения шкал ресурсы исчезают и генерируется система.
// ═══════════════════════════════════════════════════════════════

// ─── Стоимость трёх шкал ────────────────────────────────────────
function systemShopCosts() {
  const cfg = SYSTEM_SHOP_CFG || {};
  const dustSeconds = cfg.dustSeconds || 1800;
  const dust = Math.max(
    Math.floor(CFG.systemCostMin || 0),
    Math.floor(Math.max(dustPerSec(), 1) * dustSeconds)
  );
  return {
    dust: dust,
    energy: Math.max(1000, Math.floor(getResourceCap('energy') * (cfg.energyCapShare || 0.5))),
    civ: Math.max(10, Math.floor(getResourceCap('civ') * (cfg.civCapShare || 0.4))),
  };
}

// Заполненность шкалы 0..1
function systemShopFill(res) {
  const costs = systemShopCosts();
  const progress = (S.systemShopProgress && S.systemShopProgress[res]) || 0;
  return Math.max(0, Math.min(1, progress / costs[res]));
}

// ─── Итоговые шансы и бонусы для текущих вложений ───────────────
function systemShopOutcome() {
  const cfg = SYSTEM_SHOP_CFG || {};
  const eFill = systemShopFill('energy');
  const cFill = systemShopFill('civ');
  const t = (eFill + cFill) / 2;

  const colony = (cfg.colonyChanceFull || 0.6) * t;
  const gas = Math.min(cfg.gasChance || 0.3, 1 - colony);
  const ice = Math.max(0, 1 - colony - gas);

  return {
    eFill: eFill,
    cFill: cFill,
    colony: colony,
    gas: gas,
    ice: ice,
    extraPlanets: Math.round((cfg.energyBonusPlanets || 2) * eFill),
    incomeBonus: (cfg.energyBonusIncome || 0.5) * eFill,
  };
}

// ─── Вкидывание ресурса в шкалу магазина ────────────────────────
// part: 0.1 / 0.25 — доля стоимости, 'max' — всё, что есть
function pourSystemShop(res, part) {
  if (!S.systemShopProgress) S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };
  const costs = systemShopCosts();
  const cost = costs[res];
  const poured = S.systemShopProgress[res] || 0;
  const remaining = cost - poured;

  // Откуда списываем: пыль / энергия / уровень цивилизации
  const pool = res === 'dust' ? S.dust : (res === 'energy' ? S.energy : S.civLevel);

  const want = (part === 'max') ? remaining : Math.floor(cost * part);
  const amount = Math.floor(Math.min(want, remaining, pool));

  if (amount <= 0) {
    const names = { dust: 'пыли', energy: 'энергии', civ: 'цивилизации' };
    toast('Недостаточно ' + names[res],
      'Осталось вложить ' + fmt(remaining) + ', а у вас ' + fmt(pool));
    return;
  }

  if (res === 'dust') S.dust -= amount;
  else if (res === 'energy') S.energy -= amount;
  else S.civLevel -= amount;

  S.systemShopProgress[res] = poured + amount;

  saveGame();
  updateUI();
  openSystemShop();
}

// ─── Генерация системы под выбранный «вкус» ─────────────────────
function systemShopAddPlanet(sys) {
  // Ищем свободную орбиту под разрешённый для звезды тип планеты
  for (let i = 0; i < 8; i++) {
    const allowed = getAllowedTypesAtOrbit(sys.starType, i);
    if (!allowed || allowed.length === 0) continue;
    const orbitR = getOrbitR(i);
    let busy = false;
    for (let j = 0; j < sys.planets.length; j++) {
      if (Math.abs((sys.planets[j].baseOrbitR || 0) - orbitR) < ORBIT_GEOMETRY.minGap) {
        busy = true; break;
      }
    }
    if (busy) continue;

    const type = allowed[Math.floor(Math.random() * allowed.length)];
    sys.planets.push({
      type: type,
      angle: Math.random() * Math.PI * 2,
      speed: 0.15 / Math.sqrt(orbitR / 90),
      baseOrbitR: orbitR, orbitR: orbitR,
      driftPhase: Math.random() * Math.PI * 2,
      rotation: Math.random() * Math.PI * 2,
      seed: Math.random() * 1e6,
      forming: false, formUntil: 0,
      mass: planetMass(type),
      diameter: planetDiameter(type),
      moons: [], precession: 0, trueAnomaly: 0,
    });
    return true;
  }
  return false;
}

function systemShopEnsureType(sys, type) {
  for (let i = 0; i < sys.planets.length; i++) {
    if (sys.planets[i].type === type) return;
  }
  if (sys.planets.length === 0) return;
  // Превращаем последнюю необитаемую планету в нужный тип
  for (let i = sys.planets.length - 1; i >= 0; i--) {
    const pt = PLANET_TYPES[sys.planets[i].type];
    if (pt && pt.civ) continue;
    sys.planets[i].type = type;
    sys.planets[i].mass = planetMass(type);
    sys.planets[i].diameter = planetDiameter(type);
    return;
  }
}

function generateShopSystem(flavor, outcome) {
  const sys = generateRandomSystem({ isColony: flavor === 'colony' });
  for (let i = 0; i < outcome.extraPlanets; i++) {
    if (sys.planets.length >= 8) break;
    systemShopAddPlanet(sys);
  }
  if (flavor === 'gas') systemShopEnsureType(sys, 'gasGiant');
  if (flavor === 'ice') systemShopEnsureType(sys, 'iceGiant');
  sys.incomeBonus = outcome.incomeBonus;
  return sys;
}

// ─── Создание системы (когда шкала пыли заполнена) ──────────────
function createSystemFromShop() {
  const dustFill = systemShopFill('dust');
  if (dustFill < 1) {
    toast('Шкала пыли не заполнена',
      'Нужно вложить ' + fmt(systemShopCosts().dust) + ' ✦');
    return false;
  }

  const outcome = systemShopOutcome();
  const roll = Math.random();
  let flavor = 'ice';
  if (roll < outcome.colony) flavor = 'colony';
  else if (roll < outcome.colony + outcome.gas) flavor = 'gas';

  const newSys = generateShopSystem(flavor, outcome);

  // Ресурсы уже списаны при вкладе — обнуляем шкалы
  S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };

  if (S.otherSystems.length === 0 || S.otherSystems[0] === undefined) {
    S.otherSystems[0] = null;   // слот 0 — родная система
  }
  const newIdx = S.otherSystems.length;
  S.otherSystems.push(newSys);
  S.systems++;
  S.totalSystemsCreated = (S.totalSystemsCreated || 1) + 1;

  const flavorNames = { colony: 'обитаемая', gas: 'газовая', ice: 'ледяная' };
  toast('🌌 Система основана',
    newSys.name + ' · ' + STAR_TYPES[newSys.starType].name + ' · ' +
    flavorNames[flavor] +
    (outcome.incomeBonus > 0 ? ' · доход +' + Math.round(outcome.incomeBonus * 100) + '%' : ''));

  // Автопереход на новую систему
  if (typeof switchToSystem === 'function') switchToSystem(newIdx);

  if (typeof closeEvolutionModal === 'function') closeEvolutionModal();
  saveGame();
  updateUI();
  updateSystemSwitcher();
  return true;
}

// ─── Модалка магазина ───────────────────────────────────────────
function openSystemShop() {
  const card = document.getElementById('modalCard');
  if (!card) return;

  if (!S.systemShopProgress) S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };
  const costs = systemShopCosts();
  const out = systemShopOutcome();

  function row(res, icon, title, cost, hint, pool) {
    const poured = Math.min(S.systemShopProgress[res] || 0, cost);
    const pct = cost > 0 ? Math.min(100, (poured / cost) * 100) : 0;
    const done = poured >= cost;
    return `
      <div class="shop-scale">
        <div class="shop-scale-head">
          <span>${icon} ${title}</span>
          <span class="${done ? 'shop-done' : ''}">${fmt(poured)} / ${fmt(cost)}</span>
        </div>
        <div class="storage-progress" style="height:8px;">
          <div class="storage-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="shop-scale-foot">
          <span class="shop-hint">${hint} · доступно ${fmt(pool)}</span>
          <span class="pour-btn-group" style="margin:0;">
            <button class="pour-btn" onclick="pourSystemShop('${res}', 0.25)">+25%</button>
            <button class="pour-btn" onclick="pourSystemShop('${res}', 'max')">Всё</button>
          </span>
        </div>
      </div>`;
  }

  const dustOk = systemShopFill('dust') >= 1;

  card.innerHTML = `
    <div class="modal-title">🌌 Новая звёздная система</div>
    <div class="modal-sub">Систем в галактике: ${S.systems}</div>
    <div class="info-box">
      ${row('dust', '✦', 'Пыль (обязательно)', costs.dust,
        'Базовая система — 30 минут дохода', S.dust)}
      ${row('energy', '⚡', 'Энергия (+2 планеты, +50% дохода)', costs.energy,
        'Сейчас бонус: +' + out.extraPlanets + ' планет, +' +
        Math.round(out.incomeBonus * 100) + '%', S.energy)}
      ${row('civ', '🧬', 'Цивилизация (шанс жизни)', costs.civ,
        'Шанс обитаемой: ' + Math.round(out.colony * 100) + '%', S.civLevel)}
    </div>
    <div class="info-box">
      <div class="row-stat"><span>Обитаемая система:</span><span>${Math.round(out.colony * 100)}%</span></div>
      <div class="row-stat"><span>Газовая система:</span><span>${Math.round(out.gas * 100)}%</span></div>
      <div class="row-stat"><span>Ледяная система:</span><span>${Math.round(out.ice * 100)}%</span></div>
      <div class="row-stat"><span>Планет в системе:</span><span>+${out.extraPlanets}</span></div>
      <div class="row-stat"><span>Доход системы:</span><span>+${Math.round(out.incomeBonus * 100)}%</span></div>
    </div>
    ${dustOk ? `
      <button class="stars-btn" style="background:linear-gradient(135deg,#6b4de6,#b9a8ff);color:#fff;"
        onclick="createSystemFromShop()">🌌 Создать систему</button>
    ` : `
      <div class="modal-sub" style="color:#ffb347;font-weight:700;">
        Заполни шкалу пыли, чтобы создать систему
      </div>
    `}
  `;

  document.getElementById('modal').classList.add('show');
}

// ─── Экспорт ────────────────────────────────────────────────────
window.systemShopCosts = systemShopCosts;
window.systemShopFill = systemShopFill;
window.systemShopOutcome = systemShopOutcome;
window.pourSystemShop = pourSystemShop;
window.openSystemShop = openSystemShop;
window.createSystemFromShop = createSystemFromShop;
window.generateShopSystem = generateShopSystem;
