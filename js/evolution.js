// ═══════════════════════════════════════════════════════════════
//  EVOLUTION.JS — Переходы фаз, таймер зажигания, сборка планет
// ═══════════════════════════════════════════════════════════════

let evolutionModalOpen = false;
let evolutionSuppressUntil = 0;

// ★ Блокировка всплывающих окон эволюции на заданное время (мс)
function suppressEvolutionFor(ms) {
  evolutionSuppressUntil = performance.now() + (ms || 0);
}
window.suppressEvolutionFor = suppressEvolutionFor;
let _protostarTimerStart = 0;
let _protostarTimerActive = false;
let _systemFullNotified = false;

// ═══════════════════════════════════════════════════════════════
//  ПРОВЕРКА ПЕРЕХОДА ФАЗ
// ═══════════════════════════════════════════════════════════════
function checkEvolution() {
  if (evolutionModalOpen) return;
  if (performance.now() < evolutionSuppressUntil) return;
  if (S.activeMinigame) return;
  if (S.stage === 'protostar') return;
  if (S.stage === 'galaxy') return;
  if (S.stage === 'system' && S.prestigeLevel > 0) return;
  
  // ★ Если игрок недавно провалил сборку — не высовываемся
  if (S.evolutionPopupSuspended) return; 
  if (Date.now() < (S.assemblyCooldownUntil || 0)) return;

  const modal = document.getElementById('modal');
  if (modal && modal.classList.contains('show')) return;

  if (S.stage === 'system') {
    if (S.planets.length >= 8) {
      if (!_systemFullNotified) {
        _systemFullNotified = true;
        toast('Система сформирована', 'Пора расширяться — купи новую систему');
      }
      return;
    }
    _systemFullNotified = false;
    if (S.dust >= currentGoal()) openEvolution();
    return;
  }

  const goal = currentGoal();
  if (goal === null) return;
  if (S.dust >= goal) openEvolution();
}

// ═══════════════════════════════════════════════════════════════
//  ДИСПЕТЧЕР ЭВОЛЮЦИИ
// ═══════════════════════════════════════════════════════════════
function openEvolution() {
  if (evolutionModalOpen) return;
  if (performance.now() < evolutionSuppressUntil) return;
  if (S.activeMinigame) return;
  if (S.stage === 'protostar') return;
  if (S.stage === 'galaxy') return;
  if (S.stage === 'system' && S.prestigeLevel > 0) return;

  // ★ Проверка кулдауна
  if (Date.now() < (S.assemblyCooldownUntil || 0)) {
    toast('Перезарядка', 'Подождите ' + Math.ceil((S.assemblyCooldownUntil - Date.now()) / 1000) + 'с');
    return;
  }
  // ... дальше идет старый код
  const stage = S.stage;

  if (stage === 'cloud') {
    S.stage = 'condense';
    if (typeof playSFX === 'function') playSFX('evolution');
    S.phaseProgress.cloud = 0;
    closeEvolutionModal();
    if (typeof showLoreCard === 'function') showLoreCard('condense', function() {
      setTimeout(function() { toast('Коллапс начался', 'Гравитация сжимает облако'); }, 5000);
    });
    return;
  }

  if (stage === 'condense') {
    S.stage = 'protostar';
    if (typeof playSFX === 'function') playSFX('evolution');
    S.phaseProgress.condense = 0;
    S.protostarHeat = 0.2;
    closeEvolutionModal();
    startProtostarTimer();
    if (typeof showLoreCard === 'function') showLoreCard('protostar', function() {
      setTimeout(function() { toast('Протозвезда', 'Тапай по экрану — держи жар!'); }, 5000);
    });
    return;
  }

  if (stage === 'firstPlanet') {
    _buildPlanetModal(1, 'Сборка первой планеты');
    return;
  }

  if (stage === 'system') {
    if (S.planets.length >= 8) {
      closeEvolutionModal();
      setTimeout(function() { toast('Система сформирована', 'Пора расширяться'); }, 500);
      return;
    }
    _buildPlanetModal(S.planets.length + 1);
    return;
  }
}

