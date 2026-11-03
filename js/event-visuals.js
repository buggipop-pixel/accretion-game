// ═══════════════════════════════════════════════════════════════
//  EVENT-VISUALS.JS — ежедневные события как живые объекты сцены
//
//  Событие больше не «живёт» в модалке: оно происходит прямо на
//  игровом полотне, в том же визуальном языке, что и планеты —
//  слоистые радиальные градиенты, режим 'lighter', орбитальные
//  дуги, щупальца, осколки, порталы, частицы и вспышки.
//
//  Модалка (random-events.js) остаётся только брифингом-оповещением:
//  «что случилось и что делать». Игра же — тапы по существу,
//  сбивание осколков, выбор портала — идёт здесь.
//
//  Слой не хранит игровое состояние. Источник правды —
//  S.activeRandomEvent / S.activeWorldEvents. Тап вызывает те же
//  функции, что и кнопки модалки (tapRandomEvent /
//  resolveRandomEventChoice), поэтому экономика, награды, штрафы
//  и сохранение не дублируются.
// ═══════════════════════════════════════════════════════════════

const EVV = {
  activeId: null,
  bornAt: 0,
  current: null,
  shards: null,
  particles: [],
  floaters: [],
  cins: [],
  worldSig: '',
  worldList: [],
  shake: 0,
  flash: 0,
  flashColor: '#ffffff',
  pendingHit: null,
  _reduced: null
};

const EVV_MAX_PARTICLES = 180;

function evvNow() {
  if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
    return performance.now() / 1000;
  }
  return Date.now() / 1000;
}

function evvClamp(v, a, b) {
  return v < a ? a : (v > b ? b : v);
}

function evvRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16) || 0,
      g: parseInt(h[1] + h[1], 16) || 0,
      b: parseInt(h[2] + h[2], 16) || 0
    };
  }
  if (h.length >= 6) {
    return {
      r: parseInt(h.slice(0, 2), 16) || 0,
      g: parseInt(h.slice(2, 4), 16) || 0,
      b: parseInt(h.slice(4, 6), 16) || 0
    };
  }
  return { r: 160, g: 140, b: 230 };
}

function evvRgba(hex, alpha) {
  const c = evvRgb(hex);
  const a = evvClamp(Number(alpha) || 0, 0, 1);
  return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
}

function evvReducedMotion() {
  if (EVV._reduced === null) {
    EVV._reduced = false;
    try {
      EVV._reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      EVV._reduced = false;
    }
  }
  return EVV._reduced;
}

// ─── Связь с подсистемой событий ───────────────────────────────

function evvEventCfg(id) {
  if (!id) return null;
  if (typeof RandomEvents !== 'undefined' && RandomEvents && typeof RandomEvents.eventById === 'function') {
    return RandomEvents.eventById(id);
  }
  return null;
}

function evvPolarity(cfg) {
  if (typeof RandomEvents !== 'undefined' && RandomEvents && typeof RandomEvents.polarityInfo === 'function') {
    try {
      const p = RandomEvents.polarityInfo(cfg);
      if (p && p.key) return p;
    } catch (e) { /* не критично для визуала */ }
  }
  return { key: 'mixed', icon: '🌍', label: 'Смешанный', color: cfg && cfg.color ? cfg.color : '#8b7fd4' };
}

