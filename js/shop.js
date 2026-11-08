// ═══════════════════════════════════════════════════════════════
//  SHOP.JS — Магазин новых систем (фаза «Галактика»)
//
//  ★ Покупка партией: ползунок выбирает, сколько систем основать за один
//    раз. Максимум считается по пыли — это единственный обязательный
//    ресурс. Энергия и цивилизация не дают планет/дохода, а только
//    повышают шанс, что система окажется «живой» (колонизируемой).
// ═══════════════════════════════════════════════════════════════

function systemShopCosts() {
  const cfg = SYSTEM_SHOP_CFG || {};
  // ★ Цена берётся по индексу систем: внутри галактики он не откатывается,
  // а после престижа пересчитывается от выживших систем (см. prestige.js).
  const systemsOwned = (typeof nextSystemCostIndex === 'function')
    ? nextSystemCostIndex()
    : Math.max(0, (S.systems || 1) - 1);
  let dust = systemCost(systemsOwned);
  if (typeof getActiveSystemDiscount === 'function') {
    const disc = getActiveSystemDiscount();
    if (disc > 0) dust = Math.floor(dust * (1 - Math.min(1, disc)));
  }
  return {
    dust: dust,
    energy: Math.max(1000, Math.floor(energyPerSec() * (cfg.shopEnergySeconds || 1800))),
    civ: Math.max(10, Math.floor(civPerSec() * (cfg.shopCivSeconds || 900))),
  };
}

// ★ Цены фиксируются на всю покупку: вливание цивилизации уменьшает
//   S.civLevel и меняет energyPerSec(), из-за чего цена энергии «скачет».
//   Снимок хранится в S.systemShopCost и живёт до создания/отмены.
function systemShopActiveCosts() {
  const snap = S.systemShopCost;
  if (snap && typeof snap === 'object' &&
      Number.isFinite(Number(snap.dust)) && Number(snap.dust) >= 0 &&
      Number.isFinite(Number(snap.energy)) && Number(snap.energy) >= 0 &&
      Number.isFinite(Number(snap.civ)) && Number(snap.civ) >= 0) {
    return snap;
  }
  const costs = systemShopCosts();
  S.systemShopCost = { dust: costs.dust, energy: costs.energy, civ: costs.civ };
  return S.systemShopCost;
}

function systemShopFill(res) {
  const costs = systemShopActiveCosts();
  const progress = (S.systemShopProgress && S.systemShopProgress[res]) || 0;
  return Math.max(0, Math.min(1, progress / costs[res]));
}

// ─── Партия систем ─────────────────────────────────────────────
// Цена одной системы с учётом скидок (тех-скидка уже внутри systemCost).
function systemShopUnitCost(index) {
  let cost = systemCost(index);
  if (typeof getActiveSystemDiscount === 'function') {
    const disc = getActiveSystemDiscount();
    if (disc > 0) cost = Math.floor(cost * (1 - Math.min(1, disc)));
  }
  return Math.max(0, cost);
}

function systemShopStartIndex() {
  return (typeof nextSystemCostIndex === 'function')
    ? nextSystemCostIndex()
    : Math.max(0, (S.systems || 1) - 1);
}

// Суммарная цена count систем подряд — каждая следующая дороже.
function systemShopBatchTotal(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const start = systemShopStartIndex();
  let total = 0;
  for (let k = 0; k < n; k++) total += systemShopUnitCost(start + k);
  return total;
}

// Сколько систем игрок реально может основать на текущую пыль.
function systemShopMaxSystems() {
  const cfg = SYSTEM_SHOP_CFG || {};
  const cap = Math.max(1, Math.floor(cfg.batchMax || 50));
  const start = systemShopStartIndex();
  let budget = Math.max(0, Number(S.dust) || 0);
  let total = 0, n = 0;
  while (n < cap) {
    const c = systemShopUnitCost(start + n);
    if (total + c > budget) break;
    total += c;
    n++;
  }
  return n;
}