// ═══════════════════════════════════════════════════════════════
//  ТАЙМЕР ФАЗЫ III (ПРОТОЗВЕЗДА)
// ═══════════════════════════════════════════════════════════════
function tickProtostar(dt) {
  if (S.stage !== 'protostar') { _protostarTimerActive = false; return; }
  if (!_protostarTimerActive) {
    _protostarTimerStart = performance.now();
    _protostarTimerActive = true;
    if (typeof S.protostarHeat !== 'number') S.protostarHeat = 0;
  }

  const b = (CFG.activeBoost && CFG.activeBoost.protostar) || {};
  const elapsed = (performance.now() - _protostarTimerStart) / 1000;
  const decay = (b.heatDecayBase || 0.10) * (1 + elapsed * (b.heatDecayAccel || 0.18));

  S.protostarHeat = Math.max(0, (S.protostarHeat || 0) - decay * dt);

  if (elapsed >= (b.duration || 30)) {
    _protostarTimerActive = false;
    finishProtostar();
  }
}

function startProtostarTimer() {
  _protostarTimerStart = performance.now();
  _protostarTimerActive = true;
}

function getProtostarTimeLeft() {
  if (S.stage !== 'protostar' || !_protostarTimerActive) return 0;
  const b = (CFG.activeBoost && CFG.activeBoost.protostar) || {};
  const duration = b.duration || 30;
  const elapsed = (performance.now() - _protostarTimerStart) / 1000;
  return Math.max(0, duration - elapsed);
}

function finishProtostar() {
  const b = (CFG.activeBoost && CFG.activeBoost.protostar) || {};
  const heat = S.protostarHeat || 0;
  S.lastIgnitionQuality = heat;

  const thresholds = b.starThresholds || [
    { q: 0.90, star: 'M', color: '#ff3030' },
    { q: 0.70, star: 'B', color: '#5577ff' },
    { q: 0.45, star: 'K', color: '#ff9944' },
    { q: 0.25, star: 'A', color: '#ccccff' },
    { q: 0.00, star: 'G', color: '#ffcc55' },
  ];
  
  let starType = 'G', starColor = '#ffcc55';
  for (let i = 0; i < thresholds.length; i++) {
    if (heat >= thresholds[i].q) {
      starType = thresholds[i].star;
      starColor = thresholds[i].color;
      break;
    }
  }
  S.starType = starType;

  _ignitionFlash(starColor);
  if (typeof playSFX === 'function') playSFX('star_ignite');
  if (typeof resetAllParticlesToSpiral === 'function') resetAllParticlesToSpiral();

  S.systemType = (typeof rollSystemType === 'function') ? rollSystemType() : 'single';
  if (typeof resetGas === 'function') resetGas();

  setTimeout(function() {
    S.stage = 'firstPlanet';
    const st = STAR_TYPES[starType];
    const sysSt = SYSTEM_TYPES[S.systemType];
    toast('★ ' + st.name, sysSt.name + ' система · доход ×' + st.rateMult);

    // ★ Выдаем ежедневную награду при переходе на 4-ю фазу
    if (typeof checkDailyRewards === 'function') {
      const dailyScheduled = checkDailyRewards();
      // Пока ежедневка не закрыта, сборка планеты не должна выскакивать
      if (dailyScheduled && typeof suppressEvolutionFor === 'function') {
        suppressEvolutionFor(Infinity);
      }
    }

    setTimeout(function() {
      if (typeof showLoreCard === 'function') {
        showLoreCard('firstPlanet', function() {
          setTimeout(function() { toast('Диск остывает', 'Накопи ' + fmt(planetCost(0)) + ' пыли для первой планеты'); }, 5000);
        });
      }
    }, 10000);
  }, 900);
}

function _ignitionFlash(color) {
  const f = document.createElement('div');
  f.style.cssText = 'position:fixed;inset:0;background:' + color + ';opacity:0;pointer-events:none;z-index:9998;transition:opacity 0.15s ease;';
  document.body.appendChild(f);
  requestAnimationFrame(function() { f.style.opacity = '0.7'; });
  setTimeout(function() {
    f.style.opacity = '0';
    setTimeout(function() { f.remove(); }, 300);
  }, 400);
}

