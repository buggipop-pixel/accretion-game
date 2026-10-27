// ═══════════════════════════════════════════════════════════════
//  PLANETS.JS — планеты, орбиты, столкновения, звёзды, прайм
// ═══════════════════════════════════════════════════════════════

const VIEW_COS = 0.5;

// ─── Шум Перлина-подобный ───
function _phash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function _pnoise2(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = _phash(ix + iy * 57 + seed);
  const b = _phash(ix + 1 + iy * 57 + seed);
  const c = _phash(ix + (iy + 1) * 57 + seed);
  const d = _phash(ix + 1 + (iy + 1) * 57 + seed);

  const v1 = a * (1 - ux) + b * ux;
  const v2 = c * (1 - ux) + d * ux;
  return v1 * (1 - uy) + v2 * uy;
}

function _pfbm(x, y, seed) {
  let v = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < 4; i++) {
    v += _pnoise2(x * freq, y * freq, seed + i * 11) * amp;
    amp *= 0.5;
    freq *= 2;
  }
  return v;
}

const _planetTexCache = {};

function _getPlanetTexture(p) {
  const cacheKey = p.seed + '_' + p.type;
  if (_planetTexCache[cacheKey]) return _planetTexCache[cacheKey];

  const SIZE = 256;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const cctx = canvas.getContext('2d');
  const imgData = cctx.createImageData(SIZE, SIZE);
  const data = imgData.data;
  const seed = p.seed || 1;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const nx = (x / SIZE) * 2 - 1;
      const ny = (y / SIZE) * 2 - 1;
      const dist = nx * nx + ny * ny;
      if (dist > 1) continue;

      const nz = Math.sqrt(1 - dist);
      const lx = -0.6, ly = -0.7, lz = 0.8;
      const len = Math.sqrt(lx*lx + ly*ly + lz*lz);
      const dot = (nx*lx + ny*ly + nz*lz) / len;
      const light = Math.max(0.15, Math.min(1.0, dot));

      const idx = (y * SIZE + x) * 4;
      let r = 0, g = 0, b = 0, a = 255;

      if (p.type === 'superEarth') {
        const continent = _pfbm(nx * 2.5, ny * 2.5, seed);
        const detail = _pfbm(nx * 8, ny * 8, seed + 50);
        const h = continent * 0.8 + detail * 0.2;

        if (h > 0.48) {
          const land = (h - 0.48) / 0.52;
          r = 50 + land * 100; g = 110 + land * 70; b = 40 + land * 30;
          if (h > 0.7) { r *= 0.7; g *= 0.7; b *= 0.7; }
        } else {
          const ocean = h / 0.48;
          r = 20 + ocean * 30; g = 60 + ocean * 70; b = 120 + ocean * 60;
        }

        if (Math.abs(ny) > 0.75) {
          const polar = (Math.abs(ny) - 0.75) / 0.25;
          r = r * (1 - polar) + 240 * polar; g = g * (1 - polar) + 250 * polar; b = b * (1 - polar) + 255 * polar;
        }

        const cloud = _pfbm(nx * 3 + 100, ny * 3, seed + 300);
        if (cloud > 0.58) {
          const cloudA = Math.min(1, (cloud - 0.58) * 4);
          r = r * (1 - cloudA) + 255 * cloudA; g = g * (1 - cloudA) + 255 * cloudA; b = b * (1 - cloudA) + 255 * cloudA;
        }
      }
      else if (p.type === 'rocky') {
        const h = _pfbm(nx * 4, ny * 4, seed);
        const detail = _pfbm(nx * 12, ny * 12, seed + 20);
        r = 140 + h * 50 + detail * 30; g = 95 + h * 40 + detail * 20; b = 70 + h * 30 + detail * 20;
        if (h < 0.35) { r *= 0.75; g *= 0.7; b *= 0.65; }
        if (Math.abs(ny) > 0.82) {
          const polar = (Math.abs(ny) - 0.82) / 0.18;
          r = r * (1 - polar) + 240 * polar; g = g * (1 - polar) + 240 * polar; b = b * (1 - polar) + 245 * polar;
        }
      }
      else if (p.type === 'iceGiant') {
        const band = Math.sin(ny * 12 + _pfbm(nx * 3, ny * 3, seed) * 2);
        r = 80 + band * 20; g = 170 + band * 40; b = 210 + band * 30;
        if (band > 0.6) { r += 50; g += 30; b += 20; }
        if (Math.abs(ny) > 0.75) {
          const polar = (Math.abs(ny) - 0.75) / 0.25;
          r = r * (1 - polar) + 240 * polar; g = g * (1 - polar) + 250 * polar; b = b * (1 - polar) + 255 * polar;
        }
      }
      else if (p.type === 'gasGiant') {
        const bandPos = ny * 18 + _pfbm(nx * 2, ny * 6, seed) * 4;
        const band = Math.sin(bandPos);
        r = 200 + band * 30; g = 150 + band * 40; b = 80 + band * 30;
        const turb = _pfbm(nx * 5, ny * 3, seed + 40);
        r += turb * 15; g += turb * 15; b += turb * 10;
        const spotX = 0.25, spotY = 0.2;
        const spotDist = Math.sqrt((nx - spotX) * (nx - spotX) + (ny - spotY) * (ny - spotY));
        if (spotDist < 0.32) {
          const spotA = 1 - spotDist / 0.32;
          const spotStrong = Math.pow(spotA, 0.6);
          r = r * (1 - spotStrong) + 220 * spotStrong; g = g * (1 - spotStrong) + 90 * spotStrong; b = b * (1 - spotStrong) + 60 * spotStrong;
        }
      }
      else if (p.type === 'lava') {
        const crust = _pfbm(nx * 3, ny * 3, seed);
        const crack = _pfbm(nx * 8, ny * 8, seed + 100);
        const heat = Math.max(0, crack - 0.42);
        r = 30 + crust * 20; g = 12 + crust * 10; b = 8 + crust * 5;
        if (heat > 0) {
          const hot = Math.min(1, heat * 2.5);
          r = r * (1 - hot) + 255 * hot; g = g * (1 - hot) + 140 * hot * (0.7 + 0.3 * Math.sin(seed + nx * 5)); b = b * (1 - hot) + 20 * hot;
        }
      }

      r = Math.max(0, Math.min(255, r * light));
      g = Math.max(0, Math.min(255, g * light));
      b = Math.max(0, Math.min(255, b * light));

      data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = a;
    }
  }

  cctx.putImageData(imgData, 0, 0);

  if (p.type === 'rocky') {
    for (let i = 0; i < 12; i++) {
      const ang = _phash(seed + i * 3.7) * Math.PI * 2;
      const dist = _phash(seed + i * 5.3) * 100;
      const cx = 128 + Math.cos(ang) * dist;
      const cy = 128 + Math.sin(ang) * dist;
      const cr = 4 + _phash(seed + i * 7.1) * 8;
      if ((cx - 128) * (cx - 128) + (cy - 128) * (cy - 128) > 115 * 115) continue;
      cctx.fillStyle = 'rgba(0,0,0,0.5)'; cctx.beginPath(); cctx.arc(cx, cy, cr, 0, Math.PI * 2); cctx.fill();
      cctx.fillStyle = 'rgba(180,150,110,0.6)'; cctx.beginPath(); cctx.arc(cx - cr * 0.2, cy - cr * 0.2, cr * 0.7, 0, Math.PI * 2); cctx.fill();
    }
  }

  if (p.type === 'gasGiant') {
    cctx.strokeStyle = 'rgba(255,200,150,0.4)'; cctx.lineWidth = 2;
    const spotX = 128 + 0.25 * 128, spotY = 128 + 0.2 * 128;
    for (let i = 0; i < 3; i++) { cctx.beginPath(); cctx.ellipse(spotX, spotY, 30 + i * 12, 20 + i * 8, 0.4, 0, Math.PI * 2); cctx.stroke(); }
  }

  _planetTexCache[cacheKey] = canvas;
  return canvas;
}

