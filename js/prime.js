// ═══════════════════════════════════════════════════════════════
//  PRIME.JS — Прайм-системы: объекты, имена, иконки, большой визуал
// ═══════════════════════════════════════════════════════════════

const PRIME_PREFIX = ['Система', 'Сектор', 'Кластер', 'Ядро', 'Венец', 'Ореол', 'Вихрь', 'Поток'];
const PRIME_ROOT = ['Дракона', 'Феникса', 'Ориона', 'Лебедя', 'Гидры', 'Кита', 'Лиры', 'Пегаса', 'Центавра', 'Андромеды'];
const PRIME_SUFFIX = ['Прайм', 'Ультима', 'Нексус', 'Альфа', 'Омега', 'Зенит', 'Апекс', 'Вертекс'];

const PRIME_OBJECTS = {
  blackHole:  { name: 'Чёрная дыра',         icon: 'blackHole',  bonus: { dustMult: 0.25 },   absorbRadius: 150 },
  massiveBH:  { name: 'Массивная ЧД',         icon: 'massiveBH',  bonus: { dustMult: 0.50 },   absorbRadius: 200 },
  superBH:    { name: 'Сверхмассивная ЧД',    icon: 'superBH',    bonus: { dustMult: 1.00 },   absorbRadius: 260 },
  quasar:     { name: 'Квазар',               icon: 'quasar',     bonus: { allMult: 0.30 },    absorbRadius: 130 },
  pulsar:     { name: 'Пульсар',              icon: 'pulsar',     bonus: { energyMult: 0.50 }, absorbRadius: 100 },
  magnetar:   { name: 'Магнетар',             icon: 'magnetar',   bonus: { planetHP: 2.0 },    absorbRadius: 120 },
  wormhole:   { name: 'Кротовая нора',        icon: 'wormhole',   bonus: { keepSystems: 0.5 }, absorbRadius: 90  },
  darkMatter: { name: 'Тёмная материя',       icon: 'darkMatter', bonus: { incomePerHour: 0.005 }, absorbRadius: 0 },
  gravLens:   { name: 'Гравитационная линза', icon: 'gravLens',   bonus: { autoClick: 2 },     absorbRadius: 0 },
  quarkVoid:  { name: 'Кварковый войд',       icon: 'quarkVoid',  bonus: { offlineMult: 2.0, capPenalty: 0.2 }, absorbRadius: 220 },
  primeBH:    { name: 'Первичная ЧД',         icon: 'primeBH',    bonus: { rareChance: 0.05 }, absorbRadius: 300 },
};

function generatePrimeName() {
  const p = PRIME_PREFIX[Math.floor(Math.random() * PRIME_PREFIX.length)];
  const r = PRIME_ROOT[Math.floor(Math.random() * PRIME_ROOT.length)];
  const s = PRIME_SUFFIX[Math.floor(Math.random() * PRIME_SUFFIX.length)];
  return p + ' ' + r + ' ' + s;
}

function createPrimeSystem(objectKey) {
  const obj = PRIME_OBJECTS[objectKey];
  if (!obj) return null;
  if (typeof playSFX === 'function') {
    if (objectKey === 'pulsar') playSFX('sfx_pulsar');
    else if (objectKey === 'blackHole' || objectKey === 'massiveBH' ||
             objectKey === 'superBH' || objectKey === 'primeBH') playSFX('sfx_blackhole_hum');
    else if (objectKey === 'wormhole') playSFX('sfx_wormhole');
    else if (objectKey === 'quasar') playSFX('sfx_quasar');
  }
  return {
    name: generatePrimeName(),
    objectKey: objectKey,
    objectName: obj.name,
    objectIcon: obj.icon,
    bonus: obj.bonus,
    absorbRadius: obj.absorbRadius,
    createdAt: Date.now(),
  };
}

function tryCraftPrime(type1, type2) {
  if (type1 !== type2) return null;
  if (Math.random() < 0.10) return createPrimeSystem(type1);
  return null;
}