// ═══════════════════════════════════════════════════════════════
//  СБОРКА ПЛАНЕТ (ЛОГИКА КУЛДАУНА И ПРОВАЛА)
// ═══════════════════════════════════════════════════════════════
function _handlePlanetPlaced() {
  const wasFirst = (S.stage === 'firstPlanet');
  const preferred = (typeof MG !== 'undefined' && MG.result) ? MG.result : 'rocky';
  const placedType = (typeof addPlanet === 'function') ? addPlanet(preferred) : false;

  closeEvolutionModal();

  if (placedType) {
    // ★ УСПЕХ: снимаем блокировку (на следующую планету всё будет норм)
    S.evolutionPopupSuspended = false;
    
    if (typeof trackDaily === 'function') trackDaily('d_planet', 1);
    if (!S.stats) S.stats = {};
    S.stats.planets = (S.stats.planets || 0) + 1;
    if (wasFirst) S.stage = 'system';
    
    toast(PLANET_TYPES[placedType].name + ' сформирована', 'Новая планета в системе');
    if (typeof logPlanetFormed === 'function') logPlanetFormed(PLANET_TYPES[placedType].name);
    if (typeof playSFX === 'function') playSFX('planet_form');
  } else {
    // ★ ПРОВАЛ: блокируем авто-вызов
    S.evolutionPopupSuspended = true;
    
    const cost = planetCost(S.planets.length);
    S.dust += cost;
    S.assemblyCooldownUntil = Date.now() + 30000;
    toast('⚠ Неверная планета', 'Нет места. Возврат ' + fmt(cost) + ' ✦. Перезарядка 30с.');
  }
  saveGame();
  if (typeof updateUI === 'function') updateUI();
}

