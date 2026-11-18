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

// ─── Прайм-реликвии и текущий макро-объект ───────────────────────
// Лучшая Прайм-система определяется по редкости объекта, а не по доходу:
// primeBH > superBH > massiveBH > blackHole > ...
const _PREMIUM_RARITY_FALLBACK = {
  primeBH: 100, superBH: 90, massiveBH: 80, blackHole: 70, quasar: 65,
  wormhole3: 60, magnetar: 55, pulsar: 50, wormhole2: 45, wormhole: 40,
  darkMatter: 30, gravLens: 20, quarkVoid: 10,
};

function _primeDataOfSystem(sys) {
  if (!sys || typeof sys !== 'object') return null;
  if (typeof primeDataOfSystem === 'function') {
    const data = primeDataOfSystem(sys);
    if (data) return data;
  }
  return sys.primeData || sys.primeSystem || null;
}

function _primeRarityOfSystem(sys) {
  const data = _primeDataOfSystem(sys);
  if (!data) return 0;
  if (typeof primeObjectRank === 'function') return primeObjectRank(data.objectKey);
  return _PREMIUM_RARITY_FALLBACK[data.objectKey] || 1;
}

// Название макро-объекта, который будет потерян при вспышке.
function currentMacroObjectName() {
  const total = Math.max(1, Number(S.totalSystemsCreated) || 1);
  if (typeof galaxyLodForTotal !== 'function' || typeof galaxyGroupSizeForLevel !== 'function') {
    return 'Галактику (' + total + ' сист.)';
  }
  const lvl = galaxyLodForTotal(total);
  if (lvl >= 4) return 'Звёздное поле (' + total + ' сист.)';
  const size = galaxyGroupSizeForLevel(lvl);
  const count = Math.max(1, Math.ceil(total / size));
  const name = (typeof galaxyMacroName === 'function')
    ? galaxyMacroName(lvl, count - 1)
    : (((typeof galaxyLodMeta === 'function' ? galaxyLodMeta(lvl) : null) || {}).label || 'Объект');
  return name + ' (' + total + ' сист.)';
}

// Лучшая Прайм-система (по редкости) среди активной и остальных.
function findBestPrimeSystemData() {
  let best = null;
  let bestRank = 0;
  if (S.primeSystem) {
    const rank = _primeRarityOfSystem({ primeData: S.primeSystem });
    if (rank > bestRank) {
      bestRank = rank;
      best = { data: S.primeSystem, rank: rank, name: S.systemName || 'Родная', active: true };
    }
  }
  const list = Array.isArray(S.otherSystems) ? S.otherSystems : [];
  for (let i = 0; i < list.length; i++) {
    const sys = list[i];
    const data = _primeDataOfSystem(sys);
    if (!data) continue;
    const rank = _primeRarityOfSystem(sys);
    if (rank > bestRank) {
      bestRank = rank;
      best = { data: data, rank: rank, name: (sys && sys.name) || ('Система ' + (i + 1)), active: false };
    }
  }
  return best;
}

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
// ★ Старый рандом: от 1.5·√N до N обычных систем. Норы поднимают
//   нижнюю границу (20/30/50%). Окно показывает диапазон, а точное
//   число фиксируется броском при подтверждении — превью и результат
//   больше не расходятся.
function calculateKeepRange(regularCount) {
  const n = Math.max(0, Math.floor(Number(regularCount) || 0));
  if (n <= 0) return { min: 0, max: 0 };
  let min = Math.max(1, Math.floor(Math.sqrt(n) * 1.5));
  const wormPct = (typeof bestPrimeWormholePct === 'function') ? bestPrimeWormholePct() : 0;
  if (wormPct > 0) min = Math.max(min, Math.ceil(n * wormPct));
  min = Math.min(min, n);
  return { min: min, max: n };
}

function rollKeepCount(regularCount) {
  const range = calculateKeepRange(regularCount);
  if (range.max <= 0) return 0;
  return range.min + Math.floor(Math.random() * (range.max - range.min + 1));
}

