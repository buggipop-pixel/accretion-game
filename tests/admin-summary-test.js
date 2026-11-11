// ═══════════════════════════════════════════════════════════════
//  ADMIN-SUMMARY TEST — выжимка сейва и статистика покупок Stars.
//  Запуск: node tests/admin-summary-test.js
// ═══════════════════════════════════════════════════════════════
let passed = 0;
let failed = 0;

function assert(name, cond, extra) {
  if (cond) { console.log('✅ ' + name); passed++; }
  else {
    console.error('❌ ' + name + (extra ? ' → ' + extra : ''));
    failed++;
  }
}

(async () => {
  const {
    summarizeSave,
    premiumStats,
    STORAGE_MAX_LEVEL,
  } = await import('../lib/admin-summary.js');

  console.log('========================================');
  console.log('🧪 ТЕСТЫ ВЫЖИМКИ СЕЙВА ДЛЯ АДМИНКИ');
  console.log('========================================');

  const now = 1700000000000;

  // ── Импорт ──────────────────────────────────────────────────
  assert('Импорт: summarizeSave — функция', typeof summarizeSave === 'function');
  assert('Импорт: premiumStats — функция', typeof premiumStats === 'function');
  assert('Импорт: STORAGE_MAX_LEVEL = 7', STORAGE_MAX_LEVEL === 7);

  // ── Пустой / битый сейв ─────────────────────────────────────
  const empty = summarizeSave({}, { now });
  assert('Пустой сейв: now из ctx', empty.now === now);
  assert('Пустой сейв: ресурсы по нулям',
    empty.resources.dust === 0 && empty.resources.dustTotal === 0 &&
    empty.resources.energy === 0 && empty.resources.civLevel === 0 &&
    empty.resources.metalAmount === 0);
  assert('Пустой сейв: хранилище maxLevel = 7', empty.storage.maxLevel === 7);
  assert('Пустой сейв: уровни хранилища по единице',
    empty.storage.levels.dust === 1 && empty.storage.levels.energy === 1 &&
    empty.storage.levels.civ === 1);
  assert('Пустой сейв: Прайм-систем нет',
    Array.isArray(empty.primes) && empty.primeCount === 0);
  assert('Пустой сейв: галактика пуста',
    empty.galaxy.planetsCount === 0 && empty.galaxy.planetTypes.rocky === 0);
  assert('Пустой сейв: фаза-заглушка', empty.phase.stageLabel === '—');
  assert('Пустой сейв: щит/бустер не активны',
    empty.shield.active === false && empty.boosters.active === false);
  assert('Пустой сейв: вторжений нет', empty.invasions.length === 0);
  assert('Пустой сейв: статы по нулям',
    empty.stats.invasionsDefeated === 0 && empty.stats.clicks === 0);

  const nullSave = summarizeSave(null, { now });
  assert('null-сейв не ломает выжимку',
    nullSave && nullSave.primeCount === 0 && nullSave.player.stage === '—');
  const junkSave = summarizeSave('мусор', { now });
  assert('Строка вместо сейва не ломает выжимку',
    junkSave && junkSave.resources.dust === 0);

  // ── Полный сейв ─────────────────────────────────────────────
  const full = {
    playerName: 'Тест',
    systemName: 'Родная',
    stage: 'galaxy',
    tutorialDone: true,
    dust: 1234, dustTotal: 9999, energy: 555, civLevel: 12, metalAmount: 77,
    storageLevels: { dust: 3, energy: 2, civ: 5 },
    storageProgress: { dust: 10, energy: 20, civ: 30 },
    fleet: { interceptor: 5, cruiser: 3, dreadnought: 1 },
    planets: [{ type: 'rocky' }, { type: 'lava' }],
    otherSystems: [
      null,
      {
        name: 'Система 1',
        planets: [{ type: 'gasGiant' }, { type: 'rocky' }],
        isPrime: true,
        primeData: { objectKey: 'blackHole', objectName: 'Чёрная дыра' },
      },
      {
        name: 'Система 2',
        planets: [{ type: 'superEarth' }],
        primeData: { objectKey: 'pulsar', objectName: 'Пульсар' },
      },
    ],
    activeSystemIdx: 0,
    systems: 3, totalSystemsCreated: 3,
    galaxies: 2, galaxyForm: 'ring',
    prestigeLevel: 4, singularities: 7,
    primeSystem: { objectKey: 'quasar', objectName: 'Квазар' },
    phaseProgress: { cloud: 1, condense: 2, protostar: 3 },
    assemblyCooldownUntil: now + 1000,
    shieldUntil: now + 5000,
    boosters: { incomeUntil: now - 5000 },
    invasionDebuff: { pct: 0.25, until: now + 6000 },
    primeDebuffUntil: now + 7000,
    activeWorldEvents: [
      { id: 'golden_hour', title: 'Золотой час', tier: 'daily', startedAt: now - 1000, endsAt: now + 1000 },
      { id: 'old_event', tier: 'weekly', startedAt: now - 9000, endsAt: now - 1000 },
    ],
    activeTrophyEffects: [
      { type: 'shield', value: 24, expiresAt: now + 1000 },
      { type: 'defense_level', value: 2, expiresAt: now - 1 },
    ],
    invasions: [{
      id: 'inv1', tierKey: 'raid', targetType: 'planet',
      systemIdx: 1, systemName: 'Система 1', planetName: 'Газовый гигант',
      ships: [
        { hp: 10, maxHp: 10, destroyed: false },
        { hp: 0, maxHp: 10, destroyed: true },
      ],
      shipsTotal: 2, hp: 50, maxHp: 100,
      spawnedAt: now - 1000,
      robberyEndsAt: now + 1000,
      destructionEndsAt: now + 2000,
    }],
    stats: { invasionsDefeated: 9, clicks: 100, comets: 3, expeditions: 4, planets: 5, dailyClaims: 6 },
    achievements: ['a', 'b'],
    unlockedAch: { x: 1, y: 2, z: 3 },
    primeParts: 4, primeCrafts: 1,
    anticheat: { flags: 2 },
    eventLogUnread: 5,
    dailyReward: { day: 42 },
    settings: { sound: false, pushEnabled: true },
  };
  const s = summarizeSave(full, { now });

  assert('Полный сейв: игрок и фаза',
    s.player.name === 'Тест' && s.player.systemName === 'Родная' &&
    s.player.stage === 'galaxy' && s.player.stageLabel === 'Межзвёздная экспансия' &&
    s.player.tutorialDone === true && s.player.activeSystemIdx === 0);
  assert('Полный сейв: ресурсы',
    s.resources.dust === 1234 && s.resources.dustTotal === 9999 &&
    s.resources.energy === 555 && s.resources.civLevel === 12 &&
    s.resources.metalAmount === 77);
  assert('Полный сейв: уровни и прогресс хранилища',
    s.storage.levels.dust === 3 && s.storage.levels.energy === 2 && s.storage.levels.civ === 5 &&
    s.storage.progress.dust === 10 && s.storage.progress.energy === 20 && s.storage.progress.civ === 30);

  assert('Прайм-системы: активная + две чужие (count = 3)',
    s.primeCount === 3 && s.primes.length === 3, JSON.stringify(s.primes));
  assert('Прайм-системы: активная — home/0/Квазар',
    s.primes[0].scope === 'home' && s.primes[0].index === 0 &&
    s.primes[0].objectKey === 'quasar' && s.primes[0].systemName === 'Родная');
  assert('Прайм-системы: чужие из otherSystems',
    s.primes[1].scope === 'other' && s.primes[1].index === 1 &&
    s.primes[1].objectName === 'Чёрная дыра' &&
    s.primes[2].index === 2 && s.primes[2].objectKey === 'pulsar');

  assert('Галактика: счётчики',
    s.galaxy.systems === 3 && s.galaxy.totalSystemsCreated === 3 &&
    s.galaxy.galaxies === 2 && s.galaxy.galaxyForm === 'ring' &&
    s.galaxy.prestigeLevel === 4 && s.galaxy.singularities === 7);
  assert('Галактика: домашние планеты = 2', s.galaxy.homePlanets === 2);
  assert('Галактика: планеты чужих систем = 3', s.galaxy.otherSystemPlanets === 3);
  assert('Галактика: всего планет = 5 (без двойного счёта)', s.galaxy.planetsCount === 5);
  assert('Галактика: типы планет посчитаны',
    s.galaxy.planetTypes.rocky === 2 && s.galaxy.planetTypes.lava === 1 &&
    s.galaxy.planetTypes.gasGiant === 1 && s.galaxy.planetTypes.superEarth === 1 &&
    s.galaxy.planetTypes.iceGiant === 0);

  assert('Фаза: прогресс и кулдаун',
    s.phase.phaseProgress.cloud === 1 && s.phase.phaseProgress.condense === 2 &&
    s.phase.phaseProgress.protostar === 3 && s.phase.assemblyCooldownUntil === now + 1000);

  assert('Щит: активен', s.shield.active === true && s.shield.until === now + 5000);
  assert('Бустер: истёк', s.boosters.active === false && s.boosters.until === now - 5000);
  assert('Дебаффы: вторжение активно',
    s.debuffs.invasion.active === true && s.debuffs.invasion.pct === 0.25);
  assert('Дебаффы: Прайм активен', s.debuffs.prime.active === true);

  assert('Мировые события: два, активно только первое',
    s.worldEvents.length === 2 && s.worldEvents[0].active === true &&
    s.worldEvents[0].title === 'Золотой час' &&
    s.worldEvents[1].active === false && s.worldEvents[1].title === 'old_event' &&
    s.worldEvents[1].tier === 'weekly');

  assert('Трофеи: активный и истёкший',
    s.trophyEffects.length === 2 && s.trophyEffects[0].active === true &&
    s.trophyEffects[1].active === false);

  assert('Вторжение: живые корабли = 1 из 2',
    s.invasions.length === 1 && s.invasions[0].shipsAlive === 1 &&
    s.invasions[0].shipsTotal === 2);
  assert('Вторжение: подпись сложности из внутренней карты',
    s.invasions[0].tierLabel === 'Рейд' && s.invasions[0].targetType === 'planet' &&
    s.invasions[0].systemName === 'Система 1');
  assert('Вторжение: HP и таймеры',
    s.invasions[0].hp === 50 && s.invasions[0].maxHp === 100 &&
    s.invasions[0].robberyEndsAt === now + 1000 &&
    s.invasions[0].destructionEndsAt === now + 2000);

  assert('Флот: три класса',
    s.fleet.interceptor === 5 && s.fleet.cruiser === 3 && s.fleet.dreadnought === 1);
  assert('Статы',
    s.stats.invasionsDefeated === 9 && s.stats.clicks === 100 &&
    s.stats.comets === 3 && s.stats.expeditions === 4 &&
    s.stats.planets === 5 && s.stats.dailyClaims === 6);
  assert('Достижения: 2 открыто, 3 разблокировано',
    s.achievements.count === 2 && s.achievements.unlocked === 3 &&
    s.achievements.primeParts === 4 && s.achievements.primeCrafts === 1);
  assert('Флаги: античит, журнал, день награды, настройки',
    s.flags.anticheatFlags === 2 && s.flags.eventLogUnread === 5 &&
    s.flags.dailyRewardDay === 42 && s.flags.settings.sound === false);

  // ── Переопределение подписей сложности ──────────────────────
  const customTier = summarizeSave(
    { invasions: [{ tierKey: 'siege' }] },
    { now, tierLabels: { siege: 'Осада (тест)' } }
  );
  assert('ctx.tierLabels переопределяет подпись сложности',
    customTier.invasions[0].tierLabel === 'Осада (тест)');

  // ── Активная не-родная система ──────────────────────────────
  const activeOther = summarizeSave({
    activeSystemIdx: 1,
    planets: [{ type: 'rocky' }],
    otherSystems: [
      { name: 'Родная', planets: [{ type: 'lava' }, { type: 'iceGiant' }] },
      { name: 'Вторая', planets: [{ type: 'rocky' }], isPrime: true, primeData: { objectKey: 'pulsar' } },
    ],
    primeSystem: { objectKey: 'pulsar', objectName: 'Пульсар' },
  }, { now });
  assert('Активная чужая система: home = 2, other = 1',
    activeOther.galaxy.homePlanets === 2 && activeOther.galaxy.otherSystemPlanets === 1 &&
    activeOther.galaxy.planetsCount === 3);
  assert('Активная чужая система: Прайм не дублируется',
    activeOther.primeCount === 1 && activeOther.primes[0].scope === 'other' &&
    activeOther.primes[0].index === 1);

  // ── Легаси-мусор не ломает выжимку ──────────────────────────
  let legacy = null;
  try {
    legacy = summarizeSave({
      planets: 'мусор',
      otherSystems: [null, 42, {}, { planets: 'нет' }],
      storageLevels: 'нет',
      storageProgress: 5,
      phaseProgress: null,
      primeSystem: 'мусор',
      boosters: 'нет',
      fleet: 5,
      stats: 'нет',
      activeWorldEvents: [null, { endsAt: 5 }, { id: 'x' }, 'мусор'],
      activeTrophyEffects: [null, 'мусор', { type: 'shield' }],
      invasions: [null, { ships: 'нет' }, { shipsAlive: 3 }],
      achievements: 7,
      unlockedAch: 'нет',
      dailyReward: 'нет',
      anticheat: null,
      activeSystemIdx: 'нет',
    }, { now });
  } catch (e) {
    legacy = null;
  }
  assert('Легаси-мусор: выжимка не падает', legacy !== null);
  assert('Легаси-мусор: мировые события отфильтрованы',
    legacy && legacy.worldEvents.length === 1 && legacy.worldEvents[0].id === 'x');
  assert('Легаси-мусор: вторжения без массива кораблей',
    legacy && legacy.invasions.length === 2 &&
    legacy.invasions[0].shipsTotal === 0 &&
    legacy.invasions[1].shipsAlive === 3 && legacy.invasions[1].shipsTotal === 3);
  assert('Легаси-мусор: Прайм-мусор не создаёт систем',
    legacy && legacy.primeCount === 0);
  assert('Легаси-мусор: настройки — объект',
    legacy && legacy.flags.settings && typeof legacy.flags.settings === 'object');

  // ── premiumStats ────────────────────────────────────────────
  const nullStats = premiumStats(null);
  assert('Покупки: null → нули',
    nullStats.spentStars === 0 && nullStats.purchaseCount === 0 &&
    nullStats.byProduct.length === 0 && nullStats.lastPaidAt === 0);
  const emptyStats = premiumStats([]);
  assert('Покупки: пустой массив → нули',
    emptyStats.spentStars === 0 && emptyStats.purchaseCount === 0);

  const stats = premiumStats([
    { product: 'chest', stars: 200, paid_at: 100, granted: true },
    { product: 'booster', stars: 75, paid_at: 300, granted: false },
    { product: 'chest', stars: 200, paid_at: 200 },
    { stars: 'мусор' },
    null,
    'мусор',
  ]);
  assert('Покупки: количество и сумма',
    stats.purchaseCount === 4 && stats.spentStars === 475,
    JSON.stringify(stats));
  assert('Покупки: последняя оплата — максимум paid_at', stats.lastPaidAt === 300);
  assert('Покупки: разбивка по товарам',
    stats.byProduct.length === 4 &&
    stats.byProduct[0].product === 'chest' && stats.byProduct[0].stars === 200 &&
    stats.byProduct[0].paidAt === 100 && stats.byProduct[0].granted === true &&
    stats.byProduct[1].granted === false &&
    stats.byProduct[3].product === 'unknown');
  assert('Покупки: не-массив не ломает подсчёт',
    premiumStats('мусор').purchaseCount === 0);

  console.log('========================================');
  console.log(`ИТОГО: Пройдено ${passed}, Провалено ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
