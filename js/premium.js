// ═══════════════════════════════════════════════════════════════
//  PREMIUM.JS — магазин за металлы (автооборона, щит)
// ═══════════════════════════════════════════════════════════════

// Легаси-прокачка S.defenseLevel (снижение урона от вторжений).
// Переименована, чтобы не конфликтовать с покупкой 24ч-обороны ниже.
function buyDefenseUpgrade() {
  const cur = S.defenseLevel || 0;
  if (cur >= 5) {
    toast('Максимум', 'Автооборона уже максимальна');
    return;
  }
  const next = cur + 1;
  const baseCost = INVASION_CFG.defenseCost[next] || 99999;
  const discount = getDefenseDiscount();
  const cost = Math.floor(baseCost * (1 - discount));

  if ((S.metalAmount || 0) < cost) {
    toast('Не хватает металла', 'Нужно ' + cost + ' ⚙, есть ' + Math.floor(S.metalAmount || 0));
    return;
  }

  S.metalAmount -= cost;
  S.defenseLevel = next;
  if (discount > 0) consumeDefenseContract();

  const bonus = (INVASION_CFG.defenseBonusBase * Math.pow(next, INVASION_CFG.defenseBonusExp)).toFixed(1);
  toast('🛡 Автооборона улучшена', 'Ур.' + next + ' · +' + bonus + '% к шансу');
  saveGame();
  updateUI();
  if (typeof openPremiumShop === 'function') openPremiumShop();
}
window.buyDefenseUpgrade = buyDefenseUpgrade;
function buyShield() {
  const cfg = PREMIUM_CFG.shield;
  if ((S.metalAmount || 0) < cfg.costMetals) {
    toast('Не хватает металла', 'Нужно ' + cfg.costMetals + ' ⚙');
    return;
  }
  S.metalAmount -= cfg.costMetals;
  const until = Date.now() + cfg.hours * 3600 * 1000;
  if (!S.shieldUntil || S.shieldUntil < until) S.shieldUntil = until;
  if (!S.activeTrophyEffects) S.activeTrophyEffects = [];
  S.activeTrophyEffects.push({ type: 'shield', value: cfg.hours, expiresAt: until });
  toast('🛡 Щит активирован', 'На ' + cfg.hours + ' ч');
  saveGame();
  updateUI();
  if (typeof openPremiumShop === 'function') openPremiumShop();
}
window.buyShield = buyShield;

function openPremiumShop() {
  const card = document.getElementById('modalCard');
  if (!card) return;

  const shieldActive = S.shieldUntil && S.shieldUntil > Date.now();
  const shieldLeft = shieldActive ? Math.ceil((S.shieldUntil - Date.now()) / 3600000) : 0;

  card.innerHTML = `
    <div class="modal-title">⚙ Магазин за металлы</div>
    <div class="modal-sub">Металлы: ${fmt(S.metalAmount || 0)} ⚙</div>

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
        <span>🛡 Автооборона (24ч)</span>
        <span>Ур.${S.nightDefenseLevel || 0} / 5</span>
      </div>
      <div class="pour-btn-group" style="flex-wrap:wrap;gap:4px;margin-top:8px;">
        ${[1,2,3,4,5].map(lvl => {
          const cost = INVASION_CFG.defenseCost[lvl];
          const isCurrent = (S.nightDefenseExpiresAt > Date.now()) && S.nightDefenseLevel === lvl;
          return `<button class="pour-btn" style="flex-direction:column;padding:6px 2px;font-size:9px; ${isCurrent ? 'background:rgba(46,170,119,0.4);border-color:#2eaa77;' : ''}"
            onclick="buyDefenseLevel(${lvl})" ${(S.metalAmount || 0) >= cost ? '' : 'disabled'}>
            Ур.${lvl}<br><span style="font-size:8px;">${cost}⚙</span><br>+${(INVASION_CFG.defenseBonusBase * Math.pow(lvl, INVASION_CFG.defenseBonusExp)).toFixed(1)}%
          </button>`;
        }).join('')}
      </div>
    </div>

    <button class="pour-btn" style="width:100%;margin-top:10px;background:rgba(255,94,94,0.2);border-color:rgba(255,94,94,0.5);color:#ff8a8a;"
      onclick="document.getElementById('modal').classList.remove('show');">
      ✕ Закрыть
    </button>
  `;
  document.getElementById('modal').classList.add('show');
}
window.openPremiumShop = openPremiumShop;

function buyDefenseLevel(lvl) {
  const cost = INVASION_CFG.defenseCost[lvl];
  if ((S.metalAmount || 0) < cost) { toast('Мало металлов', 'Нужно ' + cost + ' ⚙'); return; }
  S.metalAmount -= cost;
  S.nightDefenseLevel = lvl;
  S.nightDefenseExpiresAt = Date.now() + 24 * 3600 * 1000;
  toast('🛡 Оборона активирована', 'Ур.' + lvl + ' на 24 ч');
  saveGame(); updateUI(); openPremiumShop();
}
window.buyDefenseLevel = buyDefenseLevel;