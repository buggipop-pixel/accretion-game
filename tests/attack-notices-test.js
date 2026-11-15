// ═══════════════════════════════════════════════════════════════
//  ATTACK-NOTICES TEST — офлайн-волна идёт с ОБЫЧНЫМ уведомлением
//  о вторжении (как живой спавн), а не с «Волна N из M · сложность
//  до X/3 · Вас нет ~3 ч».
//
//  Запуск: node tests/attack-notices-test.js
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

const MIN_SAVE = {
  stage: 'galaxy',
  starType: 'G',
  systemType: 'single',
  systems: 4,
  totalSystemsCreated: 4,
  galaxyMultiplier: 1,
  prestigeLevel: 0,
  gammaDebuff: 0,
  dust: 1e9,
  dustTotal: 1e10,
  energy: 1e9,
  civLevel: 1000,
  metalAmount: 1e9,
  storageLevels: { dust: 3, energy: 2, civ: 2 },
  boosters: { incomeUntil: 0 },
  lastTick: Date.now(),
  shadow: 0,
  shieldUntil: 0,
  activeSystemIdx: 0,
  systemName: 'Родная',
  planets: [
    { type: 'rocky', baseOrbitR: 1.1, orbitR: 110, mass: 1.4, radius: 8, forming: false },
    { type: 'gasGiant', baseOrbitR: 3.2, orbitR: 320, mass: 5.0, radius: 18, forming: false },
  ],
  otherSystems: [
    { name: 'A', starType: 'G', planets: [{ type: 'rocky', baseOrbitR: 1, orbitR: 100, mass: 1, radius: 6, forming: false }] },
    { name: 'B', starType: 'K', planets: [{ type: 'rocky', baseOrbitR: 1, orbitR: 100, mass: 1, radius: 6, forming: false }] },
  ],
  fleet: { interceptor: 0, cruiser: 0, dreadnought: 0 },
  invasionDebuff: { pct: 0, until: 0 },
  nightDefenseLevel: 0,
  settings: { pushEnabled: true },
};

