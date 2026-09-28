// ═══════════════════════════════════════════════════════════════
//  PLANETS.JS — планеты, орбиты, слияния, снеговая линия
// ═══════════════════════════════════════════════════════════════

const VIEW_COS = 0.5;

// ─── Физические константы (Hayashi 1981) ────────────────────────
// Имя P_PHYS — чтобы не конфликтовать с physics.js
const P_PHYS = {
  refRadius: 100,
  refTemp: 280,
  snowLine: 270,
};
// ─── Escape-скорость (Safronov) ─────────────────────────────────
// v_esc = √(2GM/R). В игровом масштабе: √(масса / радиус) × 0.5
function escapeVelocity(mass, radius) {
  if (radius <= 0) return 0;
  return Math.sqrt(2 * mass / radius) * 0.5;
}

// Относительная скорость на разных орбитах
function relativeVelocity(r1, r2) {
  // v ∝ 1/√r → |v1 - v2|
  const v1 = 1 / Math.sqrt(Math.max(10, r1) / 100);
  const v2 = 1 / Math.sqrt(Math.max(10, r2) / 100);
  return Math.abs(v1 - v2);
}

// Правило слияния (Safronov/Ida-Lin)
function shouldMerge(p1, p2) {
  const r1 = p1.orbitR || 100;
  const r2 = p2.orbitR || 100;
  const gap = Math.abs(r1 - r2);
  const sumRadii = (p1.diameter + p2.diameter) * 8;

  const vRel = relativeVelocity(r1, r2);
  const vEsc = escapeVelocity(p1.mass + p2.mass, p1.diameter + p2.diameter);

  // Гравитационный фокус — захват шире физического радиуса
  const focusFactor = vRel > 0.01
    ? Math.sqrt(1 + (vEsc * vEsc) / (vRel * vRel))
    : 1;
  const captureDist = sumRadii * Math.min(4, focusFactor);

  if (gap > captureDist) return null;
  if (vRel > vEsc * 1.2) return 'bounce';
  return 'merge';
}
// Температура на расстоянии r (px): T(r) = T0 · (r0/r)^(1/2)
function tempAt(r) {
  if (r < 1) r = 1;
  return P_PHYS.refTemp * Math.sqrt(P_PHYS.refRadius / r);
}

// Зона по температуре
function zoneAt(r) {
  const t = tempAt(r);
  if (t > 1000) return 'lava';
  if (t > 400)  return 'hot';
  if (t > 170)  return 'rocky';
  if (t > 80)   return 'ice';
  return 'gas';
}

// ─── Добавление планеты ─────────────────────────────────────────
function addPlanet(type) {
  if (S.planets.length >= 8) return false;
  const idx = S.planets.length;
  S.planets.push({
    type: type,
    angle: Math.random() * Math.PI * 2,
    speed: 0.15 / Math.sqrt(idx + 1),
    baseOrbitR: 90 + idx * 34,
    orbitR: 90 + idx * 34,
    driftPhase: Math.random() * Math.PI * 2,
    rotation: Math.random() * Math.PI * 2,
    seed: Math.random() * 1e6,
    forming: false,
    formUntil: 0,
    mass: planetMass(type),
    diameter: planetDiameter(type),
    moons: [],
  });
  return true;
}

// ─── Обновление планет ──────────────────────────────────────────
function updatePlanets(dt) {
  if (!S.systemType) return;
  const now = Date.now();

   // ★ Инициализация газа при первом вызове
  if (typeof initGas === 'function' && GAS.initTime === null) initGas();

  for (let i = 0; i < S.planets.length; i++) {
    const p = S.planets[i];
    if (p.forming) {
      if (now >= p.formUntil) {
        p.forming = false;
        if (typeof toast === 'function') {
          toast('🪐 Планета сформирована', PLANET_TYPES[p.type].name);
        }
      }
      continue;
    }

    // ★ Миграция I типа — сползание к звезде пока есть газ
    if (typeof migrationRate === 'function') {
      const dr = migrationRate(p);
      if (dr !== 0) {
        p.baseOrbitR = Math.max(55, p.baseOrbitR + dr * dt);
      }
    }

    p.orbitR = p.baseOrbitR * (1 + 0.12 * Math.sin(now * 0.00002 + p.driftPhase));
    p.rotation += dt * 0.5;
  }

  for (let i = S.explosions.length - 1; i >= 0; i--) {
    if (now > S.explosions[i].endAt) S.explosions.splice(i, 1);
  }

  checkCollisions();
}

