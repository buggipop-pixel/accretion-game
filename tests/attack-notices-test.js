// ═══════════════════════════════════════════════════════════════
//  ATTACK-NOTICES TEST — сервер должен знать, КОГДА начинается
//  очередная офлайн-волна, чтобы прислать «⚔️ Вторжение!» ещё
//  до возвращения игрока.
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
  planets: [
    { type: 'rocky', baseOrbitR: 1.1, orbitR: 110, mass: 1.4, radius: 8, forming: false },
    { type: 'gasGiant', baseOrbitR: 3.2, orbitR: 320, mass: 5.0, radius: 18, forming: false },
  ],
  otherSystems: [
    { name: 'A', starType: 'G', planets: [{ type: 'rocky', baseOrbitR: 1, orbitR: 100, mass: 1, radius: 6, forming: false }] },
    { name: 'B', starType: 'K', planets: [{ type: 'rocky', baseOrbitR: 1, orbitR: 100, mass: 1, radius: 6, forming: false }] },
  ],
  fleet: { interceptor: 0, cruiser: 0, dreadnought: 0 },
};

(async () => {
  console.log('🧪 ТЕСТЫ РАСПИСАНИЯ ОФЛАЙН-ВОЛН (attack-notices)');

  const { waveSchedule, buildWaveNotice } = await import('../lib/attack-notices.js');

  // 1. Защита от мусора.
  assert('1. null → нет расписания', waveSchedule(null) === null);
  assert('2. skipped → нет расписания', waveSchedule({ skipped: true, reason: 'shield' }) === null);
  assert('3. attacks=0 → нет расписания', waveSchedule({ attacks: 0, attackWindowStartMs: 1, attackStepMs: 1 }) === null);
  assert('4. без шага → нет расписания', waveSchedule({ attacks: 3, attackWindowStartMs: 1, attackStepMs: 0 }) === null);

  // 2. Расписание: середины интервалов.
  const sched = waveSchedule({ attacks: 3, attackWindowStartMs: 1000, attackStepMs: 100 });
  assert('5. Волн в расписании = attacks', sched && sched.attacks === 3);
  assert('6. Времена волн = середины интервалов', sched && sched.times.join(',') === '1050,1150,1250',
    sched && sched.times.join(','));

  // 3. Текст пуша.
  const preview = {
    attacks: 4,
    awayHours: 9.5,
    maxDifficulty: 3,
    shieldProtected: false,
  };
  const msg = buildWaveNotice(preview, 2);
  assert('7. Заголовок «Вторжение!»', msg.indexOf('⚔️ <b>Вторжение!</b>') === 0);
  assert('8. Номер волны и всего', msg.indexOf('Волна <b>3</b> из <b>4</b>') !== -1, msg);
  assert('9. Сложность «до 3/3»', msg.indexOf('3/3') !== -1);
  assert('10. Часы отсутствия в тексте', msg.indexOf('9.5 ч') !== -1);
  assert('11. Без щита нет строки про щит', msg.indexOf('🛡') === -1);

  const shielded = buildWaveNotice({ attacks: 2, awayHours: 0.5, maxDifficulty: 1, shieldProtected: true }, 0);
  assert('12. Со щитом есть строка про щит', shielded.indexOf('🛡') !== -1);
  assert('13. Минуты для короткого отсутствия', shielded.indexOf('30 мин') !== -1);
  assert('14. Индекс волны зажимается в диапазон',
    buildWaveNotice({ attacks: 2, awayHours: 1, maxDifficulty: 1 }, 99).indexOf('Волна <b>2</b> из <b>2</b>') !== -1);

  // 4. Связка с серверным предпросмотром: после 22 ч отсутствия волны есть,
  //    а расписание строится и лежит внутри окна отсутствия.
  const { createGameCore } = await import('../lib/game-core.js');
  const core = createGameCore();
  const awaySec = 22 * 3600;
  const pv = core.previewOfflineInvasions(MIN_SAVE, awaySec);
  assert('15. Предпросмотр за 22 ч не пуст', !!pv && !pv.skipped, pv && pv.reason);
  assert('16. В предпросмотре есть окно волн', !!(pv && pv.attackWindowStartMs > 0));
  assert('17. В предпросмотре есть шаг волн', !!(pv && pv.attackStepMs > 0));
  const s2 = waveSchedule(pv);
  assert('18. Расписание строится из предпросмотра', !!s2 && s2.attacks === pv.attacks);
  const nowTs = Date.now();
  assert('19. Все волны в прошлом (уже «начались»)', s2 && s2.times.every((t) => t <= nowTs + 1000));
  assert('20. Волны идут по возрастанию', s2 && s2.times.every((t, i, a) => i === 0 || t > a[i - 1]));

  console.log('========================================');
  console.log('ИТОГО: Пройдено ' + passed + ', Провалено ' + failed);
  console.log('========================================');
  if (failed > 0) process.exit(1);
})();