// ─── Маленькая иконка (HUD, галактика) ─────────────────────────
function drawPrimeIcon(ctx, x, y, objectKey, time, size) {
  size = size || 12;
  const t = time;
  ctx.save();
  ctx.translate(x, y);

  if (objectKey === 'blackHole' || objectKey === 'massiveBH' ||
      objectKey === 'superBH' || objectKey === 'primeBH') {
    const scale = objectKey === 'superBH' ? 1.5
                : objectKey === 'massiveBH' ? 1.2
                : objectKey === 'primeBH' ? 1.8 : 1.0;
    const r = size * scale;
    ctx.rotate(t * 0.8);
    const g = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.5);
    g.addColorStop(0, 'rgba(255, 150, 50, 0)');
    g.addColorStop(0.5, 'rgba(255, 120, 30, 0.7)');
    g.addColorStop(1, 'rgba(255, 200, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (objectKey === 'quasar') {
    ctx.rotate(t * 0.3);
    ctx.fillStyle = 'rgba(255, 220, 100, 0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180, 220, 255, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, -size * 2);
    ctx.moveTo(0, 0); ctx.lineTo(0, size * 2);
    ctx.stroke();
  } else if (objectKey === 'pulsar') {
    ctx.rotate(t * 3);
    ctx.fillStyle = '#ddf';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200, 220, 255, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, -size * 1.6);
    ctx.moveTo(0, 0); ctx.lineTo(0, size * 1.6);
    ctx.stroke();
  } else if (objectKey === 'magnetar') {
    ctx.rotate(t * 0.5);
    ctx.fillStyle = '#a8f';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200, 150, 255, 0.6)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * size * 0.6, Math.sin(a) * size * 0.6);
      ctx.lineTo(Math.cos(a) * size * 1.2, Math.sin(a) * size * 1.2);
      ctx.stroke();
    }
  } else if (objectKey === 'wormhole') {
    ctx.rotate(t * 1.2);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rr = size * (0.4 + (i % 2) * 0.4);
      ctx.fillStyle = 'hsl(' + (280 + i * 10) + ', 80%, 70%)';
      ctx.beginPath();
      ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, size * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (objectKey === 'darkMatter') {
    ctx.fillStyle = 'rgba(20, 10, 40, 0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(140, 100, 220, ' + (0.4 + 0.3 * Math.sin(t * 2)) + ')';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (objectKey === 'gravLens') {
    ctx.rotate(t * 0.4);
    ctx.strokeStyle = 'rgba(180, 200, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  } else if (objectKey === 'quarkVoid') {
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60, 100, 180, 0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  drawPrimeMain — большой визуал в центре системы
// ═══════════════════════════════════════════════════════════════
function drawPrimeMain(ctx, cx, cy, z, time, objectKey) {
  const t = time;

  // ═════════════════════════════════════════════════════════════
  //  ЧЁРНЫЕ ДЫРЫ: blackHole / massiveBH / superBH / primeBH
  //  Фотонное кольцо + наклонный аккреционный диск + линзирование
  // ═════════════════════════════════════════════════════════════
  if (objectKey === 'blackHole' || objectKey === 'massiveBH' ||
      objectKey === 'superBH' || objectKey === 'primeBH') {
    const scale = objectKey === 'superBH' ? 1.3
                : objectKey === 'massiveBH' ? 1.15
                : objectKey === 'primeBH' ? 1.5 : 1.0;
    const baseR = 16 * scale * z;
    const hasJets = (objectKey === 'massiveBH' || objectKey === 'superBH' || objectKey === 'primeBH');
    const starCount = objectKey === 'primeBH' ? 8
                    : (objectKey === 'superBH' ? 6 : 4);

    // Цвета для ЧД
    const isPrime = objectKey === 'primeBH';
    const photonColor = isPrime ? 'rgba(255, 200, 255, 1)' : 'rgba(255, 230, 180, 1)';
    const diskHot = isPrime ? 'rgba(220, 180, 255, 0.95)' : 'rgba(255, 240, 200, 0.95)';
    const diskMid = isPrime ? 'rgba(180, 90, 255, 0.55)' : 'rgba(255, 140, 60, 0.55)';
    const diskCold = isPrime ? 'rgba(100, 20, 180, 0.15)' : 'rgba(180, 40, 10, 0.15)';

    // 1. ДЖЕТЫ (для массивных)
    if (hasJets) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const jetLen = baseR * (objectKey === 'primeBH' ? 12 : 8);
      const jetW = baseR * 0.6;
      for (let side = -1; side <= 1; side += 2) {
        const jg = ctx.createLinearGradient(cx, cy, cx, cy + side * jetLen);
        jg.addColorStop(0, isPrime ? 'rgba(255, 220, 255, 0.9)' : 'rgba(200, 240, 255, 0.85)');
        jg.addColorStop(0.3, isPrime ? 'rgba(180, 100, 255, 0.5)' : 'rgba(120, 180, 255, 0.4)');
        jg.addColorStop(1, 'rgba(80, 60, 200, 0)');
        ctx.fillStyle = jg;
        ctx.beginPath();
        ctx.moveTo(cx - jetW, cy);
        ctx.lineTo(cx + jetW, cy);
        ctx.lineTo(cx + jetW * 0.2, cy + side * jetLen);
        ctx.lineTo(cx - jetW * 0.2, cy + side * jetLen);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // 2. ГРАВИТАЦИОННОЕ ЛИНЗИРОВАНИЕ — дуга света НАД горизонтом (с задней стороны)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lensR = baseR * 1.15;
    const lensG = ctx.createRadialGradient(cx, cy - baseR * 0.3, lensR * 0.5,
                                            cx, cy - baseR * 0.3, lensR * 1.4);
    lensG.addColorStop(0, 'rgba(255, 200, 100, 0)');
    lensG.addColorStop(0.6, isPrime ? 'rgba(255, 180, 255, 0.5)' : 'rgba(255, 200, 120, 0.45)');
    lensG.addColorStop(1, 'rgba(255, 200, 100, 0)');
    ctx.fillStyle = lensG;
    ctx.beginPath();
    ctx.ellipse(cx, cy - baseR * 0.35, lensR * 1.6, lensR * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. АККРЕЦИОННЫЙ ДИСК (наклонный эллипс)
    const diskR = baseR * 2.6;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.32);
    // Внешняя холодная часть
    const g = ctx.createRadialGradient(0, 0, baseR * 0.9, 0, 0, diskR);
    g.addColorStop(0, diskHot);
    g.addColorStop(0.3, diskMid);
    g.addColorStop(0.75, diskCold);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, diskR, 0, Math.PI * 2);
    ctx.fill();

    // Вращающиеся «прожилки» — материя закручивается
    ctx.rotate(t * 0.6);
    ctx.strokeStyle = isPrime ? 'rgba(220, 160, 255, 0.6)' : 'rgba(255, 220, 150, 0.55)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, baseR * (1.8 + i * 0.4), i * Math.PI, i * Math.PI + Math.PI * 1.3);
      ctx.stroke();
    }
    ctx.restore();

    // 4. ФОТОННОЕ КОЛЬЦО (тонкое, яркое, чуть больше горизонта)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = photonColor;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 1.04, 0, Math.PI * 2);
    ctx.stroke();
    // Внешнее свечение кольца
    ctx.strokeStyle = isPrime ? 'rgba(255, 200, 255, 0.4)' : 'rgba(255, 200, 150, 0.35)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 1.08, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 5. ЧЁРНЫЙ ГОРИЗОНТ
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

       // 6. ЗВЁЗДЫ-СПУТНИКИ на иерархических кеплеровских орбитах
    // Как S-звёзды вокруг Sgr A*: разные наклоны, эллипсы, прецессия.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // ─── Группы орбит ───
    // Каждая группа — своё наклонение (tilt), эксцентриситет (ecc),
    // направление и радиус. Кеплеровская скорость вычисляется ниже.
    const groups = [];
    if (starCount <= 4) {
      // blackHole (4 спутника) — тесная пара + внешняя пара
      groups.push({ count: 2, r: baseR * 1.7, tilt: 0.45, dir: 1,  ecc: 0.10 });
      groups.push({ count: 2, r: baseR * 2.9, tilt: 0.30, dir: -1, ecc: 0.18 });
    } else if (starCount === 6) {
      // superBH — тройка внутренняя + тройка внешняя
      groups.push({ count: 3, r: baseR * 1.7, tilt: 0.45, dir: 1,  ecc: 0.10 });
      groups.push({ count: 3, r: baseR * 3.0, tilt: 0.28, dir: -1, ecc: 0.18 });
    } else {
      // primeBH (8 спутников) — иерархия 2+3+3
      groups.push({ count: 2, r: baseR * 1.5, tilt: 0.52, dir: 1,  ecc: 0.08 });
      groups.push({ count: 3, r: baseR * 2.4, tilt: 0.38, dir: -1, ecc: 0.15 });
      groups.push({ count: 3, r: baseR * 3.6, tilt: 0.26, dir: 1,  ecc: 0.22 });
    }

    // ─── 6a. Пунктирные орбиты (визуальная «сетка» системы) ───
    for (let g = 0; g < groups.length; g++) {
      const grp = groups[g];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, grp.tilt);
      ctx.strokeStyle = isPrime
        ? 'rgba(200, 140, 255, 0.10)'
        : 'rgba(255, 180, 100, 0.10)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, grp.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ─── 6b. Сами звёзды ───
    const baseOmega = 2.0;  // рад/сек у самой внутренней орбиты
    let starIdx = 0;

    for (let g = 0; g < groups.length; g++) {
      const grp = groups[g];

      // Кеплеровский закон: ω ∝ r^(-3/2)
      const omega = (baseOmega / Math.pow(grp.r / baseR, 1.5)) * grp.dir;

      // Очень медленная прецессия орбиты (как у Меркурия/S2)
      const precession = t * 0.02 * grp.dir;
      const cosPrec = Math.cos(precession);
      const sinPrec = Math.sin(precession);

      for (let i = 0; i < grp.count; i++) {
        // Начальная фаза — равномерно по орбите
        const theta0 = (i / grp.count) * Math.PI * 2;
        // Текущий угол
        const theta = theta0 + omega * t;

        // Эллипс: r(θ) = a(1-e²)/(1 + e·cos θ)
        const e = grp.ecc;
        const rLocal = grp.r * (1 - e * e) / (1 + e * Math.cos(theta));

        // Позиция в плоскости орбиты
        const xLocal = rLocal * Math.cos(theta);
        const yLocal = rLocal * Math.sin(theta);

        // Прецессия вокруг центра
        const xRot = xLocal * cosPrec - yLocal * sinPrec;
        const yRot = xLocal * sinPrec + yLocal * cosPrec;

        // Наклон (сжатие по Y) — «вид с ребра»
        const sx = cx + xRot;
        const sy = cy + yRot * grp.tilt;

        // Небольшая вариация яркости — «мерцание»
        const flare = 0.85 + 0.15 * Math.sin(t * 3 + starIdx * 1.7);
        const glowR = (isPrime ? 11 : 9) * z * flare;
        const coreR = (isPrime ? 2.8 : 2.3) * z;

        // Свечение
        const starG = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
        starG.addColorStop(0, isPrime ? 'rgba(255, 220, 255, 1)' : 'rgba(255, 255, 240, 1)');
        starG.addColorStop(0.3, isPrime ? 'rgba(220, 140, 255, 0.8)' : 'rgba(255, 220, 140, 0.8)');
        starG.addColorStop(1, 'rgba(255, 150, 50, 0)');
        ctx.fillStyle = starG;
        ctx.beginPath();
        ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
        ctx.fill();

        // Ядро
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(sx, sy, coreR, 0, Math.PI * 2);
        ctx.fill();

        starIdx++;
      }
    }
    ctx.restore();
    return;
      }
  // ═════════════════════════════════════════════════════════════
  //  КВАЗАР — сверхъяркое ядро + джеты + пылевой тор
  // ═════════════════════════════════════════════════════════════
  if (objectKey === 'quasar') {
    const baseR = 14 * z;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Пылевой тор (эллипс вокруг)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.4);
    const torG = ctx.createRadialGradient(0, 0, baseR * 1.6, 0, 0, baseR * 3.2);
    torG.addColorStop(0, 'rgba(180, 100, 40, 0)');
    torG.addColorStop(0.5, 'rgba(200, 120, 50, 0.35)');
    torG.addColorStop(1, 'rgba(120, 60, 20, 0)');
    ctx.fillStyle = torG;
    ctx.beginPath();
    ctx.arc(0, 0, baseR * 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Джеты — мощные, раздваивающиеся
    for (let side = -1; side <= 1; side += 2) {
      const len = baseR * 9;
      const w = baseR * 0.5;
      const jg = ctx.createLinearGradient(cx, cy, cx, cy + side * len);
      jg.addColorStop(0, 'rgba(220, 240, 255, 1)');
      jg.addColorStop(0.15, 'rgba(140, 200, 255, 0.85)');
      jg.addColorStop(0.5, 'rgba(100, 160, 255, 0.4)');
      jg.addColorStop(1, 'rgba(60, 100, 220, 0)');
      ctx.fillStyle = jg;
      ctx.beginPath();
      ctx.moveTo(cx - w, cy);
      ctx.lineTo(cx + w, cy);
      ctx.lineTo(cx + w * 0.15, cy + side * len);
      ctx.lineTo(cx - w * 0.15, cy + side * len);
      ctx.closePath();
      ctx.fill();

      // Внутреннее яркое ядро джета
      const w2 = w * 0.35;
      const jg2 = ctx.createLinearGradient(cx, cy, cx, cy + side * len * 0.7);
      jg2.addColorStop(0, 'rgba(255, 255, 255, 1)');
      jg2.addColorStop(1, 'rgba(200, 230, 255, 0)');
      ctx.fillStyle = jg2;
      ctx.beginPath();
      ctx.moveTo(cx - w2, cy);
      ctx.lineTo(cx + w2, cy);
      ctx.lineTo(cx + w2 * 0.1, cy + side * len * 0.7);
      ctx.lineTo(cx - w2 * 0.1, cy + side * len * 0.7);
      ctx.closePath();
      ctx.fill();
    }

    // СВЕРХЪЯРКОЕ ЯДРО
    const coreG = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 3.5);
    coreG.addColorStop(0, 'rgba(255, 255, 255, 1)');
    coreG.addColorStop(0.15, 'rgba(255, 250, 220, 1)');
    coreG.addColorStop(0.4, 'rgba(255, 220, 120, 0.7)');
    coreG.addColorStop(0.75, 'rgba(255, 180, 60, 0.25)');
    coreG.addColorStop(1, 'rgba(255, 140, 30, 0)');
    ctx.fillStyle = coreG;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Пульсирующее белое ядро
    const pulse = 1 + 0.1 * Math.sin(t * 3);
    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 0.55 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return;
  }

  // ═════════════════════════════════════════════════════════════
  //  ПУЛЬСАР — быстрое вращение, два конуса света
  // ═════════════════════════════════════════════════════════════
  if (objectKey === 'pulsar') {
    const baseR = 10 * z;
    const spin = t * 2.5;
    const pulse = 0.7 + 0.3 * Math.abs(Math.sin(t * 6));

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Два конуса света (маяк) — вращаются вокруг центра
    ctx.translate(cx, cy);
    ctx.rotate(spin);
    for (let side = -1; side <= 1; side += 2) {
      const len = baseR * 14 * pulse;
      const lg = ctx.createLinearGradient(0, 0, 0, side * len);
      lg.addColorStop(0, 'rgba(220, 240, 255, 1)');
      lg.addColorStop(0.3, 'rgba(160, 210, 255, 0.6)');
      lg.addColorStop(1, 'rgba(80, 140, 255, 0)');
      ctx.fillStyle = lg;
      // Треугольный конус, расширяющийся к концу
      ctx.beginPath();
      ctx.moveTo(-baseR * 0.3, 0);
      ctx.lineTo(baseR * 0.3, 0);
      ctx.lineTo(baseR * 2.5, side * len);
      ctx.lineTo(-baseR * 2.5, side * len);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Пульсирующее гало
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const haloG = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 4 * pulse);
    haloG.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    haloG.addColorStop(0.25, 'rgba(200, 230, 255, 0.5)');
    haloG.addColorStop(1, 'rgba(100, 160, 255, 0)');
    ctx.fillStyle = haloG;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 4 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Ядро — крошечное, но яркое
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 0.5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // ═════════════════════════════════════════════════════════════
  //  МАГНЕТАР — магнитные петли + вспышки
  // ═════════════════════════════════════════════════════════════
  if (objectKey === 'magnetar') {
    const baseR = 10 * z;
    const flicker = 0.6 + 0.4 * Math.abs(Math.sin(t * 3));

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // 4 дипольные петли магнитного поля (эллипсы под углом)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.5);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.strokeStyle = 'rgba(180, 130, 255, ' + (0.6 * flicker + 0.2) + ')';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(0, 0, baseR * 3.5, baseR * 0.8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // 8 коротких «вспышек» — энергичные выбросы
    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + t * 1.2;
      const flare = 0.5 + 0.5 * Math.abs(Math.sin(t * 4 + i));
      const r1 = baseR * 1.5;
      const r2 = baseR * (2.5 + flare * 1.5);
      ctx.strokeStyle = 'rgba(220, 180, 255, ' + (flare * 0.8) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      ctx.stroke();
    }
    ctx.restore();

    // Ядро с фиолетовым свечением
    const coreG = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 2 * flicker);
    coreG.addColorStop(0, 'rgba(255, 255, 255, 1)');
    coreG.addColorStop(0.35, 'rgba(220, 160, 255, 0.85)');
    coreG.addColorStop(1, 'rgba(140, 80, 220, 0)');
    ctx.fillStyle = coreG;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 2 * flicker, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return;
  }

  // ═════════════════════════════════════════════════════════════
  //  КРОТОВАЯ НОРА — горловина с искажением
  // ═════════════════════════════════════════════════════════════
  if (objectKey === 'wormhole') {
    const baseR = 15 * z;

    // Искажение пространства — концентрические кольца, «втягивающиеся»
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let ring = 0; ring < 6; ring++) {
      const phase = (t * 0.4 + ring / 6) % 1;
      const rr = baseR * (0.8 + phase * 3);
      const alpha = (1 - phase) * 0.35;
      ctx.strokeStyle = 'rgba(180, 100, 255, ' + alpha + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rr, rr * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Сама горловина — два встречных конуса
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Левая сторона горловины (свет из «той стороны»)
    const inGrad = ctx.createRadialGradient(cx - baseR * 0.3, cy, 0, cx, cy, baseR * 2);
    inGrad.addColorStop(0, 'rgba(255, 200, 255, 0.95)');
    inGrad.addColorStop(0.4, 'rgba(200, 100, 255, 0.6)');
    inGrad.addColorStop(1, 'rgba(80, 20, 180, 0)');
    ctx.fillStyle = inGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, baseR * 2, baseR, 0, 0, Math.PI * 2);
    ctx.fill();

    // Вихрь точек — закручивающийся в центр
    for (let i = 0; i < 30; i++) {
      const phase = (t * 0.6 + i / 30) % 1;
      const r = (1 - phase) * baseR * 3;
      const a = i * 2.399963 + t * 0.5;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r * 0.55;
      const alpha = Math.min(1, phase * 2);
      ctx.fillStyle = 'hsla(' + (270 + i * 4) + ', 85%, 75%, ' + alpha + ')';
      ctx.beginPath();
      ctx.arc(px, py, 1.5 * z * (1 - phase) + 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Глубокая тёмная воронка в центре
    const holeG = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 0.8);
    holeG.addColorStop(0, 'rgba(20, 0, 40, 1)');
    holeG.addColorStop(0.7, 'rgba(60, 20, 100, 0.7)');
    holeG.addColorStop(1, 'rgba(80, 20, 120, 0)');
    ctx.fillStyle = holeG;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 0.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return;
  }

  // ═════════════════════════════════════════════════════════════
  //  ТЁМНАЯ МАТЕРИЯ — невидимый сгусток с искажением
  // ═════════════════════════════════════════════════════════════
  if (objectKey === 'darkMatter') {
    const baseR = 20 * z;
    const pulse = 0.8 + 0.2 * Math.sin(t * 1.5);

    // Тёмное пятно в центре — почти чёрное, но с фиолетовым
    ctx.save();
    const coreG = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 1.5 * pulse);
    coreG.addColorStop(0, 'rgba(10, 5, 25, 0.95)');
    coreG.addColorStop(0.6, 'rgba(20, 10, 50, 0.6)');
    coreG.addColorStop(1, 'rgba(40, 20, 80, 0)');
    ctx.fillStyle = coreG;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 1.5 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Искажение света вокруг — концентрические тонкие кольца
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let r = 0; r < 4; r++) {
      const phase = (t * 0.3 + r / 4) % 1;
      const ringR = baseR * (1.5 + phase * 2);
      const alpha = (1 - phase) * 0.4;
      ctx.strokeStyle = 'rgba(140, 100, 220, ' + alpha + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Мерцающие точки внутри — «частицы тёмной материи»
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + t * 0.3;
      const dist = baseR * (0.4 + 0.5 * Math.abs(Math.sin(t * 1.5 + i)));
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + i * 1.7));
      ctx.fillStyle = 'rgba(200, 150, 255, ' + (tw * 0.8) + ')';
      ctx.beginPath();
      ctx.arc(px, py, 1.2 * z, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // ═════════════════════════════════════════════════════════════
  //  ГРАВИТАЦИОННАЯ ЛИНЗА — кольцо Эйнштейна
  // ═════════════════════════════════════════════════════════════
  if (objectKey === 'gravLens') {
    const baseR = 17 * z;

    // Внешнее кольцо Эйнштейна — свет, обогнувший массивный объект
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lensG = ctx.createRadialGradient(cx, cy, baseR * 0.9, cx, cy, baseR * 1.6);
    lensG.addColorStop(0, 'rgba(180, 220, 255, 0)');
    lensG.addColorStop(0.5, 'rgba(200, 230, 255, 0.55)');
    lensG.addColorStop(0.7, 'rgba(180, 210, 255, 0.35)');
    lensG.addColorStop(1, 'rgba(120, 160, 255, 0)');
    ctx.fillStyle = lensG;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 1.6, 0, Math.PI * 2);
    ctx.fill();

    // Яркое тонкое кольцо
    ctx.strokeStyle = 'rgba(220, 240, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 1.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // «Двойное изображение» — симметричные дуги сверху и снизу
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.rotate(0); // без вращения для стабильности
    ctx.strokeStyle = 'rgba(180, 210, 255, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 1.7, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 1.7, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.restore();

    // Слабое центральное пятно (массивный объект внутри)
    ctx.save();
    const centerG = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 0.7);
    centerG.addColorStop(0, 'rgba(40, 30, 80, 0.9)');
    centerG.addColorStop(1, 'rgba(80, 60, 140, 0)');
    ctx.fillStyle = centerG;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // ═════════════════════════════════════════════════════════════
  //  КВАРКОВЫЙ ВОЙД — светящийся пузырь
  // ═════════════════════════════════════════════════════════════
  if (objectKey === 'quarkVoid') {
    const baseR = 20 * z;
    const pulse = 0.85 + 0.15 * Math.sin(t * 2);

    // Внутреннее свечение — синее ядро
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const coreG = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * pulse);
    coreG.addColorStop(0, 'rgba(180, 230, 255, 0.4)');
    coreG.addColorStop(0.5, 'rgba(80, 160, 255, 0.25)');
    coreG.addColorStop(1, 'rgba(30, 80, 180, 0)');
    ctx.fillStyle = coreG;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Оболочка — «кварковое море» вокруг
    ctx.strokeStyle = 'rgba(140, 200, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * pulse, 0, Math.PI * 2);
    ctx.stroke();

    // Вторая, чуть шире — «рябь»
    ctx.strokeStyle = 'rgba(100, 160, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * pulse * 1.25, 0, Math.PI * 2);
    ctx.stroke();

    // Внутренние точки — кварки, свободно летающие
    for (let i = 0; i < 8; i++) {
      const phase = (t * 0.5 + i / 8) % 1;
      const dist = phase * baseR * 0.8 * pulse;
      const angle = i * 1.7 + t * 0.8;
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      const alpha = Math.sin(phase * Math.PI) * 0.9;
      ctx.fillStyle = 'rgba(200, 230, 255, ' + alpha + ')';
      ctx.beginPath();
      ctx.arc(px, py, 1.5 * z, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // Fallback — маленькая иконка
  drawPrimeIcon(ctx, cx, cy, objectKey, t, 12 * z);
}

window.PRIME_OBJECTS = PRIME_OBJECTS;
window.generatePrimeName = generatePrimeName;
window.createPrimeSystem = createPrimeSystem;
window.tryCraftPrime = tryCraftPrime;
window.drawPrimeIcon = drawPrimeIcon;
window.drawPrimeMain = drawPrimeMain;