// ═══════════════════════════════════════════════════════════════
//  UI.JS — HUD, квесты, тосты, переключатель систем, ночной режим
// ═══════════════════════════════════════════════════════════════

const UNITS = ['', 'К', 'М', 'Б', 'Т', 'Кв', 'Кт', 'Сх', 'Сп', 'Ок'];

// Форматирование больших чисел (1000 -> 1К, 1000000 -> 1М)
function fmt(n) {
  if (n < 1000) return Math.floor(n).toString();
  let i = 0;
  while (n >= 1000 && i < UNITS.length - 1) { n /= 1000; i++; }
  return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + UNITS[i];
}

// Форматирование времени (3600 -> 1ч 0м)
function fmtTime(sec) {
  if (sec < 0) sec = 0;
  if (sec < 60) return Math.floor(sec) + 'с';
  if (sec < 3600) return Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0');
  return Math.floor(sec / 3600) + 'ч ' + Math.floor((sec % 3600) / 60) + 'м';
}

// Всплывающие уведомления
function toast(title, sub) {
  const el = document.getElementById('toasts');
  if (!el) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = '<b>' + title + '</b>' + (sub || '');
  el.appendChild(t);
  setTimeout(function() { t.remove(); }, 3500);
}

// ═══════════════════════════════════════════════════════════════
//  ОБНОВЛЕНИЕ HUD
// ═══════════════════════════════════════════════════════════════
function updateUI() {
  const ids = ['dustVal', 'energyVal', 'civVal', 'systemsVal'];
  for (let i = 0; i < ids.length; i++) {
    const el = document.getElementById(ids[i]);
    if (!el) continue;
    if (ids[i] === 'dustVal') el.textContent = fmt(S.dust);
    if (ids[i] === 'energyVal') el.textContent = fmt(S.energy);
    if (ids[i] === 'civVal') el.textContent = fmt(S.civLevel);
    if (ids[i] === 'systemsVal') el.textContent = S.systems;
  }

  // Доход пыли
  const rateEl = document.getElementById('dustRate');
  if (rateEl) {
    if (S.stage === 'cloud' || S.stage === 'condense' || S.stage === 'protostar') {
      const r = (typeof PART !== 'undefined' && PART.absorbRate) ? PART.absorbRate : 0;
      rateEl.textContent = '+' + r.toFixed(1) + ' / сек';
    } else {
      rateEl.textContent = '+' + fmt(dustPerSec() * 3600) + ' / час';
    }
  }
  
  // Доход энергии и цивилизации
  const energyRateEl = document.getElementById('energyRate');
  if (energyRateEl && typeof energyPerSec === 'function') {
    energyRateEl.textContent = '+' + fmt(energyPerSec() * 3600) + ' / ч';
  }
  const civRateEl = document.getElementById('civRate');
  if (civRateEl && typeof civPerSec === 'function') {
    civRateEl.textContent = '+' + fmt(civPerSec() * 3600) + ' / ч';
  }

  // Индикатор газа
  const gasEl = document.getElementById('gasIndicator');
  if (gasEl && typeof gasPercent === 'function') {
    const pct = gasPercent();
    if (pct > 1 && S.starType) {
      gasEl.style.display = 'block';
      gasEl.textContent = '💨 Газ: ' + pct + '%';
      gasEl.style.color = pct > 50 ? '#7ec8e3' : (pct > 20 ? '#ff9500' : '#ff5e5e');
    } else {
      gasEl.style.display = 'none';
    }
  }

  // Кругляшок фазы (SVG)
  const orbLabel = document.getElementById('orbLabel');
  const orbProgress = document.getElementById('orbProgress');
  const stages = ['cloud', 'condense', 'protostar', 'firstPlanet', 'system', 'galaxy'];
  const stageIdx = stages.indexOf(S.stage);
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI'][stageIdx] || 'I';
  if (orbLabel) orbLabel.textContent = roman;

  if (orbProgress) {
    const goal = currentGoal();
    let prog = 0;
    if (goal && isFinite(goal)) prog = Math.min(1, S.dust / goal);
    else if (S.stage === 'system' && S.planets) prog = S.planets.length / 8;
    else prog = 1;
    
    if (!isFinite(prog) || prog < 0) prog = 0;
    if (prog > 1) prog = 1;
    
    orbProgress.style.strokeDashoffset = (264 * (1 - prog)).toString();
  }

  // Кнопка Эволюции
  const btn = document.getElementById('evolveBtn');
  if (btn) {
    const goal = currentGoal();
    let ready = false;
    if (S.stage === 'galaxy' || S.prestigeLevel > 0) ready = false;
    else if (S.planets.length >= 8) ready = false;
    else if (goal !== null && S.dust >= goal) ready = true;

    // ★ Проверяем кулдаун сборки
    const cooldownLeft = Math.ceil(((S.assemblyCooldownUntil || 0) - Date.now()) / 1000);
    const isCooldown = cooldownLeft > 0;

    if (isCooldown) {
      btn.classList.add('show');
      btn.textContent = '⏳ Перезарядка ' + cooldownLeft + 'с';
      btn.style.opacity = '0.6';
      btn.style.background = 'linear-gradient(135deg, #555, #333)';
    } else {
      btn.textContent = 'Эволюция';
      btn.style.opacity = '1';
      btn.style.background = 'linear-gradient(135deg, #6b4de6, #8b5cf6)';
      
      if (ready && !S.activeMinigame) btn.classList.add('show');
      else btn.classList.remove('show');
    }
  }

   const backBtn = document.getElementById('backToGalaxyBtn');
  if (backBtn) {
    // Показываем кнопку "В галактику", если мы в системе и у нас больше 1 системы (до престижа)
    // Или если мы после престижа
    if (S.stage === 'system' && (S.prestigeLevel > 0 || S.systems > 1)) backBtn.style.display = 'block';
    else backBtn.style.display = 'none';
  }

  // Кнопка звука в настройках
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  if (soundToggleBtn) {
    soundToggleBtn.textContent = S.settings.sound ? 'Вкл' : 'Выкл';
    soundToggleBtn.classList.toggle('active', S.settings.sound);
  }
  
  updateStorageUI();
  updateTrophyBadge();
  if (typeof updateEventUI === 'function') updateEventUI();
  
  // Применяем яркость
  const app = document.getElementById('app');
  if (app && S.settings) {
    app.style.filter = `brightness(${S.settings.brightness})`;
  }
}

