// ═══════════════════════════════════════════════════════════════
//  PRESTIGE.JS — система Престижа (Вспышка Сверхновой)
//
//  Логика:
//    • 5 систем → доступна 1-я вспышка, 10 → 2-я, 20 → 3-я и т.д.
//    • При вспышке сохраняется min..max систем (√N × 1.5 .. N)
//    • Кротовая нора поднимает floor до 50%
//    • Множитель дохода и форма галактики — переносятся
//    • Пыль/энергия/цивилизация/родная система — сбрасываются
//
//  Экспортирует: prestigeRequirements, checkPrestigeAvailability,
//                activateSupernova, performSupernova,
//                updatePrestigeButton, initPrestige,
//                calculateKeepCount, _systemRate
// ═══════════════════════════════════════════════════════════════

// ─── Формы галактик ──────────────────────────────────────────────
const GALAXY_FORMS = ['spiral', 'elliptical', 'irregular', 'ring'];

// ─── Шансы на класс звезды при престиже (M — легендарная) ───────
const PRESTIGE_STAR_TABLE = [
  [1,  { M: 0.05, K: 0.25, G: 0.55, A: 0.10, B: 0.05 }],
  [3,  { M: 0.08, K: 0.24, G: 0.50, A: 0.11, B: 0.07 }],
  [5,  { M: 0.12, K: 0.23, G: 0.44, A: 0.12, B: 0.09 }],
  [7,  { M: 0.16, K: 0.22, G: 0.38, A: 0.13, B: 0.11 }],
  [10, { M: 0.20, K: 0.20, G: 0.32, A: 0.14, B: 0.14 }],
  [15, { M: 0.24, K: 0.18, G: 0.26, A: 0.15, B: 0.17 }],
  [20, { M: 0.28, K: 0.16, G: 0.20, A: 0.16, B: 0.20 }],
];

function rollStarForPrestige(prestigeLevel) {
  const lvl = Math.max(1, prestigeLevel || 1);
  let row = PRESTIGE_STAR_TABLE[0][1];
  for (let i = PRESTIGE_STAR_TABLE.length - 1; i >= 0; i--) {
    if (lvl >= PRESTIGE_STAR_TABLE[i][0]) { row = PRESTIGE_STAR_TABLE[i][1]; break; }
  }
  const r = Math.random();
  let acc = 0;
  const keys = ['M', 'K', 'G', 'A', 'B'];
  for (let i = 0; i < keys.length; i++) {
    acc += row[keys[i]];
    if (r < acc) return keys[i];
  }
  return 'G';
}
window.rollStarForPrestige = rollStarForPrestige;

// ─── Сколько ОБЫЧНЫХ систем сохранится после престижа ───────────
// Прайм-системы сюда не входят, они сохраняются 100% всегда.
function calculateKeepCount(regularCount) {
  if (regularCount <= 0) return 0;

  // Минимум сохраняем корень из количества обычных систем * 1.5
  let minTotal = Math.max(1, Math.floor(Math.sqrt(regularCount) * 1.5));
  let maxTotal = regularCount;

  // Кротовая нора увеличивает минимум до 50% обычных систем
  if (S.primeSystem && S.primeSystem.objectKey === 'wormhole') {
    const wormMin = Math.ceil(regularCount * 0.5);
    if (wormMin > minTotal) minTotal = wormMin;
  }

  minTotal = Math.min(minTotal, maxTotal);
  return minTotal + Math.floor(Math.random() * (maxTotal - minTotal + 1));
}
window.calculateKeepCount = calculateKeepCount;

// ─── Оценка дохода системы (для сортировки лучших) ──────────────
function _systemRate(sys) {
  if (!sys) return 0;
  
  // ★ ПРАЙМ-СИСТЕМЫ ВСЕГДА В ТОПЕ (не удаляются)
  if (sys.isPrime) return 9999999;
  
  let sum = 0;
  const planets = sys.planets || [];
  for (let i = 0; i < planets.length; i++) {
    const pt = PLANET_TYPES[planets[i].type];
    if (pt) sum += pt.rate;
  }
  const stMult  = STAR_TYPES[sys.starType]     ? STAR_TYPES[sys.starType].rateMult    : 1;
  const sysMult = SYSTEM_TYPES[sys.systemType] ? SYSTEM_TYPES[sys.systemType].rateMult : 1;
  
  return sum * stMult * sysMult * (1 + (sys.incomeBonus || 0));
}
window._systemRate = _systemRate;