function initAssembleField() {
  const W = window.CANVAS_W || 400;
  const H = window.CANVAS_H || 700;
  MG.fieldHalfW = W / 2 - 25;
  MG.fieldHalfH = H / 2 - 140;
  MG.startDistMin = Math.min(MG.fieldHalfW, MG.fieldHalfH) * 0.40;
  MG.startDistMax = Math.min(MG.fieldHalfW, MG.fieldHalfH) * 0.95;

  MG.fieldParticles = [];
  MG.result = null;
  MG.resultLabel = null;
  MG.elapsedSec = 0;
  MG.finishAt = 0;

  const star = S.starType || 'G';
  const validPlanets = (S.planets || []).filter(p => p && typeof p === 'object' && isFinite(p.baseOrbitR));
  
  // 1. Находим свободные орбиты
  const freeOrbitIndices = [];
  for (let i = 0; i < 8; i++) {
    const orbitR = getOrbitR(i);
    let free = true;
    for (let pi = 0; pi < validPlanets.length; pi++) {
      if (Math.abs(validPlanets[pi].baseOrbitR - orbitR) < ORBIT_GEOMETRY.minGap) {
        free = false; break;
      }
    }
    if (free) freeOrbitIndices.push(i);
  }

  // 2. Смотрим, какие планеты туда можно поставить
  const availableTypes = [];
  for (let i = 0; i < freeOrbitIndices.length; i++) {
    const types = getAllowedTypesAtOrbit(star, freeOrbitIndices[i]);
    for (let t of types) {
      if (availableTypes.indexOf(t) === -1) availableTypes.push(t);
    }
  }

  MG.allowedPlanets = availableTypes; // ★ Честная подсказка
  MG.availableColors = ['ice', 'lava', 'stone', 'gas']; // ★ Всегда 4 цвета для игры

  const types = MG.availableColors;
  const total = types.length * MG_ASSEMBLE.colorsPerType;
  const margin = 30;
  const innerW = (MG.fieldHalfW - margin) * 0.9;
  const innerH = (MG.fieldHalfH - margin) * 0.9;

  const placed = [];
  let attempts = 0;
  const maxAttempts = 500;

  for (let i = 0; i < total; i++) {
    let x = 0, y = 0, ok = false;
    while (!ok && attempts < maxAttempts) {
      attempts++;
      x = (Math.random() * 2 - 1) * innerW;
      y = (Math.random() * 2 - 1) * innerH;
      ok = true;
      for (let k = 0; k < placed.length; k++) {
        const dx = x - placed[k].x, dy = y - placed[k].y;
        if (dx * dx + dy * dy < 55 * 55) { ok = false; break; }
      }
    }
    placed.push({ x: x, y: y });
    const colorKey = types[Math.floor(i / MG_ASSEMBLE.colorsPerType)];
    const cc = {}; cc[colorKey] = 1;
    MG.fieldParticles.push({
      x: x, y: y, vx: 0, vy: 0,
      r: MG_ASSEMBLE.baseRadius,
      colors: [colorKey],
      colorCounts: cc,
      mass: 1,
      fixed: false,
    });
  }
}
function _buildPlanetModal(stepNumber, titleOverride) {
  if (S.stage === 'galaxy') return;
  if (S.prestigeLevel > 0) return;

  const cost = planetCost(S.planets.length);
  const canAfford = S.dust >= cost;
  const zone = getOrbitHint();
  const title = titleOverride || (stepNumber === 1 ? 'Сборка первой планеты' : ('Сборка планеты №' + stepNumber));
  
  // Проверяем перезарядку
  const cooldownLeft = Math.ceil(((S.assemblyCooldownUntil || 0) - Date.now()) / 1000);
  const isCooldown = cooldownLeft > 0;
  
  let btnName = 'Начать сборку';
  let btnDesc = canAfford ? 'Собери планету из частиц' : 'Не хватает ' + fmt(cost - S.dust);
  
  if (isCooldown) {
    btnName = 'Перезарядка ' + cooldownLeft + 'с';
    btnDesc = 'Подождите перед новой попыткой';
  }

  setModal(buildModal(title,
    'Стоимость: ' + fmt(cost) + ' пыли.' + assembleRulesHTML(),
    [{ id:'go', name: btnName,
      desc: btnDesc,
      stats: zone.hint,
      color:'#6b4de6', icon:'🪐', disabled: !canAfford || isCooldown }]),
    { go: function() {
        if (S.dust < cost) return;
        if (isCooldown) return;
        
        S.dust -= cost;
        tryMinigameFull('assemble',
          _handlePlanetPlaced,
          function() {
            // Если время вышло (провал)
            S.dust += cost;
            S.assemblyCooldownUntil = Date.now() + 30000;
            S.evolutionPopupSuspended = true; // Блокируем авто-вызов
            evolutionSuppressUntil = performance.now() + 3000;
            toast('Сборка не удалась', 'Возврат ' + fmt(cost) + ' пыли. Перезарядка 30с.');
            saveGame();
            if (typeof updateUI === 'function') updateUI();
          }
        );
      }
    });
    
  // Если кулдаун идет, обновляем модалку каждую секунду
  if (isCooldown) {
    setTimeout(function() {
      if (evolutionModalOpen) _buildPlanetModal(stepNumber, titleOverride);
    }, 1000);
  }
}
function tryMinigameFull(type, onSuccess, onFail) {
  closeEvolutionModal();
  if (typeof startMinigame === 'function') {
    try {
      startMinigame(type, function(success) {
        if (success) onSuccess();
        else if (onFail) onFail();
        else toast('Не получилось', 'Возвращайся, когда будешь готов');
      });
    } catch (e) { console.warn('Minigame error:', e); onSuccess(); }
  } else { onSuccess(); }
}

// ═══════════════════════════════════════════════════════════════
//  UI ИНТЕРФЕЙС МОДАЛКИ
// ═══════════════════════════════════════════════════════════════
function getOrbitHint() {
  const star = S.starType || 'G';
  const allTypes = (typeof getAllowedTypesForSystem === 'function')
    ? getAllowedTypesForSystem(star) : ['rocky', 'gasGiant', 'iceGiant'];
  const freeTypes = [];
  
  for (let i = 0; i < 8; i++) {
    const orbitR = (typeof getOrbitR === 'function') ? getOrbitR(i) : 90 + i * 50;
    let occupied = false;
    for (let pi = 0; pi < S.planets.length; pi++) {
      if (Math.abs(S.planets[pi].baseOrbitR - orbitR) < ORBIT_GEOMETRY.minGap) { occupied = true; break; }
    }
    if (occupied) continue;
    
    const allowed = (typeof getAllowedTypesAtOrbit === 'function')
      ? getAllowedTypesAtOrbit(star, i) : allTypes;
    for (let ai = 0; ai < allowed.length; ai++) {
      if (freeTypes.indexOf(allowed[ai]) === -1) freeTypes.push(allowed[ai]);
    }
  }
  
  const names = freeTypes.map(function(t) {
    return PLANET_TYPES[t] ? PLANET_TYPES[t].name : t;
  });
  
  return {
    label: 'Свободные орбиты',
    hint: names.length > 0 ? 'Доступно: ' + names.join(', ') : 'Все орбиты заполнены',
    types: freeTypes,
  };
}