function systemShopBatchCount() {
  const maxN = systemShopMaxSystems();
  const raw = Math.floor(Number(S.systemShopBatch) || 1);
  const n = Math.max(1, Math.min(Math.max(1, maxN), raw));
  S.systemShopBatch = n;
  return n;
}

// Шанс, что система окажется с жизнью (0..1): энергия и цивилизация
// складываются поровну и дают до 100% от lifeChanceFull.
function systemShopLifeChance() {
  const cfg = SYSTEM_SHOP_CFG || {};
  const eFill = systemShopFill('energy');
  const cFill = systemShopFill('civ');
  const t = (eFill + cFill) / 2;
  const full = Number(cfg.lifeChanceFull || cfg.colonyChanceFull || 0.6);
  return Math.max(0, Math.min(1, full * t));
}

function systemShopOutcome() {
  const cfg = SYSTEM_SHOP_CFG || {};
  const eFill = systemShopFill('energy');
  const cFill = systemShopFill('civ');
  const colony = systemShopLifeChance();
  const gas = Math.min(cfg.gasChance || 0.3, 1 - colony);
  const ice = Math.max(0, 1 - colony - gas);
  return {
    eFill: eFill, cFill: cFill,
    colony: colony, lifeChance: colony,
    gas: gas, ice: ice,
    // Оставлены для совместимости: энергия больше не даёт планет/дохода.
    extraPlanets: 0,
    incomeBonus: 0,
  };
}

// Склонение для кнопки «Создать N ...» (винительный падеж).
function systemWordAcc(n) {
  const v = Math.abs(Math.floor(Number(n) || 0)) % 100;
  const d = v % 10;
  if (v > 10 && v < 20) return 'систем';
  if (d === 1) return 'систему';
  if (d >= 2 && d <= 4) return 'системы';
  return 'систем';
}

function pourSystemShop(res, part) {
  if (!S.systemShopProgress) S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };
  const costs = systemShopActiveCosts();
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

// flavor: 'colony' — система с жизнью, 'gas' — газовая, 'ice' — обычная.
function generateShopSystem(flavor) {
  return generateRandomSystem({ isColony: flavor === 'colony' });
}

function createSystemFromShop() {
  try {
    const out = systemShopOutcome();
    const maxN = systemShopMaxSystems();
    const wanted = Math.floor(Number(S.systemShopBatch) || 1);
    const count = Math.max(1, Math.min(maxN > 0 ? maxN : 1, wanted));
    const totalCost = systemShopBatchTotal(count);

    if (maxN < 1 || Number(S.dust) < totalCost) {
      toast('Не хватает пыли', 'Нужно ✦ ' + fmt(totalCost) + ' · есть ✦ ' + fmt(Math.floor(S.dust || 0)));
      return false;
    }

    S.dust = Math.max(0, Number(S.dust) - totalCost);
    S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };
    S.systemShopCost = null;
    S.systemShopBatch = 1;

    let colonyCount = 0;
    let firstNew = null;
    let lastIdx = S.otherSystems.length;

    const prevTotalSystems = S.totalSystemsCreated || 1;
    for (let k = 0; k < count; k++) {
      const roll = Math.random();
      let flavor = 'ice';
      if (roll < out.colony) { flavor = 'colony'; colonyCount++; }
      else if (roll < out.colony + out.gas) flavor = 'gas';

      const newSys = generateShopSystem(flavor);
      if (!firstNew) firstNew = newSys;
      if (S.otherSystems.length === 0 || S.otherSystems[0] === undefined) S.otherSystems[0] = null;
      lastIdx = S.otherSystems.length;
      S.otherSystems.push(newSys);
      S.systems++;
      S.totalSystemsCreated = (S.totalSystemsCreated || 1) + 1;
      if (typeof bumpSystemCostFloor === 'function') bumpSystemCostFloor();
    }
    if (typeof checkGalaxyMergeThresholds === 'function') {
      checkGalaxyMergeThresholds(prevTotalSystems, S.totalSystemsCreated);
    }
    if (S.systems >= 5 && S.stage === 'system') {
      S.stage = 'galaxy';
      setTimeout(function() { toast('🌌 Галактика сформирована', 'Теперь доступен Престиж!'); }, 1000);
    }

    if (typeof consumeSystemContract === 'function') consumeSystemContract();

    // Одиночную систему сразу открываем; партию — оставляем на карте галактики.
    if (count === 1 && typeof switchToSystem === 'function') switchToSystem(lastIdx);
    S.stage = 'galaxy';

    if (count === 1) {
      const sys = firstNew || null;
      const starName = (sys && STAR_TYPES[sys.starType]) ? STAR_TYPES[sys.starType].name : '';
      toast('🌌 Система основана',
        (sys ? sys.name : '') + (starName ? ' · ' + starName : '') +
        (colonyCount > 0 ? ' · 🧬 есть жизнь' : ''));
    } else {
      toast('🌌 Основано систем: ' + count,
        'с жизнью: ' + colonyCount + ' · всего систем: ' + S.systems);
    }

    if (typeof saveGame === 'function') saveGame();
    if (typeof updateUI === 'function') updateUI();
    if (typeof updateSystemSwitcher === 'function') updateSystemSwitcher();
    document.getElementById('modal').classList.remove('show');
    // ★ Принудительно фиксируем покупку системы, чтобы прогресс не потерялся
    if (typeof autoSaveToCloud === 'function') autoSaveToCloud(true);
    return true;
  } catch (e) {
    alert('ОШИБКА ПРИ СОЗДАНИИ: ' + e.message);
    console.error(e);
    return false;
  }
}