function evvWorldList() {
  if (typeof RandomEvents !== 'undefined' && RandomEvents && typeof RandomEvents.getActiveWorldEvents === 'function') {
    try {
      const list = RandomEvents.getActiveWorldEvents();
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

function evvCurrent() {
  if (typeof S === 'undefined' || !S || !S.activeRandomEvent) return null;
  const ar = S.activeRandomEvent;
  if (!ar || !ar.id) return null;
  const cfg = evvEventCfg(ar.id);
  if (!cfg) return null;
  return { ar: ar, cfg: cfg, kind: cfg.kind };
}

// ─── Геометрия сцены ───────────────────────────────────────────
// Событие привязано к звезде (или к активной системе в галактике),
// поэтому оно панорамируется и зумится вместе с миром, но всегда
// остаётся рядом с центром сцены.

function evvLayout(now) {
  const t = (typeof now === 'number' && isFinite(now)) ? now : evvNow();
  const zRaw = Number(S.zoom);
  const z = evvClamp(isFinite(zRaw) ? zRaw : 1, 0.4, 3);
  let x = window.CANVAS_CX || 0;
  let y = window.CANVAS_CY || 0;
  let galaxy = false;
  if (S.stage === 'galaxy' && typeof galaxySystemPos === 'function') {
    const gp = galaxySystemPos(S.activeSystemIdx || 0, S.totalSystemsCreated || 1, t);
    if (gp && isFinite(gp.x) && isFinite(gp.y)) {
      x = gp.x;
      y = gp.y;
      galaxy = true;
    }
  } else if (typeof worldToScreen === 'function') {
    const c = worldToScreen(0, 0);
    if (c && isFinite(c.x) && isFinite(c.y)) {
      x = c.x;
      y = c.y;
    }
  }
  return {
    x: x,
    y: y,
    z: z,
    galaxy: galaxy,
    u: galaxy ? evvClamp(z, 0.7, 1.1) : evvClamp(z, 0.55, 1.6),
    dist: galaxy ? 26 : 150
  };
}

function evvBossGeom(L, t) {
  // Крупная сущность держится у звезды: это центр сцены, поэтому
  // она панорамируется и зумится вместе с миром.
  const bob = Math.sin(t * 0.5) * 0.03;
  const screenMin = Math.min(window.CANVAS_W || 900, window.CANVAS_H || 700);
  const baseR = evvClamp(screenMin * 0.115, 56, 94);
  return {
    x: L.x + Math.sin(t * 0.23) * 12 * L.u,
    y: L.y - (L.galaxy ? 6 : 26) * L.u - Math.sin(t * 0.41) * 6 * L.u,
    r: (L.galaxy ? 30 : baseR) * L.u * (1 + bob)
  };
}

function evvEnsureShards(cfg) {
  const total = Math.max(1, Math.floor(Number(cfg.tapsRequired) || 1));
  if (EVV.shards && EVV.shards.cfgId === cfg.id && EVV.shards.total === total) return EVV.shards;
  const n = Math.floor(evvClamp(total, 4, 12));
  const arr = [];
  for (let i = 0; i < n; i++) {
    const prev = Math.floor(i * total / n);
    const need = Math.max(prev + 1, Math.ceil((i + 1) * total / n));
    arr.push({
      ang: i * 2.399963 + 0.6,
      speed: 0.55 + (i % 3) * 0.17,
      size: 0.75 + (i % 4) * 0.13,
      wob: i * 1.7,
      need: need,
      prev: prev
    });
  }
  EVV.shards = { cfgId: cfg.id, total: total, n: n, arr: arr };
  return EVV.shards;
}

function evvTapGeom(L, t, a) {
  const sh = evvEnsureShards(a.cfg);
  const taps = Math.max(0, Number(a.ar.taps) || 0);
  const items = [];
  for (let i = 0; i < sh.arr.length; i++) {
    const s = sh.arr[i];
    if (taps >= s.need) continue;
    const prog = (s.need > s.prev) ? evvClamp((taps - s.prev) / (s.need - s.prev), 0, 1) : 0;
    const ang = s.ang + t * s.speed * 0.45;
    const base = L.dist * evvClamp(L.z, 0.5, 1.4);
    const d = base * (0.72 + 0.28 * (1 - prog)) * (1 + 0.06 * Math.sin(t * 1.6 + s.wob));
    items.push({
      x: L.x + Math.cos(ang) * d,
      y: L.y + Math.sin(ang) * d * 0.68,
      r: (L.galaxy ? 10 : 24) * L.u * s.size * (1 + 0.1 * Math.sin(t * 3 + s.wob)),
      ang: ang,
      prog: prog,
      shard: s
    });
  }
  return items;
}

function evvChoiceGeom(L, t, a) {
  const opts = (a.cfg.options || []);
  const items = [];
  const n = opts.length;
  const spread = n > 2 ? 1.0 : 1.2;
  const d = (L.galaxy ? 30 : 168) * evvClamp(L.z, 0.5, 1.4);
  for (let i = 0; i < n; i++) {
    const bob = Math.sin(t * 0.7 + i * 1.9) * 0.06;
    const ang = -Math.PI * 0.5 + (i - (n - 1) / 2) * spread + bob;
    items.push({
      x: L.x + Math.cos(ang) * d,
      y: L.y + Math.sin(ang) * d * 0.82,
      r: (L.galaxy ? 20 : 46) * L.u,
      ang: ang,
      opt: opts[i],
      index: i
    });
  }
  return items;
}

// ─── Частицы и всплывающий текст ───────────────────────────────

function evvPushParticle(x, y, vx, vy, life, size, color, kind, gravity) {
  if (EVV.particles.length >= EVV_MAX_PARTICLES) EVV.particles.shift();
  EVV.particles.push({
    x: x, y: y,
    vx: vx, vy: vy,
    life: life, max: life,
    size: size,
    color: color || '#ffffff',
    kind: kind || 'spark',
    gravity: gravity || 0
  });
}

function evvBurst(x, y, count, color, power) {
  const p = Number(power) || 1;
  const n = Math.max(1, Math.floor(count));
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = (30 + Math.random() * 110) * p;
    evvPushParticle(
      x, y,
      Math.cos(ang) * sp,
      Math.sin(ang) * sp,
      0.35 + Math.random() * 0.65,
      1 + Math.random() * 2.6,
      color,
      Math.random() < 0.25 ? 'star' : 'spark',
      Math.random() < 0.2 ? 60 : 0
    );
  }
}

function evvFloater(x, y, text, color, size) {
  EVV.floaters.push({
    x: x, y: y,
    text: String(text),
    color: color || '#ffffff',
    size: Number(size) || 13,
    life: 1.15,
    max: 1.15
  });
  if (EVV.floaters.length > 24) EVV.floaters.shift();
}

function evvRewardText(cfg) {
  const r = (cfg && cfg.reward) || {};
  const parts = [];
  if (r.dust) parts.push('+' + evvNum(r.dust) + ' ✦');
  if (r.energy) parts.push('+' + evvNum(r.energy) + ' ⚡');
  if (r.metals) parts.push('+' + evvNum(r.metals) + ' ⚙');
  if (r.civ) parts.push('+' + evvNum(r.civ) + ' 🧬');
  if (!parts.length && cfg && cfg.title) parts.push(cfg.title);
  return parts.join('  ');
}

function evvNum(n) {
  if (typeof fmt === 'function') {
    try { return fmt(n); } catch (e) { /* fallback ниже */ }
  }
  return String(Math.floor(Number(n) || 0));
}

function evvRewardLine(cfg, kind) {
  if (kind === 'choice') {
    const opts = cfg.options || [];
    const bits = [];
    for (let i = 0; i < opts.length; i++) bits.push((i + 1) + '. ' + opts[i].label);
    return bits.join('   ');
  }
  if (kind === 'world') {
    return 'Эффект активен, пока идёт таймер';
  }
  if (kind === 'bad') return 'Удар по системе уже случился';
  return evvRewardText(cfg) || 'Награда';
}

// ─── Синхронизация визуала с состоянием игры ───────────────────

function evvSpawnAmbient(cfg) {
  const L = evvLayout(evvNow());
  const pol = evvPolarity(cfg);
  const col = cfg.color || pol.color || '#b9a8ff';
  evvBurst(L.x, L.y, 26, col, 0.7);
  EVV.flash = Math.max(EVV.flash, 0.5);
  EVV.flashColor = pol.key === 'negative' ? '#ff5e5e' : (pol.key === 'positive' ? '#7ee0a8' : '#b9a8ff');
}

function evvSync(now) {
  const a = evvCurrent();
  EVV.current = a;
  const id = a ? a.cfg.id : null;
  if (id !== EVV.activeId) {
    EVV.activeId = id;
    EVV.bornAt = now;
    EVV.particles.length = 0;
    EVV.floaters.length = 0;
    EVV.shards = null;
    EVV.shake = 0;
    EVV.flash = 0;
    if (a) {
      if (a.cfg.kind === 'tap') evvEnsureShards(a.cfg);
      evvSpawnAmbient(a.cfg);
    }
  }
  if (a && a.cfg.kind === 'tap') evvEnsureShards(a.cfg);

  const list = evvWorldList();
  EVV.worldList = list;
  let sig = '';
  for (let i = 0; i < list.length; i++) {
    if (!list[i] || !list[i].cfg) continue;
    sig += list[i].cfg.id + '|' + (list[i].state ? list[i].state.endsAt : 0) + ';';
  }
  if (sig !== EVV.worldSig) {
    const had = EVV.worldSig !== '';
    EVV.worldSig = sig;
    if (had || list.length) {
      const pol = list.length && list[0].cfg ? evvPolarity(list[0].cfg) : null;
      EVV.flashColor = (pol && pol.key === 'negative') ? '#ff5e5e' : '#b9a8ff';
      EVV.flash = Math.max(EVV.flash, 0.35);
    }
  }
}

// ─── Обновление (вызывается из игрового цикла) ─────────────────

function updateEventVisuals(dt, time) {
  if (typeof S === 'undefined' || !S) return;
  const t = (typeof time === 'number' && isFinite(time)) ? time : evvNow();
  const d = evvClamp(Number(dt) || 0, 0, 0.1);
  evvSync(t);

  for (let i = EVV.cins.length - 1; i >= 0; i--) {
    const c = EVV.cins[i];
    c.p = evvClamp((t - c.start) / c.dur, 0, 1);
    if (c.p > 0.62 && !c.burst) {
      c.burst = true;
      const L = evvLayout(t);
      const col = c.cfg.color || (c.mode === 'bad' ? '#ff5e5e' : '#7ec8e3');
      evvBurst(L.x, L.y, c.mode === 'bad' ? 46 : 34, col, c.mode === 'bad' ? 1.5 : 1.1);
      EVV.flash = Math.max(EVV.flash, c.mode === 'bad' ? 0.8 : 0.55);
      EVV.flashColor = col;
      if (c.mode === 'bad') EVV.shake = Math.max(EVV.shake, 1);
      const txt = c.mode === 'bad'
        ? '💥 удар по системе'
        : evvRewardText(c.cfg);
      evvFloater(L.x, L.y - 24 * L.u, txt, c.mode === 'bad' ? '#ff8a8a' : '#e8e2ff', 14);
    }
    if (c.p >= 1) EVV.cins.splice(i, 1);
  }

  for (let i = EVV.particles.length - 1; i >= 0; i--) {
    const p = EVV.particles[i];
    p.life -= d;
    if (p.life <= 0) { EVV.particles.splice(i, 1); continue; }
    p.x += p.vx * d;
    p.y += p.vy * d;
    p.vy += p.gravity * d;
    const drag = p.kind === 'loot' ? 1.6 : 2.2;
    p.vx *= Math.max(0, 1 - drag * d);
    p.vy *= Math.max(0, 1 - drag * d);
  }

  for (let i = EVV.floaters.length - 1; i >= 0; i--) {
    const f = EVV.floaters[i];
    f.life -= d;
    if (f.life <= 0) { EVV.floaters.splice(i, 1); continue; }
    f.y -= 24 * d;
  }

  // Живой след у активного события
  const a = EVV.current;
  if (a && d > 0) {
    const L = evvLayout(t);
    const pol = evvPolarity(a.cfg);
    const col = a.cfg.color || pol.color || '#b9a8ff';
    if (a.cfg.kind === 'boss' && Math.random() < d * 14) {
      const g = evvBossGeom(L, t);
      const ang = Math.random() * Math.PI * 2;
      const rr = g.r * (0.95 + Math.random() * 0.5);
      evvPushParticle(
        g.x + Math.cos(ang) * rr,
        g.y + Math.sin(ang) * rr * 0.8,
        Math.cos(ang) * 8,
        Math.sin(ang) * 8 - 12,
        0.8 + Math.random() * 0.7,
        1 + Math.random() * 2,
        col, 'star'
      );
    }
  }

  EVV.shake = Math.max(0, EVV.shake - d * 1.8);
  EVV.flash = Math.max(0, EVV.flash - d * 1.5);
}

// ─── Тап по событию на канвасе ─────────────────────────────────

function evvTryHit(screenX, screenY) {
  if (typeof S === 'undefined' || !S) return false;
  const sx = Number(screenX);
  const sy = Number(screenY);
  if (!isFinite(sx) || !isFinite(sy)) return false;
  const t = evvNow();
  evvSync(t);
  const a = EVV.current;
  if (!a) return false;
  const L = evvLayout(t);

  if (a.cfg.kind === 'boss') {
    const g = evvBossGeom(L, t);
    const hitR = g.r * 1.35 + 10 * L.u;
    if (Math.hypot(sx - g.x, sy - g.y) <= hitR) {
      EVV.pendingHit = { x: sx, y: sy };
      if (typeof tapRandomEvent === 'function') tapRandomEvent();
      return true;
    }
    return false;
  }

  if (a.cfg.kind === 'tap') {
    const items = evvTapGeom(L, t, a);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (Math.hypot(sx - it.x, sy - it.y) <= it.r * 1.8 + 12 * L.u) {
        EVV.pendingHit = { x: sx, y: sy };
        if (typeof tapRandomEvent === 'function') tapRandomEvent();
        return true;
      }
    }
    // Прощающая зона: тап рядом с роем тоже засчитывается.
    const zone = (L.galaxy ? 90 : 205) * evvClamp(L.z, 0.5, 1.4);
    if (Math.hypot(sx - L.x, sy - L.y) <= zone) {
      EVV.pendingHit = { x: sx, y: sy };
      if (typeof tapRandomEvent === 'function') tapRandomEvent();
      return true;
    }
    return false;
  }

  if (a.cfg.kind === 'choice') {
    const items = evvChoiceGeom(L, t, a);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (Math.hypot(sx - it.x, sy - it.y) <= it.r * 1.25) {
        EVV.pendingHit = { x: sx, y: sy };
        const pol = evvPolarity(a.cfg);
        evvBurst(it.x, it.y, 28, a.cfg.color || pol.color, 1);
        EVV.flash = Math.max(EVV.flash, 0.35);
        EVV.flashColor = a.cfg.color || pol.color;
        if (typeof resolveRandomEventChoice === 'function') resolveRandomEventChoice(it.opt.id);
        return true;
      }
    }
    return false;
  }

  return false;
}