// ═══════════════════════════════════════════════════════════════
//  ХРАНИЛИЩЕ РЕСУРСОВ
// ═══════════════════════════════════════════════════════════════
function updateStorageUI() {
  const resources = ['dust', 'energy', 'civ', 'metals'];
  resources.forEach(res => {
    const cell = document.querySelector(`.storage-cell[data-res="${res}"]`);
    if (!cell) return;
    const valEl = cell.querySelector('.storage-val');
    const rateEl = cell.querySelector('.storage-rate');
    const progFill = cell.querySelector('.storage-progress-fill');
    const progText = cell.querySelector('.storage-progress-text');

    let current = 0;
    if (res === 'dust') current = S.dust;
    else if (res === 'energy') current = S.energy;
    else if (res === 'civ') current = S.civLevel;
    else if (res === 'metals') current = S.metalAmount || 0;

    if (valEl) valEl.textContent = fmt(current);

    if (rateEl) {
      if (res === 'dust') {
        if (S.stage === 'cloud' || S.stage === 'condense' || S.stage === 'protostar') {
          const r = (typeof PART !== 'undefined' && PART.absorbRate) ? PART.absorbRate : 0;
          rateEl.textContent = '+' + r.toFixed(1) + ' / сек';
        } else {
          rateEl.textContent = '+' + fmt(dustPerSec() * 3600) + ' / час';
        }
      } else if (res === 'energy') {
        rateEl.textContent = '+' + fmt(energyPerSec() * 3600) + ' / час';
      } else if (res === 'civ') {
        rateEl.textContent = '+' + fmt(civPerSec() * 3600) + ' / час';
      } else if (res === 'metals') {
        const mRate = metalsPerSec();
        rateEl.textContent = '+' + (mRate < 10 ? mRate.toFixed(1) : fmt(mRate)) + ' / сек';
      }
    }

    if (!progFill) return;

    let cap = 1;
    if (typeof getResourceCap === 'function') {
      cap = getResourceCap(res);
    }

    const pct = Math.min(100, Math.max(0, (current / cap) * 100));
    progFill.style.width = pct + '%';

    const isFull = current >= cap;
    if (isFull) cell.classList.add('full');
    else cell.classList.remove('full');

    if (progText) progText.textContent = fmt(current) + ' / ' + fmt(cap);

    const btn = cell.querySelector('.storage-upgrade-btn');
    if (btn) {
      const lvl = S.storageLevels[res] || 1;
      const cost = STORAGE_CFG.getUpgradeCost(res, lvl);
      if (lvl >= STORAGE_CFG.maxLevel) {
        btn.textContent = 'МАКС';
        btn.disabled = true;
      } else {
        btn.disabled = false;
        const poured = S.storageProgress[res] || 0;
        btn.textContent = poured > 0
          ? 'Улучшить ' + Math.min(99, Math.floor((poured / cost) * 100)) + '%'
          : 'Улучшить';
      }
    }
  });
}

function openStorageModal(res) {
  const names = { dust: 'Пыли', energy: 'Энергии', civ: 'Цивилизации' };
  const icons = { dust: '✦', energy: '⚡', civ: '🧬' };
  const lvl = S.storageLevels[res] || 1;
  const cost = STORAGE_CFG.getUpgradeCost(res, lvl);
  const card = document.getElementById('modalCard');
  if (!card) return;

  let capInfo = '';
  if (res === 'dust') {
    const curH = STORAGE_CFG.getDustCapHours(lvl);
    const nextH = lvl < 7 ? STORAGE_CFG.getDustCapHours(lvl + 1) : curH;
    capInfo = `Кап хранения: <b>${curH} ч</b> ${lvl < 7 ? '➔ <b>' + nextH + ' ч</b>' : '(МАКС)'}`;
  } else if (res === 'energy') {
    const curM = STORAGE_CFG.getEnergyCapMult(lvl);
    const nextM = lvl < 7 ? STORAGE_CFG.getEnergyCapMult(lvl + 1) : curM;
    capInfo = `Множитель капа: <b>×${curM}</b> ${lvl < 7 ? '➔ <b>×' + nextM + '</b>' : '(МАКС)'}`;
  } else if (res === 'civ') {
    const curM = STORAGE_CFG.getCivCapMult(lvl);
    const nextM = lvl < 7 ? STORAGE_CFG.getCivCapMult(lvl + 1) : curM;
    capInfo = `Множитель капа: <b>×${curM.toFixed(2)}</b> ${lvl < 7 ? '➔ <b>×' + nextM.toFixed(2) + '</b>' : '(МАКС)'}`;
  }

  const isMax = lvl >= STORAGE_CFG.maxLevel;
  const poured = isMax ? 0 : Math.min(S.storageProgress[res] || 0, cost);
  const pct = isMax ? 100 : Math.min(100, (poured / cost) * 100);
  const starsPrice = (CFG && CFG.storageInstantStars) || 50;

  card.innerHTML = `
    <div class="modal-title">${icons[res]} Улучшение Хранилища ${names[res]}</div>
    <div class="modal-sub">Уровень ${lvl} из ${STORAGE_CFG.maxLevel}</div>
    <div class="info-box">
      <div class="row-stat">
        <span>Параметры капа:</span>
        <span>${capInfo}</span>
      </div>
      <div class="row-stat">
        <span>Стоимость уровня:</span>
        <span>${isMax ? 'МАКСИМУМ' : fmt(cost) + ' ✦ пыли'}</span>
      </div>
      ${!isMax ? `
      <div class="row-stat">
        <span>Вложено:</span>
        <span>${fmt(poured)} / ${fmt(cost)}</span>
      </div>
      <div class="storage-progress" style="height:8px; margin-top:6px;">
        <div class="storage-progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="pour-btn-group">
        <button class="pour-btn" onclick="pourStorage('${res}', 0.1)">+10%</button>
        <button class="pour-btn" onclick="pourStorage('${res}', 0.25)">+25%</button>
        <button class="pour-btn" onclick="pourStorage('${res}', 'max')">Вложить всё</button>
      </div>
      <button class="stars-btn" onclick="buyStorageWithStars('${res}')">
        ⭐ Мгновенно за ${starsPrice} Stars
      </button>
      ` : '<div style="text-align:center; color:#b9a8ff; font-weight:700; margin-top:15px;">Достигнут максимальный уровень!</div>'}
  `;
  if (typeof playSFX === 'function') playSFX('ui_open');
  document.getElementById('modal').classList.add('show');
}

function pourStorage(res, part) {
  const lvl = S.storageLevels[res] || 1;
  if (lvl >= STORAGE_CFG.maxLevel) {
    toast('Максимальный уровень', 'Хранилище прокачано до предела.');
    return;
  }

  const cost = STORAGE_CFG.getUpgradeCost(res, lvl);
  const poured = S.storageProgress[res] || 0;
  const remaining = cost - poured;

  const want = (part === 'max') ? remaining : Math.floor(cost * part);
  const amount = Math.floor(Math.min(want, remaining, S.dust));

  if (amount <= 0) {
    if (typeof playSFX === 'function') playSFX('ui_error');
    toast('Недостаточно пыли', 'Осталось вложить ' + fmt(remaining) + ' ✦, у вас ' + fmt(S.dust));
    return;
  }

  S.dust -= amount;
  S.storageProgress[res] = poured + amount;

  if (S.storageProgress[res] >= cost) {
    S.storageLevels[res] = lvl + 1;
    S.storageProgress[res] = 0;
    toast('Хранилище улучшено! 🎉', namesTitle(res) + ': уровень ' + S.storageLevels[res]);
    if (typeof playSFX === 'function') playSFX('ui_levelup');
  }

  saveGame();
  updateUI();
  openStorageModal(res);
}

