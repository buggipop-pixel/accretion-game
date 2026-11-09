// ═══════════════════════════════════════════════════════════════
//  RANDOM-EVENTS.JS — единая подсистема случайных событий
//
//  Ежедневные события: раз в сутки (один бросок на день) одно событие
//  из пула EVENTS_CFG.daily — босс, тап-угроза, награда, штраф,
//  мировой бафф/дебафф или выбор с риском.
//
//  Еженедельные «убер»-события: каждый игровой год (7-дневная неделя)
//  детерминированно выбирается случайный день и событие из
//  EVENTS_CFG.weekly. В этот день (или при первом входе после него)
//  событие стартует и действует 12–24 часа, меняя экономику.
//
//  Всё, что раньше было «глобальными событиями» (EVENT_CFG), теперь
//  является daily/weekly world-событиями с модификаторами (mods).
// ═══════════════════════════════════════════════════════════════

const RE_DAY_MS = 24 * 60 * 60 * 1000;
const RE_WEEK_MS = 7 * RE_DAY_MS;
// Понедельник, 1 января 2024, UTC — начало отсчёта игровых дней/недель.
// Единый серверный день: 01:00 UTC = 04:00 МСК (см. GAME_DAY_EPOCH).
const RE_EPOCH = (typeof GAME_DAY_EPOCH === 'number') ? GAME_DAY_EPOCH : Date.UTC(2024, 0, 1, 1);
const RE_MAX_WORLD_EVENTS = 5;

const RE_STAGE_RANK = { cloud: 0, condense: 1, protostar: 2, firstPlanet: 3, system: 4, galaxy: 5 };

const RE_EFFECT_LABELS = {
  allMult: 'весь доход',
  dustMult: 'пыль',
  energyMult: 'энергия',
  civMult: 'цивилизация',
  metalsMult: 'металл',
  clickMult: 'клики',
  cometMult: 'кометы',
  expeditionMult: 'экспедиции'
};

function reNow() { return Date.now(); }

// Щит: 24 ч полной защиты. Используем общий helper, но с фоллбеком,
// чтобы модуль событий можно было грузить отдельно в тестах/консоли.
function reShieldActive(now) {
  if (typeof isShieldActive === 'function') return isShieldActive(now);
  const t = Number(now);
  const ts = (isFinite(t) && t > 0) ? t : Date.now();
  return !!(typeof S !== 'undefined' && S && Number(S.shieldUntil) > ts);
}

function reEscapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

// Push игрокам о любом событии (ежедневном, недельном, интерактивном).
function rePushEventNotify(cfg, type, lead) {
  if (!cfg || typeof sendPushNotification !== 'function') return;
  const title = reEscapeHtml(cfg.title || 'Событие');
  const desc = reEscapeHtml(cfg.desc || '');
  const icon = cfg.icon ? String(cfg.icon) + ' ' : '';
  sendPushNotification(lead + ' ' + icon + '<b>' + title + '</b>' + (desc ? ' — ' + desc : ''), type || 'event');
}

function reDayIndex(ts) {
  const t = Number(ts) || reNow();
  return Math.floor((t - RE_EPOCH) / RE_DAY_MS);
}

function reWeekIndex(ts) {
  const t = Number(ts) || reNow();
  return Math.floor((t - RE_EPOCH) / RE_WEEK_MS);
}

function reDayOfWeek(ts) {
  const t = Number(ts) || reNow();
  const week = reWeekIndex(t);
  return Math.floor((t - RE_EPOCH - week * RE_WEEK_MS) / RE_DAY_MS);
}

// Детерминированный ГПСЧ (mulberry32): недельный план не «прыгает»
// между перезагрузками и одинаков у всех игроков в одну неделю.
function reMulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function reHashSeed(n) {
  let h = (Number(n) || 0) ^ 0x9E3779B9;
  h = Math.imul(h ^ (h >>> 16), 0x21F0AAAD);
  h = Math.imul(h ^ (h >>> 15), 0x735A2D97);
  return (h ^ (h >>> 15)) >>> 0;
}

function reStageRank(stage) {
  return Object.prototype.hasOwnProperty.call(RE_STAGE_RANK, stage) ? RE_STAGE_RANK[stage] : 0;
}

function reEventById(id) {
  if (!id || typeof EVENTS_CFG === 'undefined') return null;
  const daily = (EVENTS_CFG.daily && EVENTS_CFG.daily.pool) || [];
  const weekly = (EVENTS_CFG.weekly && EVENTS_CFG.weekly.pool) || [];
  for (let i = 0; i < weekly.length; i++) if (weekly[i].id === id) return weekly[i];
  for (let i = 0; i < daily.length; i++) if (daily[i].id === id) return daily[i];
  return null;
}

// Полярность события: положительное / отрицательное / смешанное.
// Для world/weekly считается автоматически по модификаторам, если не задано явно.
function reEventPolarity(cfg) {
  if (!cfg) return 'mixed';
  if (cfg.polarity === 'positive' || cfg.polarity === 'negative' || cfg.polarity === 'mixed') return cfg.polarity;
  if (cfg.kind === 'boss' || cfg.kind === 'tap' || cfg.kind === 'bad') return 'negative';
  if (cfg.kind === 'good') return 'positive';
  if (cfg.kind === 'choice') return 'mixed';
  const mods = cfg.mods || {};
  let buff = false;
  let debuff = false;
  for (const key in mods) {
    const v = Number(mods[key]);
    if (!isFinite(v) || v === 1) continue;
    if (v > 1) buff = true;
    else if (v > 0) debuff = true;
  }
  if (buff && debuff) return 'mixed';
  if (debuff) return 'negative';
  return 'positive';
}

function rePolarityInfo(cfg) {
  const p = reEventPolarity(cfg);
  if (p === 'negative') return { key: p, label: 'отрицательное', icon: '⚠️', color: '#ff5e5e' };
  if (p === 'mixed') return { key: p, label: 'смешанное', icon: '🎭', color: '#ffb347' };
  return { key: 'positive', label: 'положительное', icon: '✅', color: '#7ee0a8' };
}

function rePickWeighted(list, rng) {
  if (!Array.isArray(list) || !list.length) return null;
  let total = 0;
  for (let i = 0; i < list.length; i++) total += Math.max(0, Number(list[i].weight) || 0);
  if (!(total > 0)) return list[0];
  let roll = (typeof rng === 'function' ? rng() : Math.random()) * total;
  for (let i = 0; i < list.length; i++) {
    roll -= Math.max(0, Number(list[i].weight) || 0);
    if (roll <= 0) return list[i];
  }
  return list[list.length - 1];
}

