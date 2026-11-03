// ═══════════════════════════════════════════════════════════════
//  UI.JS — HUD, квесты, тосты, переключатель систем, активная оборона
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
// Плашка игрока вверху: ник, под ним текущая система
function updateNameplate() {
  const nickEl = document.getElementById('hudNick');
  const sysEl = document.getElementById('hudSystem');
  if (nickEl) nickEl.textContent = S.playerName || 'Пилот';
  if (sysEl) sysEl.textContent = (S.stage === 'galaxy') ? 'Галактика' : (S.systemName || 'Родная');
}

// ═══════════════════════════════════════════════════════════════
//  ОБУЧАЛКА ДЛЯ НОВИЧКОВ
// ═══════════════════════════════════════════════════════════════
// Пошаговые подсказки на первых фазах. Шаги переключаются сами,
// когда игрок выполняет нужное действие, поэтому оверлей не мешает игре.
function renderTutorial() {
  const el = document.getElementById('tutorialOverlay');
  let hintText = '';
  let hintSub = '';
  const planets = Array.isArray(S.planets) ? S.planets : [];

  // ─── Шаг 1: молекулярное облако ───
  if (S.tutorialStep === 1) {
    if (S.stage === 'cloud') {
      if (S.dust >= 2000) {
        S.tutorialStep = 2;
        hintText = '✨ Жми кнопку «Эволюция»';
        hintSub = 'Пора переходить на новый этап';
      } else {
        hintText = '☝️ Зажми палец на экране';
        hintSub = 'Гравитация стянет пыль к центру';
      }
    } else {
      // Игрок уже эволюционировал — переходим к следующему шагу
      S.tutorialStep = 2;
    }

  // ─── Шаг 2: протопланетный диск ───
  } else if (S.tutorialStep === 2) {
    if (S.stage === 'condense') {
      if (S.dust >= 25000) {
        S.tutorialStep = 3;
        hintText = '⭐ Жми «Эволюция» снова';
        hintSub = 'Облако готово сжаться в звезду';
      } else {
        hintText = '🌀 Крути пальцем по экрану';
        hintSub = 'Раскрути протопланетный диск';
      }
    } else if (S.stage === 'protostar' || S.stage === 'firstPlanet' || S.stage === 'system') {
      S.tutorialStep = 3;
    }

  // ─── Шаг 3: протозвезда ───
  } else if (S.tutorialStep === 3) {
    if (S.stage === 'protostar') {
      hintText = '🔥 Быстро тапай по экрану!';
      hintSub = 'Разогрей ядро до максимума';
    } else if (S.stage === 'firstPlanet' || S.stage === 'system') {
      S.tutorialStep = 4;
    }

  // ─── Шаг 4: первая планета ───
  } else if (S.tutorialStep === 4) {
    if (planets.length > 0 || S.stage === 'system') {
      S.tutorialStep = 5;
    } else if (S.stage === 'firstPlanet') {
      hintText = '🪐 Собери первую планету';
      hintSub = 'Тяни шары, чтобы они сливались';
    }

  // ─── Шаг 5: система — финальная подсказка ───
  } else if (S.tutorialStep === 5) {
    if (S.stage === 'system') {
      hintText = '🌌 Добро пожаловать в систему!';
      hintSub = 'Строй планеты, развивай доход';
      // Через 5 секунд выключаем туториал
      if (!window._tutorialEndTimer) {
        window._tutorialEndTimer = setTimeout(function() {
          window._tutorialEndTimer = null;
          S.tutorialStep = 0;
          S.tutorialDone = true;
          if (typeof saveGame === 'function') saveGame();
          updateTutorialUI(); // обновить, чтобы скрыть оверлей
        }, 5000);
      }
    } else if (S.stage === 'cloud' || S.stage === 'condense' || S.stage === 'protostar') {
      // Игру перезапустили — начинаем обучение заново
      S.tutorialStep = 1;
    }
  }

  if (!el) return;

  if (hintText) {
    el.style.display = 'flex';
    el.innerHTML =
      '<div class="tutorial-bubble">' +
        '<div class="tutorial-title">' + hintText + '</div>' +
        '<div class="tutorial-sub">' + hintSub + '</div>' +
      '</div>';
  } else {
    el.style.display = 'none';
  }
}

// Обновить подсказку вручную (вызывается из таймера/кода)
function updateTutorialUI() {
  renderTutorial();
}

// ═══════════════════════════════════════════════════════════════
//  ОБНОВЛЕНИЕ HUD
// ═══════════════════════════════════════════════════════════════
// ─── Живые таймеры активных миссий ──────────────────────────────
function _fmtMissionTimer(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) return h + ':' + mm + ':' + ss;
  return mm + ':' + ss;
}