function buyStorageWithStars(res) {
  const starsPrice = (CFG && CFG.storageInstantStars) || 50;
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg && typeof tg.openInvoice === 'function') {
    toast('⭐ Оплата', 'Инвойс на ' + starsPrice + ' Stars (заглушка).');
  } else {
    toast('⭐ Telegram Stars', 'Оплата откроется внутри Telegram.');
  }
}

function namesTitle(res) {
  if (res === 'dust') return 'Пыли';
  if (res === 'energy') return 'Энергии';
  return 'Цивилизации';
}

// ═══════════════════════════════════════════════════════════════
//  КВЕСТЫ
// ═══════════════════════════════════════════════════════════════
function getQuests() {
  const list = [];
  const st = (S.prestigeLevel > 0 && S.stage === 'system') ? 'galaxy' : S.stage;

  if (st === 'cloud' && STAGES.cloud.goal) {
    list.push({ title: 'Собери ' + fmt(STAGES.cloud.goal) + ' пылинок', cur: S.dustTotal, max: STAGES.cloud.goal });
  }
  else if (st === 'condense' && STAGES.condense.goal) {
    list.push({ title: 'Накопи ' + fmt(STAGES.condense.goal) + ' пыли', cur: S.dustTotal, max: STAGES.condense.goal });
  }
  else if (st === 'protostar') {
    const left = (typeof getProtostarTimeLeft === 'function') ? getProtostarTimeLeft() : 0;
    const b = (CFG.activeBoost && CFG.activeBoost.protostar) || {};
    const total = b.duration || 30;
    list.push({ title: '🔥 Разогрев · ' + left.toFixed(1) + 'с', cur: Math.max(0, total - left), max: total });
  }
  else if (st === 'firstPlanet') {
    const cost = planetCost(0);
    list.push({ title: 'Собери первую планету · ' + fmt(cost) + ' ✦', cur: S.dust, max: cost });
  }
  else if (st === 'system') {
    if (S.systems === 1) {
      const built = S.planets.filter(p => p && !p.forming).length;
      if (built < 8) {
        list.push({ title: 'Собери 8 планет', cur: built, max: 8 });
        const nextCost = planetCost(built);
        list.push({ title: 'Следующая планета · ' + fmt(nextCost) + ' ✦', cur: S.dust, max: nextCost });
      } else {
        list.push({ title: 'Система готова · расширяйся', cur: 1, max: 1 });
      }
    } else {
      const shopCost = (typeof systemShopCosts === 'function') ? systemShopCosts().dust : systemCost(Math.max(0, S.systems - 1));
      list.push({ title: 'До Галактики (5 систем)', cur: S.systems, max: 5 });
      list.push({ title: 'Следующая система · ' + fmt(shopCost) + ' ✦', cur: S.dust, max: shopCost });
    }
  }
  else if (st === 'galaxy') {
    const systems = S.systems;
    const nextCost = systemCost(Math.max(0, systems - 1));
    if (systems < 2) {
      list.push({ title: 'Основай 2-ю систему · ' + fmt(nextCost) + ' ✦', cur: S.dust, max: nextCost });
    } else {
      const avail = (typeof checkPrestigeAvailability === 'function') ? checkPrestigeAvailability() : 0;
      if (avail > 0) {
        list.push({ title: '💥 Престиж доступен!', cur: 1, max: 1 });
      } else {
        const reqs = (typeof prestigeRequirements === 'function') ? prestigeRequirements() : [];
        const nextReq = reqs[S.prestigeLevel || 0];
        if (nextReq) list.push({ title: '💥 До престижа', cur: systems, max: nextReq });
      }
      list.push({ title: 'Следующая система · ' + fmt(nextCost) + ' ✦', cur: S.dust, max: nextCost });
    }
  }
  return list;
}

