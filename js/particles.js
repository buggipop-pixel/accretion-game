// ═══════════════════════════════════════════════════════════════
//  PARTICLES.JS — пыль, диск, 3D-камера
//
//  worldToScreen: сферическая камера (yaw + pitch).
//    tiltX = pitch, свободный оборот (wrap ±π)
//    tiltY = yaw,   свободный оборот (wrap ±π)
//  Пыль: spiral | disk | infall.
//  Спавн: эллипс за краем экрана, без рамок.
// ═══════════════════════════════════════════════════════════════

const PART = {
  particles: [], passing: [],
  coreR: 1.8, corePulse: 0, starPulse: 0, absorbed: 0,
  coreHue: null,
  dragX: 0, dragY: 0, dragActive: false,
  dragVelX: 0, dragVelY: 0,
  dragLastAt: 0, dragLastX: 0, dragLastY: 0,
  fingerLastAngle: null, fingerAngularVel: 0,
  tapBursts: [], lastPassingAt: 0,
  absorbRate: 0, _rateAt: 0, _rateCount: 0,
  _twistSmooth: 1,
  _lastDragX: 0, _lastDragY: 0,

  // Отслеживание смены фазы (для формирования диска во II)
  _stageAt: 0,
  _lastStage: null,
};

const PART_COUNT = 700;
const DUST_PER_PARTICLE = 1;

function _boost() {
  if (typeof CFG === 'undefined' || !CFG.activeBoost) return null;
  return CFG.activeBoost[S.stage] || null;
}

function keplerTangential(r, vRef) {
  if (r < 20) r = 20;
  return (vRef || 25) * Math.sqrt(100 / r);
}

// ═══════════════════════════════════════════════════════════════
//  3D-ПРОЕКЦИЯ (сферическая камера)
// ═══════════════════════════════════════════════════════════════
function worldToScreen(wx, wy) {
  const z = S.zoom || 1;
  const rot = S.rotation || 0;

  // Шаг 1: вращение в плоскости вокруг Z
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const x1 = wx * cosR - wy * sinR;
  const y1 = wx * sinR + wy * cosR;

  // Шаг 2: 3D-проекция — yaw вокруг Y, pitch вокруг X.
  // Сцена плоская (z=0 в мировых координатах), поэтому после yaw
  // ось X уходит в глубину, потом pitch наклоняет.
  const yaw = S.tiltY || 0;
  const pitch = S.tiltX || 0;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);

  // Yaw вокруг Y: точка (x1, y1, 0) → (x1*cy, y1, x1*sy)
  // Pitch вокруг X: (x1*cy, y1, x1*sy) → (x1*cy, y1*cp - x1*sy*sp, ...)
  const x3 = x1 * cy;
  const y3 = y1 * cp - x1 * sy * sp;

  return {
    x: (window.CANVAS_CX || 0) + (S.panX || 0) + x3 * z,
    y: (window.CANVAS_CY || 0) + (S.panY || 0) + y3 * z,
  };
}

function screenToWorld(sx, sy) {
  const z = S.zoom || 1;
  const rot = S.rotation || 0;
  const yaw = S.tiltY || 0;
  const pitch = S.tiltX || 0;

  const x3 = (sx - (window.CANVAS_CX || 0) - (S.panX || 0)) / z;
  const y3 = (sy - (window.CANVAS_CY || 0) - (S.panY || 0)) / z;

  // Обратная проекция:
  //   x3 = x1 * cosY
  //   y3 = y1 * cosP - x1 * sinY * sinP
  // Отсюда: x1 = x3 / cosY, y1 = (y3 + x1 * sinY * sinP) / cosP
  // (имена cosY/sinY/cosP/sinP — чтобы не конфликтовать с параметром sy)
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch), sinP = Math.sin(pitch);

  let x1 = Math.abs(cosY) > 1e-6 ? x3 / cosY : x3;
  let y1 = Math.abs(cosP) > 1e-6 ? (y3 + x1 * sinY * sinP) / cosP : y3;

  const cos = Math.cos(-rot), sin = Math.sin(-rot);
  return { x: x1 * cos - y1 * sin, y: x1 * sin + y1 * cos };
}

function visibleHalfSize() {
  let W = window.CANVAS_W || 0;
  let H = window.CANVAS_H || 0;
  if (W < 50 || H < 50) {
    W = window.innerWidth || 400;
    H = window.innerHeight || 700;
  }
  const z = S.zoom || 1;
  return { halfW: W / (2 * z), halfH: H / (2 * z) };
}