function reMakeWeeklyPlan(week) {
  const cfg = (typeof EVENTS_CFG !== 'undefined' && EVENTS_CFG.weekly) ? EVENTS_CFG.weekly : null;
  if (!cfg || !Array.isArray(cfg.pool) || !cfg.pool.length) return null;
  const rng = reMulberry32(reHashSeed(week));
  const dayOffset = Math.floor(rng() * 7);
  const evt = rePickWeighted(cfg.pool, rng);
  if (!evt) return null;
  return { week: week, dayOffset: dayOffset, eventId: evt.id };
}

// ─── СОСТОЯНИЕ ────────────────────────────────────────────────

function reEnsureState() {
  if (!Array.isArray(S.activeWorldEvents)) S.activeWorldEvents = [];
  if (typeof S.lastDailyEventDay !== 'number' || !isFinite(S.lastDailyEventDay)) S.lastDailyEventDay = 0;
  if (typeof S.lastWeeklyEventWeek !== 'number' || !isFinite(S.lastWeeklyEventWeek)) S.lastWeeklyEventWeek = 0;
  if (S.weeklyEventPlan && typeof S.weeklyEventPlan !== 'object') S.weeklyEventPlan = null;
  if (S.activeRandomEvent && (typeof S.activeRandomEvent !== 'object' || !S.activeRandomEvent.id)) S.activeRandomEvent = null;
}

function reSanitizeWorldEvents(now) {
  reEnsureState();
  const t = Number(now) || reNow();
  const out = [];
  for (let i = 0; i < S.activeWorldEvents.length; i++) {
    const e = S.activeWorldEvents[i];
    if (!e || typeof e !== 'object') continue;
    if (typeof e.endsAt !== 'number' || e.endsAt <= t) continue;
    if (!reEventById(e.id)) continue;
    out.push(e);
  }
  S.activeWorldEvents = out;
  return out;
}

function reAggregateMods(now) {
  const mods = {
    allMult: 1, dustMult: 1, energyMult: 1, civMult: 1,
    metalsMult: 1, clickMult: 1, cometMult: 1, expeditionMult: 1
  };
  const list = reSanitizeWorldEvents(now);
  const shielded = reShieldActive(now);
  for (let i = 0; i < list.length; i++) {
    const cfg = reEventById(list[i].id);
    if (!cfg || !cfg.mods) continue;
    for (const key in mods) {
      if (typeof cfg.mods[key] !== 'number') continue;
      // ★ Щит — альтернатива обороне: негативную часть мировых событий
      //   он нейтрализует (v < 1), а положительную оставляет игроку.
      if (shielded && cfg.mods[key] < 1) continue;
      mods[key] *= cfg.mods[key];
    }
  }
  return mods;
}

// Множитель для конкретного вида дохода. Всегда ≥ 0 и конечный.
function reEventMult(kind, now) {
  if (typeof S === 'undefined' || !S) return 1;
  const mods = reAggregateMods(now);
  const key = String(kind || '') + 'Mult';
  const specific = (typeof mods[key] === 'number') ? mods[key] : 1;
  const value = (Number(mods.allMult) || 1) * specific;
  return (isFinite(value) && value >= 0) ? value : 1;
}

function reGetActiveWorldEvents(now) {
  const t = Number(now) || reNow();
  const shielded = reShieldActive(t);
  const list = reSanitizeWorldEvents(t);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const cfg = reEventById(list[i].id);
    if (cfg) out.push({ state: list[i], cfg: cfg, shielded: shielded && reEventPolarity(cfg) !== 'positive' });
  }
  out.sort(function(a, b) {
    if (a.state.tier === 'weekly' && b.state.tier !== 'weekly') return -1;
    if (b.state.tier === 'weekly' && a.state.tier !== 'weekly') return 1;
    return a.state.endsAt - b.state.endsAt;
  });
  return out;
}

// ─── НАГРАДЫ И ШТРАФЫ ─────────────────────────────────────────

function reAddResource(kind, amount) {
  const value = Number(amount);
  if (!isFinite(value) || value === 0) return;
  if (kind === 'dust') { S.dust = (S.dust || 0) + value; S.dustTotal = (S.dustTotal || 0) + value; }
  else if (kind === 'energy') { S.energy = (S.energy || 0) + value; }
  else if (kind === 'metals') { S.metalAmount = (S.metalAmount || 0) + value; }
  else if (kind === 'civ') { S.civLevel = (S.civLevel || 0) + value; }
}

function reFmt(n) {
  if (typeof fmt === 'function') return fmt(n);
  return String(Math.floor(Number(n) || 0));
}

function reApplyReward(reward) {
  const parts = [];
  if (!reward) return parts;

  let dust = Number(reward.dust) || 0;
  if (reward.dustHours && typeof dustPerSec === 'function') dust += Math.floor(dustPerSec() * 3600 * reward.dustHours);
  let energy = Number(reward.energy) || 0;
  if (reward.energyHours && typeof energyPerSec === 'function') energy += Math.floor(energyPerSec() * 3600 * reward.energyHours);
  let civ = Number(reward.civ) || 0;
  if (reward.civHours && typeof civPerSec === 'function') civ += Math.floor(civPerSec() * 3600 * reward.civHours);
  let metals = Number(reward.metals) || 0;
  if (reward.metalsHours && typeof metalsPerSec === 'function') metals += Math.floor(metalsPerSec() * 3600 * reward.metalsHours);

  if (dust > 0) { reAddResource('dust', Math.floor(dust)); parts.push('+' + reFmt(dust) + ' ✦'); }
  if (energy > 0) { reAddResource('energy', Math.floor(energy)); parts.push('+' + reFmt(energy) + ' ⚡'); }
  if (metals > 0) { reAddResource('metals', Math.floor(metals)); parts.push('+' + reFmt(metals) + ' ⚙'); }
  if (civ > 0) { reAddResource('civ', Math.floor(civ)); parts.push('+' + reFmt(civ) + ' 🧬'); }

  if (reward.shieldHours) {
    S.shieldUntil = Math.max(S.shieldUntil || 0, Date.now() + reward.shieldHours * 3600 * 1000);
    parts.push('🛡 ' + reward.shieldHours + 'ч');
  }
  if (reward.defenseHours) {
    S.nightDefenseLevel = Math.max(3, Number(S.nightDefenseLevel) || 0);
    S.nightDefenseExpiresAt = Math.max(S.nightDefenseExpiresAt || 0, Date.now() + reward.defenseHours * 3600 * 1000);
    parts.push('🛡 оборона');
  }
  if (reward.trophy && typeof tryRollTrophy === 'function') {
    tryRollTrophy(reward.trophy);
    parts.push('🏆 трофей');
  }
  return parts;
}

function rePickPlanet() {
  const list = Array.isArray(S.planets) ? S.planets : [];
  if (!list.length) return null;
  const pool = S.primeSystem ? list : list.filter(function(p) { return p && !p.isPrime; });
  const src = pool.length ? pool : list;
  return src[Math.floor(Math.random() * src.length)] || null;
}