// ─── Столкновения ───────────────────────────────────────────────
function checkCollisions() {
  const st = SYSTEM_TYPES[S.systemType];
  if (!st.collisionPerPlanet) return;

  S.collisionTimer = (S.collisionTimer || 0) + 1 / 60;
  if (S.collisionTimer < CFG.collisionInterval) return;
  S.collisionTimer = 0;

  const active = S.planets.filter(function(p) { return !p.forming; });
  if (active.length < 2) return;

  const chance = st.collisionPerPlanet * active.length;
  if (Math.random() > chance) return;

    const sorted = active.slice().sort(function(a, b) { return a.orbitR - b.orbitR; });
  for (let i = 0; i < sorted.length - 1; i++) {
    const decision = shouldMerge(sorted[i], sorted[i + 1]);
    if (decision === 'merge') {
      collidePlanets(sorted[i], sorted[i + 1], 'merge');
      return;
    }
     // ★ Отскок — если скорости слишком высокие для слияния
  if (decision === 'bounce') {
    const avgR = (a.orbitR + b.orbitR) / 2;
    a.baseOrbitR = Math.max(60, avgR - 20);
    b.baseOrbitR = avgR + 20;

    // ★ Потеря пыли от удара
    const dustLoss = Math.floor(S.dust * 0.08);  // 8% пыли
    S.dust = Math.max(0, S.dust - dustLoss);

    const sp = worldToScreen(wmx, wmy);
    S.explosions.push({
      x: sp.x, y: sp.y, type: 'moon',
      startAt: Date.now(), endAt: Date.now() + 600, size: 20,
    });
    if (typeof toast === 'function') {
      toast('💫 Отскок', '−' + fmt(dustLoss) + ' пыли от удара');
    }
    return;
  }
  }
}

function collidePlanets(a, b, decision) {
  const aPt = PLANET_TYPES[a.type];
  const bPt = PLANET_TYPES[b.type];

  const angleA = a.angle;
  const angleB = b.angle;
  const wxA = Math.cos(angleA) * a.orbitR;
  const wyA = Math.sin(angleA) * a.orbitR * VIEW_COS;
  const wxB = Math.cos(angleB) * b.orbitR;
  const wyB = Math.sin(angleB) * b.orbitR * VIEW_COS;
  const wmx = (wxA + wxB) / 2;
  const wmy = (wyA + wyB) / 2;
  const bigMass = a.mass + b.mass;
  const roll = Math.random();
  // ★ Отскок — если скорости слишком высокие для слияния
  if (decision === 'bounce') {
    const avgR = (a.orbitR + b.orbitR) / 2;
    a.baseOrbitR = Math.max(60, avgR - 20);
    b.baseOrbitR = avgR + 20;
    const sp = worldToScreen(wmx, wmy);
    S.explosions.push({
      x: sp.x, y: sp.y, type: 'moon',
      startAt: Date.now(), endAt: Date.now() + 600, size: 20,
    });
    if (typeof toast === 'function') {
      toast('💫 Отскок', 'Скорость слишком высока');
    }
    return;
  }

  if (roll < 0.5) {
    // Разрушение
    const refund = Math.floor((aPt.rate + bPt.rate) * 600);
    S.dust += refund;
    S.dustTotal += refund;
    S.planets = S.planets.filter(function(p) { return p !== a && p !== b; });

    if (Math.random() < 0.3 && S.planets.length > 0) {
      const lucky = S.planets[Math.floor(Math.random() * S.planets.length)];
      lucky.moons.push({
        size: 0.4 + Math.random() * 0.5,
        angle: Math.random() * Math.PI * 2,
        speed: 2 + Math.random() * 1.5,
        dist: 2.2 + Math.random() * 0.5,
      });
      if (typeof toast === 'function') toast('🌙 Луна', 'Осколок стал спутником');
    }

    const sp = worldToScreen(wmx, wmy);
    S.explosions.push({
      x: sp.x, y: sp.y, type: 'destroy',
      startAt: Date.now(), endAt: Date.now() + 1500,
      size: 30 + bigMass * 3,
    });
    if (typeof toast === 'function') {
      toast('💥 Столкновение', '+' + fmt(refund) + ' пыли');
    }
  } else {
    // Слияние
    const newType = aPt.rate > bPt.rate ? a.type : b.type;
    const rPix = (a.orbitR + b.orbitR) / 2;
    const newMass = a.mass + b.mass;

    S.planets = S.planets.filter(function(p) { return p !== a && p !== b; });
    const idx = S.planets.length;

    S.planets.push({
      type: newType,
      angle: Math.random() * Math.PI * 2,
      speed: 0.15 / Math.sqrt(idx + 1),
      baseOrbitR: rPix,
      orbitR: rPix,
      driftPhase: Math.random() * Math.PI * 2,
      rotation: 0,
      seed: Math.random() * 1e6,
      forming: true,
      formUntil: Date.now() + CFG.formationDuration * 1000,
      mass: newMass,
      diameter: Math.pow(newMass, 1 / 3) * 1.1,
      moons: [],
    });

    const sp = worldToScreen(wmx, wmy);
    S.explosions.push({
      x: sp.x, y: sp.y, type: 'merge',
      startAt: Date.now(), endAt: Date.now() + 1000, size: 40,
    });
    if (typeof toast === 'function') {
      toast('🪐 Слияние', PLANET_TYPES[newType].name);
    }
  }
}