// ─── Частица ────────────────────────────────────────────────────
function _newParticle(x, y) {
  return {
    x, y,
    r: 0.5 + Math.random() * 1.2,
    hue: Math.random() < 0.72 ? 215 + Math.random() * 50 : 15 + Math.random() * 35,
    bright: 0.4 + Math.random() * 0.5,
    twinkle: Math.random() * Math.PI * 2,
    spinVar: 0.9 + Math.random() * 0.2,
    armOffset: (Math.random() - 0.5) * 0.9,
    age: 0,
    mode: 'spiral',
    diskAngle: 0,
    diskTimeLeft: 0,
  };
}

// Спавн по эллипсу за краем видимой области + угловой шум
function makeSpawnParticle() {
  const vis = visibleHalfSize();
  // Угловой шум — чтобы не было кольца «одинаковых» спавнов
  const a = Math.random() * Math.PI * 2;
  const kx = 1.15 + Math.random() * 0.35;
  const ky = 1.15 + Math.random() * 0.35;
  return _newParticle(
    Math.cos(a) * vis.halfW * kx,
    Math.sin(a) * vis.halfH * ky
  );
}

// Частица ВНУТРИ видимой области — для стартового заполнения
function makeInnerParticle() {
  const vis = visibleHalfSize();
  return _newParticle(
    (Math.random() * 2 - 1) * vis.halfW * 0.95,
    (Math.random() * 2 - 1) * vis.halfH * 0.95
  );
}

function makeWorldParticle() { return makeSpawnParticle(); }
function makeEdgeParticle()  { return makeSpawnParticle(); }

function initParticles(force) {
  // ★ Защита от повторного вызова: если частицы уже есть,
  // ничего не пересоздаём (иначе будет «продёргивание»).
  // Явный вызов initParticles(true) — принудительная пересборка.
  if (!force && PART.particles.length > 0) return;

  PART.particles = [];
  PART.absorbed = 0;
  PART.absorbRate = 0;
  PART._rateAt = 0;
  PART._rateCount = 0;
  PART.coreHue = null;

  // 55% — внутри видимой области (сразу «густо»),
  // 45% — за краем (естественный прилёт извне).
  for (let i = 0; i < PART_COUNT; i++) {
    if (i < PART_COUNT * 0.55) PART.particles.push(makeInnerParticle());
    else                       PART.particles.push(makeSpawnParticle());
  }

  PART.passing = [];
  PART.tapBursts = [];
  PART.lastPassingAt = performance.now();
}

// Быстрый сброс всех частиц в режим spiral (при смене фазы)
function resetAllParticlesToSpiral() {
  for (let i = 0; i < PART.particles.length; i++) {
    PART.particles[i] = makeSpawnParticle();
  }
}
window.resetAllParticlesToSpiral = resetAllParticlesToSpiral;

// ─── Поглощение ─────────────────────────────────────────────────
function _absorb(index) {
  const b = _boost();
  const reward = (b && b.dustPerParticle) || DUST_PER_PARTICLE;
  S.dust += reward;
  S.dustTotal += reward;
  PART.absorbed++;
  PART.corePulse = Math.max(PART.corePulse, 0.8);
  PART.particles[index] = makeSpawnParticle();
}

