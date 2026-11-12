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

// Подпись версии игры в «Настройках»: одна точка правды — js/config.js
function renderGameVersion() {
  const el = document.getElementById('gameVersionLabel');
  if (!el) return;
  const version = (typeof GAME_VERSION === 'string') ? GAME_VERSION : '—';
  const build = (typeof GAME_BUILD === 'string') ? GAME_BUILD : '';
  el.textContent = 'v' + version + (build ? ' · ' + build : '');
}
window.renderGameVersion = renderGameVersion;

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
// ★ Состояние между вызовами (updateUI вызывает renderTutorial каждые 250 мс):
// ключ последнего показанного шага/текста и таймер авто-скрытия.
let _tutorialKey = '';
let _tutorialHideTimer = null;

// Подсветка элемента, к которому ведёт текущий шаг онбординга.
let _tutorialPulseEl = null;
function _tutorialPulse(id) {
  if (_tutorialPulseEl) {
    _tutorialPulseEl.classList.remove('tutorial-pulse');
    _tutorialPulseEl = null;
  }
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;
  target.classList.add('tutorial-pulse');
  _tutorialPulseEl = target;
}

function renderTutorial() {
  // ★ Новый движок обучения (js/tutorial.js) полностью заменяет старую
  //   линейную обучалку. Старый код оставлен как безопасный fallback.
  if (window.Tutorial && window.Tutorial.render) {
    window.Tutorial.render();
    return;
  }
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
      // Дальше — знакомство с механиками системы.
      S.tutorialStep = 6;
    } else if (S.stage === 'cloud' || S.stage === 'condense' || S.stage === 'protostar') {
      // Игру перезапустили — начинаем обучение заново
      S.tutorialStep = 1;
    }
  // ─── Шаг 6: флот ───
  } else if (S.tutorialStep === 6) {
    hintText = '🚀 Купи первый корабль';
    hintSub = 'Верфь → флот: корабли отбивают вторжения и несут потери';
    _tutorialPulse('fleetChip');
    if (typeof fleetShipTotal === 'function' && fleetShipTotal() > 0) S.tutorialStep = 7;

  // ─── Шаг 7: оборона ───
  } else if (S.tutorialStep === 7) {
    hintText = '🛡 Построй оборону';
    hintSub = 'Уровни обороны дают шанс отбить атаку до высадки';
    _tutorialPulse('defenseChip');
    if (Number(S.defenseLevel) >= 1) S.tutorialStep = 8;

  // ─── Шаг 8: миссии ───
  } else if (S.tutorialStep === 8) {
    hintText = '☄️ Запусти миссию';
    hintSub = 'Комета даёт пыль, экспедиция — металл и шанс колонии';
    _tutorialPulse('missionButtons');
    const doneMissions = ((S.stats && S.stats.comets) || 0) + ((S.stats && S.stats.expeditions) || 0);
    if (doneMissions >= 1) S.tutorialStep = 9;

  // ─── Шаг 9: журнал и финал ───
  } else if (S.tutorialStep === 9) {
    hintText = '📜 Журнал событий';
    hintSub = 'Там итоги каждой атаки: что украдено, что уничтожено, сколько флота потеряно';
    if (!window._tutorialEndTimer) {
      window._tutorialEndTimer = setTimeout(function() {
        window._tutorialEndTimer = null;
        S.tutorialStep = 0;
        S.tutorialDone = true;
        if (typeof saveGame === 'function') saveGame();
        updateTutorialUI();
      }, 9000);
    }
  }

  if (!el) return;

  // ★ Подсказка не висит постоянно: показываем только при смене шага/текста,
  // через ~7 секунд плавно скрываем. Повторно — только на новом шаге.
  if (!hintText) {
    _tutorialPulse(null);
    _hideTutorialBubble();
    _tutorialKey = '';
    return;
  }

  const key = (S.tutorialStep || 0) + '|' + hintText + '|' + hintSub;
  if (key === _tutorialKey) return;
  _tutorialKey = key;

  el.style.display = 'flex';
  el.innerHTML =
    '<div class="tutorial-bubble">' +
      '<div class="tutorial-title">' + hintText + '</div>' +
      '<div class="tutorial-sub">' + hintSub + '</div>' +
      '<button type="button" class="tutorial-close">Понятно</button>' +
    '</div>';

  const bubble = el.querySelector('.tutorial-bubble');
  if (bubble) {
    bubble.addEventListener('click', function() { _hideTutorialBubble(); });
  }

  if (_tutorialHideTimer) { clearTimeout(_tutorialHideTimer); _tutorialHideTimer = null; }
  _tutorialHideTimer = setTimeout(function() {
    _tutorialHideTimer = null;
    _hideTutorialBubble();
  }, 7000);
}

