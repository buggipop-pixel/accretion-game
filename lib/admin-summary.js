// ═══════════════════════════════════════════════════════════════
//  ADMIN-SUMMARY.JS — компактная выжимка сейва для админ-панели.
//
//  Модуль чистый: только числа и объекты, без Redis и Express —
//  поэтому его можно тестировать отдельно, как lib/wallet.js.
//
//  Сейв приходит из облака «как есть»: часть полей могла не
//  появиться (старая версия игры), быть обрезанной или битой.
//  Поэтому каждый доступ идёт через нормализатор, а сборка целиком
//  обёрнута в try/catch: админка не должна падать из-за сейва.
// ═══════════════════════════════════════════════════════════════

export const STORAGE_MAX_LEVEL = 7;

// Подписи фаз из js/config.js (STAGES) — своих зависимостей не тянем.
const STAGE_LABELS = {
  cloud: 'Молекулярное облако',
  condense: 'Протопланетный диск',
  protostar: 'Протозвезда',
  firstPlanet: 'Первая планета',
  system: 'Формирование системы',
  galaxy: 'Межзвёздная экспансия',
};

// Подписи сложности вторжений (tierKey из js/config.js).
// Админка показывает их рядом с кораблями; ctx.tierLabels может
// переопределить любую подпись, если в игре появятся новые сложности.
const DEFAULT_TIER_LABELS = {
  scout: 'Разведка',
  raid: 'Рейд',
  siege: 'Осада',
};

// Типы планет из js/config.js (PLANET_TYPES).
const PLANET_TYPE_KEYS = ['rocky', 'superEarth', 'iceGiant', 'gasGiant', 'lava'];

function obj(value) {
  return (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, def) {
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  const d = Number(def);
  return Number.isFinite(d) ? d : 0;
}

function finiteOr(value, def) {
  return Number.isFinite(Number(value)) ? Number(value) : def;
}

function stageLabel(stage) {
  const key = typeof stage === 'string' ? stage : '';
  return STAGE_LABELS[key] || key || '—';
}

// Одна запись Прайм-системы. Данные объекта (primeData) могут быть
// неполными — показываем то, что есть, без падений.
function makePrimeEntry(scope, index, systemName, prime) {
  const p = obj(prime);
  const objectKey = typeof p.objectKey === 'string' && p.objectKey ? p.objectKey : '—';
  return {
    scope: scope,
    index: index,
    systemName: systemName || '—',
    objectKey: objectKey,
    objectName: (typeof p.objectName === 'string' && p.objectName)
      ? p.objectName
      : objectKey,
    level: num(p.level, 0),
    isPrime: true,
  };
}

// Собирает Прайм-системы: активная живёт в data.primeSystem,
// остальные — в data.otherSystems[i].primeData. Индекс 0 — родная.
function collectPrimes(data) {
  const list = arr(data.otherSystems);
  const activeIdx = Math.max(0, Math.floor(num(data.activeSystemIdx, 0)));
  const out = [];
  const seen = {};

  const activePrime = obj(data.primeSystem);
  const hasActivePrime = Object.keys(activePrime).length > 0;
  if (hasActivePrime) {
    const scope = activeIdx === 0 ? 'home' : 'other';
    const name = activeIdx === 0
      ? (data.systemName || 'Родная')
      : (obj(list[activeIdx]).name || data.systemName || ('Система ' + activeIdx));
    out.push(makePrimeEntry(scope, activeIdx, name, activePrime));
    seen[activeIdx] = true;
  }

  for (let i = 0; i < list.length; i++) {
    const sys = obj(list[i]);
    if (!Object.keys(sys).length) continue;
    const prime = sys.primeData || sys.primeSystem || null;
    if (!sys.isPrime && !prime) continue;
    if (seen[i]) continue;
    const scope = i === 0 ? 'home' : 'other';
    out.push(makePrimeEntry(scope, i, sys.name || '—', prime));
    seen[i] = true;
  }

  out.sort(function(a, b) {
    if (a.index !== b.index) return a.index - b.index;
    return a.scope === 'home' ? -1 : 1;
  });
  return out;
}

// Планеты системы. Активная система лежит в data.planets, родная при
// этом — в otherSystems[0]; планеты активной системы не считаем дважды.
function collectGalaxy(data) {
  const list = arr(data.otherSystems);
  const activeIdx = Math.max(0, Math.floor(num(data.activeSystemIdx, 0)));

  const homeList = activeIdx === 0
    ? arr(data.planets)
    : arr(obj(list[0]).planets);
  const otherLists = [];
  if (activeIdx > 0) otherLists.push(arr(data.planets));
  for (let i = 1; i < list.length; i++) {
    if (i === activeIdx) continue;
    otherLists.push(arr(obj(list[i]).planets));
  }

  const planetTypes = {};
  for (let i = 0; i < PLANET_TYPE_KEYS.length; i++) {
    planetTypes[PLANET_TYPE_KEYS[i]] = 0;
  }
  function countTypes(planets) {
    for (let i = 0; i < planets.length; i++) {
      const p = obj(planets[i]);
      const type = typeof p.type === 'string' && p.type ? p.type : 'unknown';
      planetTypes[type] = (planetTypes[type] || 0) + 1;
    }
  }
  countTypes(homeList);

  let otherPlanets = 0;
  for (let i = 0; i < otherLists.length; i++) {
    otherPlanets += otherLists[i].length;
    countTypes(otherLists[i]);
  }

  return {
    systems: num(data.systems, 1),
    totalSystemsCreated: num(data.totalSystemsCreated, 1),
    galaxies: num(data.galaxies, 1),
    galaxyForm: (typeof data.galaxyForm === 'string' && data.galaxyForm) ? data.galaxyForm : 'spiral',
    prestigeLevel: num(data.prestigeLevel, 0),
    singularities: num(data.singularities, 0),
    homePlanets: homeList.length,
    otherSystemPlanets: otherPlanets,
    planetsCount: homeList.length + otherPlanets,
    planetTypes: planetTypes,
  };
}

function collectWorldEvents(data, now) {
  const list = arr(data.activeWorldEvents);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const e = obj(list[i]);
    const id = typeof e.id === 'string' ? e.id : '';
    if (!id) continue;
    const endsAt = Math.max(0, num(e.endsAt, 0));
    out.push({
      id: id,
      // cfg из js/config.js здесь недоступен (модуль чистый),
      // поэтому берём подпись из сейва, а в крайнем случае — id.
      title: (typeof e.title === 'string' && e.title) ? e.title : id,
      tier: (typeof e.tier === 'string' && e.tier) ? e.tier : 'daily',
      startedAt: Math.max(0, num(e.startedAt, 0)),
      endsAt: endsAt,
      active: endsAt > now,
    });
  }
  return out;
}