function reAddWorldEvent(cfg, durationMs, tier) {
  if (!cfg) return null;
  reEnsureState();
  const now = reNow();
  const duration = Math.max(60000, Number(durationMs) || 3600000);
  // Одинаковые события не стакаются — продлеваем/обновляем.
  S.activeWorldEvents = S.activeWorldEvents.filter(function(e) { return e && e.id !== cfg.id; });
  const state = { id: cfg.id, tier: tier || 'daily', startedAt: now, endsAt: now + duration };
  S.activeWorldEvents.push(state);
  const limit = (EVENTS_CFG && EVENTS_CFG.limits && EVENTS_CFG.limits.maxWorldEvents) || RE_MAX_WORLD_EVENTS;
  while (S.activeWorldEvents.length > limit) S.activeWorldEvents.shift();
  return state;
}

// ★ Разрушение по масштабу империи. Гибнет объект, адекватный размеру
//   государства: планета → система → созвездие → туманность → скопление.
//   Прайм-системы неприкосновенны, активная система не удаляется.
function reDestroyByScale(intensity, shieldMult) {
  const res = { parts: [], systemsLost: 0, planetsLost: 0, label: '', resourcesPct: 0, primeDebuffed: false };
  function primeDebuff() {
    res.primeDebuffed = true;
    S.primeDebuffUntil = Math.max(Number(S.primeDebuffUntil) || 0, Date.now() + 3600 * 1000);
    res.parts.push('📉 Прайм: −50% дохода на 1ч');
  }
  const systems = Math.max(1, Number(S.systems) || 1);
  let small = 0, big = 0, label = 'планета';
  if (systems >= 450)      { small = 150; big = 450; label = 'скопление'; }
  else if (systems >= 150) { small = 50;  big = 150; label = 'туманность'; }
  else if (systems >= 50)  { small = 10;  big = 50;  label = 'созвездие'; }
  else if (systems >= 10)  { small = 1;   big = 10;  label = 'система'; }
  res.label = label;

  // 30% — редкий крупный объект, 70% — обычный.
  const bigRoll = big > small && Math.random() < 0.30;
  let want = bigRoll ? big : small;
  // Потолок — не более 34% империи за одно событие, но не меньше 1.
  const cap = Math.max(1, Math.floor(systems * 0.34));
  if (want > 0) want = Math.min(want, cap);
  if (shieldMult < 1 && want > 0) want = Math.max(1, Math.ceil(want / 2));

  if (want <= 1 && systems < 10) {
    const list = Array.isArray(S.planets) ? S.planets : [];
    if (!S.primeSystem && list.length > 1) {
      const victim = list.splice(Math.floor(Math.random() * list.length), 1)[0];
      res.planetsLost = 1;
      const nm = (typeof PLANET_TYPES !== 'undefined' && PLANET_TYPES[victim.type]) ? PLANET_TYPES[victim.type].name : 'планета';
      res.parts.push('💀 ' + nm);
    } else if (S.primeSystem) {
      primeDebuff();
    } else {
      res.parts.push('🛡 последняя планета не тронута');
    }
  } else {
    const list = Array.isArray(S.otherSystems) ? S.otherSystems : [];
    const active = Number(S.activeSystemIdx) || 0;
    const cand = [];
    for (let i = 1; i < list.length; i++) {
      if (i === active) continue;
      const sys = list[i];
      if (!sys || !Array.isArray(sys.planets) || !sys.planets.length) continue;
      if (typeof isPrimeSystemData === 'function' && isPrimeSystemData(sys)) continue;
      cand.push(i);
    }
    // Перемешиваем, чтобы гибли случайные системы, а не последние.
    for (let i = cand.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = cand[i]; cand[i] = cand[j]; cand[j] = t;
    }
    const take = Math.min(want, cand.length);
    const remove = {};
    const names = [];
    for (let k = 0; k < take; k++) {
      remove[cand[k]] = true;
      const sys = list[cand[k]];
      names.push(sys && sys.name ? sys.name : 'колония');
    }
    let removed = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!remove[i]) continue;
      list.splice(i, 1);
      removed++;
    }
    S.otherSystems = list;
    if (removed > 0) {
      S.systems = Math.max(1, (Number(S.systems) || 1) - removed);
      if (active > 0) {
        let shift = 0;
        for (const key in remove) if (Number(key) < active) shift++;
        S.activeSystemIdx = Math.max(1, active - shift);
      }
      res.systemsLost = removed;
      res.parts.push('💀 ' + removed + ' сист. (' + names.slice(0, 3).join(', ') + (names.length > 3 ? '…' : '') + ')');
    } else {
      const plist = Array.isArray(S.planets) ? S.planets : [];
      if (!S.primeSystem && plist.length > 1) {
        plist.splice(Math.floor(Math.random() * plist.length), 1);
        res.planetsLost = 1;
        res.parts.push('💀 планета');
      } else if (S.primeSystem) {
        primeDebuff();
      } else {
        res.parts.push('🛡 последняя планета не тронута');
      }
    }
  }

  // Разрушение всегда сопровождается потерей 15% каждой валюты.
  if (res.systemsLost > 0 || res.planetsLost > 0) {
    res.resourcesPct = 0.15;
    const fields = [['dust', '✦'], ['energy', '⚡'], ['civLevel', '🧬'], ['metalAmount', '⚙']];
    for (let i = 0; i < fields.length; i++) {
      const key = fields[i][0];
      const cur = Number(S[key]) || 0;
      const lost = Math.floor(cur * res.resourcesPct);
      if (lost > 0) S[key] = cur - lost;
    }
    res.parts.push('−15% ресурсов');

  }
  const happened = !!(res.systemsLost || res.planetsLost || res.primeDebuffed);
  if (happened && typeof notifyEvent === 'function') {
    const lines = [];
    if (res.systemsLost) lines.push('💀 Уничтожено систем: ' + res.systemsLost);
    else if (res.planetsLost) lines.push('💀 Уничтожена планета');
    if (res.primeDebuffed) lines.push('📉 Прайм: −50% дохода на 1 час');
    lines.push('🌌 Объект: ' + res.label);
    if (res.resourcesPct) lines.push('💸 Потеряно 15% каждой валюты');
    notifyEvent('event', '☠️ Босс атаковал империю', lines, {
      key: 'destroy:' + Date.now(), immediate: true, ignoreCooldown: true,
    });
  }
  if (happened && typeof addEvent === 'function') {
    addEvent('random_event_fail', 'Атака босса: ' + res.parts.join(' · '), { meta: { source: 'boss' } });
  }

  return res;
}