function getPlanetWorldPos(p, timeSec) {
  const st = SYSTEM_TYPES[S.systemType || 'single'];
  const e = st.eccentricity || 0;
  const a = p.baseOrbitR || 100;
  
  // ★ ИСПОЛЬЗУЕМ РЕАЛЬНОЕ ВРЕМЯ, а не время с момента загрузки страницы
  const absoluteTime = Date.now() / 1000;
  const theta = (p.angle || 0) + absoluteTime * (p.speed || 0.15);
  
  let r;
  if (e < 0.001) r = a;
  else r = a * (1 - e * e) / (1 + e * Math.cos(theta));
  
  const finalAngle = theta + (p.precession || 0);
  return { x: Math.cos(finalAngle) * r, y: Math.sin(finalAngle) * r * VIEW_COS, r: r };
}
window.getPlanetWorldPos = getPlanetWorldPos;

function addPlanet(preferredType) {
  if (_tryPlacePlanetAt(preferredType)) return preferredType;
  return false;
}

function _tryPlacePlanetAt(type) {
  if (!S.planets) S.planets = [];
  if (S.planets.length >= 8) return false;
  if (!type) return false;

  const allowed = (typeof getAllowedOrbitsForType === 'function') 
    ? getAllowedOrbitsForType(S.starType || 'G', type) 
    : [0,1,2,3,4,5,6,7];
  
  for (let oi = 0; oi < allowed.length; oi++) {
    const idx = allowed[oi];
    const orbitR = getOrbitR(idx);
    
    let free = true;
    for (let pi = 0; pi < S.planets.length; pi++) {
      if (Math.abs(S.planets[pi].baseOrbitR - orbitR) < ORBIT_GEOMETRY.minGap) {
        free = false; break;
      }
    }
    
    if (free) {
      S.planets.push({
        type: type, angle: Math.random() * Math.PI * 2, speed: 0.2 / Math.pow(orbitR / 90, 1.5),
        baseOrbitR: orbitR, orbitR: orbitR, driftPhase: Math.random() * Math.PI * 2,
        rotation: Math.random() * Math.PI * 2, seed: Math.random() * 1e6,
        forming: false, formUntil: 0, mass: planetMass(type), diameter: planetDiameter(type),
        moons: [], precession: 0, trueAnomaly: 0,
      });
      return true;
    }
  }
  return false;
}