function updateActiveMissionsUI() {
  const panel = document.getElementById('activeMissionsPanel');
  if (!panel) return;

  const missions = (typeof getActiveMissions === 'function') ? getActiveMissions() : [];
  if (!Array.isArray(missions) || missions.length === 0) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }

  let html = '';
  for (let i = 0; i < missions.length; i++) {
    const m = missions[i];
    if (!m) continue;
    const icon = m.icon || (m.type === 'comet' ? '☄️' : '🚀');
    const label = m.type === 'comet' ? 'Комета' : 'Экспедиция';
    html += '<div class="mission-timer-row"><span>' + icon + ' ' + label + '</span><span>' +
      _fmtMissionTimer(m.timeLeft) + '</span></div>';
  }

  panel.style.display = 'block';
  panel.innerHTML = html;
}

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
      rateEl.textContent = '+' + r.toFixed(1) + ' / с';
    } else {
      rateEl.textContent = '+' + fmt(dustPerSec() * 3600) + ' / ч';
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

  // Стадия фазы в левом нижнем углу
  const phaseTagEl = document.getElementById('phaseTag');
  const phaseNameEl = document.getElementById('phaseName');
  const stageInfo = (typeof STAGES !== 'undefined' && STAGES[S.stage])
    ? STAGES[S.stage]
    : { tag: 'ФАЗА VI', name: 'Галактика' };
  if (phaseTagEl) phaseTagEl.textContent = stageInfo.tag;
  if (phaseNameEl) phaseNameEl.textContent = stageInfo.name;

  updateNameplate();

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
  // Активные миссии: живые таймеры
  updateActiveMissionsUI();
  // Обучалка (подсказки для новичков)
  renderTutorial();
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
          rateEl.textContent = '+' + r.toFixed(1) + ' / с';
        } else {
          rateEl.textContent = '+' + fmt(dustPerSec() * 3600) + ' / ч';
        }
      } else if (res === 'energy') {
        rateEl.textContent = '+' + fmt(energyPerSec() * 3600) + ' / ч';
      } else if (res === 'civ') {
        rateEl.textContent = '+' + fmt(civPerSec() * 3600) + ' / ч';
      } else if (res === 'metals') {
        const mRate = metalsPerSec();
        rateEl.textContent = '+' + (mRate < 10 ? mRate.toFixed(1) : fmt(mRate)) + ' / с';
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

  // Плашка всегда показывает ник и систему; меню доступно в любой фазе
  updateNameplate();
  btn.style.display = 'flex';

  const list = [];
  // ★ Прайм определяется и по isPrime, и по primeData (старые сейвы)
  const _primeOf = (sys) => (typeof primeDataOfSystem === 'function' ? primeDataOfSystem(sys) : (sys && sys.primeData) || null);
  if (S.activeSystemIdx === 0) {
    const pd = S.primeSystem || _primeOf(S.otherSystems[0]);
    list.push({ idx: 0, name: S.systemName, isPrime: !!pd, primeData: pd });
  } else if (S.otherSystems[0]) {
    const pd = _primeOf(S.otherSystems[0]);
    list.push({ idx: 0, name: S.otherSystems[0].name, isPrime: !!(pd || S.otherSystems[0].isPrime), primeData: pd });
  } else list.push({ idx: 0, name: 'Родная', isPrime: false });

  for (let i = 1; i < S.otherSystems.length; i++) {
    if (S.otherSystems[i]) {
      const pd = _primeOf(S.otherSystems[i]);
      list.push({ idx: i, name: S.otherSystems[i].name, isPrime: !!(pd || S.otherSystems[i].isPrime), primeData: pd });
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

  html += `<button class="sys-dropdown-item" style="color:#b9a8ff;border-top:1px solid rgba(139,127,212,0.2);margin-top:4px;"
    onclick="document.getElementById('nicknameInput').value = S.playerName || ''; document.getElementById('nicknameModal').classList.add('show'); document.getElementById('systemDropdown').style.display='none';">
    <div class="dd-icon-wrap" style="font-size:14px;">👤</div><span style="flex:1; text-align:left;">Сменить ник</span>
  </button>`;

  html += `<button class="sys-dropdown-item" style="color:#8b7fd4;"
    onclick="renameCurrentSystem(); document.getElementById('systemDropdown').style.display='none';">
    <div class="dd-icon-wrap"></div><span style="flex:1; text-align:left;">✎ Переименовать систему</span>
  </button>`;

  // Перерисовываем только при изменении содержимого, чтобы не сбрасывать нажатия каждые 2 сек
  if (dropdown.dataset.html !== html) {
    dropdown.innerHTML = html;
    dropdown.dataset.html = html;
  }

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
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      if (typeof playSFX === 'function') playSFX('ui_click');
      if (typeof showGameGuide === 'function') showGameGuide();
    });
  }

  // Полный экран: заметная кнопка в верхнем HUD.
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const updateFullscreenButton = () => {
    if (!fullscreenBtn) return;
    const tg = window.Telegram && window.Telegram.WebApp;
    const active = !!(document.fullscreenElement || document.webkitFullscreenElement ||
      (tg && tg.isFullscreen === true));
    fullscreenBtn.textContent = active ? '⤡' : '⛶';
    fullscreenBtn.title = active ? 'Выйти из полного экрана' : 'Полный экран';
    fullscreenBtn.setAttribute('aria-label', fullscreenBtn.title);
    fullscreenBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    fullscreenBtn.classList.toggle('fs-on', active);
  };
  window.updateFullscreenButton = updateFullscreenButton;
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
      if (typeof playSFX === 'function') playSFX('ui_click');
      if (typeof toggleFullscreen === 'function') toggleFullscreen();
      setTimeout(updateFullscreenButton, 400);
      setTimeout(updateFullscreenButton, 1200);
    });
  }
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
  updateFullscreenButton();

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
  // ★ Скрытая отладка: 5 кликов по кнопке «🐞 Логи» в настройках
  const debugBtn = document.getElementById('debugLogBtn');
  if (debugBtn) {
    let debugClicks = 0;
    let debugTimer = null;

    debugBtn.addEventListener('click', function() {
      debugClicks++;

      // Сбрасываем счётчик, если прошло 2 секунды
      clearTimeout(debugTimer);
      debugTimer = setTimeout(() => { debugClicks = 0; }, 2000);

      if (debugClicks >= 5) {
        debugClicks = 0;
        clearTimeout(debugTimer);
        if (window.eruda) {
          eruda.init(); // повторный вызов безопасен: внутри есть guard
          eruda.show();
          document.getElementById('settingsModal').classList.remove('show');
          if (typeof toast === 'function') toast('🐞 Дебаг', 'Консоль открыта');
        } else {
          if (typeof toast === 'function') toast('⚠️ Ошибка', 'Eruda не загружена');
        }
      }
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
    html += '<div class="quests-actions">' +
      '<button class="quests-help-btn" type="button" onclick="openGameGuide && openGameGuide()">📖 Гид по игре</button>' +
      '<button class="quests-help-btn" type="button" onclick="openCurrentPhaseHelp && openCurrentPhaseHelp()">💡 Подсказка фазы</button>' +
    '</div>';
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
//  АКТИВНАЯ ОБОРОНА (бывш. ночной режим)
// ═══════════════════════════════════════════════════════════════
let _tempNightConfig = null;

function openNightMode() {
  const card = document.getElementById('modalCard');
  if (!card) return;
  
  if (!_tempNightConfig) {
    const nowMs = Date.now();
    _tempNightConfig = JSON.parse(JSON.stringify(S.nightConfig || { mode: 'balanced', defenseEnabled: true, cometHours: 0, expeditionPercent: 0 }));
    let defNow = 0;
    if (typeof activeDefenseLevel === 'function') defNow = activeDefenseLevel(nowMs);
    else if ((S.nightDefenseExpiresAt || 0) > nowMs) defNow = S.nightDefenseLevel || 0;
    _tempNightConfig.defenseLevel = defNow;
    _tempNightConfig.defenseDirty = false;
  }
  const nc = _tempNightConfig;
  const presets = NIGHT_CFG.presets;
  const curMode = nc.mode || 'balanced';

  // Кнопки пресетов
  const presetsHTML = Object.keys(presets).map(function(mode) {
    const labels = { cautious: '🛡️ Осторожный', balanced: '⚖️ Сбалансированный', aggressive: '🚀 Агрессивный', insane: '☠️ Безумный' };
    const trophyChance = Math.round((TROPHY_CFG.dropChanceByMode[mode] || TROPHY_CFG.dropChanceByMode.default || 0.15) * 100);
    const active = curMode === mode ? 'active' : '';
    return `<button class="pour-btn ${active}" onclick="applyNightPreset('${mode}')" style="flex-direction:column;padding:8px 4px;font-size:10px; ${active ? 'background:rgba(139,127,212,0.5);border-color:#b9a8ff;' : ''}">
      ${labels[mode]}<br><span style="font-size:9px;opacity:0.7;">трофей ${trophyChance}%</span>
    </button>`;
  }).join('');

  // Предпросмотр защиты: шанс отбития = уровни (до 50%) + флот (до 30%), общий кап 80%.
  const isDefActive = S.nightDefenseExpiresAt && S.nightDefenseExpiresAt > Date.now();
  const activeLvl = isDefActive ? (S.nightDefenseLevel || 0) : 0;
  const activeDefLvl = (typeof activeDefenseLevel === 'function')
    ? activeDefenseLevel()
    : (isDefActive ? activeLvl : 0);
  const selDefLvl = Math.max(0, Math.min(5, Number(nc.defenseLevel) || 0));
  const defChancePct = selDefLvl * (Number(INVASION_CFG.repelDefensePerLevel) || 0.10) * 100;
  const fleetChancePct = (typeof fleetRepelChance === 'function') ? fleetRepelChance() * 100 : 0;
  const expPenalty = (nc.expeditionPercent / 100) * (NIGHT_CFG.expeditionDefensePenaltyMax || 0.30) * 100;
  const shieldActive = !!(S.shieldUntil && S.shieldUntil > Date.now());
  const fleetReqPreview = Number(FLEET_CFG.activationDefenseLevel) || 5;
  const previewFleetPct = selDefLvl >= fleetReqPreview ? fleetChancePct : 0;
  const totalChancePct = shieldActive
    ? 100
    : Math.max(0, Math.min(80, defChancePct + previewFleetPct) - expPenalty);
  const chanceColor = totalChancePct > 60 ? '#7ee0a8' : totalChancePct > 30 ? '#ffb347' : '#ff5e5e';

  // Точные цифры для «Прогноза»:
  let maxTheftMin = 0, maxDisablePlanets = 0, maxDisableHours = 0;
  for (const tk in INVASION_CFG.tiers) {
    const tr = INVASION_CFG.tiers[tk];
    maxTheftMin = Math.max(maxTheftMin, Number(tr.theftMin) || 0);
    maxDisablePlanets = Math.max(maxDisablePlanets, Number(tr.disablePlanets) || 0);
    maxDisableHours = Math.max(maxDisableHours, Number(tr.disableHours) || 0);
  }
  const offlineIntervalH = (Number(INVASION_CFG.offlineAttackInterval) || 3 * 3600 * 1000) / 3600000;
  const offlineMax = Number(INVASION_CFG.offlineAttackMax) || 5;
  const debuffCapPct = Math.round((Number(INVASION_CFG.debuffStackCap) || 0.8) * 100);
  const offlineCapPct = Math.round((Number(INVASION_CFG.nightLossCapShare) || 0.4) * 100);
  const defenseHours = Number(INVASION_CFG.defenseHours) || 10;
  // Кнопки уровней обороны
  const defenseButtons = [1, 2, 3, 4, 5].map(lvl => {
    const systemsExtra = Math.max(0, (S.systems || 1) - 1);
    const cost = (typeof defenseActivationCost === 'function')
      ? defenseActivationCost(lvl)
      : Math.floor(INVASION_CFG.defenseCost[lvl] * (1 + systemsExtra * INVASION_CFG.defenseCostMultiplierPerSystem));
    const bonus = Math.round(lvl * (INVASION_CFG.repelDefensePerLevel || 0.10) * 100);
    const isCurrent = selDefLvl === lvl;
    return `<button class="pour-btn" style="flex-direction:column;padding:6px 2px;font-size:9px; line-height:1.2; ${isCurrent ? 'background:rgba(46,170,119,0.4);border-color:#2eaa77;' : ''}"
      onclick="selectDefenseLevel(${lvl})" ${ (S.metalAmount || 0) >= cost ? '' : 'disabled' }>
      Ур.${lvl}<br><span style="font-size:8px;">${cost}⚙</span><br>+${bonus}%
    </button>`;
  }).join('');

  let defenseLabel = 'Выключена';
  if (selDefLvl > 0) {
    const selPct = Math.round(selDefLvl * (Number(INVASION_CFG.repelDefensePerLevel) || 0.10) * 100);
    let tag = 'к активации';
    if (!nc.defenseDirty) {
      if (isDefActive && selDefLvl <= activeLvl) {
        tag = `до ${new Date(S.nightDefenseExpiresAt).getHours()}:00`;
      } else if (activeDefLvl > 0) {
        tag = 'трофей';
      }
    }
    defenseLabel = `Ур.${selDefLvl} · +${selPct}% (${tag})`;
  }

  // ★ Флот: активация возможна только при активной Автобороне ур.5.
  const fleetActiveNow = (typeof isFleetActive === 'function') ? isFleetActive() : false;
  const fleetReqLvl = (typeof fleetDefenseLevelReq === 'function') ? fleetDefenseLevelReq() : 5;
  const fleetShips = (typeof fleetShipTotal === 'function') ? fleetShipTotal() : 0;
  const fleetCanActivate = activeDefLvl >= fleetReqLvl;
  let fleetLabel = 'заблокирован';
  if (fleetActiveNow) fleetLabel = 'в бою';
  else if (fleetShips <= 0) fleetLabel = 'нет кораблей';
  else if (fleetCanActivate) fleetLabel = 'в резерве';
  const fleetColor = fleetActiveNow ? '#7ee0a8' : (fleetCanActivate && fleetShips > 0 ? '#b9a8ff' : '#ffb347');

  card.innerHTML = `
    <div class="modal-title">🛡 Активная оборона</div>
    <div class="modal-sub">Защита, флот и ночные миссии на время отсутствия</div>

    <div class="info-box">
      <div class="ach-sec-title">Пресеты</div>
      <div class="pour-btn-group">${presetsHTML}</div>
    </div>

    <div class="info-box">
      <div class="row-stat">
        <span>🛡 Автооборона (на ${Number(INVASION_CFG.defenseHours) || 10}ч)</span>
        <span style="color:${selDefLvl > 0 ? '#7ee0a8' : '#ff8a8a'}">${defenseLabel}</span>
      </div>
      <div class="pour-btn-group" style="flex-wrap:wrap;gap:4px;margin-top:8px;">
        ${defenseButtons}
      </div>
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;margin-top:4px;">
        <span>🚀 Флот: <span style="color:${fleetColor}">${fleetLabel}</span></span>
        <span>${fleetChancePct > 0 ? '+' + Math.round(fleetChancePct) + '% к отбитию' : 'активация с ур.' + fleetReqLvl}</span>
      </div>
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;margin-top:4px;">
        <span>Металлы: ${fmt(S.metalAmount || 0)} / ${fmt(typeof metalsCap === 'function' ? metalsCap() : 0)} ⚙</span>
        <span>Списывается при «Готово»</span>
      </div>
      <div class="pour-btn-group" style="margin-top:4px;">
        <button class="pour-btn" onclick="toggleFleet('night')"
          style="background:${fleetActiveNow ? 'rgba(46,170,119,0.4)' : 'rgba(139,127,212,0.25)'};border-color:${fleetActiveNow ? '#2eaa77' : 'rgba(139,127,212,0.6)'};"
          ${(fleetActiveNow || (fleetCanActivate && fleetShips > 0)) ? '' : 'disabled'}>
          ${fleetActiveNow ? '✓ Флот в системе' : '✕ Флот скрыт'}
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
      <div class="row-stat"><span>Шанс отбития:</span><span style="color:${chanceColor}">${Math.round(totalChancePct)}%</span></div>
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;"><span>Оборона +${Math.round(defChancePct)}% · Флот +${Math.round(previewFleetPct)}%${expPenalty > 0 ? ' · Экспедиция −' + expPenalty.toFixed(1) + '%' : ''}</span></div>
      ${shieldActive ? `<div class="row-stat"><span>⭐ Премиум-щит:</span><span style="color:#7ee0a8">100%</span></div>` : ''}
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;"><span>Офлайн-атаки:</span><span>раз в ${offlineIntervalH} ч, до ${offlineMax} за сессию</span></div>
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;"><span>Кража за атаку:</span><span>до ${maxTheftMin} мин каждого ресурса</span></div>
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;"><span>Штраф к доходу:</span><span>до −${debuffCapPct}%</span></div>
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;"><span>Кап потерь за офлайн:</span><span>${offlineCapPct}% каждого ресурса</span></div>
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;"><span>Планеты:</span><span>до ${maxDisablePlanets} в простой на ${maxDisableHours} ч</span></div>
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;"><span>Длительность обороны:</span><span>${defenseHours} ч (щит 24 ч)</span></div>
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
  if (!_tempNightConfig) return;

  // ★ Оборона: металл списывается ТОЛЬКО здесь, по кнопке «Готово».
  const systemsExtra = Math.max(0, (S.systems || 1) - 1);
  const selDefLvl = Math.max(0, Math.min(5, Number(_tempNightConfig.defenseLevel) || 0));
  let mCostDefense = 0;
  if (selDefLvl > 0 && _tempNightConfig.defenseDirty) {
    mCostDefense = (typeof defenseActivationCost === 'function')
      ? defenseActivationCost(selDefLvl)
      : Math.floor(INVASION_CFG.defenseCost[selDefLvl] * (1 + systemsExtra * INVASION_CFG.defenseCostMultiplierPerSystem));
    if ((S.metalAmount || 0) < mCostDefense) {
      toast('Не хватает металла', 'Нужно ' + mCostDefense + ' ⚙');
      return;
    }
  }

  // Проверка и списание ресурсов миссий
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

  // Сначала проверяем, что хватает металла на всё сразу
  const totalMetalCost = mCostDefense + mCostComet + mCostExp;
  if ((S.metalAmount || 0) < totalMetalCost) {
    toast('Не хватает металла', 'Нужно ' + totalMetalCost + ' ⚙');
    return;
  }

  // Списываем ресурсы
  if (mCostComet > 0) { S.metalAmount -= mCostComet; S.dust -= dCostComet; }
  if (eCostExp > 0) { S.energy -= eCostExp; S.metalAmount -= mCostExp; S.civLevel -= cCostExp; }
  if (mCostDefense > 0) {
    S.metalAmount -= mCostDefense;
    S.nightDefenseLevel = selDefLvl;
    const hours = Number(INVASION_CFG.defenseHours) || 10;
    S.nightDefenseExpiresAt = Date.now() + hours * 3600 * 1000;
  }

  S.nightConfig = {
    mode: _tempNightConfig.mode || 'balanced',
    defenseEnabled: true,
    cometHours: _tempNightConfig.cometHours || 0,
    expeditionPercent: _tempNightConfig.expeditionPercent || 0,
  };
  _tempNightConfig = null;

  saveGame();
  document.getElementById('modal').classList.remove('show');

  let totalCostText = '';
  if (mCostDefense > 0) totalCostText += `Оборона ур.${selDefLvl}: ${mCostDefense}⚙. `;
  if (mCostComet > 0) totalCostText += `Комета: ${mCostComet}⚙ ${fmt(dCostComet)}✦. `;
  if (eCostExp > 0) totalCostText += `Экспедиция: ${eCostExp}⚡ ${mCostExp}⚙ ${cCostExp}🧬. `;

  if (totalCostText) {
    toast('🛡 Активная оборона', 'Списано: ' + totalCostText);
  } else {
    toast('🛡 Настройки обороны сохранены', 'Ресурсы не списаны');
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
  _tempNightConfig.cometHours = p.cometHours;
  _tempNightConfig.expeditionPercent = p.expPercent;
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

// Выбор уровня обороны в окне — без списания. Металл спишется по «Готово».
function selectDefenseLevel(lvl) {
  if (!_tempNightConfig) return;
  lvl = Math.max(1, Math.min(5, Number(lvl) || 1));
  const systemsExtra = Math.max(0, (S.systems || 1) - 1);
  const cost = (typeof defenseActivationCost === 'function')
    ? defenseActivationCost(lvl)
    : Math.floor(INVASION_CFG.defenseCost[lvl] * (1 + systemsExtra * INVASION_CFG.defenseCostMultiplierPerSystem));
  if ((S.metalAmount || 0) < cost) {
    toast('Не хватает металла', 'Нужно ' + cost + ' ⚙');
    return;
  }
  _tempNightConfig.defenseLevel = lvl;
  _tempNightConfig.defenseDirty = true;
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
    return true;
  }
  return false;
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
  // ★ Пока ежедневка открыта, не даем выскочить сборке планеты
  if (S.stage === 'firstPlanet' && typeof window.suppressEvolutionFor === 'function') {
    window.suppressEvolutionFor(Infinity);
  }

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
    const rewardDefenseHours = Number(INVASION_CFG.defenseHours) || 10;
    S.nightDefenseExpiresAt = Date.now() + rewardDefenseHours * 3600 * 1000;
    toast('Награда!', 'Автооборона Ур.3 на ' + rewardDefenseHours + 'ч');
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
  setTimeout(() => { closeDailyAndWait(); }, 1500);
}

// ★ Закрытие ежедневной награды с паузой перед сборкой планеты
function closeDailyAndWait() {
  const modal = document.getElementById('dailyModal');
  if (modal) modal.classList.remove('show');

  // Если мы только что сформировали звезду, даем 5 секунд перед сборкой планеты
  if (S.stage === 'firstPlanet') {
    const delayMs = 5000;
    if (typeof window.suppressEvolutionFor === 'function') {
      window.suppressEvolutionFor(delayMs);
    } else {
      S.assemblyCooldownUntil = Date.now() + delayMs;
    }
    toast('⏳ Диск остывает', 'Сборка планеты начнется через 5 секунд...');
  }
}
window.closeDailyAndWait = closeDailyAndWait;

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
function saveNickname() {
  const el = document.getElementById('nicknameInput');
  const name = el.value.trim();
  if (name.length < 2) {
    toast('Ошибка', 'Ник должен быть не короче 2 символов');
    return;
  }
  S.playerName = name;
  updateNameplate();
  document.getElementById('nicknameModal').classList.remove('show');
  if (typeof saveGame === 'function') saveGame();
  if (typeof autoSaveToCloud === 'function') autoSaveToCloud();
  toast('Ник сохранён', 'Играем как: ' + name);
  if (typeof maybeShowGameGuide === 'function') setTimeout(maybeShowGameGuide, 500);
}
// ═══════════════════════════════════════════════════════════════
//  СЛУЧАЙНЫЕ СОБЫТИЯ
// ═══════════════════════════════════════════════════════════════
function triggerRandomEvent(evt) {
  if (!evt) return;

  if (evt.type === 'good') {
    if (evt.rewardMetals) S.metalAmount = (S.metalAmount || 0) + evt.rewardMetals;
    if (evt.buff) S.activeEvent = { id: evt.buff, endsAt: Date.now() + (evt.duration || 0) };
    toast('🎲 Событие: ' + evt.title, evt.desc);
    if (typeof playSFX === 'function') playSFX('ui_levelup');
    if (typeof saveGame === 'function') saveGame();
    return;
  }

  // Не перебиваем уже активное событие
  if (window.activeRandomEvent) return;

  window.activeRandomEvent = { ...evt, timeLeft: evt.timeLimit || 60, taps: 0, maxHp: evt.hp };

  const card = document.getElementById('modalCard');
  if (!card) return;
  let html = `
    <div class="modal-title" style="color:#ff5e5e;">⚠️ ${evt.title}</div>
    <div class="modal-sub">${evt.desc}</div>
    <div style="font-size:12px; text-align:center; color:#ffb347; margin-bottom:10px;" id="evtTimer">Осталось: ${Math.ceil(window.activeRandomEvent.timeLeft)}с</div>
  `;

  if (evt.type === 'boss') {
    html += `
      <div style="font-size:40px; text-align:center; margin:10px 0;" id="evtTarget">👾</div>
      <div style="background:#333; height:10px; border-radius:5px; overflow:hidden; margin-bottom:5px;">
         <div id="evtHpBar" style="background:#ff4a4a; height:100%; width:100%; transition:width 0.2s;"></div>
      </div>
      <div style="text-align:center; font-size:12px; color:#aaa;" id="evtHpText">HP: ${evt.hp} / ${evt.hp}</div>
      <button class="stars-btn" style="margin-top:15px;" id="evtTapBtn">ТАПАТЬ (Урон: ${evt.tapDamage})</button>
    `;
  } else if (evt.type === 'tap') {
    html += `
      <div style="font-size:40px; text-align:center; margin:10px 0;" id="evtTarget">☄️</div>
      <div style="text-align:center; font-size:18px; font-weight:bold;" id="evtTapText">0 / ${evt.tapsRequired}</div>
      <button class="stars-btn" style="margin-top:15px;" id="evtTapBtn">ТАПАТЬ!</button>
    `;
  }

  card.innerHTML = html;
  const modalEl = document.getElementById('modal');
  if (modalEl) modalEl.classList.add('show');

  const tapBtn = document.getElementById('evtTapBtn');
  if (tapBtn) tapBtn.onclick = () => {
    if (!window.activeRandomEvent) return;
    const e = window.activeRandomEvent;
    e.taps++;
    if (e.type === 'boss') e.hp = Math.max(0, e.hp - e.tapDamage);
    const target = document.getElementById('evtTarget');
    if (target) target.style.transform = 'scale(' + (1 + (e.taps % 2 === 0 ? 0.1 : -0.1)) + ')';
    if (typeof updateRandomEventUI === 'function') updateRandomEventUI();
  };
}

function updateRandomEventUI() {
  const e = window.activeRandomEvent;
  if (!e) return;
  const timerEl = document.getElementById('evtTimer');
  if (timerEl) timerEl.textContent = 'Осталось: ' + Math.ceil(Math.max(0, e.timeLeft)) + 'с';

  if (e.type === 'boss') {
    const bar = document.getElementById('evtHpBar');
    const text = document.getElementById('evtHpText');
    if (bar && text) {
      bar.style.width = Math.max(0, (e.hp / e.maxHp) * 100) + '%';
      text.textContent = 'HP: ' + Math.max(0, Math.floor(e.hp)) + ' / ' + e.maxHp;
    }
  } else if (e.type === 'tap') {
    const text = document.getElementById('evtTapText');
    if (text) text.textContent = e.taps + ' / ' + e.tapsRequired;
  }
}

function _randomEventPickPlanet() {
  const list = Array.isArray(S.planets) ? S.planets : [];
  if (!list.length) return null;
  // По возможности не трогаем Прайм-систему (её защищает проект).
  const pool = S.primeSystem ? list : list.filter(function(p) { return p && !p.isPrime; });
  const src = pool.length ? pool : list;
  return src[Math.floor(Math.random() * src.length)] || null;
}

function _applyRandomEventPenalty(e) {
  const planets = Array.isArray(S.planets) ? S.planets : [];
  const canDestroy = e.penalty === 'destroy_planet' && planets.length > 1 && !S.primeSystem;
  if (canDestroy) {
    const lost = planets.pop();
    const lostName = (typeof PLANET_TYPES !== 'undefined' && PLANET_TYPES[lost.type]) ? PLANET_TYPES[lost.type].name : 'неизвестная';
    if (typeof addEvent === 'function') addEvent('invasion_destroy', 'Событие "' + e.title + '" уничтожило планету ' + lostName);
    toast('💀 Планета потеряна', 'Событие "' + e.title + '" уничтожило планету');
  } else if (e.penalty === 'drain_energy' || e.penalty === 'destroy_planet') {
    // Прайм-систему и последнюю планету не уничтожаем — штрафуем энергией
    S.energy = Math.floor((S.energy || 0) * 0.5);
  } else if (e.penalty === 'damage_planet') {
    const pl = _randomEventPickPlanet();
    if (pl) {
      pl.disabledUntil = Date.now() + 3600 * 1000; // Отключаем на час
      const plName = (typeof PLANET_TYPES !== 'undefined' && PLANET_TYPES[pl.type]) ? PLANET_TYPES[pl.type].name : 'неизвестная';
      if (typeof addEvent === 'function') addEvent('invasion_destroy', 'Событие повредило планету ' + plName);
    }
  }
}

function resolveRandomEvent(success) {
  const e = window.activeRandomEvent;
  if (!e) return;

  const modalEl = document.getElementById('modal');
  if (modalEl) modalEl.classList.remove('show');
  window.activeRandomEvent = null;

  if (success) {
    if (e.rewardDust) {
      S.dust = (S.dust || 0) + e.rewardDust;
      S.dustTotal = (S.dustTotal || 0) + e.rewardDust;
      toast('🏆 Победа!', '+' + fmt(e.rewardDust) + ' ✦');
    }
    if (e.rewardEnergy) {
      S.energy = (S.energy || 0) + e.rewardEnergy;
      toast('🏆 Победа!', '+' + fmt(e.rewardEnergy) + ' ⚡');
    }
    if (e.rewardMetals) {
      S.metalAmount = (S.metalAmount || 0) + e.rewardMetals;
      toast('🏆 Победа!', '+' + fmt(e.rewardMetals) + ' ⚙');
    }
    if (typeof playSFX === 'function') playSFX('ui_levelup');
  } else {
    // ПРОВАЛ (штраф)
    toast('💀 Событие пропущено', 'Вы понесли потери!');
    _applyRandomEventPenalty(e);
    if (typeof playSFX === 'function') playSFX('explosion');
  }
  if (typeof saveGame === 'function') saveGame();
}

// ═══════════════════════════════════════════════════════════════
//  ТОП ИГРОКОВ
// ═══════════════════════════════════════════════════════════════
async function openLeaderboard() {
  const card = document.getElementById('modalCard');
  if (!card) return;
  const achModal = document.getElementById('achModal');
  if (achModal) achModal.classList.remove('show');
  const modal = document.getElementById('modal');
  if (modal) modal.classList.add('show');

  card.innerHTML = '<div class="modal-title">🏆 Топ игроков</div><div class="modal-sub">Загрузка рейтинга…</div>';

  try {
    if (typeof CLOUD_API === 'undefined') throw new Error('Нет адреса сервера');
    const res = await fetch(CLOUD_API + '/api/leaderboard', { method: 'GET' });
    let json = null;
    try { json = await res.json(); } catch (err) { json = null; }
    if (!res.ok || !json) throw new Error((json && json.error) || ('HTTP ' + res.status));

    const top = Array.isArray(json.top) ? json.top : [];
    let html = '<div class="modal-title">🏆 Топ игроков</div>' +
      '<div class="modal-sub">Престиж · системы · пыль</div>';

    if (!top.length) {
      html += '<div class="info-box" style="text-align:center;font-size:12px;color:#8b7fd4;">Пока нет сохранённых игроков</div>';
    } else {
      top.forEach((p, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
        html += `<div class="row-stat" style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
          <span>${medal} ${p.name}</span>
          <span style="text-align:right; font-size:10px; color:#b9a8ff;">
            👑 ${p.prestigeLevel} | 🌌 ${p.systems} сист.<br>
            <span style="color:#fff; font-size:12px;">${fmt(p.dustTotal)} ✦</span>
          </span>
        </div>`;
      });
    }

    html += `<div class="pour-btn-group" style="margin-top:12px; display:flex; gap:8px;">
      <button class="pour-btn" style="flex:1;" onclick="openLeaderboard()">🔄 Обновить</button>
      <button class="pour-btn" style="flex:1;" onclick="document.getElementById('modal').classList.remove('show');">Закрыть</button>
    </div>`;
    card.innerHTML = html;
  } catch (err) {
    card.innerHTML = '<div class="modal-title">🏆 Топ игроков</div>' +
      '<div class="info-box" style="text-align:center;font-size:12px;color:#ff8a8a;">Не удалось загрузить рейтинг<br>' + (err && err.message ? err.message : 'ошибка сети') + '</div>' +
      '<div class="pour-btn-group" style="margin-top:12px; display:flex; gap:8px;">' +
        '<button class="pour-btn" style="flex:1;" onclick="openLeaderboard()">🔄 Повторить</button>' +
        '<button class="pour-btn" style="flex:1;" onclick="document.getElementById(\'modal\').classList.remove(\'show\');">Закрыть</button>' +
      '</div>';
  }
}

window.triggerRandomEvent = triggerRandomEvent;
window.updateRandomEventUI = updateRandomEventUI;
window.resolveRandomEvent = resolveRandomEvent;
window.openLeaderboard = openLeaderboard;

// ═══════════════════════════════════════════════════════════════
//  ЭКСПОРТ
// ═══════════════════════════════════════════════════════════════
window.saveNickname = saveNickname;
window.openDailyRewards = openDailyRewards;
window.claimDailyReward = claimDailyReward;
window.checkDailyRewards = checkDailyRewards;
window.checkFirstNightShield = checkFirstNightShield;
window.fmt = fmt;
window.fmtTime = fmtTime;
window.toast = toast;
window.updateUI = updateUI;
window.updateActiveMissionsUI = updateActiveMissionsUI;
window.renderTutorial = renderTutorial;
window.updateTutorialUI = updateTutorialUI;
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
window.selectDefenseLevel = selectDefenseLevel;
window.setNightComet = setNightComet;
window.setNightExpedition = setNightExpedition;