// ═══════════════════════════════════════════════════════════════
//  PREMIUM.JS — Магазин за металлы и Telegram Stars
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
        <span>Шанс на Прайм-объект: 100%</span>
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
        <span>🌐 Щит галактический</span>
        <span>${shieldActive ? 'Активен ' + shieldLeft + 'ч' : PREMIUM_CFG.shield.hours + ' ч · защита'}</span>
      </div>
      <button class="pour-btn" style="width:100%;margin-top:8px;"
        onclick="buyShield()" ${(S.metalAmount || 0) >= PREMIUM_CFG.shield.costMetals ? '' : 'disabled'}>
        ${(S.metalAmount || 0) >= PREMIUM_CFG.shield.costMetals ? 'Купить за ' + PREMIUM_CFG.shield.costMetals + ' ⚙' : 'Нужно ' + PREMIUM_CFG.shield.costMetals + ' ⚙'}
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
  `;
  document.getElementById('modal').classList.add('show');
}

// ─── СУНДУКИ ────────────────────────────────────────────────────
function buyPrimeChest() {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg || typeof tg.openInvoice !== 'function') {
    if (confirm('Тестовый режим вне Telegram. Открыть сундук бесплатно?')) openChestLogic();
    return;
  }
  toast('⭐ Оплата', 'Инвойс на ' + CHEST_CFG.costStars + ' Stars (в разработке)');
  if (confirm('Оплата прошла (заглушка). Открыть сундук?')) openChestLogic();
}

function openChestLogic() {
  const loot = CHEST_CFG.lootTable;
  const totalWeight = loot.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * totalWeight;
  let selectedKey = loot[0].key;

  for (let i = 0; i < loot.length; i++) {
    roll -= loot[i].weight;
    if (roll <= 0) { selectedKey = loot[i].key; break; }
  }

  const prime = createPrimeSystem(selectedKey);
  S.primeSystem = prime;
  if (S.activeSystemIdx > 0 && S.otherSystems[S.activeSystemIdx]) {
    S.otherSystems[S.activeSystemIdx].isPrime = true;
    S.otherSystems[S.activeSystemIdx].primeData = prime;
  }

  const card = document.getElementById('modalCard');
  card.innerHTML = `
    <div class="modal-title">🎁 Сундук открыт!</div>
    <div class="info-box" style="text-align:center; padding:20px;">
      <div style="font-size:48px; margin-bottom:10px;">🌟</div>
      <div class="choice-name" style="color:#ffcc55; font-size:20px; margin-bottom:4px;">${prime.objectName}</div>
      <div class="choice-desc" style="margin-bottom:10px;">${prime.name}</div>
      <div class="row-stat" style="justify-content:center; border:none;"><span>Установлен в текущую систему!</span></div>
    </div>
    <button class="stars-btn" style="background:linear-gradient(135deg,#6b4de6,#b9a8ff); color:#fff;" onclick="document.getElementById('modal').classList.remove('show'); updateUI();">Забрать</button>
  `;
  if (typeof playSFX === 'function') playSFX('ui_levelup');
  saveGame();
}

// ─── ОСТАЛЬНОЕ ──────────────────────────────────────────────────
function buyPremiumShield() {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg || typeof tg.openInvoice !== 'function') {
    toast('⭐ Telegram Stars', 'Оплата доступна только в Telegram');
    if (confirm('Тестовый режим: выдать Премиум Щит?')) {
      S.shieldUntil = Date.now() + 24 * 3600 * 1000;
      saveGame(); updateUI();
      document.getElementById('modal').classList.remove('show');
    }
    return;
  }
  toast('⭐ Оплата', 'Инвойс на 50 Stars (в разработке)');
}

function buyIncomeBooster() {
  if ((S.metalAmount || 0) < PREMIUM_CFG.booster.costMetals) return;
  S.metalAmount -= PREMIUM_CFG.booster.costMetals;
  if (!S.boosters) S.boosters = {};
  S.boosters.incomeUntil = Math.max(S.boosters.incomeUntil || 0, Date.now()) + PREMIUM_CFG.booster.hours * 3600 * 1000;
  toast('🚀 Бустер активирован', 'Доход ×' + PREMIUM_CFG.booster.incomeMult + ' на ' + PREMIUM_CFG.booster.hours + ' ч');
  saveGame(); updateUI(); openPremiumShop();
}

function buyShield() {
  if ((S.metalAmount || 0) < PREMIUM_CFG.shield.costMetals) return;
  S.metalAmount -= PREMIUM_CFG.shield.costMetals;
  const until = Date.now() + PREMIUM_CFG.shield.hours * 3600 * 1000;
  if (!S.shieldUntil || S.shieldUntil < until) S.shieldUntil = until;
  if (!S.activeTrophyEffects) S.activeTrophyEffects = [];
  S.activeTrophyEffects.push({ type: 'shield', value: PREMIUM_CFG.shield.hours, expiresAt: until });
  toast('🛡 Щит активирован', 'На ' + PREMIUM_CFG.shield.hours + ' ч');
  saveGame(); updateUI(); openPremiumShop();
}

window.openPremiumShop = openPremiumShop;
window.buyPrimeChest = buyPrimeChest;
window.buyPremiumShield = buyPremiumShield;
window.buyIncomeBooster = buyIncomeBooster;
window.buyShield = buyShield;