// Совместимость для внешних вызовов: детерминированная «середина».
function calculateKeepCount(regularCount) {
  const n = Math.max(0, Math.floor(Number(regularCount) || 0));
  if (n <= 0) return 0;
  return Math.min(n, Math.max(1, Math.floor(Math.sqrt(n) * 2)));
}
window.calculateKeepRange = calculateKeepRange;
window.rollKeepCount = rollKeepCount;
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
// Лестница вспышек синхронизирована с макро-фазами: 10, 22, 35, 50…
function prestigeRequirements() {
  // ★ явный массив требований: каждый следующий престиж должен быть быстрее,
  // ★ явный массив требований: внутри каждой фазы три вспышки,
  //   рубежи 10/50/150/450 — всегда вспышки, шаг ~1.5.
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

// ★ Макро-рубеж, на котором стоит игрок: 10 / 50 / 150, затем каждые 450.
//   На этих рубежах Вспышка должна быть доступна даже тем, кто «пересидел»
//   лестницу требований (старые сейвы с высоким prestigeLevel).
function prestigeMilestoneFor(systems) {
  const n = Math.max(0, Math.floor(Number(systems) || 0));
  if (n >= 450) return Math.floor(n / 450) * 450;
  if (n >= 150) return 150;
  if (n >= 50) return 50;
  if (n >= 10) return 10;
  return 0;
}

// Догоняющее требование: рубеж, если обычное требование лестницы
// для текущего уровня выше, чем системы. 0 — догоняющая не нужна.
// Рубеж срабатывает один раз: после вспышки он запоминается
// в S.prestigeCatchupMilestone и больше бесплатных вспышек не даёт.

// Ступень лестницы: уровень вспышек минус догоняющие вспышки.
// Догоняющая даёт уровень/множитель, но не сдвигает требование вперёд —
// иначе после неё следующий порог прыгал бы через ступень.
function prestigeTierFor() {
  const level = Math.max(0, Math.floor(Number(S.prestigeLevel) || 0));
  const catchups = Math.min(level, Math.max(0, Math.floor(Number(S.prestigeCatchupCount) || 0)));
  return Math.max(0, level - catchups);
}
// ★ Требование-пол: после Вспышки следующий порог не может быть ниже того,
//   сколько систем было у игрока на её момент (плюс запас роста). Иначе на
//   остатках (например 1000 → 500) следующая Вспышка доступна сразу же
//   и уровни прокручиваются подряд. Каждая Вспышка — разовое действие.
function prestigeRequirementFloor() {
  const floor = Math.ceil(Number(S.prestigeRequirementFloor) || 0);
  return Number.isFinite(floor) && floor > 0 ? floor : 0;
}
window.prestigeRequirementFloor = prestigeRequirementFloor;

// ★ Сколько систем реально уничтожено: было минус осталось.
//   Раньше в итог шёл только счётчик обычных: игрок с 1000 системами видел
//   «уничтожено 385», хотя сохранилось 500 — числа не сходились.
function prestigeDestroyedTotal(systemsBefore, totalSystemsAfter) {
  const before = Math.max(0, Math.round(Number(systemsBefore) || 0));
  const after = Math.max(0, Math.round(Number(totalSystemsAfter) || 0));
  return Math.max(0, before - after);
}
window.prestigeDestroyedTotal = prestigeDestroyedTotal;

function prestigeCatchupNeed() {
  const systems = Math.max(0, Number(S.systems) || 0);
  const milestone = prestigeMilestoneFor(systems);
  // Догоняющая только у крупных рубежей и только рядом с ними.
  if (!milestone || milestone < 50) return 0;
  if (systems > milestone * 1.2) return 0;
  const used = Math.max(0, Number(S.prestigeCatchupMilestone) || 0);
  if (used >= milestone) return 0;
  // Требование-пол выше рубежа — рубеж уже пройден, а не «догоняется».
  if (prestigeRequirementFloor() > milestone) return 0;
  const base = prestigeRequirementFor(prestigeTierFor());
  return base > systems ? milestone : 0;
}

// Требование, которое реально проверяет игра (с учётом догоняющей вспышки
// и требования-пола после прошлой Вспышки).
function nextPrestigeRequirement() {
  const catchup = prestigeCatchupNeed();
  const base = catchup || prestigeRequirementFor(prestigeTierFor());
  return Math.max(base, prestigeRequirementFloor());
}

// ─── Проверка доступности престижа ───────────────────────────────
function checkPrestigeAvailability() {
  const need = nextPrestigeRequirement();
  if (need && S.systems >= need) return (S.prestigeLevel || 0) + 1;
  return 0;
}
// ═══════════════════════════════════════════════════════════════
//  МОДАЛКА ПОДТВЕРЖДЕНИЯ
// ═══════════════════════════════════════════════════════════════
function activateSupernova() {
  const availableLevel = checkPrestigeAvailability();
  if (!availableLevel) {
    const need = nextPrestigeRequirement();
    const systems = Math.max(0, Number(S.systems) || 0);
    toast('Вспышка Сверхновой', need
      ? ('Нужно ' + need + ' систем — сейчас ' + systems)
      : 'Недостаточно систем для престижа');
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
  // ★ Собираем Прайм-системы так же, как это сделает performSupernova,
  //   чтобы предпросмотр совпал с реальностью (включая слияние дублей).
  const previewPrimes = [];
  let regularSystemsCount = 0;
  if (S.primeSystem) previewPrimes.push({ primeData: S.primeSystem });
  for (let i = 0; i < otherList.length; i++) {
    const sys = otherList[i];
    if (!sys || typeof sys !== 'object') continue;
    const sysIsPrime = (typeof isPrimeSystemData === 'function')
      ? isPrimeSystemData(sys)
      : !!(sys.isPrime || sys.primeData);
    if (i === S.activeSystemIdx) {
      // Активная система синхронизируется с живым состоянием: её Прайм уже
      // учтён через S.primeSystem выше, иначе она уйдёт в лимит обычных.
      if (!S.primeSystem) regularSystemsCount++;
      continue;
    }
    if (sysIsPrime) previewPrimes.push(sys);
    else if (sys.planets) regularSystemsCount++;
  }
  // ★ Дубли складываются в более редкий объект — окно показывает результат.
  const mergedPreview = (typeof mergeDuplicatePrimeSystems === 'function')
    ? mergeDuplicatePrimeSystems(previewPrimes, { clone: true })
    : previewPrimes;
  const primeCount = mergedPreview.length;
  // Сколько пар дублей сложилось в объект выше рангом (для честного окна).
  const mergedUpdates = Math.max(0, previewPrimes.length - primeCount);
  const keepRange = (typeof calculateKeepRange === 'function')
    ? calculateKeepRange(regularSystemsCount)
    : { min: regularSystemsCount, max: regularSystemsCount };
  const survivingMin = 1 + primeCount + keepRange.min;
  const survivingMax = 1 + primeCount + keepRange.max;
  const lostMin = Math.max(0, regularSystemsCount - keepRange.max);
  const lostMax = Math.max(0, regularSystemsCount - keepRange.min);
  const wormholePct = (typeof bestPrimeWormholePct === 'function')
    ? Math.round(bestPrimeWormholePct() * 100)
    : 0;
  const wormholeNote = wormholePct > 0
    ? '<div class="row-stat"><span>🌀 Кротовая нора:</span><span>+' + wormholePct + '% обычных систем</span></div>'
    : '';
  const mergeNote = mergedUpdates > 0
    ? '<div class="row-stat"><span>💠 Дубли Прайм:</span><span>сливаются в более редкие (' + mergedUpdates + ')</span></div>'
    : '';
  const gainSing = Math.floor((Number(S.systems) || 1) / 10);
  const macroName = (typeof currentMacroObjectName === 'function')
    ? currentMacroObjectName() : ('Галактику (' + (S.systems || 1) + ' сист.)');
  const bestPrime = findBestPrimeSystemData();
  const bestPrimeNote = bestPrime
    ? '<div class="row-stat"><span>👑 Лучшая Прайм:</span><span>' + bestPrime.name +
      ' · ' + ((bestPrime.data && bestPrime.data.objectName) || bestPrime.data.objectKey || 'реликвия') + '</span></div>'
    : '';
  const catchupNeed = (typeof prestigeCatchupNeed === 'function') ? prestigeCatchupNeed() : 0;
  const catchupNote = catchupNeed
    ? '<div class="row-stat"><span>⭐ Догоняющая:</span><span>на рубеже ' + catchupNeed + ' систем</span></div>'
    : '';
  const tierNow = (typeof prestigeTierFor === 'function') ? prestigeTierFor() : (S.prestigeLevel || 0);
  const nextTier = catchupNeed ? tierNow : (tierNow + 1);
  const nextReq = (typeof prestigeRequirementFor === 'function')
    ? prestigeRequirementFor(nextTier) : 0;
  const nextReqPhase = (nextReq && typeof galaxyPhaseFor === 'function')
    ? galaxyPhaseFor(nextReq) : null;
  const info = `
    <div class="info-box">
      <div class="row-stat"><span>Галактик:</span><span>${S.galaxies || 1} ➔ ${(S.galaxies || 1) + 1}</span></div>
      <div class="row-stat"><span>Множитель дохода:</span><span>×${curMult.toFixed(1)} ➔ ×${nextMult.toFixed(1)}</span></div>
      <div class="row-stat"><span>Следующая Вспышка:</span><span>${nextReq} систем${nextReqPhase ? ' · ' + nextReqPhase.title : ''}</span></div>
      ${catchupNote}
      <div class="row-stat"><span>Форма галактики:</span><span>${formNames[curForm]} ➔ ${formNames[nextForm]}</span></div>
      <div class="row-stat"><span>Систем после:</span><span>${survivingMin}–${survivingMax} (родная + ${primeCount} прайм + ${keepRange.min}–${keepRange.max} обычных)</span></div>
      <div class="row-stat"><span>Потеряется:</span><span>${lostMin}–${lostMax} обычных</span></div>
      ${wormholeNote}
      ${mergeNote}
      ${bestPrimeNote}
      <div class="row-stat"><span>Текущий объект:</span><span>${macroName}</span></div>
      <div class="row-stat"><span>Сингулярности:</span><span>+${gainSing} (всего ${(Number(S.singularities)||0) + gainSing})</span></div>
      <div class="row-stat"><span>Металлы:</span><span>останется 50%</span></div>
      <div class="row-stat"><span>Хранилище:</span><span>сохраняется</span></div>
      <div class="row-stat" style="color:#ff5e5e;"><span>Сборка планет:</span><span>отключится</span></div>
    </div>
    <div class="modal-sub" style="color:#ff5e5e;font-weight:bold;">
      Вы можете потерять ${macroName}! Но получите ${gainSing} Сингулярностей и сохраните лучшую Прайм-систему.<br>
      Точное число систем после вспышки определит бросок.<br>
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

  // 2c. Дубли Прайм-объектов складываются в более редкий объект:
  //     две ЧД → Массивная ЧД → Сверхмассивная ЧД → Первичная ЧД;
  //     две Малые кротовые норы → Кротовая нора → Гигантская кротовая нора.
  //     Оплаченная система не сгорает — она переходит в улучшение.
  if (typeof mergeDuplicatePrimeSystems === 'function') {
    mergeDuplicatePrimeSystems(primeSystems);
  }

  // 2d. Лучшая Прайм-система — первой, чтобы попасть в otherSystems[1].
  //     Редкость важнее дохода: primeBH > superBH > massiveBH > ...
  primeSystems.sort(function(a, b) {
    return _primeRarityOfSystem(b) - _primeRarityOfSystem(a);
  });
  // 3. Считаем лимит ТОЛЬКО для обычных систем
  const keepRegularCount = (typeof rollKeepCount === 'function')
    ? rollKeepCount(regularSystems.length)
    : calculateKeepCount(regularSystems.length);

  // 4. Сортируем и отбираем лучшие обычные системы
  regularSystems.sort(function(a, b) { return b.rate - a.rate; });
  const keptRegulars = regularSystems.slice(0, keepRegularCount).map(function(e) { return e.sys; });

  // 5. Итоговый список сохраненных: ВСЕ Праймы + лучшие Обычные
  const kept = [...primeSystems, ...keptRegulars];
  const totalSystemsAfter = 1 + kept.length;
  // «Обычных уничтожено» — для строки подробностей.
  const destroyedRegular = Math.max(0, regularSystems.length - keepRegularCount);
  const savedPct = regularSystems.length > 0
    ? Math.round((keepRegularCount / regularSystems.length) * 100)
    : 100;
  const systemsBefore = S.systems;
  // ★ Итоговая статистика — по тому, сколько систем было и сколько осталось.
  //   Раньше в заголовок шёл только счётчик обычных: игрок с 1000 системами
  //   видел «уничтожено 385», хотя сохранилось 500 — числа не сходились.
  const destroyedTotal = prestigeDestroyedTotal(systemsBefore, totalSystemsAfter);
  const gainedSingularities = Math.floor(Math.max(0, Number(systemsBefore) || 0) / 10);
  const oldPanX = Number(S.panX) || 0;
  const oldPanY = Number(S.panY) || 0;
  const oldZoom = Math.max(0.00001, Number(S.zoom) || 1);
  const oldCenterX = -oldPanX / oldZoom;
  const oldCenterY = -oldPanY / oldZoom;

  // ★ Догоняющая вспышка: запоминаем рубеж, на котором она случилась,
  //   чтобы он не давал бесконечные вспышки (см. prestigeCatchupNeed).
  const systemsNow = Math.max(0, Number(S.systems) || 0);
  const milestoneNow = (typeof prestigeMilestoneFor === 'function') ? prestigeMilestoneFor(systemsNow) : 0;
  const catchupMilestone = (typeof prestigeCatchupNeed === 'function') ? prestigeCatchupNeed() : 0;
  const catchupCountNext = Math.max(0, Math.floor(Number(S.prestigeCatchupCount) || 0)) +
    (catchupMilestone ? 1 : 0);
  // ★ Любая вспышка закрывает все пройденные макро-рубежи, а не только тот,
  //   у которого игрок стоит. Иначе вспышка на 225 систем оставляла рубеж 150
  //   неотмеченным: если после неё выживало ≥150 систем, догоняющая Вспышка
  //   на 150 становилась доступна сразу же (две вспышки почти подряд).
  const markMilestone = Math.max(catchupMilestone || 0, milestoneNow || 0);

  // ★ Следующая Вспышка — только после реального роста империи.
  //   Пол = системы на момент вспышки × запас (1.2). При нормальной игре
  //   у порога лестницы это ничего не меняет (и так ×1.5), а при «пересидении»
  //   не даёт прокрутить несколько уровней на остатках.
  const growthFloor = Number(PRESTIGE_CFG.minGrowthBetweenPrestiges) || 1.2;
  const requirementFloorNext = Math.max(
    Math.ceil(Number(S.prestigeRequirementFloor) || 0),
    Math.ceil(systemsNow * growthFloor)
  );

  // 6. Что переносится между галактиками
  const keep = {
    galaxies: (S.galaxies || 1) + 1,
    galaxyMultiplier: (typeof prestigeMultiplierFor === 'function')
      ? prestigeMultiplierFor(level)
      : (S.galaxyMultiplier || 1) * (PRESTIGE_CFG.multiplierPerGalaxy || 1.3),
    galaxyForm: GALAXY_FORMS[(GALAXY_FORMS.indexOf(S.galaxyForm || 'spiral') + 1) % GALAXY_FORMS.length],
    achievements: S.achievements || [],
    singularities: (Number(S.singularities) || 0) + gainedSingularities,
    // ★ Космический след: координаты старого центра + 10 минут жизни.
    cosmicTrail: { x: oldCenterX, y: oldCenterY, start: Date.now(), duration: 600000 },
    galaxyZoomLevel: (typeof galaxyLodForTotal === 'function')
      ? galaxyLodForTotal(1 + kept.length) : 4,
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
    // ★ Щит куплен за звёзды и живёт по абсолютной метке времени:
    //   вспышка не должна сжигать остаток оплаченного щита.
    shieldUntil: Math.max(0, Number(S.shieldUntil) || 0),
    techLevels: S.techLevels || { astro: 0, quantum: 0, cyber: 0, eng: 0 },
    prestigeLevel: level,
    prestigeCatchupCount: catchupCountNext,
    prestigeCatchupMilestone: Math.max(Number(S.prestigeCatchupMilestone) || 0, markMilestone || 0),
    prestigeRequirementFloor: requirementFloorNext,
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
    S.galaxyZoomLevel = (typeof galaxyLodForTotal === 'function')
      ? galaxyLodForTotal(S.totalSystemsCreated) : S.galaxyZoomLevel;
    S.galaxyFocus = null; S.galaxyManualLod = false;

    if (kept.length > 0) {
      // ★ Сохраняем ЛУЧШУЮ Прайм-систему: она уже стоит первой в kept,
      //   то есть в otherSystems[1]. Иначе — самая доходная обычная.
      let bestIdx = 1;
      if (primeSystems.length === 0) {
        let bestRate = -1;
        for (let i = 1; i < S.otherSystems.length; i++) {
          const r = _systemRate(S.otherSystems[i]);
          if (r > bestRate) { bestRate = r; bestIdx = i; }
        }
      }
      if (typeof switchToSystem === 'function') switchToSystem(bestIdx);
    }

    S.stage = 'galaxy';
    if (typeof initParticles === 'function') initParticles();
    if (typeof triggerSupernovaFlash === 'function') triggerSupernovaFlash();
    if (typeof logPrestige === 'function') logPrestige(S.galaxies, S.galaxyMultiplier);
    if (typeof playSFX === 'function') playSFX('prestige');
    saveGame();
    // Даём вспышке погаснуть и показываем итог броска.
    setTimeout(showPrestigeResult, 650);
  }, 1500);
  let pushStarted = false;

  function showPrestigeResult() {
    if (typeof buildModal !== 'function' || typeof setModal !== 'function') {
      startPrestigePush();
      return;
    }
    const modal = document.getElementById('modal');
    if (!modal) { startPrestigePush(); return; }

    const good = savedPct >= 70;
    const title = good
      ? '🎉 Поздравляем! Вспышка почти не нанесла ущерба'
      : '💥 Вспышка уничтожила ' + destroyedTotal + ' систем';
    const sub = 'Сохранено ' + keepRegularCount + ' из ' + regularSystems.length +
      ' обычных (' + savedPct + '%)';
    const text = good
      ? '<div class="modal-sub" style="color:#7ee0a8;font-weight:bold;line-height:1.6;">Поздравляем! Вспышка сверхновой почти не нанесла ущерба — сохранилось <b>' + totalSystemsAfter + '</b> систем.</div>'
      : '<div class="modal-sub" style="color:#ff8a8a;font-weight:bold;line-height:1.6;">Вспышка уничтожила <b>' + destroyedTotal + '</b> систем. Из остатков звёзд и пыли сформировалось <b>' + totalSystemsAfter + '</b> систем.</div>';
    const oldMultiplier = (typeof prestigeMultiplierFor === 'function')
      ? prestigeMultiplierFor(Math.max(0, level - 1))
      : (S.galaxyMultiplier || 1);
    const info = `
      <div class="info-box">
        <div class="row-stat"><span>Обычных сохранено:</span><span>${keepRegularCount} из ${regularSystems.length} (${savedPct}%)</span></div>
        <div class="row-stat"><span>Уничтожено:</span><span>${destroyedTotal}</span></div>
        <div class="row-stat"><span>Обычных уничтожено:</span><span>${destroyedRegular}</span></div>
        <div class="row-stat"><span>Всего систем после:</span><span>${totalSystemsAfter} (родная + ${primeSystems.length} прайм + ${keepRegularCount} обычных)</span></div>
        <div class="row-stat"><span>Сингулярности:</span><span>+${gainedSingularities} (всего ${Number(S.singularities) || 0})</span></div>
        <div class="row-stat"><span>Множитель дохода:</span><span>×${oldMultiplier.toFixed(1)} ➔ ×${(S.galaxyMultiplier || 1).toFixed(1)}</span></div>
      </div>
      ${text}
    `;
    const choices = [{
      id: 'continue',
      name: 'Продолжить',
      desc: 'Формирование новой галактики',
      color: good ? '#2eaa77' : '#ff7500',
      icon: good ? '🎉' : '💥'
    }];
    let html = buildModal(title, sub, choices);
    html = html.replace('<div class="choices">', info + '<div class="choices">');

    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      if (modal.classList && modal.classList.contains('show') && typeof closeEvolutionModal === 'function') closeEvolutionModal();
      startPrestigePush();
    }
    function onBackdrop(e) { if (e.target === modal) setTimeout(finish, 0); }
    function onKey(e) { if (e.key === 'Escape') setTimeout(finish, 0); }
    setModal(html, { continue: finish });
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  }

  function startPrestigePush() {
    if (pushStarted) return;
    pushStarted = true;
    if (S.vis) S.vis.prestigeAnim = { start: performance.now() - 2000, phase: 'push' };
    setTimeout(function () {
      if (S.vis) S.vis.prestigeAnim = null;
      const good = savedPct >= 70;
      const sub = good
        ? 'Почти без потерь: ' + totalSystemsAfter + ' систем · +' + gainedSingularities + ' ✨ · ×' + (S.galaxyMultiplier || 1).toFixed(1)
        : 'Уничтожено ' + destroyedTotal + ' · осталось ' + totalSystemsAfter + ' систем · +' + gainedSingularities + ' ✨';
      toast(good ? '🎉 Удача! Вспышка почти не нанесла ущерба'
                 : '💥 Вспышка уничтожила ' + destroyedTotal + ' систем', sub);
      if (typeof updateUI === 'function') updateUI();
      if (typeof updateSystemSwitcher === 'function') updateSystemSwitcher();
      saveGame();
    }, 1500);
  }
}
// ─── Состояние кнопки престижа (без DOM — удобно для тестов) ───
// Кнопка видна только когда Вспышка доступна; в остальное время
// прогресс до следующего порога показывают квесты (панель квестов).
function prestigeButtonState() {
  const availableLevel = checkPrestigeAvailability();
  const order = ['первая', 'вторая', 'третья', 'четвёртая', 'пятая'];
  if (availableLevel) {
    return {
      visible: true,
      text: '💥 ВСПЫШКА СВЕРХНОВОЙ',
      title: 'Доступна ' + (order[availableLevel - 1] || availableLevel + '-я') +
        ' вспышка (уровень ' + availableLevel + ')'
    };
  }
  return { visible: false, text: '', title: '' };
}

// ─── Обновление кнопки престижа в UI ───────────────────────────
function updatePrestigeButton() {
  const prestigeBtn = document.getElementById('prestigeBtn');
  if (!prestigeBtn) return;

  const state = prestigeButtonState();
  if (!state.visible) {
    prestigeBtn.style.display = 'none';
    return;
  }

  prestigeBtn.style.display = 'block';
  prestigeBtn.textContent = state.text;
  prestigeBtn.title = state.title;
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
window.prestigeMilestoneFor = prestigeMilestoneFor;
window.prestigeCatchupNeed = prestigeCatchupNeed;
window.nextPrestigeRequirement = nextPrestigeRequirement;
window.prestigeTierFor = prestigeTierFor;
window.activateSupernova = activateSupernova;
window.performSupernova = performSupernova;
window.updatePrestigeButton = updatePrestigeButton;
window.prestigeButtonState = prestigeButtonState;
window.initPrestige = initPrestige;
window.calculateKeepCount = calculateKeepCount;