// ─── Требования по системам для каждой сверхновой ───────────────
// 1-я на 5 систем, каждая следующая ×2: 5, 10, 20, 40, 80
function prestigeRequirements() {
  const first = PRESTIGE_CFG.firstRequirement || 5;
  const step  = PRESTIGE_CFG.stepMultiplier || 2;
  const list = [];
  for (let i = 0; i < 5; i++) list.push(first * Math.pow(step, i));
  return list;
}

// ─── Проверка доступности престижа ───────────────────────────────
function checkPrestigeAvailability() {
  const requirements = prestigeRequirements();
  const prestigeLevel = S.prestigeLevel || 0;
  const need = requirements[prestigeLevel];
  if (need && S.systems >= need) return prestigeLevel + 1;
  return 0;
}

// ═══════════════════════════════════════════════════════════════
//  МОДАЛКА ПОДТВЕРЖДЕНИЯ
// ═══════════════════════════════════════════════════════════════
function activateSupernova() {
  const availableLevel = checkPrestigeAvailability();
  if (!availableLevel) {
    toast('Вспышка Сверхновой', 'Недостаточно систем для престижа');
    return;
  }

  const formNames = {
    spiral: 'Спиральная',
    elliptical: 'Эллиптическая',
    irregular: 'Иррегулярная',
    ring: 'Кольцевая',
  };
  const order = ['первая', 'вторая', 'третья', 'четвёртая', 'пятая'];
  const curMult = S.galaxyMultiplier || 1;
  const nextMult = curMult * (PRESTIGE_CFG.multiplierPerGalaxy || 2);
  const curForm = S.galaxyForm || 'spiral';
  const nextForm = GALAXY_FORMS[(GALAXY_FORMS.indexOf(curForm) + 1) % GALAXY_FORMS.length];

  // Предпросмотр сохранения
 function calculateKeepCount(regularCount) {
  if (regularCount <= 0) return 0;

  let minTotal = Math.max(1, Math.floor(Math.sqrt(regularCount) * 1.5));
  let maxTotal = regularCount;

  // Бонусы кротовых нор (20%, 30%, 50%)
  if (S.primeSystem) {
    if (S.primeSystem.objectKey === 'wormhole')  minTotal = Math.max(minTotal, Math.ceil(regularCount * 0.2));
    if (S.primeSystem.objectKey === 'wormhole2') minTotal = Math.max(minTotal, Math.ceil(regularCount * 0.3));
    if (S.primeSystem.objectKey === 'wormhole3') minTotal = Math.max(minTotal, Math.ceil(regularCount * 0.5));
  }

  minTotal = Math.min(minTotal, maxTotal);
  return minTotal + Math.floor(Math.random() * (maxTotal - minTotal + 1));
}
  const info = `
    <div class="info-box">
      <div class="row-stat"><span>Галактик:</span><span>${S.galaxies || 1} ➔ ${(S.galaxies || 1) + 1}</span></div>
      <div class="row-stat"><span>Множитель дохода:</span><span>×${curMult.toFixed(1)} ➔ ×${nextMult.toFixed(1)}</span></div>
      <div class="row-stat"><span>Форма галактики:</span><span>${formNames[curForm]} ➔ ${formNames[nextForm]}</span></div>
      <div class="row-stat"><span>Систем после:</span><span>${1 + keepPreview} (родная + ${keepPreview})</span></div>
      <div class="row-stat"><span>Потеряется:</span><span>${otherSystems - keepPreview}</span></div>
      ${wormholeNote}
      <div class="row-stat"><span>Металлы:</span><span>останется 50%</span></div>
      <div class="row-stat"><span>Хранилище:</span><span>сохраняется</span></div>
      <div class="row-stat" style="color:#ff5e5e;"><span>Сборка планет:</span><span>отключится</span></div>
    </div>
    <div class="modal-sub" style="color:#ff5e5e;font-weight:bold;">
      Сбрасываются: пыль, энергия, цивилизация, родная система.<br>
      Внимание: после престижа ручная сборка планет недоступна!
    </div>
  `;

  const choices = [
    { id: 'confirm', name: 'Активировать Вспышку', desc: 'Это необратимо!',
      color: '#ff5e5e', icon: '💥' },
    { id: 'cancel', name: 'Отмена', desc: 'Остаться в текущей галактике',
      color: '#6b6b6b', icon: '✕' },
  ];

  let html = buildModal('ВСПЫШКА СВЕРХНОВОЙ',
    `${order[availableLevel - 1] || availableLevel + '-я'} вспышка · уровень ${availableLevel}`,
    choices);
  html = html.replace('<div class="choices">', info + '<div class="choices">');

  const handlers = {
    confirm: function() { performSupernova(availableLevel); },
    cancel: function() { closeEvolutionModal(); },
  };

  setModal(html, handlers);
}