function reApplyPenalty(penalty, sourceTitle) {
  const parts = [];
  if (!penalty) return parts;
  const title = sourceTitle || 'событие';

  // ★ Щит: 50% — полностью гасит событие, иначе штрафы вдвое слабее.
  const shielded = reShieldActive();
  let shieldMult = 1;
  if (shielded && !penalty.destroyPlanets) {
    if (Math.random() < 0.5) return ['🛡 щит поглотил последствия']; 
    shieldMult = 0.5;
  }

  if (penalty.energyPct) {
    const lost = Math.floor((S.energy || 0) * Number(penalty.energyPct) * shieldMult);
    if (lost > 0) { S.energy = Math.max(0, (S.energy || 0) - lost); parts.push('−' + reFmt(lost) + ' ⚡'); }
  }
  if (penalty.metalsPct) {
    const lost = Math.floor((S.metalAmount || 0) * Number(penalty.metalsPct) * shieldMult);
    if (lost > 0) { S.metalAmount = Math.max(0, (S.metalAmount || 0) - lost); parts.push('−' + reFmt(lost) + ' ⚙'); }
  }
  if (penalty.dustPct) {
    const lost = Math.floor((S.dust || 0) * Number(penalty.dustPct) * shieldMult);
    if (lost > 0) { S.dust = Math.max(0, (S.dust || 0) - lost); parts.push('−' + reFmt(lost) + ' ✦'); }
  }
  if (penalty.disablePlanetHours) {
    const pl = rePickPlanet();
    if (pl) {
      const hours = Math.max(0.5, Number(penalty.disablePlanetHours) * shieldMult);
      pl.disabledUntil = Date.now() + hours * 3600 * 1000;
      const name = (typeof PLANET_TYPES !== 'undefined' && PLANET_TYPES[pl.type]) ? PLANET_TYPES[pl.type].name : 'планета';
      parts.push('🔒 ' + name + ' на ' + hours + 'ч');
    }
  }
  if (penalty.destroyPlanets) {
    let destroyMult = 1;
    if (shielded) {
      if (Math.random() < 0.5) return ['🛡 щит поглотил разрушение'];
      destroyMult = 0.5;
    }
    const dmg = reDestroyByScale(penalty.destroyPlanets, destroyMult);
    for (let i = 0; i < dmg.parts.length; i++) parts.push(dmg.parts[i]);
    if (shielded) return parts;
  }
  if (penalty.worldEvent && typeof EVENTS_CFG !== 'undefined') {
    const target = reEventById(penalty.worldEvent);
    if (target && target.mods) {
      const hours = (Number(penalty.durationHours) || 3) * shieldMult;
      reAddWorldEvent(target, hours * 3600 * 1000, 'daily');
      parts.push(target.icon + ' ' + target.title);
    }
  }
  if (typeof addEvent === 'function' && parts.length) {
    addEvent('random_event_fail', '«' + title + '»: ' + parts.join(', '));
  }
  return parts;
}

// ─── ИНТЕРАКТИВНЫЕ СОБЫТИЯ (БОСС / ТАПЫ / ВЫБОР) ─────────────

function reEventRemainingSec(ar) {
  if (!ar || typeof ar.endsAt !== 'number') return 0;
  return Math.max(0, (ar.endsAt - Date.now()) / 1000);
}

function reActiveEventCfg() {
  if (!S.activeRandomEvent) return null;
  return reEventById(S.activeRandomEvent.id);
}

function reStartInteractive(cfg) {
  if (!cfg || S.activeRandomEvent) return false;
  const now = reNow();
  const timeLimit = Math.max(15, Number(cfg.timeLimit) || 60);
  S.activeRandomEvent = {
    id: cfg.id,
    kind: cfg.kind,
    startedAt: now,
    endsAt: now + timeLimit * 1000,
    hp: Math.max(0, Number(cfg.hp) || 0),
    maxHp: Math.max(0, Number(cfg.hp) || 0),
    taps: 0
  };
  reRenderEventModal(cfg);
  if (typeof toast === 'function') toast(cfg.icon + ' ' + cfg.title, 'Событие на экране · ' + cfg.desc);
  if (typeof addEvent === 'function') addEvent('random_event', cfg.icon + ' ' + cfg.title + ' — ' + cfg.desc);
  rePushEventNotify(cfg, 'event_interactive', '⚡ <b>Новое событие!</b>');
  if (typeof playSFX === 'function') playSFX('ui_levelup');
  if (typeof saveGame === 'function') saveGame();
  return true;
}

function reModalCard() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('modalCard');
}

function reBriefingHint(cfg) {
  if (!cfg) return '';
  if (cfg.kind === 'boss') {
    const dmg = Math.max(1, Number(cfg.tapDamage) || 1);
    return 'Существо уже в вашей системе. Тапайте по нему прямо на игровом экране: каждый тап — ' + dmg + ' урона. Флот стреляет сам.';
  }
  if (cfg.kind === 'tap') {
    return 'Осколки летят к звезде. Сбивайте их тапами по экрану — нужно ' + (Number(cfg.tapsRequired) || 0) + ' попаданий.';
  }
  if (cfg.kind === 'choice') {
    return 'Выберите светящийся портал прямо на экране — или один из вариантов ниже.';
  }
  if (cfg.kind === 'world') return 'Мировой эффект уже действует и виден аурой вокруг звезды.';
  if (cfg.kind === 'good') return 'Награда уже зачислена — смотрите, как груз прибывает в систему.';
  if (cfg.kind === 'bad') return 'Удар уже случился. Восстанавливайтесь.';
  return 'Следите за событиями на игровом экране.';
}

function reBriefingReward(cfg) {
  if (!cfg) return '';
  const r = cfg.reward || {};
  const parts = [];
  if (r.dust) parts.push('+' + reFmt(r.dust) + ' ✦');
  if (r.energy) parts.push('+' + reFmt(r.energy) + ' ⚡');
  if (r.metals) parts.push('+' + reFmt(r.metals) + ' ⚙');
  if (r.civ) parts.push('+' + reFmt(r.civ) + ' 🧬');
  if (r.shieldHours) parts.push('🛡 ' + r.shieldHours + 'ч');
  if (r.defenseHours) parts.push('🛡 оборона ' + r.defenseHours + 'ч');
  if (r.trophy) parts.push('🏆 трофей');
  if (parts.length) return parts.join(' · ');
  if (cfg.kind === 'choice') return 'Награда зависит от выбора';
  if (cfg.kind === 'world') return 'Мировой эффект · ' + (cfg.durationHours || 2) + ' ч';
  if (cfg.kind === 'boss') return 'Награда за победу';
  return '';
}