function updatePlanets(dt) {
  if (!S.systemType) return;
  
  if (S.planets) S.planets = S.planets.filter(p => p && typeof p === 'object' && isFinite(p.baseOrbitR));

  const now = Date.now();
  const timeSec = now / 1000;

  if (typeof initGas === 'function' && typeof GAS !== 'undefined' && GAS.initTime === null) initGas();

  const st = SYSTEM_TYPES[S.systemType] || SYSTEM_TYPES.single;
  const geom = ORBIT_GEOMETRY;

  for (let i = 0; i < S.planets.length; i++) {
    const p = S.planets[i];
    if (p.forming) {
      if (now >= p.formUntil) { p.forming = false; toast('🪐 Планета сформирована', PLANET_TYPES[p.type].name); }
      continue;
    }
    p.precession = (p.precession || 0) + st.precession * dt;

    if (typeof migrationRate === 'function') {
      const dr = migrationRate(p);
      if (dr !== 0) p.baseOrbitR += dr * dt;
    }

    if (st.orbitDriftRate > 0) {
      const drift = Math.sin(timeSec * 0.00005 + (p.seed || 0) * 0.001) * st.orbitDriftRate * dt;
      p.baseOrbitR += drift;
    }

    if (st.chaosticPulse > 0 && Math.random() < st.chaosticPulse * dt) {
      p.baseOrbitR += (Math.random() - 0.5) * 10;
      p.driftPhase += Math.random() * Math.PI;
    }

    p.baseOrbitR = Math.max(geom.baseR - 10, Math.min(geom.maxR, p.baseOrbitR));
  }

  const active = S.planets.filter(function(p) { return !p.forming; }).sort(function(a, b) { return a.baseOrbitR - b.baseOrbitR; });

  for (let i = 1; i < active.length; i++) {
    if (active[i].baseOrbitR - active[i-1].baseOrbitR < geom.minGap) {
      active[i].baseOrbitR = active[i-1].baseOrbitR + geom.minGap;
    }
  }

  for (let i = 0; i < S.planets.length; i++) {
    S.planets[i].orbitR = S.planets[i].baseOrbitR;
    S.planets[i].rotation += dt * 0.5;
  }

  for (let i = S.explosions.length - 1; i >= 0; i--) {
    if (now > S.explosions[i].endAt) S.explosions.splice(i, 1);
  }
  checkCollisions();
}