(async () => {
  console.log('🧪 ТЕСТЫ УВЕДОМЛЕНИЙ О ВТОРЖЕНИИ (attack-notices)');

  const {
    buildInvasionNotice, shipsSummary, formatNoticeNumber, escapeNoticeText,
    offlineSystemName, offlineWaveTargetLabel,
  } = await import('../lib/attack-notices.js');

  // 1. Текст обычного уведомления — как notifyInvasionStart в клиенте.
  const ships = [
    { name: 'Корвет', hp: 100 },
    { name: 'Корвет', hp: 120 },
    { name: 'Истребитель', hp: 50 },
  ];
  const msg = buildInvasionNotice({
    difficulty: 2,
    tierLabel: 'Среднее (2)',
    targetLabel: 'система «Родная»',
    ships: ships,
    robberyMin: 45,
    destructionMin: 15,
  });
  assert('1. Заголовок — обычный «Вторжение! Сложность 2/3»',
    msg.indexOf('⚔️ <b>Вторжение! Сложность 2/3</b>') === 0, msg);
  assert('2. Цель вторжения указана', msg.indexOf('🎯 Цель: система «Родная»') !== -1, msg);
  assert('3. Сложность и тип атаки', msg.indexOf('💀 Сложность: 2/3 · Среднее (2)') !== -1, msg);
  assert('4. Состав эскадры с числом', msg.indexOf('Корвет ×2, Истребитель ×1 (3)') !== -1, msg);
  assert('5. Суммарная прочность', msg.indexOf('❤️ Суммарная прочность: 270 HP') !== -1, msg);
  assert('6. Таймеры ограбления/разрушения', msg.indexOf('⏱ Ограбление: 45 мин · Разрушение: 15 мин') !== -1, msg);
  assert('7. Нет «волнового» шаблона', msg.indexOf('Волна') === -1 && msg.indexOf('Вас нет') === -1 && msg.indexOf('одна за другой') === -1, msg);

  // 2. Зажим сложности и экранирование имён.
  assert('8. Сложность не выходит за 1..3',
    buildInvasionNotice({ difficulty: 99 }).indexOf('Сложность 3/3') !== -1 &&
    buildInvasionNotice({ difficulty: 0 }).indexOf('Сложность 1/3') !== -1);
  assert('9. HTML в имени системы экранируется',
    buildInvasionNotice({ targetLabel: 'система «A<B>»' }).indexOf('&lt;B&gt;') !== -1);
  assert('10. escapeNoticeText экранирует &, <, >',
    escapeNoticeText('a&b<c>d') === 'a&amp;b&lt;c&gt;d');

  // 3. Вспомогательные функции.
  assert('11. Без кораблей — (0)', shipsSummary([]).total === 0 && shipsSummary([]).text === '');
  assert('12. Короткие числа', formatNoticeNumber(1500) === '1.5K' && formatNoticeNumber(2e6) === '2.00M');
  assert('13. Имя активной системы', offlineSystemName(MIN_SAVE, 0) === 'Родная');
  assert('14. Имя колонии по индексу', offlineSystemName(MIN_SAVE, 1) === 'B');
  assert('15. Подпись цели «границы галактики» для -1',
    offlineWaveTargetLabel(MIN_SAVE, -1) === 'границы галактики');
  assert('16. Подпись цели-системы', offlineWaveTargetLabel(MIN_SAVE, 1) === 'система «B»');

  // 4. Серверный разыгрыш офлайн-волны настоящей игровой логикой.
  const { createGameCore } = await import('../lib/game-core.js');
  const core = createGameCore();
  assert('17. game-core отдаёт applyOfflineInvasions', typeof core.applyOfflineInvasions === 'function');
  assert('18. game-core отдаёт rollInvasionShips', typeof core.rollInvasionShips === 'function');

  const before = JSON.stringify(MIN_SAVE);
  const sim = core.applyOfflineInvasions(MIN_SAVE, 3 * 3600);
  assert('19. За 3 ч волна разыграна', !!sim && !!sim.data && !!sim.out, !!sim);
  assert('20. Входной сейв не мутируется', JSON.stringify(MIN_SAVE) === before);

  const waves = (sim && sim.out && Array.isArray(sim.out.invasionWaves)) ? sim.out.invasionWaves : [];
  assert('21. Есть запись о волне', waves.length === 1, 'waves=' + waves.length);
  const wave = waves[0] || {};
  assert('22. У волны есть сложность 1..3', Number(wave.difficulty) >= 1 && Number(wave.difficulty) <= 3);
  assert('23. У волны есть исход', wave.outcome === 'repelled' || wave.outcome === 'breached', wave.outcome);

  // 5. Из этой самой волны строится обычное уведомление.
  const rolled = core.rollInvasionShips(wave.tierKey || 'raid');
  assert('24. rollInvasionShips вернул корабли', rolled.count > 0 && rolled.ships.length === rolled.count);
  const cfg = core.invasionConfig();
  const notice = buildInvasionNotice({
    difficulty: wave.difficulty,
    tierLabel: wave.tierLabel,
    targetLabel: offlineWaveTargetLabel(sim.data, wave.systemIdx),
    ships: rolled.ships,
    robberyMin: Math.round(cfg.robberyDuration / 60000),
    destructionMin: Math.round(cfg.destructionDuration / 60000),
  });
  assert('25. Пуш из волны — обычное «Вторжение!»', notice.indexOf('⚔️ <b>Вторжение! Сложность ' + wave.difficulty + '/3</b>') === 0, notice);
  assert('26. В пуше есть цель', notice.indexOf('🎯 Цель: ') !== -1, notice);
  assert('27. В пуше нет «сложность до»', notice.indexOf('сложность до') === -1, notice);
  assert('28. В пуше нет номера волны', notice.indexOf('Волна') === -1, notice);

  // 6. Короткое отсутствие — волн нет, ничего не списывается.
  const short = core.applyOfflineInvasions(MIN_SAVE, 60);
  assert('29. За минуту волн нет',
    !!short && (!short.out.invasionWaves || short.out.invasionWaves.length === 0));
  assert('30. Параметры конфига для расписания',
    cfgnum(cfg.offlineAttackInterval) >= 60 * 1000 && cfgnum(cfg.offlineAttackMax) >= 1);

  function cfgnum(v) { return Number(v) || 0; }

  console.log('========================================');
  console.log('ИТОГО: Пройдено ' + passed + ', Провалено ' + failed);
  console.log('========================================');
  if (failed > 0) process.exit(1);
})();