// ═══════════════════════════════════════════════════════════════
//  ОБНОВЛЕНИЕ
// ═══════════════════════════════════════════════════════════════
function updateParticles(dt, time) {
  const W = window.CANVAS_W || 400, H = window.CANVAS_H || 700;
  const z = S.zoom || 1;
  const halfW = W / (2 * z), halfH = H / (2 * z);
  const hasStar = !!S.starType;
  const stage = S.stage;
  const b = _boost();

  const areaFactor = Math.max(0.6, Math.min(2.2, Math.sqrt((W * H) / 320000)));
  const target = Math.round(PART_COUNT * areaFactor * Math.pow(1 / z, 1.5));
  const clampedTarget = Math.max(300, Math.min(2200, target));
  while (PART.particles.length < clampedTarget) PART.particles.push(makeSpawnParticle());
  while (PART.particles.length > clampedTarget + 5) PART.particles.pop();

  PART.corePulse *= 0.9;
  PART.starPulse *= 0.92;
  const absorbR = PART.coreR + 3;

  const fingerWorld = (PART.dragActive && !hasStar)
    ? screenToWorld(PART.dragX, PART.dragY) : null;

  let twistMult = 1;
  if (stage === 'condense' && b) {
    const av = Math.abs(PART.fingerAngularVel);
    const scale = b.twistScale || 0.7;
    const maxB = b.twistBoost || 3.5;
    const raw = 1 + Math.min(maxB - 1, av * scale);
    PART._twistSmooth = PART._twistSmooth * 0.85 + raw * 0.15;
    twistMult = PART._twistSmooth;
  } else {
    PART._twistSmooth = 1;
  }

  const diskR = (b && b.diskRadius) || 0;

  // ★ Позиции звёзд системы (1, 2 или 3) — пыль летит к ближайшей
  const starPositions = (hasStar && typeof getStarPositions === 'function')
    ? getStarPositions(time)
    : [{ x: 0, y: 0, r: 1.0 }];
  const multiStar = starPositions.length > 1;

  // ★ Отслеживание смены фазы
  if (S.stage !== PART._lastStage) {
    PART._lastStage = S.stage;
    PART._stageAt = performance.now();
  }

  // ★ Формирование диска в фазе II — кольцо "вырастает" за 5 сек.
  // В других фазах диск используется по целевому радиусу.
  let diskCurrentR = diskR;
  if (diskR && stage === 'condense' && PART._stageAt > 0) {
    const formSec = (b && b.diskFormSec) || 14;
    const age = (performance.now() - PART._stageAt) / 1000;
    const t = Math.min(1, age / formSec);
    const eased = t * t * (3 - 2 * t);
    const grow = 0.15 + 0.85 * eased;
    diskCurrentR = diskR * grow;
  }

  if (stage === 'protostar' && b && b.starThresholds) {
    const heat = S.protostarHeat || 0;
    for (let i = 0; i < b.starThresholds.length; i++) {
      if (heat >= b.starThresholds[i].q) { PART.coreHue = b.starThresholds[i].color; break; }
    }
  } else {
    PART.coreHue = null;
  }

  for (let i = PART.particles.length - 1; i >= 0; i--) {
    const p = PART.particles[i];
    p.twinkle += dt * 2;
    p.age += dt;

    // ─── INFALL — падает в ядро ───
    if (p.mode === 'infall') {
      const dist = Math.sqrt(p.x * p.x + p.y * p.y) || 1;
      const dirX = -p.x / dist, dirY = -p.y / dist;
      const tanX = -p.y / dist, tanY = p.x / dist;
      p.x += (dirX * 140 + tanX * 40) * dt;
      p.y += (dirY * 140 + tanY * 40) * dt;
      if (dist < absorbR) { _absorb(i); continue; }
      continue;
    }

    // Найти ближайшую звезду (или ядро 0,0 до появления звезды)
    let targetX = 0, targetY = 0;
    if (multiStar) {
      let bestD2 = Infinity;
      for (let si = 0; si < starPositions.length; si++) {
        const sp = starPositions[si];
        const dx = sp.x - p.x, dy = sp.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; targetX = sp.x; targetY = sp.y; }
      }
    }

    const toX = targetX - p.x, toY = targetY - p.y;
    const dist = Math.sqrt(toX * toX + toY * toY) || 1;
    const dirX = toX / dist, dirY = toY / dist;
    const tanX = -toY / dist, tanY = toX / dist;

    // ─── DISK — крутится на кольце ───
    if (p.mode === 'disk') {
      const spin = (b && b.diskSpinSpeed) || 3.5;
      let mult = 1;
      if (PART.dragActive && stage !== 'protostar') mult *= 1.6;
      mult *= (1 + Math.min(2.0, Math.abs(PART.fingerAngularVel) * 0.3));
      p.diskAngle += spin * mult * dt;
      // ★ Плотное кольцо: jitter маленький (0.6)
      const jitter = Math.sin(p.diskAngle * 4 + p.armOffset * 6) * 0.6;
      const rNow = diskCurrentR + jitter;
      p.x = Math.cos(p.diskAngle) * rNow;
      p.y = Math.sin(p.diskAngle) * rNow;
      // Таймер выхода
      const decayMult = (PART.dragActive && stage !== 'protostar') ? 2.5 : 1;
      p.diskTimeLeft -= dt * decayMult;
      if (p.diskTimeLeft <= 0) p.mode = 'infall';
      continue;
    }

    // ─── SPIRAL ───

    let v_r = (b && b.radialSpeed) || 25;
    let v_t = keplerTangential(dist, (b && b.vRef) || 25) * p.spinVar;

    if (!diskR) {
      const edge = 60;
      if (dist < edge) v_t *= Math.max(0.15, dist / edge);
    }

    let speedMult = 1;
    if (PART.dragActive && stage !== 'protostar') {
      if (b && b.holdBoost) speedMult *= b.holdBoost;
      if (stage === 'condense') speedMult *= twistMult;
    }
    v_r *= speedMult;
    v_t *= speedMult;

    let vx = dirX * v_r + tanX * v_t;
    let vy = dirY * v_r + tanY * v_t;

    if (fingerWorld && stage !== 'protostar') {
      const tdx = fingerWorld.x - p.x, tdy = fingerWorld.y - p.y;
      const td = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
      if (td < 100) {
        const s = (1 - td / 100) * 400;
        vx += (tdx / td) * s;
        vy += (tdy / td) * s;
      }
    }

    p.x += vx * dt;
    p.y += vy * dt;

       // ─── Вход в диск ───
    if (diskR && dist < diskCurrentR * 1.25 && dist > absorbR && !hasStar) {
      p.mode = 'disk';
      p.diskAngle = Math.atan2(p.y, p.x);
      p.diskTimeLeft = (b.diskOrbitSec || 5) * (0.8 + Math.random() * 0.4);
      p.x = Math.cos(p.diskAngle) * diskCurrentR;
      p.y = Math.sin(p.diskAngle) * diskCurrentR;
      continue;
    }

    if (dist < absorbR) { _absorb(i); continue; }

    if (stage !== 'cloud' && stage !== 'condense' && stage !== 'protostar' &&
        S.planets && S.planets.length > 0 &&
        typeof getPlanetWorldPos === 'function') {
      let consumed = false;
      for (let pi = 0; pi < S.planets.length; pi++) {
        const pl = S.planets[pi];
        if (pl.forming) continue;
        const ppos = getPlanetWorldPos(pl, time);
        const pRadius = (pl.diameter || 1) * 8 + 4;
        const dxp = p.x - ppos.x, dyp = p.y - ppos.y;
        if (dxp * dxp + dyp * dyp < pRadius * pRadius) {
          PART.particles[i] = makeSpawnParticle();
          consumed = true;
          break;
        }
      }
      if (consumed) continue;
    }

    if (p.x < -halfW * 1.5 || p.x > halfW * 1.5 ||
        p.y < -halfH * 1.5 || p.y > halfH * 1.5) {
      PART.particles[i] = makeSpawnParticle();
    }
  }

  if (stage === 'condense' || stage === 'protostar') {
    PART.coreR = 1.8 + Math.min(6, Math.log10(PART.absorbed + 1) * 2.0);
  } else PART.coreR = 1.8;

  if (time - PART._rateAt > 0.5) {
    const dtC = time - PART._rateAt;
    PART.absorbRate = (PART.absorbed - PART._rateCount) / dtC;
    PART._rateAt = time;
    PART._rateCount = PART.absorbed;
  }

  _updateFinger(time, dt);

  for (let i = PART.tapBursts.length - 1; i >= 0; i--) {
    PART.tapBursts[i].t += dt;
    if (PART.tapBursts[i].t >= PART.tapBursts[i].life) PART.tapBursts.splice(i, 1);
  }

  updatePassing(dt, time);
}

