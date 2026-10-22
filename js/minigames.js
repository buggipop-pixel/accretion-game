// ═══════════════════════════════════════════════════════════════
//  MINIGAMES.JS — мини-игра «Сборка планеты» (assemble)
//
//  Зависимости: state.js (S), config.js (PLANET_TYPES, getAllowedTypesForSystem)
//  Экспортирует: startMinigame, updateMinigame, drawMinigame,
//                mgPointerDown, mgPointerMove, mgPointerUp, MG
//
//  ФИЧА 6.5: миниигры mass и ignite перенесены в основной процесс
//  (см. particles.js → updatePhaseProgress / registerProtostarTap).
//  Здесь остаётся только assemble — сборка планеты, вызывается
//  из evolution.js при переходе IV→V и в фазе V.
//
//  Изменения сессии 2026-10-14 (ч.3):
//    • Удалены MG_VORTEX, MG_IGNITE, updateMass, drawMass,
//      updateIgnite, drawIgnite, MG.particles, MG.power, MG.elapsedSec
//    • + Патч 5: «Пропустить ▸» только после первого прохождения
//    • + Общие поля MG сокращены до необходимого для assemble
// ═══════════════════════════════════════════════════════════════

const MG = {
  type: null,
  startAt: 0,
  onComplete: null,
  progress: 0,

  // Drag
  dragX: 0, dragY: 0, dragActive: false, trail: [],
  grabbedIndex: -1,
  grabbed: null,

  // Assemble
  fieldParticles: [],
  fieldHalfW: 300, fieldHalfH: 200,
  startDistMin: 150, startDistMax: 220,
  sparks: [],
  result: null, resultLabel: null,
  finishAt: 0, elapsedSec: 0,
};

// ─── Параметры сборки планеты ───────────────────────────────────
// colorsPerType = 4 → всего 16 шаров (по 4 каждого цвета).
// 4 одинаковых → планета; 4 разных → Земля.
const MG_ASSEMBLE = {
  duration: 30,
  fingerRadius: 140,
  fingerForce: 2400,
  baseRadius: 18,
  radiusStep: 6,
  minBetweenDist: 120,
  mergeDist: 3,
  finishDelay: 1500,
  colorsPerType: 4,
};

// Цвета: 🔵 лёд, 🔴 лава, 🟢 камень, 🟡 газ
const ASSEMBLE_TYPES = {
  ice:   { color: '#3b9eff', glow: 'rgba(59,158,255,0.8)', name: 'Лёд',    planet: 'iceGiant' },
  lava:  { color: '#ff2d2d', glow: 'rgba(255,45,45,0.8)',  name: 'Лава',   planet: 'lava' },
  stone: { color: '#00e639', glow: 'rgba(0,230,57,0.8)',   name: 'Камень', planet: 'rocky' },
  gas:   { color: '#ffd633', glow: 'rgba(255,214,51,0.8)', name: 'Газ',    planet: 'gasGiant' },
};