// ═══════════════════════════════════════════════════════════════
//  ПЕРЕКЛЮЧАТЕЛЬ СИСТЕМ
// ═══════════════════════════════════════════════════════════════
function updateSystemSwitcher() {
  const btn = document.getElementById('systemSwitcherBtn');
  const dropdown = document.getElementById('systemDropdown');
  if (!btn || !dropdown) return;

  // Меню работает до престижа и только если у нас больше 1 системы
  if (S.prestigeLevel > 0 || S.totalSystemsCreated < 2) {
    btn.style.display = 'none';
    dropdown.style.display = 'none';
    return;
  }
  btn.style.display = 'block';
  btn.textContent = '🌌 ' + (S.stage === 'galaxy' ? 'Галактика' : S.systemName);

  const list = [];
  if (S.activeSystemIdx === 0) list.push({ idx: 0, name: S.systemName, isPrime: !!S.primeSystem, primeData: S.primeSystem });
  else if (S.otherSystems[0]) list.push({ idx: 0, name: S.otherSystems[0].name, isPrime: S.otherSystems[0].isPrime, primeData: S.otherSystems[0].primeData });
  else list.push({ idx: 0, name: 'Родная', isPrime: false });

  for (let i = 1; i < S.otherSystems.length; i++) {
    if (S.otherSystems[i]) {
      list.push({ idx: i, name: S.otherSystems[i].name, isPrime: S.otherSystems[i].isPrime, primeData: S.otherSystems[i].primeData });
    }
  }
  // ★ Убираем дублирующиеся короны из названий (для старых сейвов)
  for (let i = 0; i < list.length; i++) {
    if (list[i].name && list[i].name.indexOf('👑 ') === 0) {
      list[i].name = list[i].name.replace('👑 ', '');
    }
  }

  let html = '';
  for (let s of list) {
    let iconHTML = '';
    if (s.idx === 0) {
      iconHTML = '<div class="dd-icon-wrap" style="font-size:18px;">🏠</div>';
    } else if (s.isPrime && s.primeData) {
      iconHTML = `<div class="dd-icon-wrap" style="font-size:14px;">👑</div>
                  <canvas class="dd-prime-canvas" data-key="${s.primeData.objectKey}" width="24" height="24"></canvas>`;
    } else {
      iconHTML = '<div class="dd-icon-wrap"></div>';
    }

    // При клике переключаемся на систему и закрываем меню
    const action = `switchToSystem(${s.idx}); S.stage='system'; S.panX=0; S.panY=0; S.zoom=1; S.rotation=0; S.tiltX=0; S.tiltY=0; updateUI(); updateSystemSwitcher(); document.getElementById('systemDropdown').style.display='none';`;

    html += `<button class="sys-dropdown-item ${S.activeSystemIdx === s.idx && S.stage === 'system' ? 'active' : ''}" onclick="${action}">
      ${iconHTML}
      <span style="flex:1; text-align:left;">${s.name}</span>
    </button>`;
  }

  // Если мы внутри системы — добавляем кнопку возврата на карту
  if (S.stage === 'system') {
    html += `<button class="sys-dropdown-item" style="color:#7ee0a8; border-top:1px solid rgba(139,127,212,0.2); margin-top:4px;" 
      onclick="S.stage='galaxy'; S.panX=0; S.panY=0; S.zoom=1; S.rotation=0; S.tiltX=0; S.tiltY=0; updateUI(); updateSystemSwitcher(); document.getElementById('systemDropdown').style.display='none';">
      <div class="dd-icon-wrap" style="font-size:16px;">🌌</div>
      <span style="flex:1; text-align:left;">Карта галактики</span>
    </button>`;
  }

  html += `<button class="sys-dropdown-item" style="color:#8b7fd4;border-top:1px solid rgba(139,127,212,0.2);margin-top:4px;" 
    onclick="renameCurrentSystem(); document.getElementById('systemDropdown').style.display='none';">
    <div class="dd-icon-wrap"></div><span style="flex:1; text-align:left;">✎ Переименовать</span>
  </button>`;

  dropdown.innerHTML = html;

  if (!btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.onclick = function(e) {
      e.stopPropagation();
      const isHidden = dropdown.style.display === 'none' || !dropdown.style.display;
      dropdown.style.display = isHidden ? 'flex' : 'none';
      if (isHidden && typeof startDropdownAnimation === 'function') startDropdownAnimation();
    };
    document.addEventListener('click', function(e) {
      if (!dropdown.contains(e.target) && e.target !== btn) dropdown.style.display = 'none';
    });
  }
}
function renameCurrentSystem() {
  const newName = prompt('Новое имя системы:', S.systemName);
  if (newName && newName.trim()) {
    S.systemName = newName.trim().slice(0, 16);
    if (S.activeSystemIdx > 0 && S.otherSystems[S.activeSystemIdx]) {
      S.otherSystems[S.activeSystemIdx].name = S.systemName;
    }
    updateSystemSwitcher();
  }
}
window.renameCurrentSystem = renameCurrentSystem;
// ═══════════════════════════════════════════════════════════════
//  ИНИЦИАЛИЗАЦИЯ UI
// ═══════════════════════════════════════════════════════════════
function initUI() {
  const questArrowEl = document.getElementById('phaseOrb');
  if (questArrowEl) {
    questArrowEl.addEventListener('click', function() {
      if (typeof playSFX === 'function') playSFX('ui_click');
      document.getElementById('questsPanel').classList.toggle('open');
      this.classList.toggle('open');
      updateQuestPanel();
    });
  }

  const evolveBtnEl = document.getElementById('evolveBtn');
  if (evolveBtnEl) {
    evolveBtnEl.addEventListener('click', function() {
      if (typeof playSFX === 'function') playSFX('ui_click');
      if (S.stage === 'galaxy') return;
      if (typeof openEvolution === 'function') openEvolution();
    });
  }

  const backBtn = document.getElementById('backToGalaxyBtn');
  if (backBtn) {
    backBtn.onclick = function() {
      if (typeof playSFX === 'function') playSFX('ui_click');
      S.stage = 'galaxy';
      S.panX = 0; S.panY = 0; S.zoom = 1; S.rotation = 0;
      updateUI();
      updateSystemSwitcher();
      if (typeof checkEvolution === 'function') checkEvolution();
    };
  }

  document.querySelectorAll('.storage-upgrade-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (typeof playSFX === 'function') playSFX('ui_click');
      openStorageModal(btn.dataset.res);
    });
  });

  updateStorageUI();
  setInterval(updateSystemSwitcher, 2000);

  const achBtn = document.getElementById('achBtn');
  if (achBtn) {
    achBtn.addEventListener('click', () => {
      if (typeof playSFX === 'function') playSFX('ui_click');
      if (typeof openAchievements === 'function') openAchievements();
    });
  }

  // Настройки
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const brightnessSlider = document.getElementById('brightnessSlider');
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const settingsResetBtn = document.getElementById('settingsResetBtn');

  if (settingsBtn && settingsModal) {
    settingsBtn.addEventListener('click', () => {
      if (typeof playSFX === 'function') playSFX('ui_click');
      if (brightnessSlider) brightnessSlider.value = S.settings.brightness;
      if (soundToggleBtn) {
        soundToggleBtn.textContent = S.settings.sound ? 'Вкл' : 'Выкл';
        soundToggleBtn.classList.toggle('active', S.settings.sound);
      }
      settingsModal.classList.add('show');
    });
  }

  if (brightnessSlider) {
    brightnessSlider.addEventListener('input', (e) => {
      S.settings.brightness = parseFloat(e.target.value);
      const app = document.getElementById('app');
      if (app) app.style.filter = `brightness(${S.settings.brightness})`;
    });
  }

  if (soundToggleBtn) {
    soundToggleBtn.addEventListener('click', () => {
      if (typeof playSFX === 'function') playSFX('ui_click');
      const isOn = (typeof toggleSound === 'function') ? toggleSound() : !S.settings.sound;
      soundToggleBtn.textContent = isOn ? 'Вкл' : 'Выкл';
      soundToggleBtn.classList.toggle('active', isOn);
    });
  }

  if (settingsResetBtn) {
    settingsResetBtn.addEventListener('click', () => {
      if (confirm('Вы уверены? Весь прогресс будет удален.')) resetGame();
    });
  }
}