// Плавно скрыть подсказку (тап по плашке или авто-таймер).
// Ключ шага не сбрасываем, чтобы та же подсказка не возвращалась каждые 250 мс.
function _hideTutorialBubble() {
  const el = document.getElementById('tutorialOverlay');
  if (!el) return;
  if (_tutorialHideTimer) { clearTimeout(_tutorialHideTimer); _tutorialHideTimer = null; }
  const bubble = el.querySelector('.tutorial-bubble');
  if (!bubble) { el.style.display = 'none'; return; }
  bubble.classList.add('tutorial-hide');
  setTimeout(function() {
    const host = document.getElementById('tutorialOverlay');
    if (!host) return;
    const b = host.querySelector('.tutorial-bubble');
    if (b && b.classList.contains('tutorial-hide')) {
      host.style.display = 'none';
      host.innerHTML = '';
    }
  }, 300);
}

// Обновить подсказку вручную (вызывается из таймера/кода)
function updateTutorialUI() {
  if (window.Tutorial && window.Tutorial.render) {
    window.Tutorial.render();
    return;
  }
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
  // ★ Таймеры показываем прямо в кнопке «Миссии», а не отдельной плашкой:
  // раньше плашка висела поверх соседней кнопки «Новая система» и
  // перекрывала её на телефоне.
  const btn = document.querySelector('#missionButtons .mission-btn.missions');
  if (!btn) return;
  const costEl = btn.querySelector('.mb-cost');
  if (!costEl) return;

  const missions = (typeof getActiveMissions === 'function') ? getActiveMissions() : [];
  if (!Array.isArray(missions) || missions.length === 0) {
    btn.classList.remove('has-active-mission');
    btn.title = '';
    if (costEl.dataset && costEl.dataset.default) costEl.textContent = costEl.dataset.default;
    return;
  }

  // На узких экранах два таймера не помещаются в кнопку —
  // показываем ближайший и счётчик остальных. Полный список — в title.
  const compact = (window.innerWidth || 400) < 420 && missions.length > 1;
  const titles = [];
  const timers = [];
  for (let i = 0; i < missions.length; i++) {
    const m = missions[i];
    if (!m) continue;
    const icon = m.icon || (m.type === 'comet' ? '☄️' : '🚀');
    const label = m.type === 'comet' ? 'Комета' : 'Экспедиция';
    const timer = _fmtMissionTimer(m.timeLeft);
    timers.push({ icon: icon, timer: timer, left: Math.max(0, Number(m.timeLeft) || 0) });
    titles.push(label + ' · ' + timer);
  }
  timers.sort(function(a, b) { return a.left - b.left; });

  let text = '';
  if (timers.length) {
    text = timers[0].icon + ' ' + timers[0].timer;
    if (compact) text += ' +' + (timers.length - 1);
    else if (timers.length > 1) {
      const rest = [];
      for (let j = 1; j < timers.length; j++) rest.push(timers[j].icon + ' ' + timers[j].timer);
      text += ' · ' + rest.join(' · ');
    }
  }
  costEl.textContent = text;
  btn.classList.add('has-active-mission');
  btn.title = titles.join('\n');
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
    if (pct > 1 && S.starType && S.stage === 'system') {
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
  const galaxyPhase = (S.stage === 'galaxy' && typeof galaxyPhaseFor === 'function')
    ? galaxyPhaseFor(S.systems)
    : null;
  const roman = galaxyPhase
    ? galaxyPhase.roman
    : (['I', 'II', 'III', 'IV', 'V', 'VI'][stageIdx] || 'I');
  if (orbLabel) orbLabel.textContent = roman;

  if (orbProgress) {
    const goal = currentGoal();
    let prog = 0;
    if (galaxyPhase) prog = galaxyPhase.progress;
    else if (goal && isFinite(goal)) prog = Math.min(1, S.dust / goal);
    else if (S.stage === 'system' && S.planets) prog = S.planets.length / 8;
    else prog = 1;
    
    if (!isFinite(prog) || prog < 0) prog = 0;
    if (prog > 1) prog = 1;
    
    orbProgress.style.strokeDashoffset = (264 * (1 - prog)).toString();
  }

  // Стадия фазы в левом нижнем углу
  const phaseTagEl = document.getElementById('phaseTag');
  const phaseNameEl = document.getElementById('phaseName');
  const stageInfo = galaxyPhase
    ? { tag: galaxyPhase.tag, name: galaxyPhase.title }
    : ((typeof STAGES !== 'undefined' && STAGES[S.stage])
      ? STAGES[S.stage]
      : { tag: 'ФАЗА VI', name: 'Галактика' });
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
  // Карточка новой макро-фазы галактики (VI–IX) — один раз на переходе.
  if (typeof maybeShowGalaxyPhaseLore === 'function') maybeShowGalaxyPhaseLore();
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
        const ev = (typeof eventMult === 'function') ? eventMult('metals') : 1;
        const gross = metalsPerSec() * ev * 3600;
        const upkeep = (typeof fleetUpkeepPerSec === 'function') ? fleetUpkeepPerSec() * ev * 3600 : 0;
        const net = Math.max(0, gross - upkeep);
        rateEl.textContent = '+' + fmt(net) + ' / ч';
        const capNow = (typeof getResourceCap === 'function') ? getResourceCap('metals') : 0;
        let hint = 'Добыча: +' + fmt(gross) + ' / ч';
        if (upkeep > 0) hint += '\nСодержание флота: −' + fmt(upkeep) + ' / ч';
        hint += '\nЧистый прирост: +' + fmt(net) + ' / ч';
        if (capNow > 0) hint += '\nЛимит хранилища: ' + fmt(capNow);
        rateEl.title = hint;
        if (upkeep > 0) rateEl.classList.add('rate-net');
        else rateEl.classList.remove('rate-net');
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
      const cost = storageUpgradeCost(res, lvl);
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
  const cost = storageUpgradeCost(res, lvl);
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

  const cost = storageUpgradeCost(res, lvl);
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

// ★ Цена следующей системы для квест-панели — как в магазине (shop.js):
// systemShopCosts().dust учитывает тех-скидку и бонус события.
// window.nextSystemCostIndex() — будущий хелпер экономики; берём через typeof,
// чтобы ui.js работал и до его появления (fallback на systemCost).
function nextSystemDustCost() {
  if (typeof systemShopCosts === 'function') {
    try {
      const shop = systemShopCosts();
      if (shop && typeof shop.dust === 'number' && isFinite(shop.dust)) return shop.dust;
    } catch (e) { /* используем запасной вариант ниже */ }
  }
  let idx = null;
  if (typeof nextSystemCostIndex === 'function') {
    try { idx = nextSystemCostIndex(); } catch (e) { idx = null; }
  }
  if (typeof idx !== 'number' || !isFinite(idx) || idx < 0) {
    idx = Math.max(0, (S.systems || 1) - 1);
  }
  return systemCost(idx);
}

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
      const shopCost = nextSystemDustCost();
      list.push({ title: 'До Галактики (5 систем)', cur: S.systems, max: 5 });
      list.push({ title: 'Следующая система · ' + fmt(shopCost) + ' ✦', cur: S.dust, max: shopCost });
    }
  }
  else if (st === 'galaxy') {
    const systems = S.systems;
    const nextCost = nextSystemDustCost();
    const phase = (typeof galaxyPhaseFor === 'function')
      ? galaxyPhaseFor(systems)
      : { questTitle: 'Собери созвездие', count: systems, countMax: 10, countUnit: 'звёзд' };

    // ★ Вспышка всегда первой: это главная цель и самый частый апгрейд.
    const prestigeReady = (typeof checkPrestigeAvailability === 'function')
      ? checkPrestigeAvailability() > 0 : false;
    const prestigeNeed = (typeof prestigeRequirementFor === 'function')
      ? (prestigeRequirementFor(S.prestigeLevel || 0) || 0) : 0;
    if (prestigeReady) {
      list.push({ title: '💥 Сделать Вспышку (Доступна)', cur: 1, max: 1 });
    } else if (prestigeNeed > 0) {
      list.push({
        title: '💥 До следующей Вспышки (' + fmt(systems) + '/' + fmt(prestigeNeed) + ') · ' + ((S.prestigeLevel || 0) + 1) + '-я',
        cur: systems, max: prestigeNeed
      });
    }

    // ★ Квест макро-фазы в «штуках»: звёзды → созвездия → туманности → скопления.
    list.push({
      title: '🌌 ' + phase.questTitle + ' · ' + fmt(phase.count) + '/' + fmt(phase.countMax) + ' ' + phase.countUnit,
      cur: phase.count, max: phase.countMax
    });

    if (systems < 2) {
      list.push({ title: 'Основай 2-ю систему · ' + fmt(nextCost) + ' ✦', cur: S.dust, max: nextCost });
    } else {
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
  const now = Date.now();
  const _damagedOf = (idx) => {
    if (idx === S.activeSystemIdx) return !!(S.activeSystemDamagedUntil && S.activeSystemDamagedUntil > now);
    const sys = S.otherSystems && S.otherSystems[idx];
    return !!(sys && sys.damagedUntil > now);
  };
  // ★ Прайм определяется и по isPrime, и по primeData (старые сейвы)
  const _primeOf = (sys) => (typeof primeDataOfSystem === 'function' ? primeDataOfSystem(sys) : (sys && sys.primeData) || null);
  if (S.activeSystemIdx === 0) {
    const pd = S.primeSystem || _primeOf(S.otherSystems[0]);
    list.push({ idx: 0, name: S.systemName, isPrime: !!pd, primeData: pd, damaged: _damagedOf(0) });
  } else if (S.otherSystems[0]) {
    const pd = _primeOf(S.otherSystems[0]);
    list.push({ idx: 0, name: S.otherSystems[0].name, isPrime: !!(pd || S.otherSystems[0].isPrime), primeData: pd, damaged: _damagedOf(0) });
  } else list.push({ idx: 0, name: 'Родная', isPrime: false, damaged: false });

  for (let i = 1; i < S.otherSystems.length; i++) {
    if (S.otherSystems[i]) {
      const pd = _primeOf(S.otherSystems[i]);
      list.push({ idx: i, name: S.otherSystems[i].name, isPrime: !!(pd || S.otherSystems[i].isPrime), primeData: pd, damaged: _damagedOf(i) });
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
      <span style="flex:1; text-align:left;">${s.name}${s.damaged ? ' <span style="color:#ff5e5e;">☠️</span>' : ''}</span>
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
// ★ Свои модалки вместо prompt/confirm: в Telegram Mini App нативные
//   диалоги выглядят чужеродно и иногда блокируются WebView.
function openPromptModal(title, initial, onOk) {
  const modal = document.getElementById('modal');
  const card = document.getElementById('modalCard');
  if (!modal || !card) return;
  const safe = String(initial == null ? '' : initial)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  card.innerHTML = '<div class="modal-title">' + title + '</div>' +
    '<input id="promptInput" maxlength="16" value="' + safe + '" ' +
    'style="width:100%;box-sizing:border-box;margin:12px 0;padding:12px 14px;border-radius:12px;border:1px solid rgba(160,120,255,.45);background:rgba(20,12,40,.9);color:#fff;font-size:16px;">' +
    '<div class="pour-btn-group">' +
    '<button class="pour-btn" id="promptCancel">Отмена</button>' +
    '<button class="pour-btn" id="promptOk" style="font-weight:800;">Сохранить</button>' +
    '</div>';
  modal.classList.add('show');
  const input = document.getElementById('promptInput');
  const close = function() { modal.classList.remove('show'); };
  const apply = function() {
    const value = input ? input.value : '';
    close();
    if (value && value.trim()) onOk(value.trim());
  };
  const cancel = document.getElementById('promptCancel');
  const ok = document.getElementById('promptOk');
  if (cancel) cancel.addEventListener('click', close);
  if (ok) ok.addEventListener('click', apply);
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); apply(); }
    });
    setTimeout(function() { try { input.focus(); input.select(); } catch (_) {} }, 50);
  }
}
window.openPromptModal = openPromptModal;