// ═══════════════════════════════════════════════════════════════
//  ВЫПОЛНЕНИЕ ВСПЫШКИ СВЕРХНОВОЙ (ПРЕСТИЖ)
// ═══════════════════════════════════════════════════════════════
function performSupernova(level) {
  if (typeof closeEvolutionModal === 'function') {
    closeEvolutionModal();
  }

  // 1. Синхронизировать активную систему в otherSystems
  if (S.activeSystemIdx !== 0) {
    const target = S.otherSystems[S.activeSystemIdx];
    if (target) {
      target.planets     = S.planets;
      target.starType    = S.starType;
      target.systemType  = S.systemType;
      target.name        = S.systemName;
      target.incomeBonus = S.systemIncomeBonus || 0;
      target.isPrime     = !!S.primeSystem;
      target.primeData   = S.primeSystem || null;
    }
  }

  // 2. Разделяем системы на Прайм и Обычные
  const primeSystems = [];
  const regularSystems = [];
  
  for (let i = 1; i < S.otherSystems.length; i++) {
    const sys = S.otherSystems[i];
    if (sys && sys.planets) {
      if (sys.isPrime) {
        // ★ ПРАЙМ-СИСТЕМЫ СОХРАНЯЮТСЯ ВСЕГДА И НЕ СЧИТАЮТСЯ В ЛИМИТЕ
        primeSystems.push(sys); 
      } else {
        regularSystems.push({ sys: sys, rate: _systemRate(sys) });
      }
    }
  }

  // 3. Считаем лимит ТОЛЬКО для обычных систем
  const keepRegularCount = calculateKeepCount(regularSystems.length);

  // 4. Сортируем и отбираем лучшие обычные системы
  regularSystems.sort(function(a, b) { return b.rate - a.rate; });
  const keptRegulars = regularSystems.slice(0, keepRegularCount).map(function(e) { return e.sys; });

  // 5. Итоговый список сохраненных: ВСЕ Праймы + лучшие Обычные
  const kept = [...primeSystems, ...keptRegulars];
  const systemsBefore = S.systems;

  // 6. Что переносится между галактиками
  const keep = {
    galaxies: (S.galaxies || 1) + 1,
    galaxyMultiplier: (S.galaxyMultiplier || 1) * (PRESTIGE_CFG.multiplierPerGalaxy || 2),
    galaxyForm: GALAXY_FORMS[(GALAXY_FORMS.indexOf(S.galaxyForm || 'spiral') + 1) % GALAXY_FORMS.length],
    achievements: S.achievements || [],
    metalAmount: Math.floor((S.metalAmount || 0) * 0.5),
    unlockedAch: S.unlockedAch || {},
    stats: S.stats || {},
    dailyProgress: S.dailyProgress || {},
    dailyClaimed: S.dailyClaimed || {},
    lastDailyReset: S.lastDailyReset || 0,
    dailyReward: S.dailyReward || { day: 0, lastClaimed: 0 },
    firstNightShieldUsed: S.firstNightShieldUsed || false,
    techLevels: S.techLevels || { astro: 0, quantum: 0, cyber: 0, eng: 0 },
    prestigeLevel: level,
    storageLevels: Object.assign({ dust: 1, energy: 1, civ: 1 }, S.storageLevels),
    storageProgress: Object.assign({ dust: 0, energy: 0, civ: 0 }, S.storageProgress),
    primeSystem: null,
    primeCandidates: S.primeCandidates || [],
    seenLore: S.seenLore || [],
    seenMinigame: S.seenMinigame || {},
    eventLog: S.eventLog || [],
    eventLogUnread: S.eventLogUnread || 0,
    anticheat: S.anticheat || null,
    sessionStart: Date.now(),
    assemblyCooldownUntil: 0,
    evolutionPopupSuspended: false
  };

  // 7. Античит-хук
  if (typeof acOnPrestige === 'function') acOnPrestige(systemsBefore, level);

  // 8. Запускаем анимацию
  S.vis.prestigeAnim = { start: performance.now(), phase: 'pull' };
  S.stage = 'galaxy';

  // 9. Применяем данные через 1.5 сек
  setTimeout(() => {
    if (S.vis && S.vis.prestigeAnim) S.vis.prestigeAnim.phase = 'explode';
    const savedAnim = S.vis.prestigeAnim; 
    
    resetStateValues();
    Object.assign(S, keep);
    S.vis.prestigeAnim = savedAnim; 

    S.starType    = rollStarForPrestige(level);
    S.systemType  = (typeof rollSystemType === 'function') ? rollSystemType() : 'single';
    S.planets     = [];
    S.systemName  = 'Родная';
    S.activeSystemIdx = 0;
    S.systemIncomeBonus = 0;

    S.otherSystems = [null];
    for (let i = 0; i < kept.length; i++) S.otherSystems.push(kept[i]);
    S.systems = 1 + kept.length;
    S.totalSystemsCreated = S.systems;

    if (kept.length > 0) {
      let bestIdx = 1;
      let bestRate = -1;
      for (let i = 1; i < S.otherSystems.length; i++) {
        const r = _systemRate(S.otherSystems[i]);
        if (r > bestRate) { bestRate = r; bestIdx = i; }
      }
      if (typeof switchToSystem === 'function') switchToSystem(bestIdx);
    }

    S.stage = 'galaxy';
    if (typeof initParticles === 'function') initParticles();
    if (typeof triggerSupernovaFlash === 'function') triggerSupernovaFlash();
    if (typeof logPrestige === 'function') logPrestige(S.galaxies, S.galaxyMultiplier);
    if (typeof playSFX === 'function') playSFX('prestige');
    saveGame();
  }, 1500);

  setTimeout(() => {
    if (S.vis && S.vis.prestigeAnim) S.vis.prestigeAnim.phase = 'push';
  }, 2000);

  setTimeout(() => {
    if (S.vis) S.vis.prestigeAnim = null;
    toast('🌟 Вспышка Сверхновой!',
      'Галактика ' + S.galaxies + ' · ×' + S.galaxyMultiplier.toFixed(1) +
      ' · сохранено ' + kept.length + ' систем');
    if (typeof updateUI === 'function') updateUI();
    if (typeof updateSystemSwitcher === 'function') updateSystemSwitcher();
  }, 3500);
}
// ─── Обновление кнопки престижа в UI ───────────────────────────
function updatePrestigeButton() {
  const availableLevel = checkPrestigeAvailability();
  const prestigeBtn = document.getElementById('prestigeBtn');
  if (!prestigeBtn) return;

  const order = ['первая', 'вторая', 'третья', 'четвёртая', 'пятая'];
  const requirements = prestigeRequirements();
  const nextNeed = requirements[S.prestigeLevel || 0];

  if (availableLevel) {
    prestigeBtn.style.display = 'block';
    prestigeBtn.textContent = '💥 ВСПЫШКА СВЕРХНОВОЙ';
    prestigeBtn.title = 'Доступна ' + (order[availableLevel - 1] || availableLevel + '-я') +
      ' вспышка (уровень ' + availableLevel + ')';
  } else {
    prestigeBtn.style.display = 'none';
    if (nextNeed) {
      prestigeBtn.title = 'Нужно ' + nextNeed + ' систем (сейчас ' + S.systems + ')';
    }
  }
}

// ─── Инициализация престижа ─────────────────────────────────────
function initPrestige() {
  const hud = document.querySelector('.hud');
  if (hud && !document.getElementById('prestigeBtn')) {
    const prestigeBtn = document.createElement('button');
    prestigeBtn.id = 'prestigeBtn';
    prestigeBtn.className = 'prestige-btn';
    prestigeBtn.textContent = '💥 ВСПЫШКА СВЕРХНОВОЙ';
    prestigeBtn.style.display = 'none';
    prestigeBtn.addEventListener('click', activateSupernova);
    hud.appendChild(prestigeBtn);
  }
  if (!window.__prestigeTimer) {
    window.__prestigeTimer = setInterval(updatePrestigeButton, 2000);
  }
  updatePrestigeButton();
}

// ─── Экспорт ────────────────────────────────────────────────────
window.prestigeRequirements = prestigeRequirements;
window.checkPrestigeAvailability = checkPrestigeAvailability;
window.activateSupernova = activateSupernova;
window.performSupernova = performSupernova;
window.updatePrestigeButton = updatePrestigeButton;
window.initPrestige = initPrestige;
window.calculateKeepCount = calculateKeepCount;