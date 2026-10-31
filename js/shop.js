// ═══════════════════════════════════════════════════════════════
//  SHOP.JS — Магазин новых систем (фаза «Галактика»)
// ═══════════════════════════════════════════════════════════════

function systemShopCosts() {
  const cfg = SYSTEM_SHOP_CFG || {};
  const systemsOwned = Math.max(0, (S.systems || 1) - 1);
  let dust = systemCost(systemsOwned);
  if (typeof getActiveSystemDiscount === 'function') {
    const disc = getActiveSystemDiscount();
    if (disc > 0) dust = Math.floor(dust * (1 - Math.min(1, disc)));
  }
  return {
    dust: dust,
    energy: Math.max(1000, Math.floor(getResourceCap('energy') * (cfg.energyCapShare || 0.5))),
    civ: Math.max(10, Math.floor(getResourceCap('civ') * (cfg.civCapShare || 0.4))),
  };
}

function systemShopFill(res) {
  const costs = systemShopCosts();
  const progress = (S.systemShopProgress && S.systemShopProgress[res]) || 0;
  return Math.max(0, Math.min(1, progress / costs[res]));
}

function systemShopOutcome() {
  const cfg = SYSTEM_SHOP_CFG || {};
  const eFill = systemShopFill('energy');
  const cFill = systemShopFill('civ');
  const t = (eFill + cFill) / 2;
  const colony = (cfg.colonyChanceFull || 0.6) * t;
  const gas = Math.min(cfg.gasChance || 0.3, 1 - colony);
  const ice = Math.max(0, 1 - colony - gas);

  return {
    eFill: eFill, cFill: cFill, colony: colony, gas: gas, ice: ice,
    extraPlanets: Math.round((cfg.energyBonusPlanets || 2) * eFill),
    incomeBonus: (cfg.energyBonusIncome || 0.5) * eFill,
  };
}

function pourSystemShop(res, part) {
  if (!S.systemShopProgress) S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };
  const costs = systemShopCosts();
  const cost = costs[res];
  const poured = S.systemShopProgress[res] || 0;
  const remaining = cost - poured;

  const pool = res === 'dust' ? S.dust : (res === 'energy' ? S.energy : S.civLevel);
  const want = (part === 'max') ? remaining : Math.floor(cost * part);
  const amount = Math.floor(Math.min(want, remaining, pool));

  if (amount <= 0) { toast('Недостаточно ' + res, ''); return; }

  if (res === 'dust') S.dust -= amount;
  else if (res === 'energy') S.energy -= amount;
  else S.civLevel -= amount;

  S.systemShopProgress[res] = poured + amount;
  saveGame(); updateUI(); openSystemShop();
}

function systemShopAddPlanet(sys) {
  for (let i = 0; i < 8; i++) {
    const allowed = getAllowedTypesAtOrbit(sys.starType, i);
    if (!allowed || allowed.length === 0) continue;
    const orbitR = getOrbitR(i);
    let busy = false;
    for (let j = 0; j < sys.planets.length; j++) {
      if (Math.abs((sys.planets[j].baseOrbitR || 0) - orbitR) < ORBIT_GEOMETRY.minGap) { busy = true; break; }
    }
    if (busy) continue;
    const type = allowed[Math.floor(Math.random() * allowed.length)];
    sys.planets.push({
      type: type, angle: Math.random() * Math.PI * 2, speed: 0.2 / Math.pow(orbitR / 90, 1.5),
      baseOrbitR: orbitR, orbitR: orbitR, driftPhase: Math.random() * Math.PI * 2,
      rotation: Math.random() * Math.PI * 2, seed: Math.random() * 1e6,
      forming: false, formUntil: 0, mass: planetMass(type), diameter: planetDiameter(type),
      moons: [], precession: 0, trueAnomaly: 0,
    });
    return true;
  }
  return false;
}

function generateShopSystem(flavor, outcome) {
  const sys = generateRandomSystem({ isColony: flavor === 'colony' });
  for (let i = 0; i < outcome.extraPlanets; i++) {
    if (sys.planets.length >= 8) break;
    systemShopAddPlanet(sys);
  }
  sys.incomeBonus = outcome.incomeBonus;
  return sys;
}