// Модалка события — это брифинг-оповещение, а не поле боя:
// само событие идёт на игровом полотне (js/event-visuals.js).
function reRenderEventModal(cfg) {
  const card = reModalCard();
  if (!card) return;
  const ar = S.activeRandomEvent;
  if (!ar) return;
  const pol = rePolarityInfo(cfg);
  const remain = Math.ceil(reEventRemainingSec(ar));
  const col = cfg.color || '#ff5e5e';

  let html = '';
  html += '<div class="evt-kicker" style="color:' + col + ';">' + pol.icon + ' ЕЖЕДНЕВНОЕ СОБЫТИЕ</div>';
  html += '<div class="evt-icon" style="color:' + col + ';">' + (cfg.icon || '⚠️') + '</div>';
  html += '<div class="modal-title">' + cfg.title + '</div>';
  html += '<div class="modal-sub">' + (cfg.desc || '') + '</div>';
  html += '<div class="evt-brief">';
  html += '<div class="evt-brief-title">Что делать</div>';
  html += '<div class="evt-brief-text">' + reBriefingHint(cfg) + '</div>';
  html += '</div>';
  const rewardLine = reBriefingReward(cfg);
  if (rewardLine) html += '<div class="evt-reward">' + rewardLine + '</div>';
  html += '<div class="evt-timer" id="evtTimer">Осталось: ' + remain + 'с</div>';

  if (cfg.kind === 'boss') {
    html += '<div class="evt-progress"><div id="evtHpBar" style="width:100%"></div></div>';
    html += '<div class="evt-progress-text" id="evtHpText">HP: ' + Math.max(0, Math.floor(ar.hp)) + ' / ' + ar.maxHp + '</div>';
  } else if (cfg.kind === 'tap') {
    html += '<div class="evt-progress"><div id="evtHpBar" style="width:0%"></div></div>';
    html += '<div class="evt-progress-text" id="evtTapText">' + (ar.taps || 0) + ' / ' + cfg.tapsRequired + '</div>';
  }

  if (cfg.kind === 'choice' && Array.isArray(cfg.options)) {
    html += '<div class="event-choice-list evt-choice-fallback">';
    for (let i = 0; i < cfg.options.length; i++) {
      const opt = cfg.options[i];
      html += '<button class="event-choice-btn" onclick="resolveRandomEventChoice(\'' + opt.id + '\')">';
      html += '<b>' + opt.label + '</b><span>' + (opt.desc || '') + '</span></button>';
    }
    html += '</div>';
  }

  html += '<div class="evt-actions">';
  html += '<button class="stars-btn" style="width:100%;" onclick="closeEventModal()">К событию →</button>';
  html += '</div>';
  html += '<div class="evt-hint">Событие идёт на экране · подсказка висит у звезды</div>';

  card.innerHTML = html;
  const modalEl = document.getElementById('modal');
  if (modalEl) modalEl.classList.add('show');
}

function reTapRandomEvent() {
  const ar = S.activeRandomEvent;
  const cfg = reActiveEventCfg();
  if (!ar || !cfg) return;
  if (cfg.kind === 'boss') {
    ar.taps = (ar.taps || 0) + 1;
    ar.hp = Math.max(0, (ar.hp || 0) - (Number(cfg.tapDamage) || 1));
    const target = document.getElementById('evtTarget');
    if (target) target.style.transform = 'scale(' + (ar.taps % 2 === 0 ? 1.1 : 0.9) + ')';
  } else if (cfg.kind === 'tap') {
    ar.taps = (ar.taps || 0) + 1;
  }
  if (typeof eventVisualTap === 'function') eventVisualTap();
  reUpdateRandomEventUI();
  reCheckInteractiveSuccess();
}

function reCheckInteractiveSuccess() {
  const ar = S.activeRandomEvent;
  const cfg = reActiveEventCfg();
  if (!ar || !cfg) return false;
  if (cfg.kind === 'boss' && ar.hp <= 0) { reResolveRandomEvent(true); return true; }
  if (cfg.kind === 'tap' && ar.taps >= cfg.tapsRequired) { reResolveRandomEvent(true); return true; }
  return false;
}

function reUpdateRandomEventUI() {
  const ar = S.activeRandomEvent;
  if (!ar || typeof document === 'undefined') return;
  const cfg = reActiveEventCfg();
  const timerEl = document.getElementById('evtTimer');
  if (timerEl) timerEl.textContent = 'Осталось: ' + Math.ceil(reEventRemainingSec(ar)) + 'с';
  if (!cfg) return;
  if (cfg.kind === 'boss') {
    const bar = document.getElementById('evtHpBar');
    const text = document.getElementById('evtHpText');
    if (bar) bar.style.width = Math.max(0, (ar.hp / (ar.maxHp || 1)) * 100) + '%';
    if (text) text.textContent = 'HP: ' + Math.max(0, Math.floor(ar.hp)) + ' / ' + ar.maxHp;
  } else if (cfg.kind === 'tap') {
    const text = document.getElementById('evtTapText');
    if (text) text.textContent = (ar.taps || 0) + ' / ' + cfg.tapsRequired;
    const bar = document.getElementById('evtHpBar');
    if (bar) bar.style.width = Math.max(0, Math.min(100, ((ar.taps || 0) / Math.max(1, cfg.tapsRequired || 1)) * 100)) + '%';
  }
}

function reCloseEventModal() {
  if (typeof document === 'undefined') return;
  const modalEl = document.getElementById('modal');
  if (modalEl) modalEl.classList.remove('show');
}

function reResolveRandomEvent(success) {
  const ar = S.activeRandomEvent;
  const cfg = reActiveEventCfg();
  if (!ar || !cfg) return;
  reCloseEventModal();
  S.activeRandomEvent = null;

  const shielded = !success && reShieldActive();
  if (success) {
    const parts = reApplyReward(cfg.reward);
    if (typeof toast === 'function') toast('🏆 Победа!', parts.length ? parts.join(' · ') : 'Событие отбито');
    if (typeof addEvent === 'function') addEvent('random_event_win', cfg.icon + ' «' + cfg.title + '» отбито' + (parts.length ? ': ' + parts.join(', ') : ''));
    if (typeof playSFX === 'function') playSFX('ui_levelup');
  } else if (shielded) {
    if (typeof toast === 'function') toast('🛡 Щит', '«' + cfg.title + '» — негативные последствия поглощены');
    if (typeof addEvent === 'function') addEvent('random_event_shield', cfg.icon + ' «' + cfg.title + '»: щит поглотил последствия');
    if (typeof playSFX === 'function') playSFX('ui_levelup');
  } else {
    const parts = reApplyPenalty(cfg.penalty, cfg.title);
    if (typeof toast === 'function') toast('💀 Событие пропущено', parts.length ? parts.join(' · ') : 'Вы понесли потери');
    if (typeof playSFX === 'function') playSFX('explosion');
  }
  if (typeof eventVisualOnResolve === 'function') eventVisualOnResolve(cfg, !!success || shielded);
  if (typeof updateUI === 'function') updateUI();
  if (typeof saveGame === 'function') saveGame();
}

function reCanPayCost(cost) {
  if (!cost) return true;
  if (cost.metals && (S.metalAmount || 0) < cost.metals) return false;
  if (cost.energy && (S.energy || 0) < cost.energy) return false;
  if (cost.dust && (S.dust || 0) < cost.dust) return false;
  if (cost.energyPct && (S.energy || 0) <= 0) return false;
  return true;
}