function collectTrophyEffects(data, now) {
  const list = arr(data.activeTrophyEffects);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const e = obj(list[i]);
    if (!Object.keys(e).length) continue;
    const expiresAt = Math.max(0, num(e.expiresAt, 0));
    out.push({
      type: (typeof e.type === 'string' && e.type) ? e.type : 'unknown',
      value: num(e.value, 0),
      expiresAt: expiresAt,
      // Как и в js/invasions.js: эффект без срока считается активным.
      active: !expiresAt || expiresAt > now,
    });
  }
  return out;
}

function collectInvasions(data, tierLabels) {
  const list = arr(data.invasions);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const inv = obj(list[i]);
    if (!Object.keys(inv).length) continue;
    const tierKey = typeof inv.tierKey === 'string' ? inv.tierKey : '';
    const ships = arr(inv.ships);
    let shipsAlive = 0;
    if (ships.length) {
      for (let j = 0; j < ships.length; j++) {
        if (!(ships[j] && ships[j].destroyed)) shipsAlive++;
      }
    } else {
      shipsAlive = Math.max(0, Math.floor(num(inv.shipsAlive, 0)));
    }
    const shipsTotal = ships.length
      ? ships.length
      : Math.max(0, Math.floor(num(inv.shipsTotal, shipsAlive)));
    out.push({
      id: (typeof inv.id === 'string' && inv.id) ? inv.id : '—',
      tierKey: tierKey,
      tierLabel: tierLabels[tierKey] || inv.tierLabel || tierKey || '—',
      targetType: inv.targetType === 'planet' ? 'planet' : 'system',
      systemIdx: Math.max(0, Math.floor(num(inv.systemIdx, 0))),
      systemName: (typeof inv.systemName === 'string' && inv.systemName) ? inv.systemName : '—',
      planetName: (typeof inv.planetName === 'string') ? inv.planetName : '',
      shipsAlive: shipsAlive,
      shipsTotal: shipsTotal,
      hp: num(inv.hp, 0),
      maxHp: num(inv.maxHp, 0),
      spawnedAt: Math.max(0, num(inv.spawnedAt, 0)),
      robberyEndsAt: Math.max(0, num(inv.robberyEndsAt, 0)),
      destructionEndsAt: Math.max(0, num(inv.destructionEndsAt, 0)),
    });
  }
  return out;
}