function _updateFinger(time, dt) {
  if (PART.dragActive) {
    // ─── Скорость пальца в пикселях/сек ───
    if (PART.dragLastAt > 0) {
      const dtT = time - PART.dragLastAt;
      if (dtT > 0.001 && dtT < 0.5) {
        PART.dragVelX = (PART.dragX - PART.dragLastX) / dtT;
        PART.dragVelY = (PART.dragY - PART.dragLastY) / dtT;
      }
    }
    PART.dragLastAt = time;
    PART.dragLastX = PART.dragX;
    PART.dragLastY = PART.dragY;

    // ─── Угловая скорость вокруг центра ───
    const fw = screenToWorld(PART.dragX, PART.dragY);
    const curA = Math.atan2(fw.y, fw.x);

    // Палец сдвинулся с прошлого кадра?
    const moved = (PART.dragX !== PART._lastDragX ||
                   PART.dragY !== PART._lastDragY);
    PART._lastDragX = PART.dragX;
    PART._lastDragY = PART.dragY;

    if (PART.fingerLastAngle !== null && moved && dt > 0.001) {
      let dA = curA - PART.fingerLastAngle;
      if (dA > Math.PI) dA -= Math.PI * 2;
      if (dA < -Math.PI) dA += Math.PI * 2;
      // dA/dt — мгновенная угловая скорость
      let inst = dA / dt;
      // Отсекаем телепорты и клики-сквозь
      if (inst > 8) inst = 8;
      if (inst < -8) inst = -8;
      // Плавное сглаживание (медленнее нарастает, медленно гаснет)
      PART.fingerAngularVel = PART.fingerAngularVel * 0.88 + inst * 0.12;
    } else if (!moved) {
      // Палец стоит — плавный decay, а не обнуление
      PART.fingerAngularVel *= 0.85;
      if (Math.abs(PART.fingerAngularVel) < 0.05) PART.fingerAngularVel = 0;
    }

    PART.fingerLastAngle = curA;
  } else {
    PART.dragVelX = 0; PART.dragVelY = 0; PART.dragLastAt = 0;
    PART.fingerLastAngle = null; PART.fingerAngularVel = 0;
    PART._twistSmooth = 1;
  }
}

