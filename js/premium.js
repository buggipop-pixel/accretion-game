// ═══════════════════════════════════════════════════════════════
//  PREMIUM.JS — Магазин, Сундуки, Премиум-Щит
// ═══════════════════════════════════════════════════════════════

// ─── API: сервер на Render ──────────────────────────────────────
const API_BASE = 'https://accretion-api-proxy.buggipop.workers.dev';

function getPremiumInitData() {
  const tg = window.Telegram && window.Telegram.WebApp;
  return (tg && tg.initData) ? tg.initData : '';
}

async function premiumApiPost(path, payload) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    // ★ status нужен наверх: claimPurchase отличает 404/410 (покупки нет)
    // от сети/5xx (можно повторить).
    const err = new Error((data && data.error) ? data.error : ('HTTP ' + res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

// Запрос реальной ссылки на оплату у сервера (bot.createInvoiceLink)
async function getInvoiceLink(product) {
  const initData = getPremiumInitData();
  if (!initData) return null;
  try {
    const r = await premiumApiPost('/api/create-invoice', { initData: initData, product: product });
    return (r && r.invoiceLink) ? r.invoiceLink : null;
  } catch (e) {
    console.warn('[premium] create-invoice failed:', e.message);
    return null;
  }
}

// Подтверждение выдачи покупки на сервере. Награду выдаёт ТОЛЬКО сервер:
// 404/410/409 = «покупки нет / уже выдана / истекла», и начислять лут
// локально нельзя — именно так сундук получали бесплатно.
// Сеть и 5xx повторяем: оплата могла пройти, а ответ потеряться.
function claimPurchase(product, attemptsLeft) {
  const initData = getPremiumInitData();
  if (!initData) return Promise.reject(new Error('Нет initData Telegram'));

  const left = Number.isFinite(attemptsLeft) ? attemptsLeft : 2;

  return premiumApiPost('/api/claim', { initData: initData, product: product })
    .catch(function(e) {
      const status = Number(e && e.status) || 0;
      const retryable = !status || status >= 500;
      if (left > 0 && retryable) {
        return new Promise(function(resolve) { setTimeout(resolve, 1500); })
          .then(function() { return claimPurchase(product, left - 1); });
      }
      throw e;
    })
    .then(function(r) {
      // ★ Право на платный щит выдаёт сервер. Применяем его абсолютную метку,
      // чтобы покупка переживала переустановку и не зависела от сейва.
      if (r && r.entitlement && r.entitlement.shieldUntil) {
        const until = Number(r.entitlement.shieldUntil) || 0;
        if (until > (S.shieldUntil || 0)) {
          S.shieldUntil = until;
          if (typeof saveGame === 'function') saveGame();
          if (typeof updateUI === 'function') updateUI();
        }
      }
      return r;
    });
}
window.API_BASE = API_BASE;
function openPremiumShop() {
  const card = document.getElementById('modalCard');
  if (!card) return;

  const shieldActive = S.shieldUntil && S.shieldUntil > Date.now();
  const shieldLeft = shieldActive ? Math.ceil((S.shieldUntil - Date.now()) / 3600000) : 0;
  
  const boostActive = S.boosters && S.boosters.incomeUntil > Date.now();
  const boostLeft = boostActive ? Math.ceil((S.boosters.incomeUntil - Date.now()) / 3600000) : 0;

  card.innerHTML = `
    <div class="modal-title">⚙ Магазин</div>
    <div class="modal-sub">Металлы: ${fmt(S.metalAmount || 0)} ⚙</div>

    <div class="info-box">
      <div class="row-stat">
        <span>🎁 Космический сундук</span>
        <span>Гарантированный Прайм-объект</span>
      </div>
      <button class="stars-btn" style="margin-top:8px; background:linear-gradient(135deg,#ffcc00,#ff9900); color:#000;" 
        onclick="buyPrimeChest()">
        ⭐ Открыть за ${CHEST_CFG.costStars} Stars
      </button>
    </div>

    <div class="info-box">
      <div class="row-stat">
        <span>🚀 Бустер Дохода (×${PREMIUM_CFG.booster.incomeMult})</span>
        <span>${boostActive ? 'Активен ' + boostLeft + 'ч' : PREMIUM_CFG.booster.hours + ' часа'}</span>
      </div>
      <button class="pour-btn" style="width:100%;margin-top:8px;"
        onclick="buyIncomeBooster()" ${(S.metalAmount || 0) >= PREMIUM_CFG.booster.costMetals ? '' : 'disabled'}>
        ${(S.metalAmount || 0) >= PREMIUM_CFG.booster.costMetals ? 'Купить за ' + PREMIUM_CFG.booster.costMetals + ' ⚙' : 'Нужно ' + PREMIUM_CFG.booster.costMetals + ' ⚙'}
      </button>
    </div>

    <div class="info-box">
      <div class="row-stat">
        <span>⭐ Премиум Щит (24ч)</span>
        <span>100% защита от вторжений и негативных событий</span>
      </div>
      <div class="modal-sub" style="margin-top:6px;color:#8b7fd4;">Альтернатива обороне: не требует уровней и флота.</div>
      <button class="stars-btn" style="margin-top:8px; background:linear-gradient(135deg,#ffb347,#ffcc00); color:#1a0f35;" onclick="buyPremiumShield()">
        ⭐ Купить за ${CHEST_CFG.shieldStars} Stars
      </button>
    </div>

    <button class="pour-btn" style="width:100%;margin-top:10px;background:rgba(255,94,94,0.2);border-color:rgba(255,94,94,0.5);color:#ff8a8a;"
      onclick="document.getElementById('modal').classList.remove('show');">
      ✕ Закрыть
    </button>
  `;
  document.getElementById('modal').classList.add('show');
}

// ─── ГЕНЕРАЦИЯ ИДЕАЛЬНОЙ СИСТЕМЫ ДЛЯ ПРАЙМА ─────────────────────
function generatePerfectPrimeSystem(primeData) {
  // Идеальная звезда для жизни
  let starType = 'G'; 
  let systemType = 'single';
  let planets = [];
  
  // ★ Строгий пул планет: 2 Лавы, 2 Земли, 2 Газа, 2 Льда
  // Расставлены от центра к краю (по орбитам 0-7)
  const perfectPlanets = [
    'lava',       // Орбита 0
    'lava',       // Орбита 1
    'superEarth', // Орбита 2
    'superEarth', // Орбита 3
    'gasGiant',   // Орбита 4
    'gasGiant',   // Орбита 5
    'iceGiant',   // Орбита 6
    'iceGiant'    // Орбита 7
  ];
  
  for (let i = 0; i < 8; i++) {
    const type = perfectPlanets[i];
    const orbitR = getOrbitR(i);
    
    planets.push({
      type: type, 
      angle: Math.random() * Math.PI * 2, 
      speed: 0.2 / Math.pow(orbitR / 90, 1.5),
      baseOrbitR: orbitR, 
      orbitR: orbitR, 
      driftPhase: Math.random() * Math.PI * 2,
      rotation: Math.random() * Math.PI * 2, 
      seed: Math.random() * 1e6,
      forming: false, 
      formUntil: 0, 
      mass: planetMass(type), 
      diameter: planetDiameter(type),
      moons: [], 
      precession: 0, 
      trueAnomaly: 0,
    });
  }
  
  const sys = {
    name: generateSystemName(),
    starType: starType, 
    systemType: systemType, 
    planets: planets,
    isPrime: true, 
    primeData: primeData,
  };
  
  return sys;
}

// ─── СУНДУКИ И РУЛЕТКА ──────────────────────────────────────────
// ─── СУНДУКИ ────────────────────────────────────────────────────
async function buyPrimeChest() {
  const tg = window.Telegram && window.Telegram.WebApp;
  
  // Если мы в Телеграме и у нас есть метод openInvoice
  if (tg && typeof tg.openInvoice === 'function') {
    const invoiceLink = await getInvoiceLink('chest');
    if (!invoiceLink) {
      toast('Ошибка оплаты', 'Не удалось создать счёт. Попробуйте позже');
      return;
    }
    
    tg.openInvoice(invoiceLink, function(status) {
      if (status === 'paid') {
        toast('✅ Оплата прошла', 'Сундук открывается...');
        // ★ Награду выбирает сервер; локального fallback больше нет — он был дырой.
        claimPurchase('chest').then(function(r) {
          if (!r || !r.reward) {
            // Покупка оплачена, но сервер не назвал лут. Никакого локального
            // fallback: иначе сундук открывается бесплатно.
            toast('Награда не подтверждена', 'Напиши в поддержку — покупка не потеряется.');
            return;
          }
          startChestRoulette(r.reward);
        }).catch(function(e) {
          console.warn('[premium] chest claim failed:', e && e.message);
          toast('Оплата не подтверждена', 'Нет связи с сервером. Попробуй позже.');
        });
      } else if (status === 'cancelled') {
        toast('Оплата отменена', 'Вы не были списаны');
      } else {
        toast('Ошибка оплаты', 'Попробуйте позже');
      }
    });
    return;
  }

  // Заглушка ТОЛЬКО для локальной отладки: window.__DEV_SHOP = true.
  // Иначе игра, открытая просто в браузере, выдавала бы платный лут бесплатно.
  if (window.__DEV_SHOP === true) {
    startChestRoulette();
  } else {
    toast('Покупки только в Telegram', 'Открой игру через Telegram');
  }
}

// ─── ПРЕМИУМ ЩИТ ────────────────────────────────────────────────
async function buyPremiumShield() {
  const tg = window.Telegram && window.Telegram.WebApp;
  
  if (tg && typeof tg.openInvoice === 'function') {
    const invoiceLink = await getInvoiceLink('shield');
    if (!invoiceLink) {
      toast('Ошибка оплаты', 'Не удалось создать счёт. Попробуйте позже');
      return;
    }
    
    tg.openInvoice(invoiceLink, function(status) {
      if (status === 'paid') {
        // ★ Награду выдаёт сервер: без подтверждённого права щит не включаем.
        claimPurchase('shield').then(function(r) {
          const until = r && r.entitlement && Number(r.entitlement.shieldUntil);
          if (!until) {
            toast('Награда не подтверждена', 'Напиши в поддержку — покупка не потеряется.');
            return;
          }
          activatePremiumShieldReward(until);
          toast('✅ Оплата прошла', 'Щит активирован!');
        }).catch(function(e) {
          console.warn('[premium] shield claim failed:', e && e.message);
          toast('Оплата не подтверждена', 'Нет связи с сервером. Попробуй позже.');
        });
      } else if (status === 'cancelled') {
        toast('Оплата отменена', '');
      }
    });
    return;
  }

  // Заглушка ТОЛЬКО для локальной отладки: window.__DEV_SHOP = true.
  if (window.__DEV_SHOP === true) {
    activatePremiumShieldReward();
  } else {
    toast('Покупки только в Telegram', 'Открой игру через Telegram');
  }
}

function activatePremiumShieldReward(untilMs) {
  // Абсолютную метку присылает сервер; локальный fallback — только для дев-режима.
  const until = Number(untilMs) || (Date.now() + 24 * 3600 * 1000);
  if (!S.shieldUntil || S.shieldUntil < until) S.shieldUntil = until;
  if (!S.activeTrophyEffects) S.activeTrophyEffects = [];
  S.activeTrophyEffects.push({ type: 'shield', value: 24, expiresAt: until });
  
  saveGame(); 
  updateUI(); 
  document.getElementById('modal').classList.remove('show');
}

function startChestRoulette(forcedKey) {
  // 1. Определяем победителя
  const loot = CHEST_CFG.lootTable;
  let selectedKey = null;

  // ★ Ключ от сервера (оплата подтверждена, лут выбран им) — приоритет.
  // Клиент принимает только ключи из легальной таблицы лута.
  if (typeof forcedKey === 'string' && loot.some(function(item) { return item.key === forcedKey; })) {
    selectedKey = forcedKey;
  }

  if (!selectedKey) {
    // Только дев-режим (__DEV_SHOP) или кривой forcedKey — обычная покупка сюда не доходит
    const totalWeight = loot.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * totalWeight;
    selectedKey = loot[0].key;

    for (let i = 0; i < loot.length; i++) {
      roll -= loot[i].weight;
      if (roll <= 0) { selectedKey = loot[i].key; break; }
    }
  }

  const winningPrime = createPrimeSystem(selectedKey);

  // 2. Создаем HTML рулетки
  const overlay = document.createElement('div');
  overlay.className = 'chest-roulette-overlay';
  overlay.innerHTML = `
    <div class="roulette-window">
      <div class="roulette-pointer"></div>
      <div class="roulette-strip" id="rouletteStrip"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const strip = document.getElementById('rouletteStrip');
  
  // 3. Заполняем ленту (используем canvas для анимации)
  const allPrimes = Object.keys(PRIME_OBJECTS);
  const itemsPerLoop = allPrimes.length;
  const loops = 3; // Количество полных кругов
  const totalItems = itemsPerLoop * loops + 3; // +3 для плавного выезда
  
  let html = '';
  const canvasKeys = [];
  for (let i = 0; i < totalItems; i++) {
    let itemKey = (i === totalItems - 3) ? selectedKey : allPrimes[i % itemsPerLoop];
    const obj = PRIME_OBJECTS[itemKey];
    
    html += `
      <div class="roulette-item">
        <canvas class="roulette-canvas" data-key="${itemKey}" width="50" height="50"></canvas>
        <div class="roulette-item-name">${obj.name}</div>
      </div>
    `;
    canvasKeys.push(itemKey);
  }
  strip.innerHTML = html;

  // Запускаем анимацию отрисовки иконок внутри рулетки
  let rouletteActive = true;
  function animateRoulette(time) {
    if (!rouletteActive) return;
    const cxs = overlay.querySelectorAll('.roulette-canvas');
    const t = time / 1000;
    for (let c of cxs) {
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      drawPrimeIcon(ctx, c.width/2, c.height/2, c.dataset.key, t, 10);
    }
    requestAnimationFrame(animateRoulette);
  }
  requestAnimationFrame(animateRoulette);

  // 4. Анимация прокрутки
  const itemWidth = 80; // px (из CSS)
  const targetIndex = totalItems - 3;
  const windowCenter = 200; // Примерная половина ширины окна (max-width 400)
  const translateX = -(targetIndex * itemWidth) + windowCenter - (itemWidth / 2);
  
  setTimeout(() => {
    strip.style.transform = `translateX(${translateX}px)`;
  }, 100);

  // 5. Завершение
  setTimeout(() => {
    rouletteActive = false;
    overlay.remove();
    showChestResult(winningPrime);
  }, 4200);
}

function showChestResult(prime) {
  let isUpgrade = false;
  let upgradeText = '';
  let oldPrimeKey = prime.objectKey;
  let newPrimeKey = null;
  let targetSysIdx = -1;

  // Ищем дубль ТОЛЬКО среди уже существующих Прайм-объектов
  if (S.primeSystem && S.primeSystem.objectKey === prime.objectKey) {
    targetSysIdx = S.activeSystemIdx;
  } else {
    for (let i = 1; i < S.otherSystems.length; i++) {
      const sys = S.otherSystems[i];
      if (sys && sys.primeData && sys.primeData.objectKey === prime.objectKey) {
        targetSysIdx = i;
        break;
      }
    }
  }

  if (targetSysIdx !== -1) {
    // ★ Единая цепочка улучшений (js/prime.js): сундук с дублем повышает
    //   объект так же, как слияние дублей при вспышке сверхновой.
    newPrimeKey = (typeof primeMergeUpgrade === 'function')
      ? primeMergeUpgrade(prime.objectKey)
      : null;
    
    if (newPrimeKey) {
      const nextObj = PRIME_OBJECTS[newPrimeKey];
      const updatedData = { 
        ...prime, 
        objectKey: newPrimeKey, 
        objectName: nextObj.name, 
        objectIcon: nextObj.icon, 
        bonus: nextObj.bonus, 
        absorbRadius: nextObj.absorbRadius 
      };
      
      // Обновляем в зависимости от того, где нашли
      if (targetSysIdx === S.activeSystemIdx) {
        S.primeSystem = updatedData;
      } else {
        S.otherSystems[targetSysIdx].primeData = updatedData;
      }
      
      isUpgrade = true;
      upgradeText = 'Слияние: ' + PRIME_OBJECTS[oldPrimeKey].name + ' → ' + nextObj.name;
    }
  }

  if (!isUpgrade) {
    // ★ Скидка вместо бесплатной системы: игрок платит 50% стоимости системы
    // пылью. Сервер субсидирует вторую половину (chestCapabilityValue).
    const sysCost = (typeof systemCost === 'function') ? systemCost(S.systems || 1) : 0;
    const pay = Math.floor(sysCost * 0.5);
    if (pay > 0) S.dust = Math.max(0, (S.dust || 0) - pay);
    const newSys = generatePerfectPrimeSystem(prime);
    if (S.otherSystems.length === 0 || S.otherSystems[0] === undefined) S.otherSystems[0] = null;
    S.otherSystems.push(newSys);
    S.systems++;
    const prevTotalSystems = (S.totalSystemsCreated || 1);
    S.totalSystemsCreated = prevTotalSystems + 1;
    if (typeof checkGalaxyMergeThresholds === 'function') {
      checkGalaxyMergeThresholds(prevTotalSystems, S.totalSystemsCreated);
    }
    if (typeof bumpSystemCostFloor === 'function') bumpSystemCostFloor();
  }

  saveGame();
  const card = document.getElementById('modalCard');
  card.innerHTML = `
    <div class="modal-title">🎁 Сундук открыт!</div>
    <div class="info-box" style="text-align:center; padding:20px; position:relative;">
      <canvas id="chestCanvas" style="width:200px; height:200px; margin:0 auto;"></canvas>
      <div class="choice-name" style="color:#ffcc55; font-size:22px; margin-top:10px;" id="chestTitle">${isUpgrade ? 'Слияние!' : prime.objectName}</div>
      <div class="choice-desc" style="margin-top:4px;" id="chestDesc">${isUpgrade ? upgradeText : prime.name}</div>
    </div>
    <button class="stars-btn" onclick="document.getElementById('modal').classList.remove('show'); updateUI();">Отлично</button>
  `;
  document.getElementById('modal').classList.add('show');

  const canvas = document.getElementById('chestCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  const startTime = performance.now();
  let animActive = true;

  function drawAnim(time) {
    if (!animActive) return;
    const t = (time - startTime) / 1000;
    const w = 200, h = 200;
    
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== w * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, w, h);
    
    if (!isUpgrade) {
      ctx.save(); ctx.translate(w/2, h/2); ctx.scale(1.2, 1.2);
      drawPrimeMain(ctx, 0, 0, 1, t, prime.objectKey);
      ctx.restore();
    } else {
      if (t < 2.0) {
        const progress = Math.min(1, t / 2.0);
        const ease = 1 - Math.pow(1 - progress, 3);
        const offset = 60 * (1 - ease);
        
        ctx.save(); ctx.translate(w/2 - offset, h/2); ctx.scale(0.8, 0.8);
        drawPrimeMain(ctx, 0, 0, 1, t, oldPrimeKey);
        ctx.restore();
        
        ctx.save(); ctx.translate(w/2 + offset, h/2); ctx.scale(0.8, 0.8);
        drawPrimeMain(ctx, 0, 0, 1, t, oldPrimeKey);
        ctx.restore();
        
        if (progress === 1) {
           ctx.fillStyle = `rgba(255,255,255,${Math.sin(t*10)*0.5+0.5})`;
           ctx.fillRect(0, 0, w, h);
        }
            } else {
        const scale = 1 + Math.sin((t-2) * 2) * 0.1;
        ctx.save(); ctx.translate(w/2, h/2); ctx.scale(1.2 * scale, 1.2 * scale);
        drawPrimeMain(ctx, 0, 0, 1, t, newPrimeKey);
        ctx.restore();
      }
    }
    requestAnimationFrame(drawAnim);
  }
  requestAnimationFrame(drawAnim);
  if (typeof playSFX === 'function') playSFX('ui_levelup');
}

async function buyIncomeBooster() {
  const cost = PREMIUM_CFG.booster.costMetals;
  if ((S.metalAmount || 0) < cost) return;

  // ★ В режиме серверного кошелька покупку оформляет сервер:
  // металлы списываются из облачного сейва, метку бустера ставит он же.
  if (window.__serverWallet) {
    const initData = (typeof getPremiumInitData === 'function') ? getPremiumInitData() : null;
    if (!initData) {
      if (typeof toast === 'function') toast('Нет связи', 'Покупка доступна только из Telegram');
      return;
    }
    try {
      if (typeof cloudSaveGame === 'function') await cloudSaveGame();
      const r = await premiumApiPost('/api/buy-booster', { initData: initData });

      if (r && r.authoritative && r.data) {
        S.metalAmount = Number(r.data.metalAmount) || 0;
        S.boosters = Object.assign({}, S.boosters || {}, { incomeUntil: Number(r.incomeUntil) || 0 });
        if (typeof saveGame === 'function') saveGame();
        if (typeof updateUI === 'function') updateUI();
        if (typeof toast === 'function') {
          toast('🚀 Бустер активирован', 'Доход ×' + PREMIUM_CFG.booster.incomeMult + ' на ' + PREMIUM_CFG.booster.hours + ' ч');
        }
        openPremiumShop();
        return;
      }
      if (r && r.error === 'Not enough metals') {
        if (typeof toast === 'function') toast('Недостаточно металлов', '');
        return;
      }
      if (!r || r.authoritative !== false) {
        if (typeof toast === 'function') toast('Ошибка покупки', (r && r.error) || 'Попробуйте позже');
        return;
      }
      // authoritative === false — сервер не в режиме кошелька, ниже локальная покупка
    } catch (e) {
      console.warn('[premium] buy-booster failed:', e.message);
      if (typeof toast === 'function') toast('Нет связи', 'Покупка недоступна офлайн');
      return;
    }
  }

  // Локальная покупка (флаг выключен)
  if ((S.metalAmount || 0) < cost) return;
  S.metalAmount -= cost;
  if (!S.boosters) S.boosters = {};
  S.boosters.incomeUntil = Math.max(S.boosters.incomeUntil || 0, Date.now()) + PREMIUM_CFG.booster.hours * 3600 * 1000;
  toast('🚀 Бустер активирован', 'Доход ×' + PREMIUM_CFG.booster.incomeMult + ' на ' + PREMIUM_CFG.booster.hours + ' ч');
  saveGame(); updateUI(); openPremiumShop();
}
window.openPremiumShop = openPremiumShop;
window.buyPrimeChest = buyPrimeChest;
window.buyPremiumShield = buyPremiumShield;
window.buyIncomeBooster = buyIncomeBooster;

// ═══════════════════════════════════════════════════════════════
//  ВЕРФЬ (ФЛОТ)
// ═══════════════════════════════════════════════════════════════
function shipCount(key) {
  return (S.fleet && Number(S.fleet[key])) || 0;
}

function openShipyard() {
  const card = document.getElementById('modalCard');
  const modal = document.getElementById('modal');
  if (!card || !modal) return;
  if (typeof playSFX === 'function') playSFX('ui_click');

  let html = `<div class="modal-title">🚀 Верфь</div>
    <div class="modal-sub">Металлы: ${fmt(S.metalAmount || 0)} ⚙</div>`;

  // ★ Статус флота: активировать его можно только при активной Автобороне ур.5.
  const totalShips = (typeof fleetShipTotal === 'function') ? fleetShipTotal() : 0;
  const dps = (typeof fleetDps === 'function') ? fleetDps() : 0;
  const fleetValue = (typeof fleetMetalValue === 'function') ? fleetMetalValue() : 0;
  const fleetBonusPct = (typeof fleetRepelChance === 'function') ? fleetRepelChance() * 100 : 0;
  const fleetPotentialPct = Math.min(30, Math.round(fleetValue / 500));
  const reqLvl = (typeof fleetDefenseLevelReq === 'function') ? fleetDefenseLevelReq() : 5;
  const fleetReady = (typeof fleetDefenseReady === 'function') ? fleetDefenseReady() : false;
  const fleetActive = (typeof isFleetActive === 'function') ? isFleetActive() : false;
  const paidActive = (S.nightDefenseExpiresAt || 0) > Date.now();
  const paidLvl = paidActive ? (S.nightDefenseLevel || 0) : 0;
  const defLvl = (typeof activeDefenseLevel === 'function') ? activeDefenseLevel() : (paidActive ? (S.nightDefenseLevel || 0) : 0);
  const defActive = defLvl > 0;
  const defLeftH = paidActive ? Math.max(0, Math.ceil((S.nightDefenseExpiresAt - Date.now()) / 3600000)) : 0;

  let fleetHint = '';
  if (totalShips <= 0) fleetHint = 'Купите хотя бы один корабль — флот начнёт службу сразу.';

  const fleetState = fleetActive
    ? '<span style="color:#7ee0a8">В БОЮ</span>'
    : '<span style="color:#7ee0a8">НА СЛУЖБЕ</span>';
  const canToggleFleet = fleetActive || (fleetReady && totalShips > 0);
  const upkeepSharePotential = (typeof fleetUpkeepShare === 'function') ? fleetUpkeepShare(true) : 0;
  const upkeepPerSecNow = (typeof fleetUpkeepPerSec === 'function') ? fleetUpkeepPerSec() : 0;

  html += `<div class="info-box" style="border-color:${fleetActive ? 'rgba(46,170,119,0.6)' : 'rgba(139,127,212,0.4)'};">
    <div class="row-stat"><span>🚀 Флот</span>${fleetState}</div>
    <div class="row-stat" style="font-size:11px;opacity:0.85;">
      <span>Кораблей: ${totalShips}</span>
      <span>Урон: ${dps.toFixed(1)}/с</span>
    </div>
    <div class="row-stat" style="font-size:10px;color:#8b7fd4;">
      <span>Сила флота: ${fmt(fleetValue)} ⚙</span>
      <span>${fleetActive ? '+' + Math.round(fleetBonusPct) : '+' + fleetPotentialPct}% к отбитию (макс +30%)</span>
    </div>
    <div class="row-stat" style="font-size:10px;color:${upkeepPerSecNow > 0 ? '#ffb347' : '#8b7fd4'};">
      <span>Содержание: ${upkeepPerSecNow > 0 ? fmt(upkeepPerSecNow * 3600) + ' ⚙/ч' : '—'}</span>
      <span>${upkeepSharePotential > 0 ? Math.round(upkeepSharePotential * 100) + '% металлодобычи' : 'бесплатно'}</span>
    </div>
    <div class="row-stat" style="font-size:10px;color:#8b7fd4;">
      <span>Автоборона: ${defActive ? (defLvl > paidLvl ? 'ур.' + defLvl + ' · трофей' : 'ур.' + defLvl + ' · ' + defLeftH + ' ч') : 'выключена'}</span>
      <span>флот работает всегда</span>
    </div>
    ${fleetHint ? `<div style="font-size:10px;color:#ffb347;margin-top:4px;">${fleetHint}</div>` : ''}
    <div style="font-size:10px;color:#7ee0a8;margin-top:6px;">✓ Флот на службе постоянно — активация не требуется</div>
  </div>`;

  for (const key in FLEET_CFG.ships) {
    const ship = FLEET_CFG.ships[key];
    const count = shipCount(key);
    const shipPrice = (typeof fleetShipPrice === 'function') ? fleetShipPrice(key) : ship.costMetals;
    const canAfford = (S.metalAmount || 0) >= shipPrice && (S.energy || 0) >= ship.costEnergy && (S.civLevel || 0) >= ship.costCiv;
    const canAffordFive = (S.metalAmount || 0) >= shipPrice * 5 && (S.energy || 0) >= ship.costEnergy * 5 && (S.civLevel || 0) >= ship.costCiv * 5;
    html += `<div class="info-box">
      <div class="row-stat"><span>${ship.name} (есть: ${count})</span><span>${fmt(shipPrice)} ⚙ · ${fmt(ship.costEnergy)} ⚡ · ${ship.costCiv} 🧬</span></div>
      <div class="row-stat" style="opacity:0.7;font-size:11px;">
        <span>Урон ${ship.damage} · HP ${ship.hp} · ${ship.fireRate} выстр./с</span>
      </div>
      <div class="pour-btn-group">
        <button class="pour-btn" onclick="buyShip('${key}', 1)" ${canAfford ? '' : 'disabled'}>Купить 1</button>
        <button class="pour-btn" onclick="buyShip('${key}', 5)" ${canAffordFive ? '' : 'disabled'}>Купить 5</button>
      </div>
    </div>`;
  }

  html += `<button class="pour-btn" style="width:100%;margin-top:10px;background:rgba(255,94,94,0.2);border-color:rgba(255,94,94,0.5);color:#ff8a8a;"
      onclick="document.getElementById('modal').classList.remove('show');">✕ Закрыть</button>`;

  card.innerHTML = html;
  modal.classList.add('show');
}

function buyShip(key, amount) {
  const ship = FLEET_CFG.ships[key];
  if (!ship) return;
  const count = Math.max(1, Math.floor(Number(amount) || 1));
  // ★ Динамическая цена: чем выше металлодобыча — тем дороже корабль.
  const unitMetal = (typeof fleetShipPrice === 'function') ? fleetShipPrice(key) : ship.costMetals;
  const costMetals = unitMetal * count;
  const costEnergy = ship.costEnergy * count;
  const costCiv = ship.costCiv * count;
  if ((S.metalAmount || 0) < costMetals || (S.energy || 0) < costEnergy || (S.civLevel || 0) < costCiv) {
    if (typeof toast === 'function') {
      toast('Не хватает ресурсов', `Нужно ${fmt(costMetals)} ⚙ · ${fmt(costEnergy)} ⚡ · ${costCiv} 🧬`);
    }
    return;
  }

  S.metalAmount -= costMetals;
  S.energy -= costEnergy;
  S.civLevel -= costCiv;
  if (!S.fleet) S.fleet = { interceptor: 0, cruiser: 0, dreadnought: 0 };
  S.fleet[key] = shipCount(key) + count;
  // ★ Купленный флот сразу на службе.
  S.fleetActive = true;

  if (typeof saveGame === 'function') saveGame();
  if (typeof updateUI === 'function') updateUI();
  if (typeof toast === 'function') toast('🚀 Верфь', `${ship.name} ×${count} в строю`);
  if (typeof notifyFleetEvent === 'function') {
    notifyFleetEvent('Куплены корабли', [
      '🛸 ' + ship.name + ' ×' + count,
      '🚀 Всего в строю: ' + fleetShipTotal(),
      '✓ Флот сразу на службе',
    ], 'fleet_buy:' + key + ':' + Date.now());
  }
  openShipyard();
}
window.openShipyard = openShipyard;
function toggleFleet(returnTo) {
  // ★ Флот больше не отключается: купленные корабли всегда на службе.
  S.fleetActive = fleetShipTotal() > 0;
  if (typeof saveGame === 'function') saveGame();
  if (typeof updateUI === 'function') updateUI();
  if (fleetShipTotal() <= 0) {
    if (typeof toast === 'function') toast('🚀 Флот пуст', 'Купите корабли на Верфи');
  } else if (typeof toast === 'function') {
    toast('🚀 Флот на службе', 'Корабли всегда отбивают вторжения');
  }
  if (returnTo === 'night' && typeof openNightMode === 'function') openNightMode();
  else openShipyard();
}
window.buyShip = buyShip;
window.toggleFleet = toggleFleet;