function openConfirmModal(title, text, onOk) {
  const modal = document.getElementById('modal');
  const card = document.getElementById('modalCard');
  if (!modal || !card) return;
  card.innerHTML = '<div class="modal-title">' + title + '</div>' +
    '<div style="margin:12px 0 18px;color:#d9ccff;font-size:15px;line-height:1.5;">' + text + '</div>' +
    '<div class="pour-btn-group">' +
    '<button class="pour-btn" id="confirmCancel">Отмена</button>' +
    '<button class="pour-btn" id="confirmOk" style="font-weight:800;">Подтвердить</button>' +
    '</div>';
  modal.classList.add('show');
  const close = function() { modal.classList.remove('show'); };
  const cancel = document.getElementById('confirmCancel');
  const ok = document.getElementById('confirmOk');
  if (cancel) cancel.addEventListener('click', close);
  if (ok) ok.addEventListener('click', function() { close(); onOk(); });
}
window.openConfirmModal = openConfirmModal;

function renameCurrentSystem() {
  openPromptModal('Новое имя системы', S.systemName || '', function(newName) {
    S.systemName = newName.slice(0, 16);
    if (S.activeSystemIdx > 0 && S.otherSystems[S.activeSystemIdx]) {
      S.otherSystems[S.activeSystemIdx].name = S.systemName;
    }
    updateSystemSwitcher();
  });
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
      if (pushBtn) pushBtn.textContent = S.settings.pushEnabled !== false ? 'Вкл' : 'Выкл';
      renderGameVersion();
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

  // Push-уведомления: переключатель в настройках
  const pushBtn = document.getElementById('pushToggleBtn');
  if (pushBtn) {
    pushBtn.textContent = S.settings.pushEnabled !== false ? 'Вкл' : 'Выкл';
    pushBtn.addEventListener('click', () => {
      if (typeof playSFX === 'function') playSFX('ui_click');
      S.settings.pushEnabled = !(S.settings.pushEnabled !== false);
      pushBtn.textContent = S.settings.pushEnabled ? 'Вкл' : 'Выкл';
      saveGame();
    });
  }

  if (settingsResetBtn) {
    settingsResetBtn.addEventListener('click', () => {
      openConfirmModal('Сброс прогресса', 'Весь прогресс будет удалён без возможности восстановления. Продолжить?', function() { resetGame(); });
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
  // ★ Флот даёт вклад в отбитие всегда, без уровня Автобороны.
  const previewFleetPct = fleetChancePct;
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
  const neglectCfg = INVASION_CFG.neglect || {};
  const offlineIntervalH = (Number(INVASION_CFG.offlineAttackInterval) || 3 * 3600 * 1000) / 3600000;
  const offlineMax = Number(neglectCfg.maxAttacks) || Number(INVASION_CFG.offlineAttackMax) || 5;
  const neglectFromH = Number(neglectCfg.thresholdHours) || 72;
  const neglectFromLabel = neglectFromH >= 24 && neglectFromH % 24 === 0
    ? (neglectFromH / 24) + ' сут'
    : neglectFromH + ' ч';
  const neglectTheftBonus = (Number(neglectCfg.maxLevel) || 5) * (Number(neglectCfg.theftMinutesPerLevel) || 0);
  maxTheftMin = Math.min(Number(neglectCfg.theftMinutesCap) || 180, maxTheftMin + neglectTheftBonus);
  const debuffCapPct = Math.round((Number(INVASION_CFG.debuffStackCap) || 0.8) * 100);
  const offlineCapPct = Math.round((Number(INVASION_CFG.nightLossCapShare) || 0.4) * 100);
  const offlineMaxCapPct = Math.round((Number(neglectCfg.lossCapShareMax) || 0.8) * 100);
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

  // ★ Флот всегда на службе, активация больше не нужна.
  const fleetActiveNow = (typeof isFleetActive === 'function') ? isFleetActive() : false;
  const fleetShips = (typeof fleetShipTotal === 'function') ? fleetShipTotal() : 0;
  const fleetLabel = fleetShips > 0 ? 'на службе' : 'нет кораблей';
  const fleetColor = fleetShips > 0 ? '#7ee0a8' : '#ffb347';

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
        <span>${fleetChancePct > 0 ? '+' + Math.round(fleetChancePct) + '% к отбитию' : 'всегда в строю'}</span>
      </div>
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;margin-top:4px;">
        <span>Металлы: ${fmt(S.metalAmount || 0)} / ${fmt(typeof metalsCap === 'function' ? metalsCap() : 0)} ⚙</span>
        <span>Списывается при «Готово»</span>
      </div>
      <div class="pour-btn-group" style="margin-top:4px;">
        <button class="pour-btn" onclick="toggleFleet('night')"
          style="background:rgba(46,170,119,0.4);border-color:#2eaa77;">
          ✓ Флот на службе постоянно
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
      ${shieldActive ? `<div class="row-stat"><span>⭐ Премиум-щит:</span><span style="color:#7ee0a8">100% (вторжения + события)</span></div>` : ''}
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;"><span>Офлайн-атаки:</span><span>раз в ${offlineIntervalH} ч, до ${offlineMax} при запустении</span></div>
      <div class="row-stat" style="font-size:10px;color:#ff8a8a;"><span>☠️ Запустение:</span><span>с ${neglectFromLabel} отсутствия — больше атак</span></div>
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;"><span>Кража за атаку:</span><span>до ${maxTheftMin} мин каждого ресурса</span></div>
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;"><span>Штраф к доходу:</span><span>до −${debuffCapPct}% (все ресурсы)</span></div>
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;"><span>Кап потерь за офлайн:</span><span>${offlineCapPct}% → до ${offlineMaxCapPct}% каждого ресурса</span></div>
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;"><span>Планеты:</span><span>до ${maxDisablePlanets} в простой на ${maxDisableHours} ч (дольше при запустении)</span></div>
      <div class="row-stat" style="font-size:10px;color:#ffb347;"><span>Системы:</span><span>при запустении выводятся из строя на часы</span></div>
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;"><span>Длительность обороны:</span><span>${defenseHours} ч (щит 24 ч)</span></div>
      <div class="row-stat" style="font-size:10px;color:#7ee0a8;"><span>Альтернатива:</span><span>⭐ щит 24 ч — 100% без уровней и флота</span></div>
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
    // ★ Пишем активацию в журнал: иначе бонус к отбитию остаётся невидимым.
    if (typeof addEvent === 'function') {
      const addPct = Math.round(selDefLvl * (Number(INVASION_CFG.repelDefensePerLevel) || 0.10) * 100);
      addEvent('defense_active', 'Автоборона ур.' + selDefLvl + ' включена на ' + hours + ' ч (+' + addPct + '% к отбитию)', { meta: { defenseLevel: selDefLvl, hours: hours, repelPercent: addPct } });
    }
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

// ★ ЕДИНЫЙ ИГРОВОЙ ДЕНЬ ДЛЯ ЕЖЕДНЕВКИ.
// Раньше кулдаун считался как «24 часа от последнего Date.now()» на каждом
// устройстве отдельно. Из-за этого телефон и ПК жили в разных днях: игрок
// забирал «день 3», а через минуту с другого устройства — «день 2».
// Теперь день — это serverDayIndex() (граница 01:00 UTC / 04:00 МСК), тот же,
// что у событий, ежедневных заданий и лимитов бустера.
function dailyTodayIndex(now) {
  const ts = Number(now) || Date.now();
  return (typeof serverDayIndex === 'function') ? serverDayIndex(ts) : Math.floor(ts / 86400000);
}

// День, в который награда уже была забрана. Для старых сейвов считаем из ts.
function dailyClaimedDay() {
  const rw = (S && S.dailyReward) || {};
  const day = Number(rw.lastClaimedDay) || 0;
  if (day > 0) return day;
  const last = Number(rw.lastClaimed) || 0;
  return last > 0 ? dailyTodayIndex(last) : 0;
}

// { canClaim, day, today, claimedDay, streakBroken }
// canClaim — только один раз за игровой день; переход через день сбрасывает серию.
function dailyRewardStatus(now) {
  const today = dailyTodayIndex(now);
  const claimedDay = dailyClaimedDay();
  const storedDay = Number(S && S.dailyReward && S.dailyReward.day);
  let day = isFinite(storedDay) ? storedDay : 0;
  day = Math.max(0, Math.min(6, Math.floor(day)));
  if (!claimedDay) return { canClaim: true, day: day, today: today, claimedDay: 0, streakBroken: false };
  const diff = today - claimedDay;
  // Часы откатили назад: считаем, что сегодня уже забрали, — иначе фарм дня.
  if (diff <= 0) return { canClaim: false, day: day, today: today, claimedDay: claimedDay, streakBroken: false };
  if (diff === 1) return { canClaim: true, day: day, today: today, claimedDay: claimedDay, streakBroken: false };
  return { canClaim: true, day: 0, today: today, claimedDay: claimedDay, streakBroken: true };
}
window.dailyRewardStatus = dailyRewardStatus;

function getDailyRewardData(day) {
  // ★ Номинал награды — в config.js (dailyRewardFor): одну и ту же формулу
  //   использует сервер, поэтому телефон и ПК не расходятся в числах.
  if (typeof window.dailyRewardFor === 'function') {
    return window.dailyRewardFor(day, {
      dust: (typeof dustPerSec === 'function') ? dustPerSec() : 0,
      energy: (typeof energyPerSec === 'function') ? energyPerSec() : 0,
      civ: (typeof civPerSec === 'function') ? civPerSec() : 0,
    }, S.systems);
  }
  return { icon: '✦', name: 'Пыль', amount: 50000, type: 'dust' };
}

function checkDailyRewards() {
  const st = dailyRewardStatus();
  // Пропущен целый день — серия начинается заново с первого дня.
  if (st.streakBroken && S.dailyReward.day !== 0) {
    S.dailyReward.day = 0;
    if (typeof saveGame === 'function') saveGame();
  }
  if (!st.canClaim) return false;
  setTimeout(() => { openDailyRewards(); }, 1500);
  return true;
}

function openDailyRewards() {
  const modal = document.getElementById('dailyModal');
  const grid = document.getElementById('dailyGrid');
  if (!modal || !grid) return;

  let html = '';
  // ★ Кулдаун — по единому игровому дню, а не по локальным 24 часам.
  const st = dailyRewardStatus();
  const currentDay = st.day;
  const canClaim = st.canClaim;
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
  // ★ Жёсткая проверка: награда не чаще одного раза за игровой день.
  //   Раньше проверка жила только в вёрстке модалки, поэтому повторный
  //   вызов (старая модалка, второй таб, консоль) забирал следующий день.
  const st = dailyRewardStatus();
  if (!st.canClaim) {
    if (typeof toast === 'function') toast('⏳ Уже получено', 'Следующая награда — в новый игровой день');
    return false;
  }
  if (st.streakBroken) S.dailyReward.day = 0;
  const day = Math.max(0, Math.min(6, Number(S.dailyReward.day) || 0));
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
  S.dailyReward.lastClaimedDay = st.today;
  S.dailyReward.day = (day + 1) >= 7 ? 0 : (day + 1);

  saveGame();
  updateUI();
  
  if (typeof playSFX === 'function') playSFX('ui_purchase');
  
  // Перерисовываем окно
  openDailyRewards();
  
  // Если забрали всё, закрываем через секунду
  setTimeout(() => { closeDailyAndWait(); }, 1500);
  return true;
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
//  ОТЧЁТ О ЗАПУСТЕНИИ ГАЛАКТИКИ
// ═══════════════════════════════════════════════════════════════
function _neglectFmt(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return (typeof fmt === 'function') ? fmt(v) : String(v);
}

function showNeglectReport(res) {
  if (!res) return;
  const modal = document.getElementById('neglectModal');
  if (!modal) return;
  const body = document.getElementById('neglectBody');
  const title = document.getElementById('neglectTitle');
  const hours = Math.max(0, Number(res.awayHours) || 0);
  const totalHours = Math.max(hours, (Number(res.seconds) || 0) / 3600);
  const level = Math.max(0, Math.min(5, Number(res.neglectLevel) || 0));
  const rows = [];

  rows.push('Вас не было <b>' + (totalHours >= 1 ? totalHours.toFixed(1) + ' ч' : Math.round(totalHours * 60) + ' мин') + '</b>. Галактика осталась без присмотра.');
  rows.push('☠️ Уровень запустения: <b>' + level + ' / 5</b>');
  if (res.invasionAttacks > 0) {
    rows.push('⚔️ Атак: <b>' + res.invasionAttacks + '</b>' + (res.invasionDefended > 0 ? ' · отбито: ' + res.invasionDefended : ''));
  }
  const stolen = [];
  if (res.invasionLostDust > 0) stolen.push('✦ ' + _neglectFmt(res.invasionLostDust));
  if (res.invasionDrainE > 0) stolen.push('⚡ ' + _neglectFmt(res.invasionDrainE));
  if (res.invasionDrainC > 0) stolen.push('🧬 ' + _neglectFmt(res.invasionDrainC));
  if (res.invasionLostMetals > 0) stolen.push('⚙ ' + _neglectFmt(res.invasionLostMetals));
  if (stolen.length) rows.push('💰 Украдено: ' + stolen.join(' · '));
  if (res.invasionSystemsDamaged > 0) rows.push('🌫️ Повреждено систем: <b>' + res.invasionSystemsDamaged + '</b>');
  if (res.invasionLost > 0) rows.push('🪐 Планет в простое: <b>' + res.invasionLost + '</b>');
  const debuffPct = (typeof S !== 'undefined' && S.invasionDebuff && S.invasionDebuff.until > Date.now())
    ? Math.round((Number(S.invasionDebuff.pct) || 0) * 100) : 0;
  if (debuffPct > 0) rows.push('📉 Штраф к доходу: <b>−' + debuffPct + '%</b>');
  if (res.shieldProtected && totalHours > hours) {
    const protectedHours = Math.max(0, totalHours - hours);
    rows.push('🛡️ Щит покрыл ' + (protectedHours >= 1 ? protectedHours.toFixed(1) + ' ч' : Math.round(protectedHours * 60) + ' мин') + ' отсутствия, но не всё время.');
  }
  rows.push('<span style="color:#ff8a8a;">Если галактика снова останется без активной обороны, атаки станут ещё жёстче: больше волн, больше украденного и целые системы в простое.</span>');

  if (title) title.textContent = '☠️ Галактика в запустении';
  if (body) body.innerHTML = rows.join('<br><br>');
  modal.classList.add('show');
}
window.showNeglectReport = showNeglectReport;

// Короткий статус для HUD: штраф к доходу + число выведенных из строя систем.
// ★ Это НЕ «запустение» (>72 ч отсутствия, считается только при возврате),
//   а последствия обычных вторжений. Раньше подпись «Запустение» путала
//   игроков: рост штрафа от волн выглядел как «новый уровень запустения».
function galaxyNeglectChipText() {
  const now = Date.now();
  const pct = (S.invasionDebuff && S.invasionDebuff.until > now)
    ? Math.round((Number(S.invasionDebuff.pct) || 0) * 100) : 0;
  let damaged = (S.activeSystemDamagedUntil && S.activeSystemDamagedUntil > now) ? 1 : 0;
  const list = Array.isArray(S.otherSystems) ? S.otherSystems : [];
  for (let i = 0; i < list.length; i++) {
    if (i === S.activeSystemIdx) continue;
    if (list[i] && list[i].damagedUntil > now) damaged++;
  }
  if (!pct && !damaged) return '';
  let text = '⚔️ Оккупация';
  if (pct > 0) text += ' · доход −' + pct + '%';
  if (damaged > 0) text += ' · систем ' + damaged;
  return text;
}
window.galaxyNeglectChipText = galaxyNeglectChipText;

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
      // Не наслаиваем два модальных окна: отчёт о запустении важнее.
      const neglect = document.getElementById('neglectModal');
      if (neglect && neglect.classList.contains('show')) {
        if (typeof toast === 'function') toast('🛡 Первый щит', 'Выдан щит на 8 часов. Следующая ночь без обороны будет жёстче.');
        return;
      }
      document.getElementById('welcomeShieldModal').classList.add('show');
    }, 2000);
  }
}
function updateEventUI() {
  const banner = document.getElementById('eventBanner');
  if (!banner) return;

  const list = (typeof RandomEvents !== 'undefined' && typeof RandomEvents.getActiveWorldEvents === 'function')
    ? RandomEvents.getActiveWorldEvents()
    : [];
  if (!list.length) { banner.style.display = 'none'; banner.title = ''; return; }

  const primary = list[0];
  const cfg = primary.cfg;
  const leftMs = primary.state.endsAt - Date.now();
  if (leftMs <= 0) { banner.style.display = 'none'; return; }

  const h = Math.floor(leftMs / 3600000);
  const m = Math.floor((leftMs % 3600000) / 60000);
  const s = Math.floor((leftMs % 60000) / 1000);
  const timeStr = h > 0 ? h + 'ч ' + m + 'м' : m + 'м ' + s + 'с';

  const pol = (typeof RandomEvents !== 'undefined' && typeof RandomEvents.polarityInfo === 'function')
    ? RandomEvents.polarityInfo(cfg)
    : { key: 'mixed', icon: '🌍', color: '#8b7fd4' };
  const shieldEvent = !!(primary.shielded && pol.key !== 'positive');
  banner.style.display = 'flex';
  banner.style.borderColor = shieldEvent ? '#7ee0a8' : pol.color;
  if (shieldEvent) banner.style.background = 'rgba(12,38,28,0.94)';
  else if (pol.key === 'negative') banner.style.background = 'rgba(48,12,20,0.94)';
  else if (pol.key === 'positive') banner.style.background = 'rgba(12,38,28,0.94)';
  else banner.style.background = 'rgba(46,36,12,0.94)';
  const iconEl = document.getElementById('eventIcon');
  const nameEl = document.getElementById('eventName');
  const timerEl = document.getElementById('eventTimer');
  if (iconEl) iconEl.textContent = cfg.icon || '🌍';
  // ★ Один источник информации: слева иконка события, справа название и таймер.
  // Значок полярности в названии больше не дублируем (было pol.icon + cfg.title).
  if (nameEl) nameEl.textContent = (shieldEvent ? '🛡 ' : '') + cfg.title + (list.length > 1 ? ' +' + (list.length - 1) : '');
  if (timerEl) timerEl.textContent = '[' + timeStr + ']';
  banner.title = list.map(function(e) { return e.cfg.title + (e.shielded ? ' (🛡 щит поглощает негатив)' : '') + ' — ' + e.cfg.desc; }).join('\n');

  // ★ Баннер кликабельный: открывает брифинг события или журнал событий.
  // Навешиваем один раз — updateEventUI вызывается каждые 250 мс.
  if (!banner.dataset.evbWired) {
    banner.dataset.evbWired = '1';
    banner.addEventListener('click', function() {
      if (typeof playSFX === 'function') playSFX('ui_click');
      let opened = false;
      if (typeof openEventBriefing === 'function') {
        try { opened = !!openEventBriefing(); } catch (e) { opened = false; }
      }
      if (!opened && typeof toggleEventLog === 'function') toggleEventLog();
    });
    banner.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        banner.click();
      }
    });
  }
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
//  ТОП ИГРОКОВ
// ═══════════════════════════════════════════════════════════════
const LEADERBOARD_CACHE_KEY = 'accretion_leaderboard_cache';

