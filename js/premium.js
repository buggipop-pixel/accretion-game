// ═══════════════════════════════════════════════════════════════
//  PREMIUM.JS — Магазин, Сундуки, Премиум-Щит
// ═══════════════════════════════════════════════════════════════

// ─── API: сервер на Render ──────────────────────────────────────
const API_BASE = 'https://accretion-game.onrender.com';

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
  if (!res.ok) throw new Error((data && data.error) ? data.error : ('HTTP ' + res.status));
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

// Подтверждение выдачи покупки на сервере (не блокирует выдачу в игре)
function claimPurchase(product) {
  const initData = getPremiumInitData();
  if (!initData) return;
  premiumApiPost('/api/claim', { initData: initData, product: product }).catch(function(e) {
    console.warn('[premium] claim failed:', e.message);
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
        <span>100% защита от всех угроз</span>
      </div>
      <button class="stars-btn" style="margin-top:8px; background:linear-gradient(135deg,#ffb347,#ffcc00); color:#1a0f35;" onclick="buyPremiumShield()">
        ⭐ Купить за 50 Stars
      </button>
    </div>

    <button class="pour-btn" style="width:100%;margin-top:10px;background:rgba(255,94,94,0.2);border-color:rgba(255,94,94,0.5);color:#ff8a8a;"
      onclick="document.getElementById('modal').classList.remove('show');">
      ✕ Закрыть
    </button>
        <div style="text-align:center; margin-top:15px; opacity:0.6;">
      <button class="pour-btn" style="font-size:10px; padding:4px 8px;" onclick="testTelegramInvoice('chest')">🧪 Тест: Оплатить Сундук</button>
      <button class="pour-btn" style="font-size:10px; padding:4px 8px;" onclick="testTelegramInvoice('shield')">🧪 Тест: Оплатить Щит</button>
    </div>
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
        claimPurchase('chest');
        toast('✅ Оплата прошла', 'Сундук открывается...');
        startChestRoulette();
      } else if (status === 'cancelled') {
        toast('Оплата отменена', 'Вы не были списаны');
      } else {
        toast('Ошибка оплаты', 'Попробуйте позже');
      }
    });
    return;
  }

  // Заглушка для браузера (вне Telegram)
  if (confirm('Вы вне Telegram. Симулировать оплату 100 ⭐ и открыть сундук?')) {
    startChestRoulette();
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
        claimPurchase('shield');
        toast('✅ Оплата прошла', 'Щит активирован!');
        activatePremiumShieldReward();
      } else if (status === 'cancelled') {
        toast('Оплата отменена', '');
      }
    });
    return;
  }

  // Заглушка для браузера
  if (confirm('Вы вне Telegram. Симулировать оплату 50 ⭐ и получить щит?')) {
    activatePremiumShieldReward();
  }
}

function activatePremiumShieldReward() {
  const until = Date.now() + 24 * 3600 * 1000;
  if (!S.shieldUntil || S.shieldUntil < until) S.shieldUntil = until;
  if (!S.activeTrophyEffects) S.activeTrophyEffects = [];
  S.activeTrophyEffects.push({ type: 'shield', value: 24, expiresAt: until });
  
  saveGame(); 
  updateUI(); 
  document.getElementById('modal').classList.remove('show');
}

function startChestRoulette() {
  // 1. Определяем победителя
  const loot = CHEST_CFG.lootTable;
  const totalWeight = loot.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * totalWeight;
  let selectedKey = loot[0].key;

  for (let i = 0; i < loot.length; i++) {
    roll -= loot[i].weight;
    if (roll <= 0) { selectedKey = loot[i].key; break; }
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
    if (prime.objectKey === 'blackHole') newPrimeKey = 'massiveBH';
    else if (prime.objectKey === 'massiveBH') newPrimeKey = 'superBH';
    else if (prime.objectKey === 'wormhole') newPrimeKey = 'wormhole2';
    else if (prime.objectKey === 'wormhole2') newPrimeKey = 'wormhole3';
    
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
    const newSys = generatePerfectPrimeSystem(prime);
    if (S.otherSystems.length === 0 || S.otherSystems[0] === undefined) S.otherSystems[0] = null;
    S.otherSystems.push(newSys);
    S.systems++;
    S.totalSystemsCreated = (S.totalSystemsCreated || 1) + 1;
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

function buyIncomeBooster() {
  if ((S.metalAmount || 0) < PREMIUM_CFG.booster.costMetals) return;
  S.metalAmount -= PREMIUM_CFG.booster.costMetals;
  if (!S.boosters) S.boosters = {};
  S.boosters.incomeUntil = Math.max(S.boosters.incomeUntil || 0, Date.now()) + PREMIUM_CFG.booster.hours * 3600 * 1000;
  toast('🚀 Бустер активирован', 'Доход ×' + PREMIUM_CFG.booster.incomeMult + ' на ' + PREMIUM_CFG.booster.hours + ' ч');
  saveGame(); updateUI(); openPremiumShop();
}
function testTelegramInvoice(type) {
  toast('🧪 Симуляция', 'Оплата 100 ⭐ прошла успешно!');
  if (type === 'chest') {
    document.getElementById('modal').classList.remove('show');
    startChestRoulette();
  } else if (type === 'shield') {
    activatePremiumShieldReward();
  }
}
window.openPremiumShop = openPremiumShop;
window.buyPrimeChest = buyPrimeChest;
window.buyPremiumShield = buyPremiumShield;
window.buyIncomeBooster = buyIncomeBooster;