// Глобальное закрытие модалки (по клику на фон или Esc)
(function setupModalClose() {
  function attach() {
    const modal = document.getElementById('modal');
    if (!modal) { setTimeout(attach, 200); return; }
    if (modal.dataset.closeAttached === '1') return;
    modal.dataset.closeAttached = '1';
    
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        if (typeof closeEvolutionModal === 'function') closeEvolutionModal();
        else modal.classList.remove('show');
      }
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && modal.classList.contains('show')) {
        if (typeof closeEvolutionModal === 'function') closeEvolutionModal();
        else modal.classList.remove('show');
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();

// ═══════════════════════════════════════════════════════════════
//  ПАНЕЛЬ КВЕСТОВ (без перерисовки innerHTML)
// ═══════════════════════════════════════════════════════════════
let _lastQuestKey = '';
function updateQuestPanel() {
  const panel = document.getElementById('questsPanel');
  if (!panel || !panel.classList.contains('open')) return;
  const quests = getQuests();

  let key = '';
  for (let i = 0; i < quests.length; i++) key += quests[i].title + '|';

  if (key !== _lastQuestKey) {
    _lastQuestKey = key;
    let html = '<div class="quests-title">КВЕСТЫ</div>';
    for (let i = 0; i < quests.length; i++) {
      const q = quests[i];
      let pct = 0;
      if (q.max > 0) pct = Math.min(100, Math.floor(q.cur / q.max * 100));
      if (pct < 0 || !isFinite(pct)) pct = 0;
      
      html += '<div class="quest-item">' +
        '<div class="quest-title' + (pct >= 100 ? ' quest-done' : '') + '">' +
          '<span>' + q.title + '</span>' +
          '<span class="q-progress">' + fmt(q.cur) + ' / ' + fmt(q.max) + '</span>' +
        '</div>' +
        '<div class="quest-bar"><div style="width:' + pct + '%"></div></div>' +
      '</div>';
    }
    panel.innerHTML = html;
  } else {
    const items = panel.querySelectorAll('.quest-item');
    for (let i = 0; i < quests.length && i < items.length; i++) {
      const q = quests[i];
      let pct = 0;
      if (q.max > 0) pct = Math.min(100, Math.floor(q.cur / q.max * 100));
      if (pct < 0 || !isFinite(pct)) pct = 0;

      const bar = items[i].querySelector('.quest-bar > div');
      if (bar) bar.style.width = pct + '%';

      const prog = items[i].querySelector('.q-progress');
      if (prog) prog.textContent = fmt(q.cur) + ' / ' + fmt(q.max);

      const titleRow = items[i].querySelector('.quest-title');
      if (titleRow) {
        if (pct >= 100) titleRow.classList.add('quest-done');
        else titleRow.classList.remove('quest-done');
      }
    }
  }
}

function triggerSupernovaFlash() {
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:white;opacity:0;pointer-events:none;z-index:9999;';
  document.body.appendChild(flash);
  flash.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 500, easing: 'ease-out' }).onfinish = function() { flash.remove(); };
}

// ═══════════════════════════════════════════════════════════════
//  ТРОФЕЙНЫЕ КОНТРАКТЫ
// ═══════════════════════════════════════════════════════════════
function updateTrophyBadge() {
  const el = document.getElementById('trophyBadge');
  const countEl = document.getElementById('trophyCount');
  if (!el || !countEl) return;
  const c = S.trophyContracts ? S.trophyContracts.length : 0;
  if (c > 0) {
    el.style.display = 'block';
    countEl.textContent = c;
  } else {
    el.style.display = 'none';
  }
}

function openTrophyModal() {
  const modal = document.getElementById('trophyModal');
  const list = document.getElementById('trophyList');
  if (!modal || !list) return;

  if (!S.trophyContracts || S.trophyContracts.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:#8b7fd4;padding:20px;">Пусто. Отправляйтесь в ночные экспедиции!</div>';
  } else {
    let html = '';
    const names = {
      system_discount: '🎫 Скидка на систему',
      system_free: '🎫 Бесплатная система',
      shield: '🎫 Щит',
      defense_discount: '🎫 Скидка на оборону',
      defense_level: '🎫 Автооборона',
    };
    for (let i = 0; i < S.trophyContracts.length; i++) {
      const t = S.trophyContracts[i];
      let desc = '';
      if (t.type === 'system_discount') desc = Math.round(t.value * 100) + '% на пыль';
      if (t.type === 'system_free') desc = '0 пыли (энергия/цив тратятся)';
      if (t.type === 'shield') desc = t.value + ' ч';
      if (t.type === 'defense_discount') desc = Math.round(t.value * 100) + '% на апгрейд';
      if (t.type === 'defense_level') desc = 'Ур.' + t.value + ' на 12ч';

      const color = t.rarity === 'epic' ? '#ffd700' : (t.rarity === 'rare' ? '#b9a8ff' : '#fff');
      html += `<div class="ach-item" style="border-left:3px solid ${color}">
        <div class="ach-info">
          <div class="ach-name" style="color:${color}">${names[t.type] || t.type}</div>
          <div class="ach-desc">${desc}</div>
        </div>
        <div style="font-size:10px;color:#8b7fd4;text-transform:uppercase;">${t.rarity}</div>
      </div>`;
    }
    list.innerHTML = html;
  }
  modal.classList.add('show');
}
window.openTrophyModal = openTrophyModal;

// ═══════════════════════════════════════════════════════════════
//  НОЧНОЙ РЕЖИМ
// ═══════════════════════════════════════════════════════════════
let _tempNightConfig = null;