// ═══════════════════════════════════════════════════════════════
//  ТАП В ФАЗЕ III
// ═══════════════════════════════════════════════════════════════
function registerProtostarTap(x, y) {
  if (S.stage !== 'protostar') return false;
  const b = _boost();
  const add = (b && b.heatTapBoost) || 0.08;
  S.protostarHeat = Math.min(1, (S.protostarHeat || 0) + add);
  PART.tapBursts.push({ x, y, t: 0, life: 0.5 });
  PART.corePulse = Math.max(PART.corePulse, 0.7);
  return true;
}

// ═══════════════════════════════════════════════════════════════
//  ПРОЛЁТЫ
// ═══════════════════════════════════════════════════════════════
function updatePassing(dt, time) {
  const now = performance.now();
  if (now - PART.lastPassingAt > 120000 + Math.random() * 180000) {
    PART.lastPassingAt = now;
    spawnPassing();
  }
  const W = window.CANVAS_W || 400, H = window.CANVAS_H || 700;
  const z = S.zoom || 1;
  const halfW = W / (2 * z), halfH = H / (2 * z);

  for (let i = PART.passing.length - 1; i >= 0; i--) {
    const o = PART.passing[i];

    if (o.type === 'comet' && S.starType && !o.dying) {
      const dx = -o.x, dy = -o.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d < 300) {
        const g = 8000 / (d * d + 100);
        o.vx += (dx / d) * g * dt;
        o.vy += (dy / d) * g * dt;
      }
      if (d < 90) {
        o.dying = true; o.dieAt = now;
        if (Array.isArray(S.explosions)) {
          const sp = worldToScreen(o.x, o.y);
          S.explosions.push({ x: sp.x, y: sp.y, type: 'destroy',
            startAt: now, endAt: now + 800, size: 22 });
        }
        if (typeof toast === 'function') toast('☄️ Комета испарилась', 'Жар звезды');
        continue;
      }
    }

    if (!o.dying && !o.immune && !o.missionId && S.primeSystem && S.starType) {
      let absorbR = 0;
      if (typeof PRIME_OBJECTS !== 'undefined' &&
          PRIME_OBJECTS[S.primeSystem.objectKey]) {
        absorbR = PRIME_OBJECTS[S.primeSystem.objectKey].absorbRadius || 0;
      }
      const d = Math.sqrt(o.x * o.x + o.y * o.y);
      if (absorbR > 0 && d < absorbR) {
        o.dying = true; o.dieAt = now;
        if (Array.isArray(S.explosions)) {
          const sp = worldToScreen(o.x, o.y);
          S.explosions.push({ x: sp.x, y: sp.y, type: 'destroy',
            startAt: now, endAt: now + 600, size: 28 });
        }
        if (typeof toast === 'function') {
          toast('🌀 ' + (S.primeSystem.objectName || 'Объект'),
            'Поглотил ' + (o.type === 'ship' ? 'корабль' : 'метеорит'));
        }
        if (typeof addEvent === 'function') {
          addEvent('prime_found',
            (S.primeSystem.objectName || 'Объект') + ' поглотил ' +
            (o.type === 'ship' ? 'корабль' : 'метеорит'));
        }
        continue;
      }
    }

    if (o.type === 'comet' && !o.dying && !o.immune &&
        S.planets && S.planets.length > 0 &&
        typeof getPlanetWorldPos === 'function') {
      const nowSec = now / 1000;
      const cfg = window.MISSIONS_CFG || {};
      const dmgRange = cfg.cometDamageRange || 2.5;
      const dmgChance = cfg.cometDamageChance || 0.35;
      for (let j = 0; j < S.planets.length; j++) {
        const pl = S.planets[j];
        if (pl.forming) continue;
        const pos = getPlanetWorldPos(pl, nowSec);
        const dd = Math.hypot(o.x - pos.x, o.y - pos.y);
        const hitR = (pl.diameter * 5) * dmgRange + o.size * 15;
        if (dd < hitR) {
          o.dying = true; o.dieAt = now;
          if (Math.random() < dmgChance) {
            const sp = worldToScreen(o.x, o.y);
            S.explosions.push({ x: sp.x, y: sp.y, type: 'destroy',
              startAt: now, endAt: now + 1500, size: 40 });
            const pname = PLANET_TYPES[pl.type].name;
            S.planets = S.planets.filter(function(pp) { return pp !== pl; });
            if (typeof toast === 'function') toast('💥 Комета уничтожила', pname);
            if (typeof logPlanetDestroyed === 'function') {
              logPlanetDestroyed(pname, 'comet');
            }
          } else {
            const sp = worldToScreen(o.x, o.y);
            S.explosions.push({ x: sp.x, y: sp.y, type: 'moon',
              startAt: now, endAt: now + 700, size: 25 });
            if (typeof toast === 'function') toast('☄️ Комета разбилась', PLANET_TYPES[pl.type].name + ' выжила');
          }
          break;
        }
      }
    }

    if (o.dying) {
      const age = (now - o.dieAt) / 800;
      if (age > 1) { PART.passing.splice(i, 1); continue; }
      o.alpha = 1 - age;
    }

    o.x += o.vx * dt; o.y += o.vy * dt;
    o.age += dt;
    o.trail.push({ x: o.x, y: o.y });
    if (o.trail.length > o.tailLen) o.trail.shift();

    if (o.x < -halfW - 150 || o.x > halfW + 150 ||
        o.y < -halfH - 150 || o.y > halfH + 150) {
      PART.passing.splice(i, 1);
    }
  }
}