async function openLeaderboard() {
  const card = document.getElementById('modalCard');
  if (!card) return;
  const achModal = document.getElementById('achModal');
  if (achModal) achModal.classList.remove('show');
  const modal = document.getElementById('modal');
  if (modal) modal.classList.add('show');

  card.innerHTML = '<div class="modal-title">🏆 Топ игроков</div><div class="modal-sub">Загрузка рейтинга…</div>';

  let top = [];
  let cached = null;
  let lastErr = null;
  try {
    // ★ Через cloudFetch: он перебирает API-адреса и умеет пережить
    // блокировку одного из доменов (Safari в этом случае пишет «Load failed»).
    let res;
    if (typeof window.cloudFetch === 'function') {
      res = await window.cloudFetch('/api/leaderboard', { method: 'GET', cache: 'no-store' });
    } else if (typeof CLOUD_API !== 'undefined') {
      res = await fetch(CLOUD_API + '/api/leaderboard', { method: 'GET' });
    } else {
      throw new Error('нет адреса сервера');
    }
    let json = null;
    try { json = await res.json(); } catch (err) { json = null; }
    if (!res.ok || !json) throw new Error((json && json.error) || ('HTTP ' + res.status));

    top = Array.isArray(json.top) ? json.top : [];
    try {
      localStorage.setItem(LEADERBOARD_CACHE_KEY, JSON.stringify({ at: Date.now(), top: top }));
    } catch (e) { /* ignore */ }
  } catch (err) {
    lastErr = err;
    // ★ Показываем последний удачный рейтинг вместо пустого экрана.
    try { cached = JSON.parse(localStorage.getItem(LEADERBOARD_CACHE_KEY) || 'null'); } catch (e) { cached = null; }
    if (cached && Array.isArray(cached.top)) top = cached.top;
  }

  let html = '<div class="modal-title">🏆 Топ игроков</div>' +
    '<div class="modal-sub">Престиж · системы · пыль</div>';

  if (lastErr) {
    if (top.length) {
      const when = cached && cached.at ? new Date(cached.at).toLocaleString() : '';
      html += '<div class="info-box" style="text-align:center;font-size:11px;color:#ffcf7a;">' +
        'Сервер недоступен — показан кэш' + (when ? ' от ' + when : '') + '</div>';
    } else {
      html += '<div class="info-box" style="text-align:center;font-size:12px;color:#ff8a8a;">' +
        'Не удалось загрузить рейтинг<br>' + (lastErr && lastErr.message ? lastErr.message : 'ошибка сети') + '</div>' +
        '<div class="info-box" style="text-align:center;font-size:11px;color:#8b7fd4;">' +
        'Проверьте интернет/VPN и обновите игру, если ошибка повторяется.</div>';
    }
  }

  if (!top.length) {
    if (!lastErr) {
      html += '<div class="info-box" style="text-align:center;font-size:12px;color:#8b7fd4;">Пока нет сохранённых игроков</div>';
    }
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
}

// Случайные события вынесены в js/random-events.js
// (ежедневные + еженедельные world-события).
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