function rePayCost(cost) {
  if (!cost) return;
  if (cost.metals) S.metalAmount = Math.max(0, (S.metalAmount || 0) - cost.metals);
  if (cost.energy) S.energy = Math.max(0, (S.energy || 0) - cost.energy);
  if (cost.dust) S.dust = Math.max(0, (S.dust || 0) - cost.dust);
  if (cost.energyPct) S.energy = Math.max(0, (S.energy || 0) - Math.floor((S.energy || 0) * cost.energyPct));
}

function reResolveRandomEventChoice(optionId) {
  const ar = S.activeRandomEvent;
  const cfg = reActiveEventCfg();
  if (!ar || !cfg || cfg.kind !== 'choice') return;
  const opt = (cfg.options || []).find(function(o) { return o.id === optionId; });
  if (!opt) return;
  if (!reCanPayCost(opt.cost)) {
    if (typeof toast === 'function') toast('Не хватает ресурсов', 'Этот вариант сейчас недоступен');
    return;
  }
  rePayCost(opt.cost);
  const success = Math.random() < (Number(opt.chance) || 1);
  const shielded = !success && reShieldActive();
  reCloseEventModal();
  S.activeRandomEvent = null;

  if (success) {
    const parts = reApplyReward(opt.success);
    if (typeof toast === 'function') toast('🎲 ' + cfg.title, parts.length ? parts.join(' · ') : 'Выбор сделан');
    if (typeof addEvent === 'function') addEvent('random_event_win', cfg.icon + ' «' + cfg.title + '» (' + opt.label + ')' + (parts.length ? ': ' + parts.join(', ') : ''));
  } else if (shielded) {
    if (typeof toast === 'function') toast('🛡 Щит', '«' + cfg.title + '» — негативный исход поглощён');
    if (typeof addEvent === 'function') addEvent('random_event_shield', cfg.icon + ' «' + cfg.title + '» (' + opt.label + '): щит поглотил последствия');
    if (typeof playSFX === 'function') playSFX('ui_levelup');
  } else {
    const parts = reApplyPenalty(opt.fail, cfg.title);
    if (typeof toast === 'function') toast('💀 ' + cfg.title, parts.length ? parts.join(' · ') : 'Риск не оправдался');
    if (typeof playSFX === 'function') playSFX('explosion');
  }
  if (typeof updateUI === 'function') updateUI();
  if (typeof eventVisualOnResolve === 'function') eventVisualOnResolve(cfg, success || shielded);
  if (typeof saveGame === 'function') saveGame();
}

// ─── ТИК И ПРОВЕРКИ ───────────────────────────────────────────

let _reLastUiAt = 0;

// Брифинг открыт? Тогда таймер события стоит на паузе: игрок читает,
// а не теряет секунды боя. Проверяем DOM, потому что модалка общая.
function reBriefingShown() {
  if (typeof document === 'undefined') return false;
  const modal = document.getElementById('modal');
  const timer = document.getElementById('evtTimer');
  if (!modal || !timer) return false;
  if (modal.classList && typeof modal.classList.contains === 'function') return modal.classList.contains('show');
  return true;
}

function reTickInteractive(dt, now) {
  const ar = S.activeRandomEvent;
  if (!ar) return;
  const cfg = reActiveEventCfg();
  if (!cfg) { S.activeRandomEvent = null; return; }

  if (reBriefingShown()) {
    ar.endsAt = (Number(ar.endsAt) || now) + Math.max(0, Number(dt) || 0) * 1000;
  }

  if (cfg.kind === 'boss' && ar.hp > 0 && S.fleetActive && S.fleet && typeof FLEET_CFG !== 'undefined') {
    let dps = 0;
    for (const key in S.fleet) {
      const ship = FLEET_CFG.ships && FLEET_CFG.ships[key];
      if (ship && S.fleet[key] > 0) dps += S.fleet[key] * (Number(ship.damage) || 0) * (Number(ship.fireRate) || 0);
    }
    if (dps > 0) ar.hp = Math.max(0, ar.hp - dps * Math.max(0, Number(dt) || 0));
  }

  if (cfg.kind === 'boss' && ar.hp <= 0) { reResolveRandomEvent(true); return; }
  if (cfg.kind === 'tap' && ar.taps >= cfg.tapsRequired) { reResolveRandomEvent(true); return; }
  if (reEventRemainingSec(ar) <= 0) { reResolveRandomEvent(false); return; }

  if (now - _reLastUiAt > 250) {
    _reLastUiAt = now;
    reUpdateRandomEventUI();
  }
}

function reCheckDaily(now) {
  const cfg = (typeof EVENTS_CFG !== 'undefined') ? EVENTS_CFG.daily : null;
  if (!cfg || !Array.isArray(cfg.pool)) return;
  reEnsureState();

  const today = reDayIndex(now);
  const minStage = cfg.minStage || 'system';

  if (!S.lastDailyEventDay) {
    // Пока не открыта система — не «сжигаем» день, чтобы первое событие
    // случилось сразу после перехода в систему.
    if (reStageRank(S.stage) < reStageRank(minStage)) return;
    S.lastDailyEventDay = today - 1;
  }
  if (S.lastDailyEventDay >= today) return;
  S.lastDailyEventDay = today;
  if (typeof saveGame === 'function') saveGame();

  if (reStageRank(S.stage) < reStageRank(minStage)) return;
  if (Math.random() >= (Number(cfg.chance) || 0)) return;

  const pool = reGetDailyPool(now);
  if (!pool.length) return;
  const evt = rePickWeighted(pool, Math.random);
  if (evt) reFireDaily(evt);
}

function reGetDailyPool(now) {
  const cfg = (typeof EVENTS_CFG !== 'undefined') ? EVENTS_CFG.daily : null;
  if (!cfg || !Array.isArray(cfg.pool)) return [];
  const minStage = cfg.minStage || 'system';
  const hasInteractive = !!S.activeRandomEvent;
  const activeIds = {};
  const world = Array.isArray(S.activeWorldEvents) ? S.activeWorldEvents : [];
  for (let i = 0; i < world.length; i++) if (world[i] && world[i].id) activeIds[world[i].id] = true;

  const out = [];
  for (let i = 0; i < cfg.pool.length; i++) {
    const e = cfg.pool[i];
    if (!e || !e.id) continue;
    if (reStageRank(e.minStage || minStage) > reStageRank(S.stage)) continue;
    if (hasInteractive && (e.kind === 'boss' || e.kind === 'tap' || e.kind === 'choice')) continue;
    if (activeIds[e.id]) continue;
    out.push(e);
  }
  return out;
}