function assembleRulesHTML() {
  return '<div style="margin-top:10px;font-size:11px;line-height:1.5;color:#b9a8ff;text-align:left">' +
    '<b>Как играть:</b> тяни шары по одному — при касании они сливаются.<br>' +
    'Шар растёт до массы 4 и фиксируется как планета. На сборку 30 секунд.<br><br>' +
    '<b>Бонусы планет:</b><br>' +
    '🔴 <b>Лава</b>: Макс. доход (1400) + металлы (0.5/сек)<br>' +
    '🟡 <b>Газовый гигант</b>: Высокий доход (900) + снижает урон комет на 30%<br>' +
    '🔵 <b>Ледяной гигант</b>: Хороший доход (700) + нужен для запуска комет<br>' +
    '🟢 <b>Каменная</b>: Базовый доход (250)<br>' +
    '🌈 <b>Земля</b> (4 разных цвета): Доход (500) + ускоряет рост цивилизации и энергии (×1.5)</div>';
}

function buildModal(title, sub, choices) {
  let html = '<div class="modal-title">' + title + '</div>';
  if (sub) html += '<div class="modal-sub">' + sub + '</div>';
  html += '<div class="choices">';
  for (let i = 0; i < choices.length; i++) {
    const c = choices[i];
    html += '<button class="choice" data-id="' + c.id + '"' + (c.disabled ? ' disabled' : '') + '>';
    html += '<div class="choice-icon" style="background:' + c.color + ';box-shadow:0 0 20px ' + c.color + '80">' + (c.icon || '') + '</div>';
    html += '<div class="choice-body">';
    html += '<div class="choice-name">' + c.name + '</div>';
    if (c.desc) html += '<div class="choice-desc">' + c.desc + '</div>';
    if (c.stats) html += '<div class="choice-stat">' + c.stats + '</div>';
    html += '</div></button>';
  }
  html += '</div>';
  return html;
}

function setModal(html, handlers) {
  const modal = document.getElementById('modal');
  const card = document.getElementById('modalCard');
  if (!modal || !card) return;
  
  card.innerHTML = html;
  modal.classList.add('show');
  evolutionModalOpen = true;
  
  const buttons = card.querySelectorAll('.choice');
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', function() {
      const id = this.dataset.id;
      if (this.disabled) return;
      if (handlers && handlers[id]) handlers[id]();
      else closeEvolutionModal();
    });
  }
}

function closeEvolutionModal() {
  evolutionModalOpen = false;
  const modal = document.getElementById('modal');
  if (modal) modal.classList.remove('show');
  if (typeof playSFX === 'function') playSFX('ui_close');
}

// Глобальное закрытие модалки
(function setupModalClose() {
  function attach() {
    const modal = document.getElementById('modal');
    if (!modal) { setTimeout(attach, 200); return; }
    if (modal.dataset.closeAttached === '1') return;
    modal.dataset.closeAttached = '1';
    
    modal.addEventListener('click', function(e) {
      if (e.target === modal) closeEvolutionModal();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && modal.classList.contains('show')) closeEvolutionModal();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();

// ─── Экспорт ────────────────────────────────────────────────────
window.checkEvolution = checkEvolution;
window.openEvolution = openEvolution;
window.closeEvolutionModal = closeEvolutionModal;
window.tickProtostar = tickProtostar;
window.startProtostarTimer = startProtostarTimer;
window.getProtostarTimeLeft = getProtostarTimeLeft;
window.getOrbitHint = getOrbitHint;