function spawnPassing() {
  const W = window.CANVAS_W || 400, H = window.CANVAS_H || 700;
  const z = S.zoom || 1;
  const halfW = W / (2 * z), halfH = H / (2 * z);
  const isComet = Math.random() < 0.6;
  const size = 0.3 + Math.random() * 0.7;
  const tailLen = Math.round(8 + size * 14);
  const side = Math.floor(Math.random() * 4);
  let x, y, vx, vy;
  const speed = 50 + Math.random() * 90;
  if (side === 0)      { x = (Math.random()*2-1)*halfW; y = -halfH-40; vx = (Math.random()-0.5)*40; vy = speed; }
  else if (side === 1) { x = halfW+40; y = (Math.random()*2-1)*halfH; vx = -speed; vy = (Math.random()-0.5)*40; }
  else if (side === 2) { x = (Math.random()*2-1)*halfW; y = halfH+40; vx = (Math.random()-0.5)*40; vy = -speed; }
  else                 { x = -halfW-40; y = (Math.random()*2-1)*halfH; vx = speed; vy = (Math.random()-0.5)*40; }
  PART.passing.push({
    x, y, vx, vy,
    type: isComet ? 'comet' : 'ship',
    size, tailLen, alpha: 1, age: 0, trail: [],
  });
}

// ═══════════════════════════════════════════════════════════════
//  РИСОВАНИЕ
// ═══════════════════════════════════════════════════════════════
function particleVisibility() {
  if (S.stage === 'cloud')       return 1.0;
  if (S.stage === 'condense')    return 0.95;
  if (S.stage === 'protostar')   return 0.75;
  if (S.stage === 'firstPlanet') return 0.5;
  if (S.stage === 'system')      return Math.max(0.2, 0.5 - S.planets.length * 0.04);
  if (S.stage === 'galaxy')      return 0.15;
  return 1.0;
}