function reFireDaily(cfg) {
  if (!cfg) return false;
  if (cfg.kind === 'boss' || cfg.kind === 'tap' || cfg.kind === 'choice') {
    return reStartInteractive(cfg);
  }
  if (cfg.kind === 'good') {
    const parts = reApplyReward(cfg.reward);
    if (typeof toast === 'function') toast(cfg.icon + ' ' + cfg.title, cfg.desc + (parts.length ? ' · ' + parts.join(' · ') : ''));
    if (typeof addEvent === 'function') addEvent('random_event_win', cfg.icon + ' ' + cfg.title + (parts.length ? ': ' + parts.join(', ') : ''));
    rePushEventNotify(cfg, 'event_daily', '🎉 <b>Хорошее событие!</b>');
    if (typeof playSFX === 'function') playSFX('ui_levelup');
    if (typeof playEventCinematic === 'function') playEventCinematic(cfg, 'positive');
    if (typeof updateUI === 'function') updateUI();
    if (typeof saveGame === 'function') saveGame();
    return true;
  }
  if (cfg.kind === 'bad') {
    if (reShieldActive()) {
      if (typeof toast === 'function') toast('🛡 Щит', cfg.icon + ' ' + cfg.title + ' — последствия поглощены');
      if (typeof addEvent === 'function') addEvent('random_event_shield', cfg.icon + ' ' + cfg.title + ': щит поглотил последствия');
      if (typeof playSFX === 'function') playSFX('ui_levelup');
      if (typeof playEventCinematic === 'function') playEventCinematic(cfg, 'positive');
      rePushEventNotify(cfg, 'event_daily', '🛡 <b>Щит поглотил событие!</b>');
      if (typeof updateUI === 'function') updateUI();
      if (typeof saveGame === 'function') saveGame();
      return true;
    }
    const parts = reApplyPenalty(cfg.penalty, cfg.title);
    if (typeof toast === 'function') toast(cfg.icon + ' ' + cfg.title, cfg.desc + (parts.length ? ' · ' + parts.join(' · ') : ''));
    if (typeof playSFX === 'function') playSFX('explosion');
    if (typeof playEventCinematic === 'function') playEventCinematic(cfg, 'negative');
    rePushEventNotify(cfg, 'event_daily', '⚠️ <b>Плохое событие!</b>');
    if (typeof updateUI === 'function') updateUI();
    if (typeof saveGame === 'function') saveGame();
    return true;
  }
  if (cfg.kind === 'world') {
    const hours = Number(cfg.durationHours) || 2;
    const pol = rePolarityInfo(cfg);
    const shielded = reShieldActive();
    if (shielded && pol.key === 'negative') {
      if (typeof toast === 'function') toast('🛡 Щит', pol.icon + ' ' + cfg.icon + ' ' + cfg.title + ' — событие поглощено');
      if (typeof addEvent === 'function') addEvent('random_event_shield', pol.icon + ' ' + cfg.icon + ' ' + cfg.title + ': щит поглотил событие');
      rePushEventNotify(cfg, 'event_world', '🛡 <b>Щит поглотил событие!</b>');
      if (typeof playSFX === 'function') playSFX('ui_levelup');
      if (typeof playEventCinematic === 'function') playEventCinematic(cfg, 'positive');
      if (typeof updateEventUI === 'function') updateEventUI();
      if (typeof updateUI === 'function') updateUI();
      if (typeof saveGame === 'function') saveGame();
      return true;
    }
    const evType = 'world_event_' + (pol.key === 'positive' ? 'buff' : pol.key === 'negative' ? 'debuff' : 'mixed');
    reAddWorldEvent(cfg, hours * 3600 * 1000, 'daily');
    const shieldNote = (shielded && pol.key === 'mixed') ? ' · 🛡 негатив поглощён' : '';
    if (typeof toast === 'function') toast(pol.icon + ' ' + cfg.icon + ' ' + cfg.title, cfg.desc + shieldNote);
    if (typeof addEvent === 'function') addEvent(evType, pol.icon + ' ' + cfg.icon + ' ' + cfg.title + ' — ' + cfg.desc + shieldNote);
    rePushEventNotify(cfg, 'event_world', '🌍 <b>Мировое событие!</b>');
    if (typeof playSFX === 'function') playSFX(pol.key === 'negative' ? 'explosion' : 'ui_levelup');
    if (typeof playEventCinematic === 'function') playEventCinematic(cfg, pol.key);
    if (typeof updateEventUI === 'function') updateEventUI();
    if (typeof saveGame === 'function') saveGame();
    return true;
  }
  return false;
}

function reCheckWeekly(now) {
  const cfg = (typeof EVENTS_CFG !== 'undefined') ? EVENTS_CFG.weekly : null;
  if (!cfg || !Array.isArray(cfg.pool) || !cfg.pool.length) return;
  reEnsureState();
  if (reStageRank(S.stage) < reStageRank('system')) return;

  const week = reWeekIndex(now);
  let plan = S.weeklyEventPlan;
  if (!plan || plan.week !== week || !reEventById(plan.eventId)) {
    plan = reMakeWeeklyPlan(week);
    if (!plan) return;
    S.weeklyEventPlan = plan;
    if (typeof saveGame === 'function') saveGame();
  }
  if (S.lastWeeklyEventWeek === week) return;
  if (reDayOfWeek(now) < plan.dayOffset) return;

  const evt = reEventById(plan.eventId);
  if (!evt) return;
  S.lastWeeklyEventWeek = week;
  reFireWeekly(evt, now);
}

function reFireWeekly(evt, now) {
  reEnsureState();
  // Новое еженедельное событие вытесняет предыдущее недельное.
  S.activeWorldEvents = S.activeWorldEvents.filter(function(e) { return e && e.tier !== 'weekly'; });
  const pol = rePolarityInfo(evt);
  const shielded = reShieldActive();

  if (shielded && pol.key === 'negative') {
    if (typeof toast === 'function') toast('🛡 Щит', pol.icon + ' ' + evt.title + ' — событие поглощено');
    if (typeof addEvent === 'function') addEvent('random_event_shield', pol.icon + ' ' + evt.title + ': щит поглотил событие');
    rePushEventNotify(evt, 'event_weekly', '🛡 <b>Щит поглотил событие!</b>');
    if (typeof playSFX === 'function') playSFX('ui_levelup');
    if (typeof playEventCinematic === 'function') playEventCinematic(evt, 'positive');
    if (typeof updateEventUI === 'function') updateEventUI();
    if (typeof saveGame === 'function') saveGame();
    return;
  }

  const hours = Number(evt.durationHours) || (EVENTS_CFG.weekly.durationHours || 24);
  reAddWorldEvent(evt, hours * 3600 * 1000, 'weekly');

  const evType = 'weekly_event_' + (pol.key === 'positive' ? 'buff' : pol.key === 'negative' ? 'debuff' : 'mixed');
  const shieldNote = (shielded && pol.key === 'mixed') ? ' · 🛡 негатив поглощён' : '';
  if (typeof toast === 'function') toast(pol.icon + ' ' + evt.title, evt.desc + shieldNote);
  if (typeof addEvent === 'function') addEvent(evType, pol.icon + ' ' + evt.title + ' — ' + evt.desc + shieldNote);
  rePushEventNotify(evt, 'event_weekly', '📅 <b>Событие дня!</b>');
  if (typeof playSFX === 'function') playSFX(pol.key === 'negative' ? 'explosion' : 'ui_levelup');
  if (typeof playEventCinematic === 'function') playEventCinematic(evt, pol.key);
  reShowWeeklyModal(evt);
  if (typeof updateEventUI === 'function') updateEventUI();
  if (typeof saveGame === 'function') saveGame();
}