function countKeys(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

// Пустой каркас: если сейв совсем нечитаемый, админка всё равно
// получает все поля и не спотыкается об undefined.
function emptySummary(now) {
  const planetTypes = {};
  for (let i = 0; i < PLANET_TYPE_KEYS.length; i++) {
    planetTypes[PLANET_TYPE_KEYS[i]] = 0;
  }
  return {
    now: now,
    player: { name: '—', systemName: '—', stage: '—', stageLabel: '—', activeSystemIdx: 0, tutorialDone: false },
    resources: { dust: 0, dustTotal: 0, energy: 0, civLevel: 0, metalAmount: 0 },
    storage: {
      maxLevel: STORAGE_MAX_LEVEL,
      levels: { dust: 1, energy: 1, civ: 1 },
      progress: { dust: 0, energy: 0, civ: 0 },
    },
    galaxy: {
      systems: 1, totalSystemsCreated: 1, galaxies: 1, galaxyForm: 'spiral',
      prestigeLevel: 0, singularities: 0, homePlanets: 0, otherSystemPlanets: 0,
      planetsCount: 0, planetTypes: planetTypes,
    },
    phase: { stage: '—', stageLabel: '—', phaseProgress: { cloud: 0, condense: 0, protostar: 0 }, assemblyCooldownUntil: 0 },
    primes: [],
    primeCount: 0,
    shield: { active: false, until: 0 },
    boosters: { active: false, until: 0 },
    debuffs: {
      invasion: { active: false, pct: 0, until: 0 },
      prime: { active: false, until: 0 },
    },
    worldEvents: [],
    trophyEffects: [],
    invasions: [],
    fleet: { interceptor: 0, cruiser: 0, dreadnought: 0 },
    stats: { invasionsDefeated: 0, clicks: 0, comets: 0, expeditions: 0, planets: 0, dailyClaims: 0 },
    achievements: { count: 0, unlocked: 0, primeParts: 0, primeCrafts: 0 },
    flags: { anticheatFlags: 0, eventLogUnread: 0, dailyRewardDay: 0, settings: {} },
  };
}

/**
 * Компактная выжимка сейва для админки.
 *
 * @param {object} data — raw save data (payload.data из cloudsave)
 * @param {{now?:number, tierLabels?:object}} [ctx]
 * @returns {object} структура из контракта admin.html
 */
export function summarizeSave(data, ctx) {
  const source = obj(data);
  const context = obj(ctx);
  const now = Number.isFinite(Number(context.now)) && Number(context.now) > 0
    ? Number(context.now)
    : Date.now();

  try {
    const tierLabels = Object.assign({}, DEFAULT_TIER_LABELS, obj(context.tierLabels));
    const stage = (typeof source.stage === 'string' && source.stage) ? source.stage : '—';

    // ─── Ресурсы и хранилище ───────────────────────────────────
    const resources = {
      dust: num(source.dust, 0),
      dustTotal: num(source.dustTotal, 0),
      energy: num(source.energy, 0),
      civLevel: num(source.civLevel, 0),
      metalAmount: num(source.metalAmount, 0),
    };
    const storageLevels = obj(source.storageLevels);
    const storageProgress = obj(source.storageProgress);
    const storage = {
      maxLevel: STORAGE_MAX_LEVEL,
      levels: {
        dust: num(storageLevels.dust, 1),
        energy: num(storageLevels.energy, 1),
        civ: num(storageLevels.civ, 1),
      },
      progress: {
        dust: num(storageProgress.dust, 0),
        energy: num(storageProgress.energy, 0),
        civ: num(storageProgress.civ, 0),
      },
    };

    // ─── Галактика и Прайм-системы ─────────────────────────────
    const galaxy = collectGalaxy(source);
    const primes = collectPrimes(source);

    // ─── Действующие модификаторы ──────────────────────────────
    const shieldUntil = Math.max(0, num(source.shieldUntil, 0));
    const boosterUntil = Math.max(0, num(obj(source.boosters).incomeUntil, 0));
    const invasionDebuff = obj(source.invasionDebuff);
    const invasionPct = num(invasionDebuff.pct, 0);
    const invasionUntil = Math.max(0, num(invasionDebuff.until, 0));
    const primeUntil = Math.max(0, num(source.primeDebuffUntil, 0));

    // ─── Фаза ──────────────────────────────────────────────────
    const phaseProgress = obj(source.phaseProgress);

    // ─── Статистика и достижения ───────────────────────────────
    const stats = obj(source.stats);
    const dailyReward = obj(source.dailyReward);
    const anticheat = obj(source.anticheat);

    return {
      now: now,
      player: {
        name: (typeof source.playerName === 'string' && source.playerName) ? source.playerName : '—',
        systemName: (typeof source.systemName === 'string' && source.systemName) ? source.systemName : '—',
        stage: stage,
        stageLabel: stageLabel(stage),
        activeSystemIdx: Math.max(0, Math.floor(num(source.activeSystemIdx, 0))),
        tutorialDone: !!source.tutorialDone,
      },
      resources: resources,
      storage: storage,
      galaxy: galaxy,
      phase: {
        stage: stage,
        stageLabel: stageLabel(stage),
        phaseProgress: {
          cloud: num(phaseProgress.cloud, 0),
          condense: num(phaseProgress.condense, 0),
          protostar: num(phaseProgress.protostar, 0),
        },
        assemblyCooldownUntil: Math.max(0, num(source.assemblyCooldownUntil, 0)),
      },
      primes: primes,
      primeCount: primes.length,
      shield: { active: shieldUntil > now, until: shieldUntil },
      boosters: { active: boosterUntil > now, until: boosterUntil },
      debuffs: {
        invasion: {
          active: invasionPct > 0 && invasionUntil > now,
          pct: invasionPct,
          until: invasionUntil,
        },
        prime: { active: primeUntil > now, until: primeUntil },
      },
      worldEvents: collectWorldEvents(source, now),
      trophyEffects: collectTrophyEffects(source, now),
      invasions: collectInvasions(source, tierLabels),
      fleet: {
        interceptor: num(obj(source.fleet).interceptor, 0),
        cruiser: num(obj(source.fleet).cruiser, 0),
        dreadnought: num(obj(source.fleet).dreadnought, 0),
      },
      stats: {
        invasionsDefeated: num(stats.invasionsDefeated, 0),
        clicks: num(stats.clicks, 0),
        comets: num(stats.comets, 0),
        expeditions: num(stats.expeditions, 0),
        planets: num(stats.planets, 0),
        dailyClaims: num(stats.dailyClaims, 0),
      },
      achievements: {
        count: countKeys(source.achievements),
        unlocked: countKeys(source.unlockedAch),
        primeParts: num(source.primeParts, 0),
        primeCrafts: num(source.primeCrafts, 0),
      },
      flags: {
        anticheatFlags: num(anticheat.flags, 0),
        eventLogUnread: num(source.eventLogUnread, 0),
        dailyRewardDay: finiteOr(dailyReward.day, finiteOr(dailyReward.lastClaimedDay, 0)),
        settings: Object.assign({}, obj(source.settings)),
      },
    };
  } catch (e) {
    // Сейв настолько странный, что нормализаторы не спасли — отдаём
    // пустой каркас: админка важнее, чем полнота выжимки.
    return emptySummary(now);
  }
}

/**
 * Статистика покупок Stars для карточки игрока.
 *
 * @param {Array<{product:string, stars:number, paid_at:number, granted:boolean}>|null} purchases
 * @returns {{spentStars:number, purchaseCount:number, byProduct:Array, lastPaidAt:number}}
 */
export function premiumStats(purchases) {
  const result = {
    spentStars: 0,
    purchaseCount: 0,
    byProduct: [],
    lastPaidAt: 0,
  };
  if (!Array.isArray(purchases)) return result;

  for (let i = 0; i < purchases.length; i++) {
    const p = purchases[i];
    if (!p || typeof p !== 'object') continue;
    const stars = Math.max(0, num(p.stars, 0));
    const paidAt = Math.max(0, num(p.paid_at, 0));
    result.purchaseCount++;
    result.spentStars += stars;
    if (paidAt > result.lastPaidAt) result.lastPaidAt = paidAt;
    result.byProduct.push({
      product: (typeof p.product === 'string' && p.product) ? p.product : 'unknown',
      stars: stars,
      paidAt: paidAt,
      granted: !!p.granted,
    });
  }
  return result;
}