function checkCollisions() {
  const st = SYSTEM_TYPES[S.systemType];
  if (!st || !st.collisionRate) return;
  const active = S.planets.filter(function(p) { return !p.forming; });
  if (active.length < 2) return;

  const nowSec = Date.now() / 1000;
  const dt = 1 / 60;
  const captureFactor = 2.5;
  const captureProb = st.collisionRate * dt;

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      const posA = getPlanetWorldPos(a, nowSec);
      const posB = getPlanetWorldPos(b, nowSec);
      const dx = posA.x - posB.x, dy = posA.y - posB.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const sumRadii = (a.diameter + b.diameter) * 5;
      if (d < sumRadii * captureFactor) {
        if (Math.random() < captureProb) {
          const decision = (typeof shouldMerge === 'function') ? shouldMerge(a, b) : 'merge';
          if (decision === 'merge') { collidePlanets(a, b, 'merge'); return; }
          if (decision === 'bounce') { collidePlanets(a, b, 'bounce'); return; }
        }
      }
    }
  }
}

function collidePlanets(a, b, decision) {
  const aPt = PLANET_TYPES[a.type], bPt = PLANET_TYPES[b.type];
  const nowSec = Date.now() / 1000;
  const posA = getPlanetWorldPos(a, nowSec);
  const posB = getPlanetWorldPos(b, nowSec);
  const wmx = (posA.x + posB.x) / 2;
  const wmy = (posA.y + posB.y) / 2;
  const bigMass = (a.mass || 1) + (b.mass || 1);
  const roll = Math.random();

  if (decision === 'bounce') {
    const avgR = (a.baseOrbitR + b.baseOrbitR) / 2;
    a.baseOrbitR = Math.max(ORBIT_GEOMETRY.baseR, avgR - ORBIT_GEOMETRY.minGap);
    b.baseOrbitR = avgR + ORBIT_GEOMETRY.minGap;
    const dustLoss = Math.floor(Math.min(S.dust * 0.08, dustPerSec() * 60 * 0.05));
    S.dust = Math.max(0, S.dust - dustLoss);
    const sp = worldToScreen(wmx, wmy);
    S.explosions.push({ x: sp.x, y: sp.y, type: 'moon', startAt: Date.now(), endAt: Date.now() + 600, size: 20 });
    toast('💫 Отскок', '−' + fmt(dustLoss) + ' пыли от удара');
    return;
  }

  if (roll < 0.35) {
    const n = S.planets.length;
    const refundA = typeof planetCost === 'function' ? planetCost(n - 1) : 500000;
    const refund = Math.floor((refundA + (typeof planetCost === 'function' ? planetCost(n - 2) : 500000)) * 0.4);
    S.dust += refund; S.dustTotal += refund;
    S.planets = S.planets.filter(function(p) { return p !== a && p !== b; });
    if (Math.random() < 0.6 && S.planets.length > 0) {
      const lucky = S.planets[Math.floor(Math.random() * S.planets.length)];
      lucky.moons.push({ size: 0.4 + Math.random() * 0.5, angle: Math.random() * Math.PI * 2, speed: 2 + Math.random() * 2, dist: 2.2 + Math.random() * 0.8 });
      toast('🌙 Луна', 'Осколок стал спутником');
      if (typeof playSFX === 'function') playSFX('merge');
    }
    const sp = worldToScreen(wmx, wmy);
    S.explosions.push({ x: sp.x, y: sp.y, type: 'destroy', startAt: Date.now(), endAt: Date.now() + 1500, size: 30 + bigMass * 3 });
    toast('💥 Столкновение', '+' + fmt(refund) + ' пыли');
    if (typeof playSFX === 'function') playSFX('explosion');
  } else {
    const survivorType = aPt.rate > bPt.rate ? a.type : b.type;
    const newMass = bigMass;
    S.planets = S.planets.filter(function(p) { return p !== a && p !== b; });

    const allowed = (typeof getAllowedOrbitsForType === 'function') ? getAllowedOrbitsForType(S.starType || 'G', survivorType) : [];
    let useR = (a.baseOrbitR + b.baseOrbitR) / 2;
    for (let oi = 0; oi < allowed.length; oi++) {
      const oR = getOrbitR(allowed[oi]);
      let free = true;
      for (let pi = 0; pi < S.planets.length; pi++) if (Math.abs(S.planets[pi].baseOrbitR - oR) < ORBIT_GEOMETRY.minGap) free = false;
      if (free) { useR = oR; break; }
    }

    S.planets.push({
      type: survivorType, angle: Math.random() * Math.PI * 2, speed: 0.2 / Math.pow(useR / 90, 1.5),
      baseOrbitR: useR, orbitR: useR, driftPhase: Math.random() * Math.PI * 2, rotation: 0, seed: Math.random() * 1e6,
      forming: true, formUntil: Date.now() + CFG.formationDuration * 1000, mass: newMass, diameter: Math.pow(newMass, 1/3) * 1.1,
      moons: [], precession: 0, trueAnomaly: 0,
    });
    const sp = worldToScreen(wmx, wmy);
    S.explosions.push({ x: sp.x, y: sp.y, type: 'merge', startAt: Date.now(), endAt: Date.now() + 1000, size: 40 });
    toast('🪐 Слияние', PLANET_TYPES[survivorType].name);
    if (typeof playSFX === 'function') playSFX('merge');
  }
}