function reModsSummary(mods) {
  if (!mods) return '';
  const parts = [];
  for (const key in RE_EFFECT_LABELS) {
    const v = Number(mods[key]);
    if (!isFinite(v) || v === 1) continue;
    const label = RE_EFFECT_LABELS[key];
    if (v > 1) parts.push(label + ' ×' + (Math.round(v * 100) / 100));
    else parts.push(label + ' ×' + (Math.round(v * 100) / 100) + ' (−' + Math.round((1 - v) * 100) + '%)');
  }
  return parts.join(' · ');
}

function reShowWeeklyModal(evt) {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('weeklyModal');
  const body = document.getElementById('weeklyBody');
  if (!modal) return;
  const hours = Number(evt.durationHours) || 24;
  const effect = reModsSummary(evt.mods);
  const pol = rePolarityInfo(evt);
  const shielded = reShieldActive();
  const shieldNote = (shielded && pol.key === 'mixed') ? '<div class="weekly-effect-line" style="color:#7ee0a8;">🛡 Щит нейтрализует негативную часть</div>' : '';
  const html = '' +
    '<div style="font-size:52px; line-height:1; text-align:center; margin-bottom:8px;">' + (evt.icon || '🌟') + '</div>' +
    '<div class="modal-title" style="text-align:center; color:' + (evt.color || '#ffcc55') + ';">' + evt.title + '</div>' +
    '<div class="modal-sub" style="text-align:center;">' + evt.desc + '</div>' +
    '<div style="text-align:center; margin-top:10px;"><span class="weekly-polarity ' + pol.key + '">' + pol.icon + ' ' + pol.label + ' эффект</span></div>' +
    '<div class="weekly-effect-box">' +
      (effect ? '<div class="weekly-effect-line">' + effect + '</div>' : '') +
      shieldNote +
      '<div class="weekly-effect-line">Длительность: ' + hours + ' ч</div>' +
    '</div>' +
    '<button class="stars-btn" style="width:100%; margin-top:14px;" onclick="closeWeeklyModal()">Принять вызов</button>';
  if (body) body.innerHTML = html;
  modal.classList.add('show');
}

function reCloseWeeklyModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('weeklyModal');
  if (modal) modal.classList.remove('show');
}

function reCheckRandomEvents(dt) {
  if (typeof S === 'undefined' || !S) return;
  const now = reNow();
  reEnsureState();
  reSanitizeWorldEvents(now);
  reTickInteractive(dt, now);
  reCheckDaily(now);
  reCheckWeekly(now);
}

// Брифинг можно открыть повторно в любой момент, пока событие активно.
function reOpenEventBriefing() {
  const cfg = reActiveEventCfg();
  if (!cfg || !S.activeRandomEvent) return false;
  reRenderEventModal(cfg);
  return true;
}

// Восстановление после перезагрузки: активное интерактивное событие
// уже сохранено в S.activeRandomEvent — показываем брифинг и визуал заново.
function reRestoreActiveEvent() {
  if (typeof S === 'undefined' || !S || !S.activeRandomEvent) return;
  const cfg = reActiveEventCfg();
  if (!cfg) { S.activeRandomEvent = null; return; }
  if (reEventRemainingSec(S.activeRandomEvent) <= 0) {
    // Истекло, пока игрок был офлайн: не штрафуем, просто закрываем.
    const missed = cfg;
    S.activeRandomEvent = null;
    if (typeof addEvent === 'function') addEvent('random_event_fail', missed.icon + ' «' + missed.title + '» прошло мимо: вы были офлайн');
    if (typeof saveGame === 'function') saveGame();
    return;
  }
  if (typeof restoreEventVisuals === 'function') restoreEventVisuals();
  reRenderEventModal(cfg);
  if (typeof toast === 'function') toast(cfg.icon + ' ' + cfg.title, 'Событие ждёт на экране · ' + reBriefingHint(cfg));
}

// ─── ПУБЛИЧНЫЙ API ────────────────────────────────────────────

window.RandomEvents = {
  dayIndex: reDayIndex,
  weekIndex: reWeekIndex,
  dayOfWeek: reDayOfWeek,
  makeWeeklyPlan: reMakeWeeklyPlan,
  pickWeighted: rePickWeighted,
  eventById: reEventById,
  eventPolarity: reEventPolarity,
  polarityInfo: rePolarityInfo,
  aggregateMods: reAggregateMods,
  eventMult: reEventMult,
  getActiveWorldEvents: reGetActiveWorldEvents,
  getDailyPool: reGetDailyPool,
  fireDaily: reFireDaily,
  fireWeekly: reFireWeekly,
  startInteractive: reStartInteractive,
  addWorldEvent: reAddWorldEvent,
  applyPenalty: reApplyPenalty,
  destroyByScale: reDestroyByScale,
  applyReward: reApplyReward,
  check: reCheckRandomEvents,
  checkDaily: reCheckDaily,
  checkWeekly: reCheckWeekly,
  restore: reRestoreActiveEvent,
  briefingHint: reBriefingHint,
  briefingReward: reBriefingReward,
  openBriefing: function() { return reOpenEventBriefing(); },
  modsSummary: reModsSummary,
  resetRuntime: function() { _reLastUiAt = 0; }
};

window.checkRandomEvents = reCheckRandomEvents;
window.tickRandomEvent = function(dt) { reTickInteractive(dt, reNow()); };
window.triggerRandomEvent = function(evtOrId) {
  const evt = (typeof evtOrId === 'string') ? reEventById(evtOrId) : evtOrId;
  if (!evt) return false;
  if (evt.kind === 'boss' || evt.kind === 'tap' || evt.kind === 'choice') return reStartInteractive(evt);
  return reFireDaily(evt);
};
window.updateRandomEventUI = reUpdateRandomEventUI;
window.tapRandomEvent = reTapRandomEvent;
window.resolveRandomEvent = reResolveRandomEvent;
window.resolveRandomEventChoice = reResolveRandomEventChoice;
window.closeWeeklyModal = reCloseWeeklyModal;
window.closeEventModal = reCloseEventModal;
window.openEventBriefing = reOpenEventBriefing;
window.eventMult = reEventMult;
window.restoreRandomEvent = reRestoreActiveEvent;