function openNightMode() {
  const card = document.getElementById('modalCard');
  if (!card) return;
  
  if (!_tempNightConfig) {
    _tempNightConfig = JSON.parse(JSON.stringify(S.nightConfig || { mode: 'balanced', defenseEnabled: true, cometHours: 0, expeditionPercent: 0 }));
  }
  const nc = _tempNightConfig;
  const presets = NIGHT_CFG.presets;
  const curMode = nc.mode || 'balanced';

  // Кнопки пресетов
  const presetsHTML = Object.keys(presets).map(function(mode) {
    const labels = { cautious: '🛡️ Осторожный', balanced: '⚖️ Сбалансированный', aggressive: '🚀 Агрессивный', insane: '☠️ Безумный' };
    const caps = NIGHT_CFG.lossCaps[mode];
    const active = curMode === mode ? 'active' : '';
    return `<button class="pour-btn ${active}" onclick="applyNightPreset('${mode}')" style="flex-direction:column;padding:8px 4px;font-size:10px; ${active ? 'background:rgba(139,127,212,0.5);border-color:#b9a8ff;' : ''}">
      ${labels[mode]}<br><span style="font-size:9px;opacity:0.7;">потери ${Math.round(caps * 100)}%</span>
    </button>`;
  }).join('');

  // Предпросмотр шансов
  function calcPreviewChance(tierKey) {
    const tier = INVASION_CFG.tiers[tierKey];
    if (!tier) return 0;
    if (S.shieldUntil && S.shieldUntil > Date.now()) return 1.0;
    
    const capE = Math.max(1, getResourceCap('energy'));
    const capC = Math.max(1, getResourceCap('civ'));
    const thresh = INVASION_CFG.resourceThresholdShare || 0.25;
    const eF = Math.min(1, S.energy / (thresh * capE));
    const cF = Math.min(1, S.civLevel / (thresh * capC));
    const resFactor = Math.min(eF, cF);
    let chance = tier.baseChance * resFactor;
    
    const isDefActive = S.nightDefenseExpiresAt && S.nightDefenseExpiresAt > Date.now();
    const activeLvl = isDefActive ? (S.nightDefenseLevel || 0) : 0;
    let bonus = 0;
    if (activeLvl > 0 && nc.defenseEnabled) {
      bonus = (INVASION_CFG.defenseBonusBase || 6) * Math.pow(activeLvl, INVASION_CFG.defenseBonusExp || 0.8) / 100;
    }
    if (S.activeTrophyEffects) {
      for (let i = 0; i < S.activeTrophyEffects.length; i++) {
        const e = S.activeTrophyEffects[i];
        if (e.type === 'defense_level' && e.expiresAt > Date.now() && nc.defenseEnabled) {
          const tmp = (INVASION_CFG.defenseBonusBase || 6) * Math.pow(e.value, INVASION_CFG.defenseBonusExp || 0.8) / 100;
          bonus = Math.max(bonus, tmp);
        }
      }
    }
    chance += bonus;
    
    const pct = nc.expeditionPercent || 0;
    const expPenalty = (pct / 100) * (NIGHT_CFG.expeditionDefensePenaltyMax || 0.30);
    chance -= expPenalty;
    
    return Math.max(0, Math.min(tier.chanceCap, chance));
  }

  const isDefActive = S.nightDefenseExpiresAt && S.nightDefenseExpiresAt > Date.now();
  const activeLvl = isDefActive ? (S.nightDefenseLevel || 0) : 0;
  
  function getDefBonus() {
    if (!nc.defenseEnabled) return 0;
    const lvl = isDefActive ? (S.nightDefenseLevel || 0) : 0;
    let b = 0;
    if (lvl > 0) b = (INVASION_CFG.defenseBonusBase || 6) * Math.pow(lvl, INVASION_CFG.defenseBonusExp || 0.8);
    if (S.activeTrophyEffects) {
      for (let i = 0; i < S.activeTrophyEffects.length; i++) {
        const e = S.activeTrophyEffects[i];
        if (e.type === 'defense_level' && e.expiresAt > Date.now()) {
          const tmp = (INVASION_CFG.defenseBonusBase || 6) * Math.pow(e.value, INVASION_CFG.defenseBonusExp || 0.8);
          b = Math.max(b, tmp);
        }
      }
    }
    return b;
  }
  
  const rawBonus = getDefBonus();
  const expPenalty = (nc.expeditionPercent / 100) * (NIGHT_CFG.expeditionDefensePenaltyMax || 0.30) * 100;
  
  const scoutChance = calcPreviewChance('scout') * 100;
  const raidChance = calcPreviewChance('raid') * 100;
  const siegeChance = calcPreviewChance('siege') * 100;

  const lossCap = NIGHT_CFG.lossCaps[curMode] || 0.25;
  const objCount = S.stage === 'galaxy' ? S.systems : S.planets.length;
  const maxLoss = Math.floor(objCount * lossCap);

  // Кнопки уровней обороны
  const defenseButtons = [1, 2, 3, 4, 5].map(lvl => {
    const cost = INVASION_CFG.defenseCost[lvl];
    const bonus = (INVASION_CFG.defenseBonusBase * Math.pow(lvl, INVASION_CFG.defenseBonusExp)).toFixed(1);
    const isCurrent = isDefActive && activeLvl === lvl;
    return `<button class="pour-btn" style="flex-direction:column;padding:6px 2px;font-size:9px; line-height:1.2; ${isCurrent ? 'background:rgba(46,170,119,0.4);border-color:#2eaa77;' : ''}"
      onclick="activateNightDefense(${lvl})" ${ (S.metalAmount || 0) >= cost ? '' : 'disabled' }>
      Ур.${lvl}<br><span style="font-size:8px;">${cost}⚙</span><br>+${bonus}%
    </button>`;
  }).join('');

  const defenseLabel = isDefActive 
    ? `Ур.${activeLvl} · +${rawBonus.toFixed(1)}% (до ${new Date(S.nightDefenseExpiresAt).getHours()}:00)` 
    : 'Выключена';

  card.innerHTML = `
    <div class="modal-title">🌙 Ночной режим</div>
    <div class="modal-sub">Настрой риск и награду на время отсутствия</div>

    <div class="info-box">
      <div class="ach-sec-title">Пресеты</div>
      <div class="pour-btn-group">${presetsHTML}</div>
    </div>

    <div class="info-box">
      <div class="row-stat">
        <span>🛡 Автооборона (на 24ч)</span>
        <span style="color:${isDefActive ? '#7ee0a8' : '#ff8a8a'}">${defenseLabel}</span>
      </div>
      <div class="pour-btn-group" style="flex-wrap:wrap;gap:4px;margin-top:8px;">
        ${defenseButtons}
      </div>
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;margin-top:4px;">
        <span>Металлы: ${fmt(S.metalAmount || 0)} ⚙</span>
        <span>Активация съедает металл</span>
      </div>
      <div class="pour-btn-group" style="margin-top:4px;">
        <button class="pour-btn" onclick="toggleNightDefense()" style="background:${nc.defenseEnabled ? 'rgba(46,170,119,0.4)' : 'rgba(255,94,94,0.2)'};border-color:${nc.defenseEnabled ? '#2eaa77' : 'rgba(255,94,94,0.5)'};">
          ${nc.defenseEnabled ? '✓ ВКЛ' : '✕ ВЫКЛ'}
        </button>
      </div>
    </div>

    <div class="info-box">
      <div class="row-stat">
        <span>☄️ Комета на ночь</span>
        <span>${nc.cometHours > 0 ? nc.cometHours + ' ч' : 'ВЫКЛ'}</span>
      </div>
      <input type="range" min="0" max="8" step="1" value="${nc.cometHours || 0}"
        oninput="setNightComet(this.value)" style="width:100%;accent-color:#3d6dd4;">
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;">
        <span>Цена: ${nc.cometHours * 100}⚙ + ${fmt(Math.max(500000, dustPerSec() * 600))}✦</span>
        <span>Без штрафа к обороне</span>
      </div>
    </div>

    <div class="info-box">
      <div class="row-stat">
        <span>🚀 Экспедиция</span>
        <span>${nc.expeditionPercent || 0}% ресурсов</span>
      </div>
      <input type="range" min="0" max="100" step="10" value="${nc.expeditionPercent || 0}"
        oninput="setNightExpedition(this.value)" style="width:100%;accent-color:#2eaa77;">
      <div class="row-stat" style="font-size:10px;color:#ffb347;">
        <span>Штраф к обороне: −${expPenalty.toFixed(1)}%</span>
        <span>Списывает ⚡, ⚙ и 🧬</span>
      </div>
    </div>

    <div class="info-box">
      <div class="ach-sec-title">Прогноз защиты</div>
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;margin-top:4px;">
        <span>Офлайн-атаки:</span><span>только при отсутствии >1 часа</span>
      </div>
      <div class="row-stat"><span>Разведка:</span><span style="color:${scoutChance > 60 ? '#7ee0a8' : scoutChance > 30 ? '#ffb347' : '#ff5e5e'}">${Math.round(scoutChance)}%</span></div>
      <div class="row-stat"><span>Рейд:</span><span style="color:${raidChance > 60 ? '#7ee0a8' : raidChance > 30 ? '#ffb347' : '#ff5e5e'}">${Math.round(raidChance)}%</span></div>
      <div class="row-stat"><span>Осада:</span><span style="color:${siegeChance > 60 ? '#7ee0a8' : siegeChance > 30 ? '#ffb347' : '#ff5e5e'}">${Math.round(siegeChance)}%</span></div>
      <div class="row-stat"><span>Макс. потерь:</span><span style="color:#ff5e5e">${maxLoss} ${S.stage === 'galaxy' ? 'систем' : 'планет'}</span></div>
    </div>

    <div class="pour-btn-group" style="margin-top:10px;">
      <button class="pour-btn" style="background:rgba(46,170,119,0.3);border-color:#2eaa77;"
        onclick="saveNightConfig()">
        ✓ Готово
      </button>
      <button class="pour-btn" style="background:rgba(255,94,94,0.2);border-color:rgba(255,94,94,0.5);color:#ff8a8a;"
        onclick="cancelNightConfig()">
        ✕ Отмена
      </button>
    </div>
  `;
  document.getElementById('modal').classList.add('show');
}