// Вызывается из tapRandomEvent (в т.ч. если тап пришёл из модалки).
function eventVisualTap() {
  const t = evvNow();
  evvSync(t);
  const a = EVV.current;
  const pt = EVV.pendingHit;
  EVV.pendingHit = null;
  if (!a) return;
  const L = evvLayout(t);
  let x = L.x;
  let y = L.y;
  if (a.cfg.kind === 'boss') {
    const g = evvBossGeom(L, t);
    x = g.x; y = g.y;
  }
  if (pt && isFinite(pt.x) && isFinite(pt.y)) { x = pt.x; y = pt.y; }
  const pol = evvPolarity(a.cfg);
  evvBurst(x, y, 12, a.cfg.color || pol.color, 0.8);
  EVV.shake = Math.max(EVV.shake, 0.35);
  if (a.cfg.kind === 'boss') {
    const g = evvBossGeom(L, t);
    evvFloater(g.x + (Math.random() * 30 - 15), g.y - g.r * 0.6, '−' + Number(a.cfg.tapDamage || 1), '#ffd0d0', 13);
  }
}

function eventVisualOnResolve(cfg, success) {
  const t = evvNow();
  const L = evvLayout(t);
  const pol = cfg ? evvPolarity(cfg) : { color: '#b9a8ff', key: 'mixed' };
  const col = (cfg && cfg.color) || pol.color || '#b9a8ff';
  if (success) {
    evvBurst(L.x, L.y, 40, col, 1.3);
    evvFloater(L.x, L.y - 28 * L.u, '🏆 ' + (cfg ? cfg.title : 'Победа'), '#ffe8a0', 15);
    EVV.flash = Math.max(EVV.flash, 0.45);
    EVV.flashColor = '#ffe8a0';
  } else {
    evvBurst(L.x, L.y, 34, '#ff5e5e', 1.4);
    EVV.flash = Math.max(EVV.flash, 0.6);
    EVV.flashColor = '#ff5e5e';
    EVV.shake = Math.max(EVV.shake, 0.9);
  }
}