function _hexToRgba(hex, a) {
  if (!hex || hex[0] !== '#') return 'rgba(240, 235, 255, ' + a + ')';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

function drawParticles(ctx, time) {
  const z = S.zoom || 1;
  const t = time;
  const stage = S.stage;
  const hasStar = !!S.starType;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  if (!hasStar) {
    const pulse = 1 + PART.corePulse * 0.5;
    const coreRNow = PART.coreR * pulse * z;
    const cpos = worldToScreen(0, 0);

    if (stage === 'protostar') {
      _drawJets(ctx, cpos.x, cpos.y, z, PART.coreHue || '#b4dcff');
    }

    const coreColor = PART.coreHue || '#f0ebff';
    const haloR = (stage === 'condense' || stage === 'protostar' ? 22 : 12) * z;
    const haloAlpha = stage === 'protostar' ? 0.5 : (stage === 'condense' ? 0.35 : 0.25);

    const g = ctx.createRadialGradient(cpos.x, cpos.y, 0, cpos.x, cpos.y, haloR);
    g.addColorStop(0, _hexToRgba(coreColor, haloAlpha + 0.2));
    g.addColorStop(0.5, _hexToRgba(coreColor, haloAlpha * 0.4));
    g.addColorStop(1, _hexToRgba(coreColor, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cpos.x, cpos.y, haloR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = coreColor;
    ctx.beginPath();
    ctx.arc(cpos.x, cpos.y, coreRNow, 0, Math.PI * 2);
    ctx.fill();
  }

  const sizeFactor = Math.max(0.7, z);
  const vis = particleVisibility();
  for (let i = 0; i < PART.particles.length; i++) {
    const p = PART.particles[i];
    const sp = worldToScreen(p.x, p.y);
    const dist = Math.sqrt(p.x * p.x + p.y * p.y);

    let heat = 0;
    if (typeof tempAt === 'function') {
      const rAe = dist / PHYS.refRadius;
      const temp = tempAt(rAe);
      heat = Math.max(0, Math.min(1, (temp - 50) / 400));
    } else {
      heat = Math.max(0, 1 - dist / 120);
    }
    const hueShift = -heat * 60 + (1 - heat) * 20;
    const brightBoost = 1 + heat * 1.5;
    const inDisk = p.mode === 'disk';
    const diskBoost = inDisk ? 1.4 : 1.0;

    const tw = 0.7 + 0.3 * Math.sin(p.twinkle + t * 2);
    const alpha = Math.min(1, p.bright * tw * 0.85 * vis * brightBoost * diskBoost);
    ctx.globalAlpha = alpha;

    let fillHue = p.hue + hueShift;
    let fillLight = 68 + heat * 18;
    let fillSat = 65 + heat * 25;
    if (inDisk && PART.coreHue) {
      // Частицы на диске в фазе III — цвета превью звезды
      const rgb = _hexToRgbParts(PART.coreHue);
      if (rgb) {
        fillHue = rgb.h;
        fillSat = rgb.s;
        fillLight = Math.min(95, rgb.l + 15);
      }
    } else if (inDisk) {
      fillLight = Math.min(95, fillLight + 12);
    }

    ctx.fillStyle = 'hsl(' + fillHue + ', ' + fillSat + '%, ' + fillLight + '%)';
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, p.r * sizeFactor * (1 + heat * 0.3) * diskBoost, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  if (PART.tapBursts.length > 0) _drawTapBursts(ctx, z);
  if (stage === 'protostar') _drawHeatBar(ctx);

  drawPassing(ctx);
}

function _drawJets(ctx, cx, cy, z, color) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let side = -1; side <= 1; side += 2) {
    const len = 70 * z, w = 9 * z;
    const g = ctx.createLinearGradient(cx, cy, cx, cy + side * len);
    g.addColorStop(0, _hexToRgba(color, 0.6));
    g.addColorStop(0.5, _hexToRgba(color, 0.3));
    g.addColorStop(1, _hexToRgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - w, cy);
    ctx.lineTo(cx + w, cy);
    ctx.lineTo(cx + w * 0.4, cy + side * len);
    ctx.lineTo(cx - w * 0.4, cy + side * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function _drawTapBursts(ctx, z) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < PART.tapBursts.length; i++) {
    const b = PART.tapBursts[i];
    const k = b.t / b.life;
    const alpha = 1 - k;
    const r = (10 + k * 40) * z;
    const col = PART.coreHue || '#ffb347';
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
    g.addColorStop(0, _hexToRgba(col, alpha * 0.9));
    g.addColorStop(0.5, _hexToRgba(col, alpha * 0.4));
    g.addColorStop(1, _hexToRgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function _drawHeatBar(ctx) {
  const W = window.CANVAS_W || 400;
  const H = window.CANVAS_H || 700;
  const heat = S.protostarHeat || 0;
  const col = PART.coreHue || '#ffcc55';

  const barW = Math.min(280, W - 80);
  const barH = 12;
  const bx = (W - barW) / 2;
  const by = H - 190;

  ctx.save();
  ctx.fillStyle = 'rgba(30, 20, 50, 0.75)';
  ctx.fillRect(bx, by, barW, barH);

  const grad = ctx.createLinearGradient(bx, 0, bx + barW, 0);
  grad.addColorStop(0, _hexToRgba(col, 0.6));
  grad.addColorStop(1, col);
  ctx.fillStyle = grad;
  ctx.fillRect(bx, by, barW * heat, barH);

  ctx.strokeStyle = 'rgba(180, 160, 255, 0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, barW, barH);

  ctx.fillStyle = '#e8e2ff';
  ctx.font = 'bold 12px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🔥 Зажигание: ' + Math.round(heat * 100) + '%', W / 2, by - 8);
  ctx.restore();
}

function drawPassing(ctx) {
  const z = S.zoom || 1;

  // Аура поглощения у прайм-объекта
  if (S.primeSystem && typeof PRIME_OBJECTS !== 'undefined' &&
      PRIME_OBJECTS[S.primeSystem.objectKey]) {
    const absorbR = PRIME_OBJECTS[S.primeSystem.objectKey].absorbRadius || 0;
    if (absorbR > 0) {
      const cp = worldToScreen(0, 0);
      const r = absorbR * z;
      const t = performance.now() / 1000;
      const pulse = 1 + 0.08 * Math.sin(t * 2);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cp.x, cp.y, r * 0.6, cp.x, cp.y, r * pulse);
      g.addColorStop(0, 'rgba(200, 100, 255, 0)');
      g.addColorStop(0.7, 'rgba(180, 90, 220, 0.10)');
      g.addColorStop(1, 'rgba(140, 60, 200, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, r * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(180, 120, 255, ' + (0.15 + 0.1 * Math.sin(t * 3)) + ')';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  for (let i = 0; i < PART.passing.length; i++) {
    const o = PART.passing[i];
    const alpha = o.alpha != null ? o.alpha : 1;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let j = 0; j < o.trail.length; j++) {
      const seg = o.trail[j];
      const sp = worldToScreen(seg.x, seg.y);
      const life = j / o.trail.length;
      ctx.globalAlpha = life * 0.7 * alpha;
      const size = (1 + life * 2.5) * o.size * z;
      const grad = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, size * 2);
      if (o.type === 'comet') {
        grad.addColorStop(0, 'rgba(150, 220, 255, 0.9)');
        grad.addColorStop(1, 'rgba(100, 150, 255, 0)');
      } else {
        grad.addColorStop(0, 'rgba(255, 220, 150, 0.9)');
        grad.addColorStop(1, 'rgba(200, 150, 80, 0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, size * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    const sp = worldToScreen(o.x, o.y);
    if (o.type === 'ship') {
      const angle = Math.atan2(o.vy, o.vx);
      const s = o.size * z * 4;
      ctx.save();
      ctx.globalAlpha = 0.95 * alpha;
      ctx.translate(sp.x, sp.y);
      ctx.rotate(angle);
      ctx.fillStyle = '#c8e6ff';
      ctx.beginPath();
      ctx.moveTo(s * 1.8, 0);
      ctx.lineTo(-s * 0.8, -s * 0.7);
      ctx.lineTo(-s * 0.4, 0);
      ctx.lineTo(-s * 0.8, s * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.restore();
      continue;
    }

    ctx.globalAlpha = 0.95 * alpha;
    ctx.fillStyle = '#e8f6ff';
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 1.6 * o.size * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function handleParticleDrag(x, y, active) {
  if (S.starType) return;
  PART.dragX = x;
  PART.dragY = y;
  PART.dragActive = active;
  if (!active) {
    PART.dragVelX = 0; PART.dragVelY = 0; PART.dragLastAt = 0;
    PART.fingerLastAngle = null; PART.fingerAngularVel = 0;
  }
}

function _hexToRgbParts(hex) {
  if (!hex || hex[0] !== '#') return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

window.initParticles = initParticles;
window.updateParticles = updateParticles;
window.drawParticles = drawParticles;
window.handleParticleDrag = handleParticleDrag;
window.registerProtostarTap = registerProtostarTap;
window.worldToScreen = worldToScreen;
window.screenToWorld = screenToWorld;
window.PART = PART;