function saveNightConfig() {
  if (_tempNightConfig) {
    // Проверка и списание ресурсов
    let mCostComet = _tempNightConfig.cometHours * 100;
    let dCostComet = Math.floor(Math.max(500000, dustPerSec() * 600));
    let eCostExp = Math.floor(S.energy * (_tempNightConfig.expeditionPercent / 100));
    let mCostExp = Math.floor((S.metalAmount || 0) * (_tempNightConfig.expeditionPercent / 100));
    let cCostExp = Math.floor(S.civLevel * (_tempNightConfig.expeditionPercent / 100));

    if (_tempNightConfig.cometHours > 0 && (S.metalAmount < mCostComet || S.dust < dCostComet)) {
      toast('Ошибка', 'Не хватает на комету');
      _tempNightConfig.cometHours = 0;
      mCostComet = 0; dCostComet = 0;
    }
    if (_tempNightConfig.expeditionPercent > 0 && (eCostExp <= 0 || mCostExp <= 0 || cCostExp <= 0)) {
      toast('Ошибка', 'Не хватает на экспедицию');
      _tempNightConfig.expeditionPercent = 0;
      eCostExp = 0; mCostExp = 0; cCostExp = 0;
    }

    // Списываем ресурсы
    if (mCostComet > 0) { S.metalAmount -= mCostComet; S.dust -= dCostComet; }
    if (eCostExp > 0) { S.energy -= eCostExp; S.metalAmount -= mCostExp; S.civLevel -= cCostExp; }

    S.nightConfig = JSON.parse(JSON.stringify(_tempNightConfig));
    _tempNightConfig = null;
    
    saveGame();
    document.getElementById('modal').classList.remove('show');
    
    let totalCostText = '';
    if (mCostComet > 0) totalCostText += `Комета: ${mCostComet}⚙ ${fmt(dCostComet)}✦. `;
    if (eCostExp > 0) totalCostText += `Экспедиция: ${eCostExp}⚡ ${mCostExp}⚙ ${cCostExp}🧬. `;
    
    if (totalCostText) {
      toast('🌙 Ночной режим активирован', 'Списано: ' + totalCostText);
    } else {
      toast('🌙 Настройки сохранены', 'Ресурсы на миссии не списаны');
    }
  }
}

function cancelNightConfig() {
  _tempNightConfig = null;
  document.getElementById('modal').classList.remove('show');
}

function applyNightPreset(mode) {
  if (!NIGHT_CFG.presets[mode] || !_tempNightConfig) return;
  const p = NIGHT_CFG.presets[mode];
  _tempNightConfig.mode = mode;
  _tempNightConfig.defenseEnabled = p.defense > 0;
  _tempNightConfig.cometHours = p.cometHours;
  _tempNightConfig.expeditionPercent = p.expPercent;
  openNightMode();
}

function toggleNightDefense() {
  if (!_tempNightConfig) return;
  _tempNightConfig.defenseEnabled = !_tempNightConfig.defenseEnabled;
  openNightMode();
}

function setNightComet(hours) {
  if (!_tempNightConfig) return;
  _tempNightConfig.cometHours = parseInt(hours) || 0;
  _tempNightConfig.mode = 'custom';
  openNightMode();
}

function setNightExpedition(pct) {
  if (!_tempNightConfig) return;
  _tempNightConfig.expeditionPercent = parseInt(pct) || 0;
  _tempNightConfig.mode = 'custom';
  openNightMode();
}

function activateNightDefense(lvl) {
  const cost = INVASION_CFG.defenseCost[lvl];
  if ((S.metalAmount || 0) < cost) {
    toast('Не хватает металла', 'Нужно ' + cost + ' ⚙');
    return;
  }
  S.metalAmount -= cost;
  S.nightDefenseLevel = lvl;
  S.nightDefenseExpiresAt = Date.now() + 24 * 3600 * 1000;
  if (_tempNightConfig) _tempNightConfig.defenseEnabled = true;
  S.nightConfig.defenseEnabled = true;
  
  toast('🛡 Оборона активирована', 'Ур.' + lvl + ' на 24 ч');
  saveGame();
  updateUI();
  openNightMode();
}
// ═══════════════════════════════════════════════════════════════
//  ЕЖЕДНЕВНЫЕ НАГРАДЫ
// ═══════════════════════════════════════════════════════════════

function getDailyRewardData(day) {
  // Динамический подсчет наград
  const dustReward = Math.floor(Math.max(50000, dustPerSec() * 3600 * 4)); // 4 часа дохода
  const energyReward = Math.floor(Math.max(1000, energyPerSec() * 3600 * 4));
  const civReward = Math.floor(Math.max(10, civPerSec() * 3600 * 8));
  const metalReward = Math.floor(1000 * Math.max(1, S.systems)); // Масштабируется от систем

  const rewards = [
    { icon: '✦', name: 'Пыль', amount: dustReward, type: 'dust' },
    { icon: '⚡', name: 'Энергия', amount: energyReward, type: 'energy' },
    { icon: '🧬', name: 'Цивилизация', amount: civReward, type: 'civ' },
    { icon: '⚙', name: 'Металлы', amount: metalReward, type: 'metal' },
    { icon: '🛡', name: 'Оборона', amount: 'Ур.3', type: 'defense' },
    { icon: '🌐', name: 'Щит', amount: '8ч', type: 'shield' },
    { icon: '🎫', name: 'Трофей', amount: 'Случайный', type: 'trophy' }
  ];
  
  return rewards[day];
}

