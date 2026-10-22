// ═══════════════════════════════════════════════════════════════
//  PREMIUM.JS — Магазин за металлы
//  Здесь: Бустер Дохода и Галактический Щит
// ═══════════════════════════════════════════════════════════════

function openPremiumShop() {
  const card = document.getElementById('modalCard');
  if (!card) return;

  const shieldActive = S.shieldUntil && S.shieldUntil > Date.now();
  const shieldLeft = shieldActive ? Math.ceil((S.shieldUntil - Date.now()) / 3600000) : 0;
  
  const boostActive = S.boosters && S.boosters.incomeUntil > Date.now();
  const boostLeft = boostActive ? Math.ceil((S.boosters.incomeUntil - Date.now()) / 3600000) : 0;

  card.innerHTML = `
    <div class="modal-title">⚙ Магазин за металлы</div>
    <div class="modal-sub">Металлы: ${fmt(S.metalAmount || 0)} ⚙</div>

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
        <span>${shieldActive ? 'Активен ' + shieldLeft + 'ч' : PREMIUM_CFG.shield.hours + ' ч · 100% защита'}</span>
      </div>
      <button class="pour-btn" style="width:100%;margin-top:8px;"
        onclick="buyShield()" ${(S.metalAmount || 0) >= PREMIUM_CFG.shield.costMetals ? '' : 'disabled'}>
        ${(S.metalAmount || 0) >= PREMIUM_CFG.shield.costMetals ? 'Купить за ' + PREMIUM_CFG.shield.costMetals + ' ⚙' : 'Нужно ' + PREMIUM_CFG.shield.costMetals + ' ⚙'}
      </button>
    </div>

    <div class="info-box">
      <div class="row-stat">
        <span>🛡 Автооборона</span>
        <span>Покупается в Ночном режиме</span>
      </div>
      <button class="pour-btn" style="width:100%;margin-top:8px;" onclick="document.getElementById('modal').classList.remove('show'); openNightMode();">
        Перейти в Ночной режим
      </button>
    </div>

    <button class="pour-btn" style="width:100%;margin-top:10px;background:rgba(255,94,94,0.2);border-color:rgba(255,94,94,0.5);color:#ff8a8a;"
      onclick="document.getElementById('modal').classList.remove('show');">
      ✕ Закрыть
    </button>
  `;
  document.getElementById('modal').classList.add('show');
}

function buyIncomeBooster() {
  if ((S.metalAmount || 0) < PREMIUM_CFG.booster.costMetals) return;
  S.metalAmount -= PREMIUM_CFG.booster.costMetals;
  if (!S.boosters) S.boosters = {};
  
  // Если бустер уже активен, время добавляется
  S.boosters.incomeUntil = Math.max(S.boosters.incomeUntil || 0, Date.now()) + PREMIUM_CFG.booster.hours * 3600 * 1000;
  
  toast('🚀 Бустер активирован', 'Доход ×' + PREMIUM_CFG.booster.incomeMult + ' на ' + PREMIUM_CFG.booster.hours + ' ч');
  if (typeof playSFX === 'function') playSFX('ui_purchase');
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
  if (typeof playSFX === 'function') playSFX('ui_purchase');
  saveGame(); updateUI(); openPremiumShop();
}

window.openPremiumShop = openPremiumShop;
window.buyIncomeBooster = buyIncomeBooster;
window.buyShield = buyShield;