// Одноразовый кинематик: награда прилетает, штраф врезается, мир вспыхивает.
function playEventCinematic(cfg, polKey) {
  if (!cfg) return;
  const t = evvNow();
  const mode = cfg.kind === 'bad' ? 'bad' : (cfg.kind === 'good' ? 'good' : 'world');
  const dur = mode === 'bad' ? 2.4 : (mode === 'good' ? 3.0 : 2.2);
  EVV.cins.push({ cfg: cfg, mode: mode, polKey: polKey, start: t, dur: dur, p: 0, burst: false });
  if (EVV.cins.length > 3) EVV.cins.shift();
  EVV.flashColor = mode === 'bad' ? '#ff5e5e' : (cfg.color || '#b9a8ff');
  EVV.flash = Math.max(EVV.flash, 0.25);
}

// ─── Отрисовка ─────────────────────────────────────────────────

function evvRoundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.arcTo(x + w, y, x + w, y + rad, rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  ctx.lineTo(x + rad, y + h);
  ctx.arcTo(x, y + h, x, y + h - rad, rad);
  ctx.lineTo(x, y + rad);
  ctx.arcTo(x, y, x + rad, y, rad);
  ctx.closePath();
}

function evvFitText(ctx, text, maxW, size, bold) {
  const s = String(text || '');
  if (!ctx || typeof ctx.measureText !== 'function') return s;
  try {
    // Важно: measureText использует текущий font, поэтому выставляем его явно.
    ctx.font = (bold ? 'bold ' : '') + Math.max(9, Math.round(Number(size) || 10)) + 'px -apple-system, "Segoe UI", sans-serif';
    if (ctx.measureText(s).width <= maxW) return s;
    let out = s;
    while (out.length > 1 && ctx.measureText(out + '…').width > maxW) out = out.slice(0, -1);
    return out + '…';
  } catch (e) {
    return s;
  }
}

