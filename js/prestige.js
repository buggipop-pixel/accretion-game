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

  // Кротовые норы увеличивают минимум: 20% / 30% / 50% обычных систем.
  // ★ Учитываем лучшую нору среди ВСЕХ прайм-систем, а не только активной.
  const wormPct = (typeof bestPrimeWormholePct === 'function') ? bestPrimeWormholePct() : 0;
  if (wormPct > 0) {
    const wormMin = Math.ceil(regularCount * wormPct);
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
  if (typeof isPrimeSystemData === 'function' ? isPrimeSystemData(sys) : sys.isPrime) return 9999999;
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
  // ★ явный массив требований: каждый следующий престиж должен быть быстрее,
  // поэтому шаг ~1.4, а не x2 (иначе 2-я галактика недостижима)
  const step = PRESTIGE_CFG.stepMultiplier || 1.4;
  let list;
  if (Array.isArray(PRESTIGE_CFG.requirements) && PRESTIGE_CFG.requirements.length) {
    list = PRESTIGE_CFG.requirements.slice();
  } else {
    const first = PRESTIGE_CFG.firstRequirement || 5;
    list = [];
    for (let i = 0; i < 5; i++) list.push(Math.round(first * Math.pow(step, i)));
  }
  // ★ Продлеваем лестницу за пределы явного массива.
  // Раньше требования заканчивались на 5-й сверхновой: на «Галактике 6»
  // checkPrestigeAvailability() всегда возвращал 0, а квест «До престижа»
  // пропадал из панели. Теперь лестница не заканчивается и квест виден всегда.
  const MIN_LEVELS = 100;
  while (list.length < MIN_LEVELS) {
    list.push(Math.round(list[list.length - 1] * step));
  }
  return list;
}

// Требование для конкретного уровня престижа (0 — первый престиж).
function prestigeRequirementFor(level) {
  const list = prestigeRequirements();
  const idx = Math.max(0, Math.floor(Number(level) || 0));
  return list[idx] || list[list.length - 1] || (PRESTIGE_CFG.firstRequirement || 5);
}

