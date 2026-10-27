// ═══════════════════════════════════════════════════════════════
//  PREMIUM.JS — Магазин, Сундуки, Премиум-Щит
// ═══════════════════════════════════════════════════════════════

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
  let starType = 'G'; // Идеальная звезда для жизни
  let systemType = 'single'; // Без хаоса
  let planets = [];
  
  // Заполняем ВСЕ 8 орбит
  for (let i = 0; i < 8; i++) {
    let pool = getAllowedTypesAtOrbit(starType, i);
    if (pool.length === 0) continue;
    
    // Сортируем доступные планеты по базовому доходу (выбираем лучшую)
    pool.sort((a, b) => PLANET_TYPES[b].rate - PLANET_TYPES[a].rate);
    const type = pool[0];
    
    const orbitR = getOrbitR(i);
    planets.push({
      type: type, angle: Math.random() * Math.PI * 2, speed: 0.2 / Math.pow(orbitR / 90, 1.5),
      baseOrbitR: orbitR, orbitR: orbitR, driftPhase: Math.random() * Math.PI * 2,
      rotation: Math.random() * Math.PI * 2, seed: Math.random() * 1e6,
      forming: false, formUntil: 0, mass: planetMass(type), diameter: planetDiameter(type),
      moons: [], precession: 0, trueAnomaly: 0,
    });
  }
  
  const sys = {
    name: generateSystemName(), // Больше не добавляем сюда 👑, так как иконка рисуется отдельно
    starType: starType, systemType: systemType, planets: planets,
    isPrime: true, primeData: primeData,
  };
  
  return sys;
}

// ─── СУНДУКИ И РУЛЕТКА ──────────────────────────────────────────
// ─── СУНДУКИ ────────────────────────────────────────────────────
function buyPrimeChest() {
  const tg = window.Telegram && window.Telegram.WebApp;
  
  // Если мы в Телеграме и у нас есть метод openInvoice
  if (tg && typeof tg.openInvoice === 'function') {
    // ★ ВАЖНО: Сюда нужно будет вставить реальную ссылку, которую генерирует бот
    const invoiceLink = 'https://t.me/$mock_invoice_chest'; 
    
    tg.openInvoice(invoiceLink, function(status) {
      if (status === 'paid') {
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
function buyPremiumShield() {
  const tg = window.Telegram && window.Telegram.WebApp;
  
  if (tg && typeof tg.openInvoice === 'function') {
    // ★ ВАЖНО: Сюда нужно будет вставить реальную ссылку
    const invoiceLink = 'https://t.me/$mock_invoice_shield';
    
    tg.openInvoice(invoiceLink, function(status) {
      if (status === 'paid') {
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
  const newSys = generatePerfectPrimeSystem(prime);
  
  if (S.otherSystems.length === 0 || S.otherSystems[0] === undefined) S.otherSystems[0] = null;
  const newIdx = S.otherSystems.length;
  S.otherSystems.push(newSys);
  S.systems++;
  S.totalSystemsCreated = (S.totalSystemsCreated || 1) + 1;

  saveGame();

  const card = document.getElementById('modalCard');
  card.innerHTML = `
    <div class="modal-title">🎁 Сундук открыт!</div>
    <div class="info-box" style="text-align:center; padding:20px;">
      <canvas id="resultPrimeCanvas" class="result-canvas" width="240" height="240"></canvas>
      <div class="choice-name" style="color:#ffcc55; font-size:22px; margin-top:10px; margin-bottom:4px;">${prime.objectName}</div>
      <div class="choice-desc" style="margin-bottom:10px;">${prime.name}</div>
      <div class="row-stat" style="justify-content:center; border:none; color:#7ee0a8; font-weight:bold;">
         <span>Создана идеальная система!</span>
      </div>
    </div>
    <button class="stars-btn" style="background:linear-gradient(135deg,#6b4de6,#b9a8ff); color:#fff;" 
      onclick="document.getElementById('modal').classList.remove('show'); switchToSystem(${newIdx}); S.stage='system'; updateUI(); updateSystemSwitcher();">
      Перейти в систему
    </button>
  `;
  
  document.getElementById('modal').classList.add('show');
  
  // Анимация большого визуала
  let resActive = true;
  function animateResult(time) {
    if (!resActive) return;
    const c = document.getElementById('resultPrimeCanvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    const t = time / 1000;
    ctx.clearRect(0, 0, c.width, c.height);
    // drawPrimeMain рисует большой объект. Сдвигаем в центр и скейлим.
    ctx.save();
    ctx.translate(c.width/2, c.height/2);
    ctx.scale(1.5, 1.5);
    drawPrimeMain(ctx, 0, 0, 1, t, prime.objectKey);
    ctx.restore();
    requestAnimationFrame(animateResult);
  }
  requestAnimationFrame(animateResult);

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