// ═══════════════════════════════════════════════════════════════
//  ЗАПУСК
// ═══════════════════════════════════════════════════════════════
function startMinigame(type, onComplete) {
  // Патч 5.1: помечаем, что миниигра запускалась
  if (!S.seenMinigame) S.seenMinigame = {};
  S.seenMinigame[type] = true;

  MG.type = type;
  MG.startAt = performance.now();
  MG.onComplete = onComplete;
  MG.progress = 0;
  MG.dragActive = false;
  MG.grabbedIndex = -1;
  MG.trail = [];
  MG.finishAt = 0;
  MG.sparks = [];
  MG.fieldParticles = [];
  MG.result = null;
  MG.resultLabel = null;

  // Скрываем кнопку «Эволюция» — во время миниигры она не нужна
  const evolveBtnEl = document.getElementById('evolveBtn');
  if (evolveBtnEl) evolveBtnEl.classList.remove('show');

  if (type === 'assemble') {
    initAssembleField();

    // ★ Все орбиты заняты — сборка невозможна.
    // Вызываем endMinigame(false) — иначе промис повиснет,
    // ресурсы не вернутся, и игрок залипнет на пустом поле.
    if (MG.fieldParticles.length === 0) {
      if (typeof toast === 'function') {
        toast('Система заполнена', 'Все доступные орбиты заняты планетами');
      }
      endMinigame(false);
      return;
    }
  }

  S.activeMinigame = type;
  const modal = document.getElementById('modal');
  if (modal) modal.classList.remove('show');
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

  // ═══════════════════════════════════════════════════════════════
  //  ФИЛЬТР ЦВЕТОВ — только реально размещаемые планеты
  //  Правило: цвет доступен, если его планета влезет на свободную
  //  орбиту. Земля — отдельно: только если все 4 цвета уже доступны.
  // ═══════════════════════════════════════════════════════════════
  const COLOR_TO_PLANET = {
    ice:   'iceGiant',
    lava:  'lava',
    stone: 'rocky',
    gas:   'gasGiant',
  };

   const canPlacePlanet = function(planetKey) {
    if (!S.planets) return false;
    // Отсеиваем невидимые/битые планеты, у которых нет нормальных координат
    const validPlanets = S.planets.filter(p => p && typeof p === 'object' && isFinite(p.baseOrbitR));
    if (validPlanets.length >= 8) return false;
    
    if (typeof getAllowedOrbitsForType !== 'function' || typeof getOrbitR !== 'function') return false;
    const orbits = getAllowedOrbitsForType(S.starType, planetKey);
    if (!orbits || orbits.length === 0) return false;
    const gap = ORBIT_GEOMETRY.minGap;
    
    for (let oi = 0; oi < orbits.length; oi++) {
      const orbitR = getOrbitR(orbits[oi]);
      let free = true;
      for (let pi = 0; pi < validPlanets.length; pi++) {
        if (Math.abs(validPlanets[pi].baseOrbitR - orbitR) < gap) {
          free = false; break;
        }
      }
      if (free) return true;
    }
    return false;
  };

  // Собираем только те цвета, чьи планеты реально разместятся
  const allColors = ['ice', 'lava', 'stone', 'gas'];
  const allowedColors = [];
  const allowedPlanets = [];

  for (let ci = 0; ci < allColors.length; ci++) {
    const color = allColors[ci];
    const planetKey = COLOR_TO_PLANET[color];
    if (canPlacePlanet(planetKey)) {
      allowedColors.push(color);
      if (allowedPlanets.indexOf(planetKey) === -1) {
        allowedPlanets.push(planetKey);
      }
    }
  }

  // Земля — только если все 4 цвета уже доступны + есть орбита под superEarth
  if (allowedColors.length === 4 && canPlacePlanet('superEarth')) {
    if (allowedPlanets.indexOf('superEarth') === -1) {
      allowedPlanets.push('superEarth');
    }
  }

  // Fallback: если совсем ничего не разместить (все орбиты заняты),
  // оставляем пустой список — UI покажет «Система заполнена»,
  // а игрок не сможет начать сборку.
  MG.availableColors = allowedColors.slice();
  MG.allowedPlanets = allowedPlanets;

  // Если разместить нечего — выходим, миниигру не запускаем
  if (allowedColors.length === 0) {
    MG.fieldParticles = [];
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  //  РАЗМЕЩЕНИЕ ШАРОВ — хаотично по полю
  // ═══════════════════════════════════════════════════════════════
  const types = allowedColors;
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

// ═══════════════════════════════════════════════════════════════
//  ЗАВЕРШЕНИЕ
// ═══════════════════════════════════════════════════════════════
function endMinigame(success) {
  const cb = MG.onComplete;
  const type = MG.type;
  MG.type = null;
  S.activeMinigame = null;
  // Патч 5.3: помечаем, что миниигра пройдена (для кнопки «Пропустить»)
  if (type && S.seenMinigame) S.seenMinigame[type + '_shown'] = true;
  if (cb) cb(success);
}

// ═══════════════════════════════════════════════════════════════
//  ОБНОВЛЕНИЕ
// ═══════════════════════════════════════════════════════════════
function updateMinigame(dt, time) {
  const cx = window.CANVAS_CX || 0, cy = window.CANVAS_CY || 0;
  const elapsed = (performance.now() - MG.startAt) / 1000;

  for (let i = MG.trail.length - 1; i >= 0; i--) {
    MG.trail[i].age += dt;
    if (MG.trail[i].age > 0.7) MG.trail.splice(i, 1);
  }
  for (let i = MG.sparks.length - 1; i >= 0; i--) {
    const s = MG.sparks[i];
    s.age += dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= 0.92;
    s.vy *= 0.92;
    if (s.age > s.life) MG.sparks.splice(i, 1);
  }

  if (MG.type === 'assemble') updateAssemble(dt, elapsed, cx, cy);
}

// ═══════════════════════════════════════════════════════════════
//  ПРАВИЛА СЛИЯНИЯ
//  mono tier 1 + mono tier 1 (тот же) → mono tier 2
//  mono tier 2 + mono tier 2 (тот же) → mono tier 3 → финал (mass=4)
//  mono 1 + mono 1 (разный)           → 2-цветный (mass 2)
//  multi + mono 1 (новый цвет)        → multi + 1 (mass +1)
// ═══════════════════════════════════════════════════════════════
function updateAssemble(dt, elapsed, cx, cy) {
  MG.elapsedSec = elapsed;

  // ★ Держим MG.grabbed и MG.grabbedIndex синхронными: после слияний
  // индекс мог сдвинуться, а сам схваченный шар — исчезнуть.
  if (MG.grabbed) {
    const gi = MG.fieldParticles.indexOf(MG.grabbed);
    if (gi < 0) { MG.grabbed = null; MG.grabbedIndex = -1; }
    else MG.grabbedIndex = gi;
  }

  // Трейл пальца
  if (MG.dragActive && Math.random() < 0.4) {
    MG.sparks.push({
      x: MG.dragX - cx, y: MG.dragY - cy,
      vx: (Math.random() - 0.5) * 30,
      vy: (Math.random() - 0.5) * 30,
      age: 0, life: 0.35, trail: true,
    });
  }

  // Притяжение к пальцу — ТОЛЬКО для «схваченного» шара.
  // Остальные стоят на месте и отскакивают при столкновениях.
  if (MG.dragActive && MG.grabbedIndex >= 0 &&
      MG.grabbedIndex < MG.fieldParticles.length) {
    const p = MG.fieldParticles[MG.grabbedIndex];
    if (!p.fixed) {
      const fx = MG.dragX - cx, fy = MG.dragY - cy;
      const dx = fx - p.x, dy = fy - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < MG_ASSEMBLE.fingerRadius) {
        const force = (1 - d / MG_ASSEMBLE.fingerRadius) * MG_ASSEMBLE.fingerForce;
        p.vx += (dx / d) * force * dt;
        p.vy += (dy / d) * force * dt;
      }
    }
  }

  // Движение — схваченный шар двигается свободно, остальные быстро
  // гасят скорость (стоят на месте, но отскакивают при столкновениях).
  for (let i = 0; i < MG.fieldParticles.length; i++) {
    const p = MG.fieldParticles[i];
    if (p.fixed) continue;
    const isGrabbed = (i === MG.grabbedIndex);
    const friction = isGrabbed ? 0.96 : 0.85;
    p.vx *= friction; p.vy *= friction;
    if (!isGrabbed && Math.abs(p.vx) < 2) p.vx = 0;
    if (!isGrabbed && Math.abs(p.vy) < 2) p.vy = 0;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (Math.abs(p.x) > MG.fieldHalfW) {
      p.x = Math.sign(p.x) * MG.fieldHalfW; p.vx *= -0.7;
    }
    if (Math.abs(p.y) > MG.fieldHalfH) {
      p.y = Math.sign(p.y) * MG.fieldHalfH; p.vy *= -0.7;
    }
  }

  // Столкновения
  for (let i = 0; i < MG.fieldParticles.length; i++) {
    const a = MG.fieldParticles[i];
    if (a.fixed) continue;

    for (let j = i + 1; j < MG.fieldParticles.length; j++) {
      const b = MG.fieldParticles[j];
      if (b.fixed) continue;

      const dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.hypot(dx, dy);
      const minD = a.r + b.r + MG_ASSEMBLE.mergeDist;
      if (d >= minD) continue;

      // Уникальные цвета
      const totalMass = a.mass + b.mass;
      const uniqueColors = [];
      for (let ci = 0; ci < a.colors.length; ci++) {
        if (uniqueColors.indexOf(a.colors[ci]) === -1) uniqueColors.push(a.colors[ci]);
      }
      for (let ci = 0; ci < b.colors.length; ci++) {
        if (uniqueColors.indexOf(b.colors[ci]) === -1) uniqueColors.push(b.colors[ci]);
      }

      // Складываем веса
      const newCounts = {};
      if (a.colorCounts) for (const k in a.colorCounts) newCounts[k] = (newCounts[k] || 0) + a.colorCounts[k];
      if (b.colorCounts) for (const k in b.colorCounts) newCounts[k] = (newCounts[k] || 0) + b.colorCounts[k];

      let mergeResult = null;
      if (totalMass <= 4 && uniqueColors.length <= 4) {
        mergeResult = { colors: uniqueColors, mass: totalMass, colorCounts: newCounts };
      }

      if (mergeResult) {
        // Слияние
        a.x = (a.x + b.x) / 2;
        a.y = (a.y + b.y) / 2;
        a.vx = (a.vx + b.vx) / 2;
        a.vy = (a.vy + b.vy) / 2;
        a.colors = mergeResult.colors;
        a.colorCounts = mergeResult.colorCounts;
        a.mass = mergeResult.mass;
        a.r = MG_ASSEMBLE.baseRadius + (a.mass - 1) * MG_ASSEMBLE.radiusStep;

        MG.fieldParticles.splice(j, 1);
        j--;
        // Если «схваченным» был исчезнувший шар — хватаем результат слияния
        if (MG.grabbed === b) MG.grabbed = a;

        // Искры
        for (let s = 0; s < 12; s++) {
          const sa = Math.random() * Math.PI * 2;
          const ss = 60 + Math.random() * 120;
          MG.sparks.push({
            x: a.x, y: a.y,
            vx: Math.cos(sa) * ss, vy: Math.sin(sa) * ss,
            age: 0, life: 0.6,
          });
        }

        if (a.mass >= 4) {
          a.fixed = true; a.vx = 0; a.vy = 0;
          if (!MG.result) {
            MG.result = determinePlanetFromColors(a.colorCounts);
            MG.resultLabel = PLANET_TYPES[MG.result].name;
            MG.finishAt = performance.now();
          }
        }
      } else {
        // Отскок
        if (d > 0.001) {
          const nx = dx / d, ny = dy / d;
          const overlap = minD - d;
          a.x += nx * overlap * 0.5; a.y += ny * overlap * 0.5;
          b.x -= nx * overlap * 0.5; b.y -= ny * overlap * 0.5;
          const avx = a.vx, avy = a.vy;
          a.vx = b.vx * 0.7; a.vy = b.vy * 0.7;
          b.vx = avx * 0.7; b.vy = avy * 0.7;
        }
      }
    }
  }

  MG.progress = MG.result ? 1 : Math.min(0.95, elapsed / MG_ASSEMBLE.duration);
  if (MG.finishAt && performance.now() - MG.finishAt > MG_ASSEMBLE.finishDelay) {
    finishAssemble(); return;
  }
  if (elapsed >= MG_ASSEMBLE.duration) finishAssemble();
}

function finishAssemble() {
  if (!MG.result) {
    MG.result = 'superEarth';
    MG.quality = 0.5;
  } else {
    MG.quality = 1.0;
  }
  endMinigame(true);
}

// Определение планеты по набору цветов
const _COLOR_TO_PLANET = {
  ice:   'iceGiant',
  lava:  'lava',
  stone: 'rocky',
  gas:   'gasGiant',
};

// colorCounts — объект { lava: 2, ice: 1, gas: 1 }
function determinePlanetFromColors(colorCounts) {
  if (!colorCounts) return 'superEarth';
  const keys = Object.keys(colorCounts);
  if (keys.length === 0) return 'superEarth';
  if (keys.length >= 4) return 'superEarth';   // 4 разных → Земля
  if (keys.length === 1) {
    return _COLOR_TO_PLANET[keys[0]] || 'rocky';
  }
  // 2–3 цвета → по большинству (при равенстве — первый по порядку)
  let bestKey = keys[0], bestCount = -1;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (colorCounts[k] > bestCount) { bestCount = colorCounts[k]; bestKey = k; }
  }
  return _COLOR_TO_PLANET[bestKey] || 'rocky';
}