function checkDailyRewards() {
  const now = Date.now();
  const last = S.dailyReward.lastClaimed || 0;
  const day = S.dailyReward.day || 0;

  // Если прошло больше 48 часов (пропустил день) — сбрасываем на 1-й день
  if (last > 0 && (now - last) > 48 * 3600 * 1000) {
    S.dailyReward.day = 0;
  }
  
  // Если прошло больше 24 часов с последнего получения — можно забрать
  if (last === 0 || (now - last) >= 24 * 3600 * 1000) {
    setTimeout(() => { openDailyRewards(); }, 1500);
  }
}

function openDailyRewards() {
  const modal = document.getElementById('dailyModal');
  const grid = document.getElementById('dailyGrid');
  if (!modal || !grid) return;

  let html = '';
  const currentDay = S.dailyReward.day || 0;
  const now = Date.now();
  const last = S.dailyReward.lastClaimed || 0;
  const canClaim = (last === 0 || (now - last) >= 24 * 3600 * 1000);

  for (let i = 0; i < 7; i++) {
    const rw = getDailyRewardData(i);
    let stateClass = '';
    
    if (i < currentDay) stateClass = 'claimed';
    else if (i === currentDay && canClaim) stateClass = 'active';

    let rwText = typeof rw.amount === 'number' ? fmt(rw.amount) : rw.amount;
    const dayClass = i === 6 ? 'day-7' : '';

    html += `
      <div class="daily-item ${stateClass} ${dayClass}" ${i === currentDay && canClaim ? 'onclick="claimDailyReward()"' : ''} style="${i === currentDay && canClaim ? 'cursor:pointer;' : ''}">
        <div class="daily-day">День ${i + 1}</div>
        <div class="daily-icon">${rw.icon}</div>
        <div class="daily-reward-text">${rwText} ${rw.name !== 'Оборона' && rw.name !== 'Щит' && rw.name !== 'Трофей' ? rw.name : ''}</div>
      </div>
    `;
  }

  grid.innerHTML = html;
  modal.classList.add('show');
}

function claimDailyReward() {
  const day = S.dailyReward.day || 0;
  if (day >= 7) return;

  const rw = getDailyRewardData(day);

  if (rw.type === 'dust') { S.dust += rw.amount; S.dustTotal += rw.amount; toast('Награда!', '+' + fmt(rw.amount) + ' ✦'); }
  else if (rw.type === 'energy') { S.energy += rw.amount; toast('Награда!', '+' + fmt(rw.amount) + ' ⚡'); }
  else if (rw.type === 'civ') { S.civLevel += rw.amount; toast('Награда!', '+' + fmt(rw.amount) + ' 🧬'); }
  else if (rw.type === 'metal') { S.metalAmount += rw.amount; toast('Награда!', '+' + fmt(rw.amount) + ' ⚙'); }
  else if (rw.type === 'defense') { 
    S.nightDefenseLevel = 3; 
    S.nightDefenseExpiresAt = Date.now() + 24 * 3600 * 1000; 
    toast('Награда!', 'Автооборона Ур.3 на 24ч'); 
  }
  else if (rw.type === 'shield') { 
    S.shieldUntil = Math.max(S.shieldUntil || 0, Date.now() + 8 * 3600 * 1000); 
    toast('Награда!', 'Щит на 8ч'); 
  }
  else if (rw.type === 'trophy') { 
    if (typeof tryRollTrophy === 'function') tryRollTrophy('insane'); 
    toast('Джекпот!', 'Трофейный контракт'); 
  }

  S.dailyReward.lastClaimed = Date.now();
  S.dailyReward.day = day + 1;
  
  if (S.dailyReward.day >= 7) {
    S.dailyReward.day = 0; // Цикл завершен, начинаем заново
  }

  saveGame();
  updateUI();
  
  if (typeof playSFX === 'function') playSFX('ui_purchase');
  
  // Перерисовываем окно
  openDailyRewards();
  
  // Если забрали всё, закрываем через секунду
  setTimeout(() => {
    const modal = document.getElementById('dailyModal');
    if (modal) modal.classList.remove('show');
  }, 1500);
}

// ═══════════════════════════════════════════════════════════════
//  ПЕРВЫЙ ЩИТ
// ═══════════════════════════════════════════════════════════════
function checkFirstNightShield(offlineSec) {
  // Если офлайн > 2 часов и щит еще не выдавался
  if (offlineSec > 2 * 3600 && !S.firstNightShieldUsed) {
    S.firstNightShieldUsed = true;
    S.shieldUntil = Math.max(S.shieldUntil || 0, Date.now() + 8 * 3600 * 1000);
    saveGame();
    
    setTimeout(() => {
      document.getElementById('welcomeShieldModal').classList.add('show');
    }, 2000);
  }
}
function updateEventUI() {
  const banner = document.getElementById('eventBanner');
  if (!banner) return;

  if (!S.activeEvent) {
    banner.style.display = 'none';
    return;
  }

  const evt = EVENT_CFG.types.find(t => t.id === S.activeEvent.id);
  if (!evt) return;

  const leftMs = S.activeEvent.endsAt - Date.now();
  if (leftMs <= 0) { banner.style.display = 'none'; return; }

  const h = Math.floor(leftMs / 3600000);
  const m = Math.floor((leftMs % 3600000) / 60000);
  const s = Math.floor((leftMs % 60000) / 1000);
  const timeStr = h > 0 ? h + 'ч ' + m + 'м' : m + 'м ' + s + 'с';

  banner.style.display = 'block';
  banner.style.borderColor = evt.color;
  document.getElementById('eventIcon').textContent = evt.icon;
  document.getElementById('eventName').textContent = evt.name;
  document.getElementById('eventTimer').textContent = '[' + timeStr + ']';
}
// ═══════════════════════════════════════════════════════════════
//  ЭКСПОРТ
// ═══════════════════════════════════════════════════════════════
window.openDailyRewards = openDailyRewards;
window.claimDailyReward = claimDailyReward;
window.checkDailyRewards = checkDailyRewards;
window.checkFirstNightShield = checkFirstNightShield;
window.fmt = fmt;
window.fmtTime = fmtTime;
window.toast = toast;
window.updateUI = updateUI;
window.updateQuestPanel = updateQuestPanel;
window.updateSystemSwitcher = updateSystemSwitcher;
window.initUI = initUI;
window.openStorageModal = openStorageModal;
window.pourStorage = pourStorage;
window.buyStorageWithStars = buyStorageWithStars;
window.triggerSupernovaFlash = triggerSupernovaFlash;
window.openNightMode = openNightMode;
window.saveNightConfig = saveNightConfig;
window.cancelNightConfig = cancelNightConfig;
window.applyNightPreset = applyNightPreset;
window.toggleNightDefense = toggleNightDefense;
window.setNightComet = setNightComet;
window.setNightExpedition = setNightExpedition;
window.activateNightDefense = activateNightDefense;