function drawPlanets(ctx, time) {
  const t = time;
  const z = (isFinite(S.zoom) && S.zoom > 0) ? S.zoom : 1;
  const starHue = S.starType ? STAR_TYPES[S.starType].color : 260;

  if (S.starType && S.planets.length > 0) {
    const snowPx = (typeof getOrbitR === 'function') ? getOrbitR(4) : 220;
    ctx.save();
    ctx.strokeStyle = 'rgba(126, 200, 227, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 10]);
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.2) {
      const wx = Math.cos(a) * snowPx;
      const wy = Math.sin(a) * snowPx * VIEW_COS;
      const sp = worldToScreen(wx, wy);
      if (a === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (S.planets.length === 0) return;

  const sysConf = SYSTEM_TYPES[S.systemType || 'single'];
  const eccentricity = sysConf.eccentricity || 0;

  ctx.save();
  for (let i = 0; i < S.planets.length; i++) {
    const p = S.planets[i];
    if (p.forming) continue;
    ctx.strokeStyle = 'hsla(' + starHue + ', 50%, 60%, ' + (eccentricity > 0.03 ? 0.20 : 0.12) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const a = p.baseOrbitR || 100;
    const prec = p.precession || 0;
    const steps = 48;
    for (let k = 0; k <= steps; k++) {
      const theta = (k / steps) * Math.PI * 2;
      let r;
      if (eccentricity < 0.001) r = a;
      else r = a * (1 - eccentricity * eccentricity) / (1 + eccentricity * Math.cos(theta));
      const finalAngle = theta + prec;
      const wx = Math.cos(finalAngle) * r;
      const wy = Math.sin(finalAngle) * r * VIEW_COS;
      const sp = worldToScreen(wx, wy);
      if (k === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();

  const sorted = S.planets.map(function(p) {
    const pos = getPlanetWorldPos(p, t);
    return { p: p, wx: pos.x, wy: pos.y, depth: pos.y / 100 };
  }).filter(function(item) {
    return isFinite(item.wx) && isFinite(item.wy);
  }).sort(function(a, b) { return a.depth - b.depth; });

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const p = item.p;
    const sp = worldToScreen(item.wx, item.wy);
    const behind = item.depth < 0;
    const scale = (1 + item.depth * 0.15) * z;
    const alpha = behind ? 0.7 : 1;

    if (!isFinite(sp.x) || !isFinite(sp.y) || !isFinite(scale)) continue;

    if (p.forming) {
      drawFormingPlanet(ctx, sp.x, sp.y, t, p, z);
      continue;
    }

    const baseSize = 7 * (p.diameter || 1) * scale;
    if (!isFinite(baseSize) || baseSize <= 0) continue;
    
    const stars = getStarPositions(t);
    let nearestStar = { x: 0, y: 0 };
    let minD = Infinity;
    for (let s = 0; s < stars.length; s++) {
       const d = Math.hypot(item.wx - stars[s].x, item.wy - stars[s].y);
       if (d < minD) { minD = d; nearestStar = stars[s]; }
    }
    const starSp = worldToScreen(nearestStar.x, nearestStar.y);
    
    drawTexturedPlanet(ctx, sp.x, sp.y, baseSize, p, alpha, starSp);

    if (p.moons) {
      for (let m = 0; m < p.moons.length; m++) {
        const moon = p.moons[m];
        const mAngle = moon.angle + t * moon.speed;
        const tilt = 0.3 + (moon.size * 0.5);
        const mx = sp.x + Math.cos(mAngle) * baseSize * moon.dist;
        const my = sp.y + Math.sin(mAngle) * baseSize * moon.dist * tilt;

        ctx.save();
        ctx.globalAlpha = alpha * 0.25;
        ctx.strokeStyle = 'rgba(200, 190, 170, 0.8)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.ellipse(sp.x, sp.y, baseSize * moon.dist, baseSize * moon.dist * tilt, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        const moonR = baseSize * moon.size * 0.4;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * 0.4;
        const glowG = ctx.createRadialGradient(mx, my, 0, mx, my, moonR * 2.5);
        glowG.addColorStop(0, 'rgba(220, 210, 190, 0.6)');
        glowG.addColorStop(1, 'rgba(200, 190, 170, 0)');
        ctx.fillStyle = glowG;
        ctx.beginPath();
        ctx.arc(mx, my, moonR * 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = alpha;
        const mG = ctx.createRadialGradient(mx - moonR * 0.3, my - moonR * 0.3, 0, mx, my, moonR);
        mG.addColorStop(0, 'rgba(230, 225, 210, 1)');
        mG.addColorStop(0.6, 'rgba(180, 170, 150, 1)');
        mG.addColorStop(1, 'rgba(80, 75, 60, 1)');
        ctx.fillStyle = mG;
        ctx.beginPath();
        ctx.arc(mx, my, moonR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  drawExplosions(ctx);
}

function drawTexturedPlanet(ctx, x, y, size, p, alpha, starScreenPos) {
  const pt = PLANET_TYPES[p.type] || PLANET_TYPES.rocky;
  const starPos = starScreenPos || worldToScreen(0, 0);

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha * 0.4;
  const glowGrad = ctx.createRadialGradient(x, y, size * 0.85, x, y, size * 2.5);
  glowGrad.addColorStop(0, pt.color);
  glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(x, y, size * 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.clip();

  const tex = _getPlanetTexture(p);

  ctx.translate(x, y);
  ctx.rotate(p.rotation || 0);
  ctx.drawImage(tex, -size, -size, size * 2, size * 2);
  ctx.rotate(-(p.rotation || 0));
  ctx.translate(-x, -y);

  const shadowAngle = Math.atan2(y - starPos.y, x - starPos.x) - Math.PI;
  const shx = x + Math.cos(shadowAngle) * size * 1.5;
  const shy = y + Math.sin(shadowAngle) * size * 1.5;
  const shadowGrad = ctx.createRadialGradient(shx, shy, size * 0.2, shx, shy, size * 2.2);
  shadowGrad.addColorStop(0, 'rgba(0,0,0,0.85)');
  shadowGrad.addColorStop(0.4, 'rgba(0,0,0,0.5)');
  shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadowGrad;
  ctx.fillRect(x - size, y - size, size * 2, size * 2);

  const hlGrad = ctx.createRadialGradient(x - size * 0.4, y - size * 0.4, 0, x - size * 0.3, y - size * 0.3, size * 1.4);
  hlGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
  hlGrad.addColorStop(0.5, 'rgba(255,255,255,0)');
  hlGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hlGrad;
  ctx.fillRect(x - size, y - size, size * 2, size * 2);
  ctx.restore();

  if (p.type === 'gasGiant') {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(1, 0.30);
    const rings = [ { r: size * 1.9, w: 1.8, a: 0.7 }, { r: size * 2.2, w: 1.2, a: 0.55 }, { r: size * 2.5, w: 2.0, a: 0.45 }, { r: size * 2.9, w: 1.0, a: 0.30 } ];
    for (let i = 0; i < rings.length; i++) {
      ctx.strokeStyle = 'rgba(212, 167, 106, ' + rings[i].a + ')';
      ctx.lineWidth = rings[i].w;
      ctx.beginPath(); ctx.arc(0, 0, rings[i].r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawFormingPlanet(ctx, x, y, t, p, z) {
  if (!isFinite(x) || !isFinite(y)) return;
  const safeZ = (isFinite(z) && z > 0) ? z : 1;
  const remain = Math.max(0, (p.formUntil - Date.now()) / 1000);
  const total = CFG.formationDuration || 300;
  const progress = Math.min(1, 1 - remain / total);
  const baseR = 20 * safeZ;
  const pt = PLANET_TYPES[p.type] || PLANET_TYPES.rocky;
  const rgb = hexToRgb(pt.color);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const dustCount = 60;
  for (let i = 0; i < dustCount; i++) {
    const seed = i * 137.5 + p.seed;
    const baseAngle = (seed * 12.9898) % (Math.PI * 2);
    const baseRadius = ((seed * 43.7) % 1) * 0.8 + 0.2;
    const angle = baseAngle + t * (1 - progress * 0.5) * 0.8 * (1 + i / dustCount);
    const radius = baseR * baseRadius * (3.5 - progress * 2.5);
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius * 0.75;
    const dustSize = (1.2 + ((seed * 17.3) % 1) * 2.5) * safeZ * (1 - progress * 0.3);
    const heat = (1 - radius / (baseR * 3.5)) * 0.7 + progress * 0.3;
    const dustAlpha = (0.15 + heat * 0.5) * (0.5 + 0.5 * Math.sin(t * 3 + i));
    ctx.fillStyle = 'rgba(255,' + Math.floor(150 + heat * 80) + ',' + Math.floor(80 + heat * 100) + ',' + dustAlpha + ')';
    ctx.beginPath(); ctx.arc(px, py, dustSize, 0, Math.PI * 2); ctx.fill();
  }

  const coreR = baseR * (0.3 + progress * 0.9);
  const coreAlpha = 0.4 + progress * 0.6;
  const coreHaloG = ctx.createRadialGradient(x, y, 0, x, y, coreR * 3);
  coreHaloG.addColorStop(0, 'rgba(255, 240, 200, ' + coreAlpha + ')');
  coreHaloG.addColorStop(0.3, 'rgba(255, 180, 80, ' + (coreAlpha * 0.6) + ')');
  coreHaloG.addColorStop(0.7, 'rgba(255, 100, 40, ' + (coreAlpha * 0.2) + ')');
  coreHaloG.addColorStop(1, 'rgba(200, 60, 20, 0)');
  ctx.fillStyle = coreHaloG; ctx.beginPath(); ctx.arc(x, y, coreR * 3, 0, Math.PI * 2); ctx.fill();

  if (progress > 0.4) {
    const coreBodyR = baseR * ((progress - 0.4) / 0.6) * 0.9;
    const heat = 1 - ((progress - 0.4) / 0.6);
    const bodyR = Math.floor(rgb.r * (1 - heat * 0.4) + 255 * heat * 0.4);
    const bodyG = Math.floor(rgb.g * (1 - heat * 0.4) + 160 * heat * 0.4);
    const bodyB = Math.floor(rgb.b * (1 - heat * 0.4) + 80 * heat * 0.4);
    const bodyGrad = ctx.createRadialGradient(x - coreBodyR * 0.3, y - coreBodyR * 0.3, 0, x, y, coreBodyR);
    bodyGrad.addColorStop(0, 'rgba(' + Math.min(255, bodyR + 80) + ',' + Math.min(255, bodyG + 80) + ',' + Math.min(255, bodyB + 80) + ', ' + coreAlpha + ')');
    bodyGrad.addColorStop(0.7, 'rgba(' + bodyR + ',' + bodyG + ',' + bodyB + ', ' + coreAlpha + ')');
    bodyGrad.addColorStop(1, 'rgba(' + Math.floor(bodyR * 0.3) + ',' + Math.floor(bodyG * 0.3) + ',' + Math.floor(bodyB * 0.3) + ', ' + (coreAlpha * 0.8) + ')');
    ctx.fillStyle = bodyGrad; ctx.beginPath(); ctx.arc(x, y, coreBodyR, 0, Math.PI * 2); ctx.fill();
  }

  ctx.save(); ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(255, 220, 150, 0.4)'; ctx.lineWidth = 1.5 * safeZ;
  ctx.beginPath(); ctx.arc(x, y, baseR * 3 + 5 * safeZ, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); ctx.stroke();
  ctx.font = 'bold ' + Math.round(8 * safeZ) + 'px -apple-system, sans-serif'; ctx.fillStyle = 'rgba(200, 180, 255, 0.7)'; ctx.textAlign = 'center';
  ctx.fillText(Math.ceil(remain) + 'с', x, y + baseR * 3 + 16 * safeZ); ctx.restore();
  ctx.restore();
}

function drawExplosions(ctx) {
  const now = Date.now();
  for (let i = 0; i < S.explosions.length; i++) {
    const e = S.explosions[i];
    const elapsed = now - e.startAt, total = e.endAt - e.startAt;
    const prog = Math.min(1, elapsed / total), alpha = 1 - prog, r = e.size * (0.3 + prog * 1.5);
    let hue = 30; if (e.type === 'destroy') hue = 10; if (e.type === 'merge') hue = 45; if (e.type === 'moon') hue = 200;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
    g.addColorStop(0, 'hsla(' + hue + ', 100%, 95%, ' + alpha + ')');
    g.addColorStop(0.2, 'hsla(' + hue + ', 100%, 80%, ' + (alpha * 0.9) + ')');
    g.addColorStop(0.5, 'hsla(' + hue + ', 95%, 55%, ' + (alpha * 0.6) + ')');
    g.addColorStop(1, 'hsla(' + hue + ', 80%, 30%, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function getStarPositions(timeSec) {
  if (!S.starType) return [{ x: 0, y: 0, r: 1.0 }];
  const st = STAR_TYPES[S.starType], sysType = S.systemType || 'single', starsCount = SYSTEM_TYPES[sysType].stars, t = timeSec || 0;
  if (starsCount === 1) return [{ x: 0, y: 0, r: st.size }];
  if (starsCount === 2) {
    const sep = 45, a = t * 0.22, wx1 = Math.cos(a) * sep, wy1 = Math.sin(a) * sep * 0.4;
    return [{ x: wx1, y: wy1, r: st.size * 0.82 }, { x: -wx1, y: -wy1, r: st.size * 0.82 }];
  }
  const sep = 55, out = [];
  for (let i = 0; i < 3; i++) {
    const baseA = (i / 3) * Math.PI * 2 + t * 0.15;
    out.push({ x: Math.cos(baseA) * sep, y: Math.sin(baseA) * sep * 0.4, r: st.size * 0.68 });
  }
  return out;
}
window.getStarPositions = getStarPositions;

function drawStar(ctx, time) {
  const z = S.zoom || 1, t = time;
  if (S.primeSystem && typeof drawPrimeMain === 'function') {
    const cp = worldToScreen(0, 0); drawPrimeMain(ctx, cp.x, cp.y, z, t, S.primeSystem.objectKey); return;
  }
  if (!S.starType) return;
  const positions = getStarPositions(t);
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i], sp = worldToScreen(p.x, p.y);
    const st = STAR_TYPES[S.starType], baseR = 18 * p.r * z, pulse = 1 + 0.06 * Math.sin(t * 2.4 + i * 1.7);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const haloR = baseR * 8 * pulse;
    const halo = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, haloR);
    halo.addColorStop(0, 'hsla(' + st.color + ', 100%, 95%, 0.6)');
    halo.addColorStop(0.15, 'hsla(' + st.color + ', ' + st.sat + '%, ' + st.light + '%, 0.55)');
    halo.addColorStop(0.45, 'hsla(' + st.color + ', ' + st.sat + '%, ' + (st.light - 15) + '%, 0.2)');
    halo.addColorStop(1, 'hsla(' + st.color + ', ' + st.sat + '%, ' + (st.light - 30) + '%, 0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(sp.x, sp.y, haloR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'hsla(' + st.color + ', 100%, 99%, 1)'; ctx.beginPath(); ctx.arc(sp.x, sp.y, baseR * 0.55 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function hexToRgb(hex) {
  const m = hex.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return { r: 128, g: 128, b: 128 };
  return { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) };
}
function lightenColor(hex, amt) {
  const c = hexToRgb(hex);
  return 'rgb(' + Math.min(255, c.r + amt * 255) + ',' + Math.min(255, c.g + amt * 255) + ',' + Math.min(255, c.b + amt * 255) + ')';
}
function darkenColor(hex, amt) {
  const c = hexToRgb(hex);
  return 'rgb(' + Math.max(0, c.r - amt * 255) + ',' + Math.max(0, c.g - amt * 255) + ',' + Math.max(0, c.b - amt * 255) + ')';
}
function hash(n) { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); }

window.addPlanet = addPlanet;
window.updatePlanets = updatePlanets;
window.drawPlanets = drawPlanets;
window.drawStar = drawStar;
window.checkCollisions = checkCollisions;