// ═══════════════════════════════════════════════════════════════
//  РИСОВАНИЕ
// ═══════════════════════════════════════════════════════════════
function drawMinigame(ctx, time) {
  const cx = window.CANVAS_CX || 0, cy = window.CANVAS_CY || 0;
  const t = time;

  ctx.save();
  ctx.fillStyle = 'rgba(2, 1, 10, 0.65)';
  ctx.fillRect(0, 0, window.CANVAS_W, window.CANVAS_H);
  ctx.restore();

  if (MG.type === 'assemble') drawAssemble(ctx, cx, cy, t);

  // Патч 5.2: «Пропустить ▸» — только если игрок уже проходил эту миниигру
  if (S.seenMinigame && S.seenMinigame[MG.type + '_shown']) {
    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(139, 127, 212, 0.7)';
    ctx.fillText('Пропустить ▸', window.CANVAS_W - 16, 32);
    ctx.restore();
  }
}

function drawAssemble(ctx, cx, cy, t) {
  const left = Math.max(0, MG_ASSEMBLE.duration - (MG.elapsedSec || 0));

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px -apple-system, sans-serif';
  ctx.fillStyle = '#e8e2ff';
  ctx.fillText('Собери планету', cx, cy - MG.fieldHalfH - 60);

  // ─── Список доступных планет с цветными маркерами ───
  const COLOR_LABEL = {
    ice:   { color: '#3b9eff', name: 'Лёд'   },
    lava:  { color: '#ff2d2d', name: 'Лава'  },
    stone: { color: '#00e639', name: 'Камень'},
    gas:   { color: '#ffd633', name: 'Газ'   },
  };
  const PLANET_LABEL = {
    iceGiant:   'Ледяной гигант',
    lava:       'Лава-планета',
    rocky:      'Каменная',
    gasGiant:   'Газовый гигант',
    superEarth: 'Земля',
  };

  const allowedColors = (MG.availableColors && MG.availableColors.length)
    ? MG.availableColors : ['ice', 'lava', 'stone', 'gas'];
  const allowedPlanets = MG.allowedPlanets || [];

  // Отрисовка: строка с "Можно собрать:" и перечень
  const hintY = cy - MG.fieldHalfH - 38;
  ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.fillStyle = '#a89ce0';
  ctx.fillText('Можно собрать:', cx, hintY);

  // ─── Одна строка со всеми комбинациями ───
  const items = [];
  for (let pi = 0; pi < allowedPlanets.length; pi++) {
    const planetKey = allowedPlanets[pi];
    if (planetKey === 'superEarth') continue;   // отдельной строкой ниже
    const planetName = PLANET_LABEL[planetKey] || planetKey;
    // Найти цвет этой планеты
    let color = '#b9a8ff';
    const reverse = { iceGiant:'ice', lava:'lava', rocky:'stone', gasGiant:'gas' };
    for (let ck in COLOR_LABEL) {
      // PLANET_TO_COLOR обратный маппинг
      if (reverse[planetKey] === ck) color = COLOR_LABEL[ck].color;
    }
    items.push({ color: color, text: '×4 ' + planetName });
  }

  if (items.length > 0) {
    const lineY = hintY + 20;
    const totalTextW = items.reduce(function(acc, it) {
      return acc + 10 + ctx.measureText(it.text).width + 14;
    }, 0);
    let cursorX = cx - totalTextW / 2;

    for (let ii = 0; ii < items.length; ii++) {
      const it = items[ii];
      // Цветной кружок
      ctx.beginPath();
      ctx.fillStyle = it.color;
      ctx.arc(cursorX + 5, lineY - 3, 4, 0, Math.PI * 2);
      ctx.fill();
      cursorX += 12;

      // Текст
      ctx.font = 'bold 11px -apple-system, sans-serif';
      ctx.fillStyle = '#e8e2ff';
      ctx.textAlign = 'left';
      ctx.fillText(it.text, cursorX, lineY);
      cursorX += ctx.measureText(it.text).width + 14;
    }
    ctx.textAlign = 'center';
  }

  // ─── Земля отдельной строкой ───
  if (allowedPlanets.indexOf('superEarth') !== -1) {
    const eqY = hintY + 40;
    ctx.font = 'bold 11px -apple-system, sans-serif';
    ctx.fillStyle = '#5ee0a0';
    ctx.fillText('🌈 Земля · 4 разных цвета', cx, eqY);
  }

  // Прогресс-бар
  const barW = 260, barH = 6;
  const bx = cx - barW / 2, by = cy + MG.fieldHalfH + 20;
  ctx.save();
  ctx.fillStyle = 'rgba(139,127,212,0.2)';
  ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = MG.result ? '#ffb347' : '#b9a8ff';
  ctx.fillRect(bx, by, barW * MG.progress, barH);
  ctx.textAlign = 'center';
  ctx.font = '11px -apple-system, sans-serif';
  if (MG.result) {
    const pt = PLANET_TYPES[MG.result] || PLANET_TYPES.rocky;
    ctx.fillStyle = '#5ee0a0';
    ctx.font = 'bold 13px -apple-system, sans-serif';
    ctx.fillText('★ ' + pt.name, cx, by + 22);
  } else {
    ctx.fillStyle = '#8b7fd4';
    ctx.fillText(left.toFixed(1) + 'с · суперземля по умолчанию', cx, by + 22);
  }
  ctx.restore();

  // Легенда
  const legendY = cy + MG.fieldHalfH + 48;
  const legendItems = (MG.availableColors && MG.availableColors.length)
    ? MG.availableColors : ['ice', 'lava', 'stone', 'gas'];
  const legendW = 60;
  const totalW = legendItems.length * legendW;
  const startX = cx - totalW / 2 + legendW / 2;

  ctx.save();
  for (let i = 0; i < legendItems.length; i++) {
    const key = legendItems[i];
    const conf = ASSEMBLE_TYPES[key];
    const lx = startX + i * legendW;
    const g = ctx.createRadialGradient(lx, legendY, 0, lx, legendY, 8);
    g.addColorStop(0, conf.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(lx, legendY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a89ce0';
    ctx.font = '9px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(conf.name, lx, legendY + 16);
  }
  ctx.restore();

  // Шары
  for (let i = 0; i < MG.fieldParticles.length; i++) {
    drawAssembleParticle(ctx, MG.fieldParticles[i], cx, cy, t, i);
  }

  // Искры
  if (MG.sparks.length > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < MG.sparks.length; i++) {
      const s = MG.sparks[i];
      const alpha = Math.max(0, 1 - s.age / s.life);
      const size = s.trail ? 3 : 2;
      const color = s.trail ? 'rgba(200,180,255,' : 'rgba(255,220,150,';
      ctx.fillStyle = color + (alpha * 0.9) + ')';
      ctx.beginPath();
      ctx.arc(cx + s.x, cy + s.y, size * (1 + (1 - alpha) * 2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ─── Отрисовка одного шара ──────────────────────────────────────
function drawAssembleParticle(ctx, p, cx, cy, t, idx) {
  const sx = cx + p.x, sy = cy + p.y;
  const colorCount = p.colors.length;

  // Свечение
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 1 + 0.06 * Math.sin(t * 4 + idx);
  const glowR = p.r * 2.2 * pulse;
  const gg = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
  if (colorCount === 1) {
    gg.addColorStop(0, ASSEMBLE_TYPES[p.colors[0]].glow);
  } else {
    gg.addColorStop(0, 'rgba(255,255,255,0.4)');
  }
  gg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Тело
  if (colorCount === 1) {
    const color = ASSEMBLE_TYPES[p.colors[0]].color;
    const g = ctx.createRadialGradient(sx - p.r * 0.3, sy - p.r * 0.3, 0, sx, sy, p.r);
    g.addColorStop(0, lightenHex(color, 0.35));
    g.addColorStop(1, darkenHex(color, 0.3));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Базовый цвет — первый в списке, смешивается с белым
    const baseColor = ASSEMBLE_TYPES[p.colors[0]].color;
    const g0 = ctx.createRadialGradient(sx - p.r * 0.3, sy - p.r * 0.3, 0, sx, sy, p.r);
    g0.addColorStop(0, lightenHex(baseColor, 0.35));
    g0.addColorStop(1, darkenHex(baseColor, 0.3));
    ctx.fillStyle = g0;
    ctx.beginPath();
    ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
    ctx.fill();

    // Второй и последующие цвета — «пятнами» внутри круга
    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
    ctx.clip();

    // Псевдослучайный seed по позиции, чтобы пятна не мигали
    const seed = (p.x * 13.7 + p.y * 41.3);
    const n = colorCount;
    for (let k = 1; k < n; k++) {
      const col = ASSEMBLE_TYPES[p.colors[k]].color;
      // 3 пятна на каждый дополнительный цвет
      for (let s = 0; s < 3; s++) {
        const h1 = Math.abs(Math.sin(seed + k * 7.3 + s * 31.7));
        const h2 = Math.abs(Math.sin(seed + k * 11.1 + s * 17.3));
        const h3 = Math.abs(Math.sin(seed + k * 5.9 + s * 47.1));
        const ang = h1 * Math.PI * 2;
        const dist = h2 * p.r * 0.7;
        const rr = p.r * (0.35 + h3 * 0.35);
        const cx0 = sx + Math.cos(ang) * dist;
        const cy0 = sy + Math.sin(ang) * dist;
        const gk = ctx.createRadialGradient(cx0, cy0, 0, cx0, cy0, rr);
        gk.addColorStop(0, col);
        gk.addColorStop(0.6, col);
        gk.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gk;
        ctx.beginPath();
        ctx.arc(cx0, cy0, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Затемнение по краям (объём)
    const gv = ctx.createRadialGradient(sx, sy, p.r * 0.4, sx, sy, p.r);
    gv.addColorStop(0, 'rgba(255,255,255,0.10)');
    gv.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = gv;
    ctx.beginPath();
    ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Обводка
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = p.fixed ? 3 : (p.mass >= 2 ? 2 : 1.5);
  ctx.beginPath();
  ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
  ctx.stroke();

  // Звезда для финального
  if (p.fixed) {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 14;
    ctx.font = 'bold ' + Math.round(p.r * 0.9) + 'px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', sx, sy);
    ctx.restore();
  }

  // Подпись
  let label = null;
  let labelColor = '#e8e2ff';
  if (colorCount === 1) {
    label = ASSEMBLE_TYPES[p.colors[0]].name;
  } else if (colorCount >= 4) {
    label = 'Земля';
    labelColor = '#5ee0a0';
  } else {
    label = colorCount + ' цвета: ' + ASSEMBLE_TYPES[p.colors[0]].name + '...';
  }

  if (label) {
    ctx.save();
    ctx.font = 'bold 10px -apple-system, sans-serif';
    const lblW = ctx.measureText(label).width;
    const bgX = sx - lblW / 2 - 4;
    const bgY = sy + p.r + 4;
    ctx.fillStyle = 'rgba(15, 25, 45, 0.9)';
    ctx.fillRect(bgX, bgY, lblW + 8, 14);
    ctx.strokeStyle = 'rgba(139, 127, 212, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bgX, bgY, lblW + 8, 14);
    ctx.fillStyle = labelColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, sx, bgY + 7);
    ctx.restore();
  }
}

// ─── Утилиты цвета ──────────────────────────────────────────────
function lightenHex(hex, amt) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 'rgb(' + Math.min(255, r + amt * 255) + ',' +
    Math.min(255, g + amt * 255) + ',' + Math.min(255, b + amt * 255) + ')';
}
function darkenHex(hex, amt) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 'rgb(' + Math.max(0, r - amt * 255) + ',' +
    Math.max(0, g - amt * 255) + ',' + Math.max(0, b - amt * 255) + ')';
}

// ─── Ввод ───────────────────────────────────────────────────────
function mgPointerDown(x, y) {
  if (!MG.type) return;
  // Кнопка «Пропустить» (только для assemble, после первого прохождения)
  if (y < 50 && x > (window.CANVAS_W || 400) - 120) {
    if (S.seenMinigame && S.seenMinigame[MG.type + '_shown']) {
      endMinigame(false);
    }
    return;
  }
  if (MG.type === 'assemble') {
    MG.dragActive = true;
    MG.dragX = x;
    MG.dragY = y;

    // ★ Найти ближайший шар в радиусе пальца и «схватить» его.
    // Тянется только он один, остальные стоят.
    const cx = window.CANVAS_CX || 0, cy = window.CANVAS_CY || 0;
    const fx = x - cx, fy = y - cy;
    let bestIdx = -1;
    let bestD2 = MG_ASSEMBLE.fingerRadius * MG_ASSEMBLE.fingerRadius;
    for (let i = 0; i < MG.fieldParticles.length; i++) {
      const p = MG.fieldParticles[i];
      if (p.fixed) continue;
      const dx = p.x - fx, dy = p.y - fy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestIdx = i;
      }
    }
    MG.grabbedIndex = bestIdx;
    MG.grabbed = bestIdx >= 0 ? MG.fieldParticles[bestIdx] : null;
  }
}

function mgPointerMove(x, y) {
  if (!MG.type) return;
  if (MG.type === 'assemble') {
    MG.dragX = x;
    MG.dragY = y;
  }
}

function mgPointerUp() {
  MG.dragActive = false;
  MG.grabbedIndex = -1;
  MG.grabbed = null;
}

// ─── Экспорт ────────────────────────────────────────────────────
window.startMinigame = startMinigame;
window.updateMinigame = updateMinigame;
window.drawMinigame = drawMinigame;
window.mgPointerDown = mgPointerDown;
window.mgPointerMove = mgPointerMove;
window.mgPointerUp = mgPointerUp;
window.MG = MG;