function evvText(ctx, x, y, text, size, color, bold) {
  ctx.font = (bold ? 'bold ' : '') + Math.max(9, Math.round(size)) + 'px -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(4,2,12,0.6)';
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function evvPill(ctx, x, y, text, size, color) {
  const w = Math.max(46, (size || 10) * (text.length * 0.58 + 1.6));
  const h = Math.max(16, (size || 10) * 1.9);
  ctx.save();
  ctx.fillStyle = 'rgba(10,6,24,0.82)';
  evvRoundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = evvRgba(color, 0.55);
  ctx.lineWidth = 1;
  ctx.stroke();
  evvText(ctx, x, y, text, size, color || '#e8e2ff', true);
  ctx.restore();
}

function evvDrawBoss(ctx, a, L, t) {
  const cfg = a.cfg;
  const ar = a.ar;
  const col = cfg.color || '#ff6b6b';
  const g = evvBossGeom(L, t);
  const intro = evvClamp((t - EVV.bornAt) / 1.5, 0, 1);
  const ease = 1 - Math.pow(1 - intro, 3);
  const R = g.r * (0.25 + 0.75 * ease) * (1 + 0.025 * Math.sin(t * 2.1));
  if (R < 1) return;

  const hp = Number(ar.hp);
  const maxHp = Number(ar.maxHp) || 1;
  const hpFrac = evvClamp((isFinite(hp) ? hp : 0) / maxHp, 0, 1);

  // Аура
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const auraR = R * 2.4 * (1 + 0.06 * Math.sin(t * 1.7));
  const aura = ctx.createRadialGradient(g.x, g.y, R * 0.2, g.x, g.y, auraR);
  aura.addColorStop(0, evvRgba(col, 0.30));
  aura.addColorStop(0.45, evvRgba(col, 0.10));
  aura.addColorStop(1, evvRgba(col, 0));
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(g.x, g.y, auraR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Щупальца
  ctx.save();
  ctx.lineCap = 'round';
  const tendrils = 7;
  for (let k = 0; k < tendrils; k++) {
    const a0 = t * 0.55 + k * (Math.PI * 2 / tendrils);
    const len = 1.0 + 0.55 * Math.sin(t * 0.9 + k * 1.7);
    ctx.beginPath();
    for (let s = 0; s <= 14; s++) {
      const q = s / 14;
      const rr = R * (1 + q * len * 0.95);
      const aa = a0 + q * 1.5 * Math.sin(t * 0.7 + k * 0.9) + q * 0.6;
      const px = g.x + Math.cos(aa) * rr;
      const py = g.y + Math.sin(aa) * rr * 0.78;
      if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = evvRgba(col, 0.10 + 0.10 * Math.abs(Math.sin(t * 0.8 + k)));
    ctx.lineWidth = Math.max(1, R * 0.06 * (1 - k / tendrils * 0.4));
    ctx.stroke();
  }
  ctx.restore();

  // Орбитальные кольца
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 2; k++) {
    const tilt = 0.36 + k * 0.18;
    const rot = t * (k === 0 ? 0.35 : -0.22) + k * 1.2;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.5, R * 1.5 * tilt, 0, 0.25, Math.PI * 1.75);
    ctx.strokeStyle = evvRgba(col, 0.20 - k * 0.06);
    ctx.lineWidth = Math.max(1, R * 0.035);
    ctx.setLineDash([R * 0.5, R * 0.28]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  ctx.restore();

  // Тело
  const body = ctx.createRadialGradient(g.x - R * 0.32, g.y - R * 0.38, R * 0.1, g.x, g.y, R);
  body.addColorStop(0, evvRgba(col, 0.95));
  body.addColorStop(0.35, evvRgba(col, 0.55));
  body.addColorStop(0.72, 'rgba(20,10,38,0.92)');
  body.addColorStop(1, 'rgba(6,3,14,0.98)');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(g.x, g.y, R, 0, Math.PI * 2);
  ctx.fill();

  // Пятна и блик — планета-«живая» текстура вместо плоского диска.
  ctx.save();
  ctx.beginPath();
  ctx.arc(g.x, g.y, R * 0.98, 0, Math.PI * 2);
  ctx.clip();
  for (let k = 0; k < 4; k++) {
    const pa = t * 0.25 + k * 1.7;
    const pd = R * (0.25 + (k % 2) * 0.3);
    const sx = g.x + Math.cos(pa) * pd;
    const sy = g.y + Math.sin(pa) * pd * 0.7;
    const sr = R * (0.18 + (k % 3) * 0.08);
    const spot = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    spot.addColorStop(0, 'rgba(10,4,22,0.55)');
    spot.addColorStop(1, 'rgba(10,4,22,0)');
    ctx.fillStyle = spot;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }
  const glint = ctx.createRadialGradient(g.x - R * 0.35, g.y - R * 0.4, 0, g.x - R * 0.35, g.y - R * 0.4, R * 0.95);
  glint.addColorStop(0, 'rgba(255,255,255,0.16)');
  glint.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glint;
  ctx.beginPath();
  ctx.arc(g.x, g.y, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Внутренний вихрь и «глаз»
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 3; k++) {
    const rr = R * (0.35 + k * 0.17);
    const a0 = t * (1.1 + k * 0.35) * (k % 2 ? -1 : 1) + k * 2.1;
    ctx.beginPath();
    ctx.arc(g.x, g.y, rr, a0, a0 + Math.PI * 1.1);
    ctx.strokeStyle = evvRgba(col, 0.5 - k * 0.13);
    ctx.lineWidth = Math.max(1, R * 0.05);
    ctx.stroke();
  }
  const eyeA = Math.sin(t * 0.5) * 0.25;
  const ex = g.x + Math.cos(eyeA) * R * 0.12;
  const ey = g.y + Math.sin(eyeA) * R * 0.12;
  const er = R * 0.24;
  const eye = ctx.createRadialGradient(ex, ey, 0, ex, ey, er);
  eye.addColorStop(0, 'rgba(255,255,255,0.95)');
  eye.addColorStop(0.35, evvRgba(col, 0.9));
  eye.addColorStop(1, evvRgba(col, 0));
  ctx.fillStyle = eye;
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(10,4,20,0.92)';
  ctx.beginPath();
  ctx.ellipse(ex, ey, er * 0.26, er * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Ободок
  ctx.beginPath();
  ctx.arc(g.x, g.y, R, 0, Math.PI * 2);
  ctx.strokeStyle = evvRgba(col, 0.55 + 0.2 * Math.sin(t * 2.4));
  ctx.lineWidth = Math.max(1, R * 0.02);
  ctx.stroke();

  // HP-дуга
  const ringR = R * 1.62;
  const ringW = Math.max(2.5, R * 0.075);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(g.x, g.y, ringR, -Math.PI / 2, Math.PI * 1.5);
  ctx.strokeStyle = 'rgba(8,4,18,0.65)';
  ctx.lineWidth = ringW;
  ctx.stroke();
  const hpCol = hpFrac > 0.55 ? '#7ee0a8' : (hpFrac > 0.25 ? '#ffcc55' : '#ff5e5e');
  ctx.beginPath();
  ctx.arc(g.x, g.y, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpFrac);
  ctx.strokeStyle = hpCol;
  ctx.lineWidth = ringW;
  ctx.shadowColor = hpCol;
  ctx.shadowBlur = Math.max(4, R * 0.12);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Тонкий таймер снаружи
  const remain = Math.max(0, (Number(ar.endsAt) - Date.now()) / 1000);
  const limit = Math.max(1, Number(cfg.timeLimit) || 60);
  const timeFrac = evvClamp(remain / limit, 0, 1);
  ctx.beginPath();
  ctx.arc(g.x, g.y, ringR + ringW * 1.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * timeFrac);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, ringW * 0.3);
  ctx.stroke();

  evvText(ctx, g.x, g.y - ringR - 16 * L.u, cfg.icon + ' ' + cfg.title, 13 * L.u, col, true);
  evvPill(ctx, g.x, g.y + ringR + 20 * L.u, 'тапни по цели · ' + Math.ceil(remain) + 'с', 9.5 * L.u, hpCol);
  evvText(ctx, g.x, g.y + ringR + 40 * L.u, 'HP ' + Math.max(0, Math.ceil(hp)) + ' / ' + maxHp, 9 * L.u, 'rgba(232,226,255,0.75)');
}

function evvDrawTap(ctx, a, L, t) {
  const cfg = a.cfg;
  const pol = evvPolarity(cfg);
  const col = cfg.color || pol.color || '#ffb347';
  const items = evvTapGeom(L, t, a);
  const total = Math.max(1, Number(cfg.tapsRequired) || 1);
  const taps = Math.max(0, Number(a.ar.taps) || 0);
  const frac = evvClamp(taps / total, 0, 1);

  // Прогресс-кольцо вокруг звезды
  const ringR = (L.galaxy ? 46 : 108) * evvClamp(L.z, 0.5, 1.4);
  ctx.save();
  ctx.beginPath();
  ctx.arc(L.x, L.y, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = Math.max(1.5, 3 * L.u);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(L.x, L.y, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
  ctx.strokeStyle = evvRgba(col, 0.65);
  ctx.lineWidth = Math.max(1.5, 3 * L.u);
  ctx.shadowColor = col;
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  // Осколки с хвостами, летящие к звезде
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const r = Math.max(2, it.r * (1 - it.prog * 0.15));
    const alpha = 0.35 + 0.65 * (1 - it.prog);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const tx = L.x + Math.cos(it.ang + 0.4) * ringR * 0.5;
    const ty = L.y + Math.sin(it.ang + 0.4) * ringR * 0.5 * 0.68;
    const trail = ctx.createLinearGradient(it.x, it.y, tx, ty);
    trail.addColorStop(0, evvRgba(col, 0.35 * alpha));
    trail.addColorStop(1, evvRgba(col, 0));
    ctx.strokeStyle = trail;
    ctx.lineWidth = Math.max(1, r * 0.55);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(it.x, it.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    const glow = ctx.createRadialGradient(it.x, it.y, 0, it.x, it.y, r * 3.2);
    glow.addColorStop(0, evvRgba('#ffffff', 0.85 * alpha));
    glow.addColorStop(0.35, evvRgba(col, 0.55 * alpha));
    glow.addColorStop(1, evvRgba(col, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(it.x, it.y, r * 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Кристаллический осколок
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.ang * 1.4 + t * 0.8);
    ctx.fillStyle = evvRgba('#ffffff', 0.9 * alpha);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.62, 0);
    ctx.lineTo(0, r * 0.9);
    ctx.lineTo(-r * 0.62, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = evvRgba(col, 0.8 * alpha);
    ctx.lineWidth = Math.max(1, r * 0.15);
    ctx.stroke();
    ctx.restore();
  }

  // Подпись и прогресс
  evvText(ctx, L.x, L.y - ringR - 26 * L.u, cfg.icon + ' ' + cfg.title, 13 * L.u, col, true);
  evvPill(ctx, L.x, L.y - ringR - 6 * L.u, taps + ' / ' + total + ' · сбей осколки', 9.5 * L.u, col);
}

function evvDrawChoice(ctx, a, L, t) {
  const cfg = a.cfg;
  const items = evvChoiceGeom(L, t, a);
  const palette = [cfg.color || '#7ec8e3', '#7ee0a8', '#ffcc55', '#b9a8ff'];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const col = palette[i % palette.length];
    const r = it.r;
    const pulse = 1 + 0.05 * Math.sin(t * 2.2 + i);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Внешняя аура портала
    const aura = ctx.createRadialGradient(it.x, it.y, r * 0.2, it.x, it.y, r * 2.4);
    aura.addColorStop(0, evvRgba(col, 0.22));
    aura.addColorStop(0.6, evvRgba(col, 0.08));
    aura.addColorStop(1, evvRgba(col, 0));
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(it.x, it.y, r * 2.4, 0, Math.PI * 2);
    ctx.fill();

    // Вращающееся пунктирное кольцо
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(t * (0.6 + i * 0.15) * (i % 2 ? -1 : 1));
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.45 * pulse, r * 0.58 * pulse, 0.35, 0, Math.PI * 2);
    ctx.strokeStyle = evvRgba(col, 0.42);
    ctx.lineWidth = Math.max(1, r * 0.055);
    ctx.setLineDash([r * 0.32, r * 0.26]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Ядро
    const core = ctx.createRadialGradient(it.x, it.y, 0, it.x, it.y, r);
    core.addColorStop(0, 'rgba(255,255,255,0.95)');
    core.addColorStop(0.28, evvRgba(col, 0.85));
    core.addColorStop(0.72, evvRgba(col, 0.22));
    core.addColorStop(1, evvRgba(col, 0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(it.x, it.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Рамка
    ctx.beginPath();
    ctx.arc(it.x, it.y, r * 1.05, 0, Math.PI * 2);
    ctx.strokeStyle = evvRgba(col, 0.7);
    ctx.lineWidth = Math.max(1.2, r * 0.045);
    ctx.stroke();

    // Номер варианта
    evvText(ctx, it.x, it.y, String(i + 1), r * 0.85, '#0a0618', true);

    // Подпись варианта
    evvPill(ctx, it.x, it.y + r * 1.5, evvFitText(ctx, it.opt && it.opt.label ? it.opt.label : '—', r * 2.6, 9.5 * L.u, true), 9.5 * L.u, col);
  }

  evvText(ctx, L.x, L.y - (L.galaxy ? 70 : 220) * L.u, cfg.icon + ' ' + cfg.title, 13 * L.u, cfg.color || '#e8e2ff', true);
  evvText(ctx, L.x, L.y - (L.galaxy ? 54 : 202) * L.u, 'выбери портал на экране', 10 * L.u, 'rgba(232,226,255,0.8)', false);
}

function evvDrawWorldAuras(ctx, L, t) {
  const list = EVV.worldList;
  if (!list || !list.length) return;
  const maxShown = 3;
  for (let i = 0; i < list.length && i < maxShown; i++) {
    const item = list[i];
    if (!item || !item.cfg) continue;
    const pol = evvPolarity(item.cfg);
    const col = item.cfg.color || pol.color || '#8b7fd4';
    const baseR = (L.galaxy ? 18 : 128) * L.z * (0.92 + i * 0.13) * (1 + 0.02 * Math.sin(t * 1.3 + i));
    const alphaBoost = 1 - i * 0.22;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Дышащая сфера-аура вокруг звезды
    const halo = ctx.createRadialGradient(L.x, L.y, baseR * 0.55, L.x, L.y, baseR * 1.7);
    halo.addColorStop(0, evvRgba(col, 0.05 * alphaBoost));
    halo.addColorStop(0.55, evvRgba(col, 0.10 * alphaBoost));
    halo.addColorStop(1, evvRgba(col, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(L.x, L.y, baseR * 1.7, 0, Math.PI * 2);
    ctx.fill();

    // Вращающиеся разорванные дуги
    for (let k = 0; k < 3; k++) {
      const dir = (k % 2 ? -1 : 1);
      const a0 = t * (0.22 + i * 0.07) * dir + k * 2.1 + i;
      ctx.beginPath();
      ctx.arc(L.x, L.y, baseR * (1 + k * 0.13), a0, a0 + 1.25);
      ctx.strokeStyle = evvRgba(col, (0.16 + 0.06 * Math.sin(t * 2 + k)) * alphaBoost);
      ctx.lineWidth = Math.max(1, 3 * L.u);
      ctx.stroke();
    }

    // Дрейфующие глифы
    ctx.font = Math.max(10, Math.round(11 * L.u)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let g = 0; g < 5; g++) {
      const a = t * 0.3 * (i % 2 ? -1 : 1) + g * 1.2566 + i * 0.7;
      const gr = baseR * 1.3;
      const gx = L.x + Math.cos(a) * gr;
      const gy = L.y + Math.sin(a) * gr * 0.7;
      ctx.globalAlpha = (0.42 + 0.28 * Math.sin(t * 2.2 + g)) * alphaBoost;
      ctx.fillStyle = col;
      ctx.fillText(item.cfg.icon || pol.icon || '✦', gx, gy);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

function evvQuadBezier(a, b, c, t) {
  const u = 1 - t;
  return u * u * a + 2 * u * t * b + t * t * c;
}

function evvDrawCins(ctx, L, t) {
  const W = window.CANVAS_W || 400;
  const H = window.CANVAS_H || 700;
  for (let i = 0; i < EVV.cins.length; i++) {
    const c = EVV.cins[i];
    const p = evvClamp((t - c.start) / c.dur, 0, 1);
    const bad = c.mode === 'bad';
    const col = c.cfg.color || (bad ? '#ff5e5e' : '#7ec8e3');

    if (p < 0.72) {
      const e = evvClamp(p / 0.72, 0, 1);
      const dir = (i % 2 === 0) ? 1 : -1;
      const sx = L.x - dir * W * 0.6;
      const sy = L.y - H * 0.42;
      const px = L.x - dir * W * 0.25;
      const py = L.y - H * 0.16;
      const bx = evvQuadBezier(sx, px, L.x, e);
      const by = evvQuadBezier(sy, py, L.y, e);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Хвост
      const tailE = Math.max(0, e - 0.22);
      const tx = evvQuadBezier(sx, px, L.x, tailE);
      const ty = evvQuadBezier(sy, py, L.y, tailE);
      const trail = ctx.createLinearGradient(tx, ty, bx, by);
      trail.addColorStop(0, evvRgba(col, 0));
      trail.addColorStop(1, evvRgba(col, 0.55));
      ctx.strokeStyle = trail;
      ctx.lineWidth = Math.max(1.5, (bad ? 5 : 3.5) * L.u);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(bx, by);
      ctx.stroke();

      // Светящееся тело
      const rr = (bad ? 9 : 7) * L.u;
      const glow = ctx.createRadialGradient(bx, by, 0, bx, by, rr * 3.6);
      glow.addColorStop(0, evvRgba('#ffffff', 0.95));
      glow.addColorStop(0.3, evvRgba(col, 0.75));
      glow.addColorStop(1, evvRgba(col, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(bx, by, rr * 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(bx, by, rr * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (Math.random() < 0.6) {
        evvPushParticle(bx, by, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 0.5, 1.2, col, 'spark');
      }
    }

    // Ударная волна после попадания
    if (c.burst) {
      const q = evvClamp((t - (c.start + c.dur * 0.62)) / 0.8, 0, 1);
      if (q < 1) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 3; k++) {
          const qq = evvClamp(q - k * 0.12, 0, 1);
          const rr = (24 + 240 * qq) * L.u;
          ctx.beginPath();
          ctx.arc(L.x, L.y, rr, 0, Math.PI * 2);
          ctx.strokeStyle = evvRgba(col, (1 - qq) * (0.45 - k * 0.1));
          ctx.lineWidth = Math.max(1, (4 - k) * L.u * (1 - qq * 0.5));
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Текст события по центру сверху
    const fade = p < 0.15 ? p / 0.15 : (p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1);
    const ty = L.y - (L.galaxy ? 90 : 250) * L.u;
    ctx.save();
    ctx.globalAlpha = evvClamp(fade, 0, 1);
    evvText(ctx, L.x, ty, c.cfg.icon + ' ' + c.cfg.title, 14 * L.u, col, true);
    evvText(ctx, L.x, ty + 18 * L.u, evvFitText(ctx, c.cfg.desc || evvRewardLine(c.cfg, c.mode), (window.CANVAS_W || 400) * 0.8, 10 * L.u, false), 10 * L.u, 'rgba(232,226,255,0.85)', false);
    ctx.restore();
  }
}

function evvDrawParticles(ctx) {
  if (!EVV.particles.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < EVV.particles.length; i++) {
    const p = EVV.particles[i];
    const k = evvClamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = k;
    if (p.kind === 'star') {
      ctx.fillStyle = p.color;
      const r = p.size * (0.6 + 0.4 * Math.sin(p.life * 18));
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.4, r), 0, Math.PI * 2);
      ctx.fill();
    } else {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.4);
      g.addColorStop(0, evvRgba('#ffffff', 0.9));
      g.addColorStop(0.4, p.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function evvDrawFloaters(ctx) {
  if (!EVV.floaters.length) return;
  ctx.save();
  for (let i = 0; i < EVV.floaters.length; i++) {
    const f = EVV.floaters[i];
    const k = evvClamp(f.life / f.max, 0, 1);
    ctx.globalAlpha = k;
    evvText(ctx, f.x, f.y, f.text, f.size, f.color, true);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function evvDrawFlash(ctx) {
  if (EVV.flash <= 0.01) return;
  const W = window.CANVAS_W || 0;
  const H = window.CANVAS_H || 0;
  if (!W || !H) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, evvRgba(EVV.flashColor, EVV.flash * 0.22));
  g.addColorStop(0.5, evvRgba(EVV.flashColor, EVV.flash * 0.08));
  g.addColorStop(1, evvRgba(EVV.flashColor, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawEventVisuals(ctx, time) {
  if (!ctx || typeof S === 'undefined' || !S) return;
  const t = (typeof time === 'number' && isFinite(time)) ? time : evvNow();
  evvSync(t);
  const L = evvLayout(t);

  const reduced = evvReducedMotion();
  const shakePx = reduced ? 0 : EVV.shake * 7;
  ctx.save();
  if (shakePx > 0.15) {
    ctx.translate((Math.random() * 2 - 1) * shakePx, (Math.random() * 2 - 1) * shakePx);
  }

  evvDrawWorldAuras(ctx, L, t);

  const a = EVV.current;
  if (a) {
    if (a.cfg.kind === 'boss') evvDrawBoss(ctx, a, L, t);
    else if (a.cfg.kind === 'tap') evvDrawTap(ctx, a, L, t);
    else if (a.cfg.kind === 'choice') evvDrawChoice(ctx, a, L, t);
  }

  evvDrawCins(ctx, L, t);
  evvDrawParticles(ctx);
  evvDrawFloaters(ctx);

  ctx.restore();
  evvDrawFlash(ctx);
}

// ─── Восстановление визуала после загрузки страницы ────────────

function restoreEventVisuals() {
  const t = evvNow();
  EVV.activeId = null;
  EVV.particles.length = 0;
  EVV.floaters.length = 0;
  EVV.cins.length = 0;
  evvSync(t);
}

// ─── Публичный API ─────────────────────────────────────────────

window.EventVisuals = {
  layout: evvLayout,
  bossGeom: evvBossGeom,
  choiceGeom: evvChoiceGeom,
  tapGeom: evvTapGeom,
  polarity: evvPolarity,
  rewardLine: evvRewardLine,
  playCinematic: playEventCinematic,
  onResolve: eventVisualOnResolve,
  onTap: eventVisualTap,
  restore: restoreEventVisuals,
  debug: function() {
    return { activeId: EVV.activeId, bornAt: EVV.bornAt, now: evvNow(), cins: EVV.cins.length, particles: EVV.particles.length };
  },
  reset: function() {
    EVV.activeId = null;
    EVV.current = null;
    EVV.shards = null;
    EVV.particles.length = 0;
    EVV.floaters.length = 0;
    EVV.cins.length = 0;
    EVV.worldSig = '';
    EVV.worldList = [];
    EVV.shake = 0;
    EVV.flash = 0;
    EVV.pendingHit = null;
  }
};

window.updateEventVisuals = updateEventVisuals;
window.drawEventVisuals = drawEventVisuals;
window.tryHitEventVisual = evvTryHit;
window.playEventCinematic = playEventCinematic;
window.eventVisualTap = eventVisualTap;
window.eventVisualOnResolve = eventVisualOnResolve;
window.restoreEventVisuals = restoreEventVisuals;