// ─── Проверка доступности престижа ───────────────────────────────
function checkPrestigeAvailability() {
  const need = prestigeRequirementFor(S.prestigeLevel || 0);
  if (need && S.systems >= need) return (S.prestigeLevel || 0) + 1;
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
  // ★ Множитель считается от уровня, а не домножается на старый сейв:
  //   так кривая сама «лечит» сохранения, сделанные до ребаланса.
  const curLevel = S.prestigeLevel || 0;
  const curMult = (typeof prestigeMultiplierFor === 'function')
    ? prestigeMultiplierFor(curLevel)
    : (S.galaxyMultiplier || 1);
  const nextMult = (typeof prestigeMultiplierFor === 'function')
    ? prestigeMultiplierFor(curLevel + 1)
    : curMult * (PRESTIGE_CFG.multiplierPerGalaxy || 1.3);
  const curForm = S.galaxyForm || 'spiral';
  const nextForm = GALAXY_FORMS[(GALAXY_FORMS.indexOf(curForm) + 1) % GALAXY_FORMS.length];

  // Предпросмотр сохранения.
  // ★ Прайм-системы (в т.ч. ВСЕ системы из сундуков) сохраняются всегда
  // и НЕ входят в лимит обычных систем. Считаем их отдельно, чтобы игрок
  // видел честную картину и не думал, что оплаченные системы сгорят.
  const otherList = S.otherSystems || [];
  let primeCount = S.primeSystem ? 1 : 0;
  let regularSystemsCount = 0;
  for (let i = 0; i < otherList.length; i++) {
    const sys = otherList[i];
    if (!sys || typeof sys !== 'object') continue;
    if (i === S.activeSystemIdx) {
      // Активная система после синхронизации уйдёт в лимит, если она не Прайм.
      if (!S.primeSystem) regularSystemsCount++;
      continue;
    }
    const sysIsPrime = (typeof isPrimeSystemData === 'function')
      ? isPrimeSystemData(sys)
      : !!(sys.isPrime || sys.primeData);
    if (sysIsPrime) primeCount++;
    else if (sys.planets) regularSystemsCount++;
  }
  const keepPreview = calculateKeepCount(regularSystemsCount);
  const survivingPreview = 1 + primeCount + keepPreview;
  const lostPreview = Math.max(0, regularSystemsCount - keepPreview);
  const wormholePct = (typeof bestPrimeWormholePct === 'function')
    ? Math.round(bestPrimeWormholePct() * 100)
    : 0;
  const wormholeNote = wormholePct > 0
    ? '<div class="row-stat"><span>🌀 Кротовая нора:</span><span>+' + wormholePct + '% обычных систем</span></div>'
    : '';
  const info = `
    <div class="info-box">
      <div class="row-stat"><span>Галактик:</span><span>${S.galaxies || 1} ➔ ${(S.galaxies || 1) + 1}</span></div>
      <div class="row-stat"><span>Множитель дохода:</span><span>×${curMult.toFixed(1)} ➔ ×${nextMult.toFixed(1)}</span></div>
      <div class="row-stat"><span>Форма галактики:</span><span>${formNames[curForm]} ➔ ${formNames[nextForm]}</span></div>
      <div class="row-stat"><span>Систем после:</span><span>${survivingPreview} (родная + ${primeCount} прайм + ${keepPreview} обычных)</span></div>
      <div class="row-stat"><span>Потеряется:</span><span>${lostPreview} обычных</span></div>
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

  // 2. Разделяем системы на Прайм и Обычные.
  //    ★ Прайм-системы сохраняются ВСЕГДА: независимо от лимита обычных
  //    систем, от того, какая система активна, и от флага isPrime в старых сейвах.
  const primeSystems = [];
  const regularSystems = [];
  const takenIdx = new Set();

  // 2a. Активная система (в т.ч. родная): если на ней есть Прайм-объект,
  //     она обязана выжить. Данные берём из живого состояния, а не из сейва.
  if (S.primeSystem) {
    // ★ Если Прайм стоит на активной системе, сохраняем САМ объект системы
    // (а не пересобранную копию), чтобы не потерять поля сундучной системы.
    const activeSys = (S.activeSystemIdx !== 0) ? S.otherSystems[S.activeSystemIdx] : null;
    const preservedActive = (activeSys && typeof activeSys === 'object') ? activeSys : {
      name: S.systemName || 'Родная',
      starType: S.starType,
      systemType: S.systemType,
      planets: (S.planets || []).slice(),
      incomeBonus: S.systemIncomeBonus || 0
    };
    preservedActive.name = preservedActive.name || S.systemName || 'Родная';
    preservedActive.planets = preservedActive.planets || (S.planets || []).slice();
    preservedActive.isPrime = true;
    preservedActive.primeData = S.primeSystem;
    primeSystems.push(preservedActive);
    takenIdx.add(S.activeSystemIdx);
  }

  // 2b. Все остальные системы, включая родную в otherSystems[0].
  for (let i = 0; i < S.otherSystems.length; i++) {
    if (takenIdx.has(i)) continue;
    const sys = S.otherSystems[i];
    if (!sys || typeof sys !== 'object') continue;

    const primeData = (typeof primeDataOfSystem === 'function')
      ? primeDataOfSystem(sys)
      : (sys.primeData || null);

    if (sys.isPrime || primeData || (typeof isPrimeSystemData === 'function' && isPrimeSystemData(sys))) {
      // ★ ПРАЙМ-СИСТЕМЫ СОХРАНЯЮТСЯ ВСЕГДА И НЕ СЧИТАЮТСЯ В ЛИМИТЕ
      sys.isPrime = true;
      if (primeData) sys.primeData = primeData;
      primeSystems.push(sys);
    } else if (sys.planets) {
      regularSystems.push({ sys: sys, rate: _systemRate(sys) });
    }
  }

  // 2c. Дубли Прайм-систем НЕ удаляем: каждая оплаченная система из сундука
  //     обязана выжить при вспышке, даже если объекты совпадают. Дубликат
  //     активной системы уже исключён через takenIdx выше.

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
    galaxyMultiplier: (typeof prestigeMultiplierFor === 'function')
      ? prestigeMultiplierFor(level)
      : (S.galaxyMultiplier || 1) * (PRESTIGE_CFG.multiplierPerGalaxy || 1.3),
    galaxyForm: GALAXY_FORMS[(GALAXY_FORMS.indexOf(S.galaxyForm || 'spiral') + 1) % GALAXY_FORMS.length],
    achievements: S.achievements || [],
    metalAmount: Math.floor((S.metalAmount || 0) * 0.5),
    unlockedAch: S.unlockedAch || {},
    stats: S.stats || {},
    dailyProgress: S.dailyProgress || {},
    dailyClaimed: S.dailyClaimed || {},
    lastDailyReset: S.lastDailyReset || 0,
    dailyReward: S.dailyReward || { day: 0, lastClaimed: 0 },
    // ★ Мировые события привязаны к реальному времени, а не к прогрессу.
    //   Вспышка не должна обнулять их таймеры и планировщик: иначе то же
    //   событие (например «День Раздора») выдаётся заново с новым сроком.
    activeWorldEvents: (Array.isArray(S.activeWorldEvents) ? S.activeWorldEvents : [])
      .filter(function(e) { return e && typeof e === 'object' && Number(e.endsAt) > Date.now(); })
      .map(function(e) { return Object.assign({}, e); }),
    lastDailyEventDay: Number(S.lastDailyEventDay) || 0,
    lastWeeklyEventWeek: Number(S.lastWeeklyEventWeek) || 0,
    weeklyEventPlan: S.weeklyEventPlan ? Object.assign({}, S.weeklyEventPlan) : null,
    firstNightShieldUsed: S.firstNightShieldUsed || false,
    techLevels: S.techLevels || { astro: 0, quantum: 0, cyber: 0, eng: 0 },
    prestigeLevel: level,
    storageLevels: Object.assign({ dust: 1, energy: 1, civ: 1 }, S.storageLevels),
    storageProgress: Object.assign({ dust: 0, energy: 0, civ: 0 }, S.storageProgress),
    // ★ Цена систем после Вспышки считается от ВЫЖИВШИХ систем, а не от пика
    //   до сброса. Иначе игрок платит за систему по цене бывшей империи,
    //   имея доход в 2-6 раз меньше: престиж превращался в ловушку.
    //   Выжившие системы уже оплачены — их номер и есть новая нижняя граница.
    systemCostFloor: Math.max(0, kept.length),
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
  const nextNeed = prestigeRequirementFor(S.prestigeLevel || 0);
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
  // Кнопку кладём в нижний док отдельной строкой над фазой/миссиями:
  // так её не перекрывает панель квестов и она всегда доступна для тапа.
  const hud = document.querySelector('.hud-dock') || document.querySelector('.hud');
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
window.prestigeRequirementFor = prestigeRequirementFor;
window.checkPrestigeAvailability = checkPrestigeAvailability;
window.activateSupernova = activateSupernova;
window.performSupernova = performSupernova;
window.updatePrestigeButton = updatePrestigeButton;
window.initPrestige = initPrestige;
window.calculateKeepCount = calculateKeepCount;