function createSystemFromShop() {
  try {
    const dustFill = systemShopFill('dust');
    if (dustFill < 1) {
      toast('Не хватает пыли', 'Шкала пыли должна быть заполнена на 100%');
      return false;
    }

    const outcome = systemShopOutcome();
    const roll = Math.random();
    let flavor = 'ice';
    if (roll < outcome.colony) flavor = 'colony';
    else if (roll < outcome.colony + outcome.gas) flavor = 'gas';

    const newSys = generateShopSystem(flavor, outcome);
    S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };

    if (S.otherSystems.length === 0 || S.otherSystems[0] === undefined) S.otherSystems[0] = null;
    const newIdx = S.otherSystems.length;
    S.otherSystems.push(newSys);
    S.systems++;
    S.totalSystemsCreated = (S.totalSystemsCreated || 1) + 1;

    if (S.systems >= 5 && S.stage === 'system') {
      S.stage = 'galaxy';
      setTimeout(function() { toast('🌌 Галактика сформирована', 'Теперь доступен Престиж!'); }, 1000);
    }

    let toastMsg = newSys.name + ' · ' + STAR_TYPES[newSys.starType].name;
    toast('🌌 Система основана', toastMsg);
    
    if (typeof consumeSystemContract === 'function') consumeSystemContract();

    if (typeof switchToSystem === 'function') switchToSystem(newIdx);
    S.stage = 'galaxy'; // Принудительно переводим в режим галактики
    if (typeof updateUI === 'function') updateUI();
    if (typeof updateSystemSwitcher === 'function') updateSystemSwitcher();
    document.getElementById('modal').classList.remove('show');
    saveGame(); updateUI(); updateSystemSwitcher();
    return true;
    
  } catch(e) {
    alert('ОШИБКА ПРИ СОЗДАНИИ: ' + e.message);
    console.error(e);
    return false;
  }
}

function cancelSystemCreation() {
  if (!S.systemShopProgress) { document.getElementById('modal').classList.remove('show'); return; }
  const p = S.systemShopProgress;
  if (p.dust > 0) S.dust += p.dust;
  if (p.energy > 0) S.energy += p.energy;
  if (p.civ > 0) S.civLevel += p.civ;
  S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };
  saveGame(); updateUI();
  document.getElementById('modal').classList.remove('show');
  toast('Отменено', 'Ресурсы возвращены');
}

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
        <div class="shop-scale-head"><span>${icon} ${title}</span><span class="${done ? 'shop-done' : ''}">${fmt(poured)} / ${fmt(cost)}</span></div>
        <div class="storage-progress" style="height:8px;"><div class="storage-progress-fill" style="width:${pct}%"></div></div>
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
      ${row('dust', '✦', 'Пыль', costs.dust, 'Базовая система', S.dust)}
      ${row('energy', '⚡', 'Энергия', costs.energy, 'Бонус: +' + out.extraPlanets + ' планет, +' + Math.round(out.incomeBonus * 100) + '%', S.energy)}
      ${row('civ', '🧬', 'Цивилизация', costs.civ, 'Шанс жизни: ' + Math.round(out.colony * 100) + '%', S.civLevel)}
    </div>
    <button class="stars-btn" style="background:linear-gradient(135deg,#6b4de6,#b9a8ff);color:#fff; opacity:${dustOk ? '1' : '0.5'};" 
      onclick="createSystemFromShop()">
      🌌 Создать систему ${dustOk ? '' : '(Заполни пыль)'}
    </button>
    <button class="pour-btn" style="width:100%;margin-top:10px;background:rgba(255,94,94,0.2);border-color:rgba(255,94,94,0.5);color:#ff8a8a;" onclick="cancelSystemCreation()">✕ Отмена</button>
  `;
  document.getElementById('modal').classList.add('show');
}

window.systemShopCosts = systemShopCosts;
window.systemShopFill = systemShopFill;
window.pourSystemShop = pourSystemShop;
window.openSystemShop = openSystemShop;
window.createSystemFromShop = createSystemFromShop;