// ─── Рисование звезды ───────────────────────────────────────────
function drawStar(ctx, time) {
  if (!S.starType) return;
  const st = STAR_TYPES[S.starType];
  const sysType = S.systemType || 'single';
  const starsCount = SYSTEM_TYPES[sysType].stars;
  const z = S.zoom || 1;
  const t = time;

  if (starsCount === 1) {
    drawOneStar(ctx, 0, 0, st.size, t, 0, z);
  } else if (starsCount === 2) {
    const sep = 45;
    const a = t * 0.22;
    const wx1 = Math.cos(a) * sep;
    const wy1 = Math.sin(a) * sep * 0.4;
    drawOneStar(ctx, wx1, wy1, st.size * 0.82, t, 1.7, z);
    drawOneStar(ctx, -wx1, -wy1, st.size * 0.82, t, 3.4, z);
  } else {
    const sep = 55;
    for (let i = 0; i < 3; i++) {
      const baseA = (i / 3) * Math.PI * 2 + t * 0.15;
      const wx = Math.cos(baseA) * sep;
      const wy = Math.sin(baseA) * sep * 0.4;
      drawOneStar(ctx, wx, wy, st.size * 0.68, t, i * 1.9, z);
    }
  }
}

function drawOneStar(ctx, wx, wy, sizeMul, t, seed, z) {
  const st = STAR_TYPES[S.starType];
  const sp = worldToScreen(wx, wy);
  const hue = st.color, sat = st.sat, light = st.light;
  const baseR = 14 * sizeMul * z;
  const pulse = 1 + 0.06 * Math.sin(t * 2.4 + seed);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const haloR = baseR * 8 * pulse;
  const halo = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, haloR);
  halo.addColorStop(0, 'hsla(' + hue + ', 100%, 95%, 0.6)');
  halo.addColorStop(0.15, 'hsla(' + hue + ', ' + sat + '%, ' + light + '%, 0.55)');
  halo.addColorStop(0.45, 'hsla(' + hue + ', ' + sat + '%, ' + (light - 15) + '%, 0.2)');
  halo.addColorStop(1, 'hsla(' + hue + ', ' + sat + '%, ' + (light - 30) + '%, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(sp.x, sp.y, haloR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'hsla(' + hue + ', 100%, 99%, 1)';
  ctx.beginPath();
  ctx.arc(sp.x, sp.y, baseR * 0.55 * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ─── Рисование планет + снеговая линия ──────────────────────────
function drawPlanets(ctx, time) {
  const t = time;
  const z = S.zoom || 1;
  const starHue = S.starType ? STAR_TYPES[S.starType].color : 260;

  // ★ СНЕГОВАЯ ЛИНИЯ — рисуется сразу после выбора звезды, даже если планет ещё нет
  if (S.starType) {
        const snowPx = P_PHYS.snowLine;
    ctx.save();
    ctx.strokeStyle = 'rgba(126, 200, 227, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 12]);
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.2) {
      const wx = Math.cos(a) * snowPx;
      const wy = Math.sin(a) * snowPx * VIEW_COS;
      const sp = worldToScreen(wx, wy);
      if (a === 0) ctx.moveTo(sp.x, sp.y);
      else ctx.lineTo(sp.x, sp.y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // Подпись
    const lblPos = worldToScreen(snowPx, 0);
    ctx.fillStyle = 'rgba(126, 200, 227, 0.5)';
    ctx.font = '9px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('❄ снеговая линия', lblPos.x + 6, lblPos.y - 4);
    ctx.restore();
  }

  // Если планет нет — больше рисовать нечего
  if (S.planets.length === 0) return;

  // Орбиты планет
  ctx.save();
  for (let i = 0; i < S.planets.length; i++) {
    const p = S.planets[i];
    if (p.forming) continue;
    ctx.strokeStyle = 'hsla(' + starHue + ', 50%, 60%, 0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.2) {
      const wx = Math.cos(a) * p.orbitR;
      const wy = Math.sin(a) * p.orbitR * VIEW_COS;
      const sp = worldToScreen(wx, wy);
      if (a === 0) ctx.moveTo(sp.x, sp.y);
      else ctx.lineTo(sp.x, sp.y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();

  // Сортировка по глубине (задние — первыми)
  const sorted = S.planets.map(function(p) {
    const angle = p.angle + t * p.speed;
    const sinA = Math.sin(angle);
    const wx = Math.cos(angle) * p.orbitR;
    const wy = sinA * p.orbitR * VIEW_COS;
    return { p: p, wx: wx, wy: wy, depth: sinA };
  }).sort(function(a, b) { return a.depth - b.depth; });

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const p = item.p;
    const sp = worldToScreen(item.wx, item.wy);
    const behind = item.depth < 0;
    const scale = (1 + item.depth * 0.15) * z;
    const alpha = behind ? 0.7 : 1;

    if (p.forming) {
      drawFormingPlanet(ctx, sp.x, sp.y, t, p, z);
      continue;
    }

    const baseSize = 5 * p.diameter * scale;
    drawTexturedPlanet(ctx, sp.x, sp.y, baseSize, p, alpha);

    // Луны
    for (let m = 0; m < p.moons.length; m++) {
      const moon = p.moons[m];
      const mAngle = moon.angle + t * moon.speed;
      const mx = sp.x + Math.cos(mAngle) * baseSize * moon.dist;
      const my = sp.y + Math.sin(mAngle) * baseSize * moon.dist * 0.6;
      ctx.save();
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = '#cfc6b0';
      ctx.beginPath();
      ctx.arc(mx, my, baseSize * moon.size * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawExplosions(ctx);
}

// ─── Текстурированная планета ───────────────────────────────────
function drawTexturedPlanet(ctx, x, y, size, p, alpha) {
  const pt = PLANET_TYPES[p.type];
  const starPos = worldToScreen(0, 0);

  // Свечение
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha * 0.5;
  const glowGrad = ctx.createRadialGradient(x, y, size * 0.7, x, y, size * 2.8);
  glowGrad.addColorStop(0, pt.color);
  glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(x, y, size * 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Тело
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.clip();

  const baseGrad = ctx.createRadialGradient(
    x - size * 0.3, y - size * 0.3, 0, x, y, size);
  baseGrad.addColorStop(0, lightenColor(pt.color, 0.4));
  baseGrad.addColorStop(0.7, pt.color);
  baseGrad.addColorStop(1, darkenColor(pt.color, 0.4));
  ctx.fillStyle = baseGrad;
  ctx.fillRect(x - size, y - size, size * 2, size * 2);

  drawPlanetTexture(ctx, x, y, size, p);

  // Тень от звезды
  const shadowAngle = Math.atan2(y - starPos.y, x - starPos.x) - Math.PI;
  const shx = x + Math.cos(shadowAngle) * size * 1.5;
  const shy = y + Math.sin(shadowAngle) * size * 1.5;
  const shadowGrad = ctx.createRadialGradient(shx, shy, 0, shx, shy, size * 2);
  shadowGrad.addColorStop(0, 'rgba(0,0,0,0.75)');
  shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadowGrad;
  ctx.fillRect(x - size, y - size, size * 2, size * 2);
  ctx.restore();

  // Кольца газового гиганта
  if (p.type === 'gasGiant') {
    drawRings(ctx, x, y, size, alpha);
  }
}

function drawPlanetTexture(ctx, x, y, size, p) {
  const seed = p.seed;
  const rot = p.rotation || 0;
  ctx.save();
  ctx.globalAlpha = 0.4;

  if (p.type === 'rocky' || p.type === 'superEarth') {
    for (let i = 0; i < 12; i++) {
      const a = hash(seed + i * 3.7) * Math.PI * 2;
      const r = hash(seed + i * 5.1) * size * 0.85;
      const cr = 1 + hash(seed + i * 7.3) * (size * 0.18);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.arc(x + Math.cos(a + rot * 0.3) * r,
              y + Math.sin(a + rot * 0.3) * r, cr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (p.type === 'gasGiant' || p.type === 'iceGiant') {
    for (let i = 0; i < 6; i++) {
      const sy = y - size + (i + 0.5) * (size * 2 / 6);
      const sh = (size * 2 / 6) * 0.5;
      const hs = hash(seed + i * 11.3);
      if (p.type === 'gasGiant') {
        ctx.fillStyle = 'hsla(' + (35 + hs * 15) + ', 60%, ' +
                        (50 + hs * 20) + '%, 0.6)';
      } else {
        ctx.fillStyle = 'hsla(' + (200 + hs * 20) + ', 70%, ' +
                        (65 + hs * 15) + '%, 0.55)';
      }
      ctx.beginPath();
      ctx.ellipse(x + Math.sin(rot * 0.5 + i) * 2, sy, size, sh, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (p.type === 'lava') {
    const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.003 + seed);
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 8; i++) {
      const a = hash(seed + i * 13.7) * Math.PI * 2;
      const r = hash(seed + i * 17.1) * size * 0.8;
      const px = x + Math.cos(a + rot * 0.2) * r;
      const py = y + Math.sin(a + rot * 0.2) * r;
      const gr = ctx.createRadialGradient(px, py, 0, px, py, size * 0.25);
      gr.addColorStop(0, 'rgba(255, 200, 60, ' + pulse + ')');
      gr.addColorStop(1, 'rgba(200, 40, 0, 0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(px, py, size * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawRings(ctx, x, y, size, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(1, 0.32);
  ctx.strokeStyle = 'rgba(212, 167, 106, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, size * 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ─── Формирующаяся планета ──────────────────────────────────────
function drawFormingPlanet(ctx, x, y, t, p, z) {
  const remain = Math.max(0, (p.formUntil - Date.now()) / 1000);
  const total = CFG.formationDuration;
  const progress = 1 - remain / total;
  const baseR = 20 * (z || 1);

  ctx.save();
  for (let i = 0; i < 8; i++) {
    const a = t * 1.5 + i * Math.PI / 4;
    const r = baseR * (1 + Math.sin(t * 3 + i) * 0.2);
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r * 0.6;
    const g = ctx.createRadialGradient(px, py, 0, px, py, 4);
    g.addColorStop(0, 'rgba(255, 220, 150, 0.8)');
    g.addColorStop(1, 'rgba(255, 180, 80, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255, 220, 150, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, baseR * 0.6, -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.stroke();
  ctx.restore();
}

// ─── Взрывы ─────────────────────────────────────────────────────
function drawExplosions(ctx) {
  const now = Date.now();
  for (let i = 0; i < S.explosions.length; i++) {
    const e = S.explosions[i];
    const elapsed = now - e.startAt;
    const total = e.endAt - e.startAt;
    const prog = Math.min(1, elapsed / total);
    const alpha = 1 - prog;
    const r = e.size * (0.3 + prog * 1.5);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    let hue = 30;
    if (e.type === 'destroy') hue = 10;
    if (e.type === 'merge') hue = 45;
    if (e.type === 'moon') hue = 200;

    const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
    g.addColorStop(0, 'hsla(' + hue + ', 100%, 90%, ' + alpha + ')');
    g.addColorStop(0.4, 'hsla(' + hue + ', 95%, 60%, ' + (alpha * 0.7) + ')');
    g.addColorStop(1, 'hsla(' + hue + ', 80%, 40%, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'hsla(' + hue + ', 100%, 80%, ' + (alpha * 0.7) + ')';
    ctx.lineWidth = 2 * (1 - prog);
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 1.3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}

// ─── Утилиты цвета ──────────────────────────────────────────────
function hexToRgb(hex) {
  const m = hex.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return { r: 128, g: 128, b: 128 };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}
function lightenColor(hex, amt) {
  const c = hexToRgb(hex);
  return 'rgb(' + Math.min(255, c.r + amt * 255) + ',' +
    Math.min(255, c.g + amt * 255) + ',' +
    Math.min(255, c.b + amt * 255) + ')';
}
function darkenColor(hex, amt) {
  const c = hexToRgb(hex);
  return 'rgb(' + Math.max(0, c.r - amt * 255) + ',' +
    Math.max(0, c.g - amt * 255) + ',' +
    Math.max(0, c.b - amt * 255) + ')';
}
function hash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

// ─── Экспорт ────────────────────────────────────────────────────
window.P_PHYS = P_PHYS;
window.tempAt = tempAt;
window.zoneAt = zoneAt;
window.addPlanet = addPlanet;
window.updatePlanets = updatePlanets;
window.drawPlanets = drawPlanets;
window.drawStar = drawStar;