function cancelSystemCreation() {
  S.systemShopCost = null;
  S.systemShopBatch = 1;
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

// ─── Ползунок партии ───────────────────────────────────────────
function onSystemShopSlider(val) {
  const maxN = systemShopMaxSystems();
  const n = Math.max(1, Math.min(Math.max(1, maxN), Math.floor(Number(val) || 1)));
  S.systemShopBatch = n;
  updateSystemShopBatchUI();
}

// Пересчитывает подписи без перерисовки модалки (чтобы ползунок не прыгал).
function updateSystemShopBatchUI() {
  const maxN = systemShopMaxSystems();
  const n = systemShopBatchCount();
  const total = systemShopBatchTotal(n);
  const life = systemShopLifeChance();

  const countEl = document.getElementById('shopBatchCount');
  if (countEl) countEl.textContent = String(n);
  const wordEl = document.getElementById('shopBatchWord');
  if (wordEl) wordEl.textContent = systemWordAcc(n);
  const totalEl = document.getElementById('shopBatchTotal');
  if (totalEl) totalEl.textContent = fmt(total);

  const leftEl = document.getElementById('shopBatchLeft');
  if (leftEl) {
    leftEl.textContent = maxN < 1
      ? 'Не хватает пыли на одну систему'
      : 'Можно создать: ' + maxN + ' · останется ✦ ' + fmt(Math.max(0, (S.dust || 0) - total));
  }

  const lifeEl = document.getElementById('shopLifeSummary');
  if (lifeEl) {
    lifeEl.innerHTML = 'Шанс жизни: <b>' + Math.round(life * 100) + '%</b> на систему · ожидается ≈ ' +
      (n * life).toFixed(1) + ' из ' + n;
  }

  const btn = document.getElementById('shopCreateBtn');
  if (btn) {
    btn.textContent = '🌌 Создать ' + n + ' ' + systemWordAcc(n);
    btn.disabled = maxN < 1;
    btn.style.opacity = maxN < 1 ? '0.5' : '1';
  }
}

function openSystemShop() {
  const card = document.getElementById('modalCard');
  if (!card) return;
  if (!S.systemShopProgress) S.systemShopProgress = { dust: 0, energy: 0, civ: 0 };

  // ★ Пыль больше не «вливается» шкалой — её распределяет ползунок.
  //   Старый прогресс из сейва возвращаем игроку, чтобы ничего не пропало.
  if (S.systemShopProgress.dust > 0) {
    S.dust = (S.dust || 0) + S.systemShopProgress.dust;
    S.systemShopProgress.dust = 0;
  }

  const cfg = SYSTEM_SHOP_CFG || {};
  const costs = systemShopActiveCosts();
  const maxN = systemShopMaxSystems();
  const batch = systemShopBatchCount();
  const canBuy = maxN >= 1;

  const unitCost = systemShopUnitCost(systemShopStartIndex());
  const totalCost = systemShopBatchTotal(batch);
  const leftDust = Math.max(0, (S.dust || 0) - totalCost);

  const eFill = systemShopFill('energy');
  const cFill = systemShopFill('civ');
  const lifeFull = Number(cfg.lifeChanceFull || cfg.colonyChanceFull || 0.6);
  const energyLife = Math.round(lifeFull * eFill * 0.5 * 100);
  const civLife = Math.round(lifeFull * cFill * 0.5 * 100);
  const life = systemShopLifeChance();

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

  card.innerHTML = `
    <div class="modal-title">🌌 Новая звёздная система</div>
    <div class="modal-sub">Систем в галактике: ${S.systems}</div>
    <div class="info-box">
      <div class="shop-batch">
        <div class="shop-scale-head">
          <span>✦ Пыль · цена одной системы</span>
          <span>${fmt(unitCost)}</span>
        </div>
        <input id="shopBatchSlider" class="shop-slider" type="range"
          min="1" max="${Math.max(1, maxN)}" step="1" value="${batch}"
          ${canBuy ? '' : 'disabled'}
          oninput="onSystemShopSlider(this.value)">
        <div class="shop-batch-foot">
          <span class="shop-batch-count">✦ <b id="shopBatchCount">${batch}</b> <span id="shopBatchWord">${systemWordAcc(batch)}</span></span>
          <span class="shop-batch-total" id="shopBatchTotal">${fmt(totalCost)}</span>
        </div>
        <div class="shop-hint" id="shopBatchLeft">${canBuy
          ? ('Можно создать: ' + maxN + ' · останется ✦ ' + fmt(leftDust))
          : 'Не хватает пыли на одну систему'}</div>
      </div>
      ${row('energy', '⚡', 'Энергия', costs.energy, 'Шанс жизни +' + energyLife + '%', S.energy)}
      ${row('civ', '🧬', 'Цивилизация', costs.civ, 'Шанс жизни +' + civLife + '%', S.civLevel)}
      <div class="shop-life-summary" id="shopLifeSummary">Шанс жизни: <b>${Math.round(life * 100)}%</b> на систему · ожидается ≈ ${(batch * life).toFixed(1)} из ${batch}</div>
    </div>
    <button class="stars-btn" id="shopCreateBtn" style="background:linear-gradient(135deg,#6b4de6,#b9a8ff);color:#fff; opacity:${canBuy ? '1' : '0.5'};"
      ${canBuy ? '' : 'disabled'}
      onclick="createSystemFromShop()">
      🌌 Создать ${batch} ${systemWordAcc(batch)}
    </button>
    <button class="pour-btn" style="width:100%;margin-top:10px;background:rgba(255,94,94,0.2);border-color:rgba(255,94,94,0.5);color:#ff8a8a;" onclick="cancelSystemCreation()">✕ Отмена</button>
  `;
  document.getElementById('modal').classList.add('show');
}

window.systemShopCosts = systemShopCosts;
window.systemShopActiveCosts = systemShopActiveCosts;
window.systemShopFill = systemShopFill;
window.systemShopUnitCost = systemShopUnitCost;
window.systemShopBatchTotal = systemShopBatchTotal;
window.systemShopMaxSystems = systemShopMaxSystems;
window.systemShopBatchCount = systemShopBatchCount;
window.systemShopLifeChance = systemShopLifeChance;
window.onSystemShopSlider = onSystemShopSlider;
window.pourSystemShop = pourSystemShop;
window.openSystemShop = openSystemShop;
window.createSystemFromShop = createSystemFromShop;
