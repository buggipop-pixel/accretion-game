// ═══════════════════════════════════════════════════════════════
//  PUSH-NOTICES TEST — серверные поводы для Telegram-оповещений.
//  Проверяем, что игрок получает пуш о переполнении хранилища,
//  окончании щита/автобороны и «давно не виделись» БЕЗ входа в игру,
//  при этом без дублей и без потери события при сбое доставки.
//  Запуск: node tests/push-notices-test.js
// ═══════════════════════════════════════════════════════════════
// tests/ объявлен CommonJS — ESM-модуль подключаем динамически (как attack-notices-test).
let collectNotices, sleepNotice, buildDigest, formatNumber, STORAGE_RESOURCES;

let passed = 0;
let failed = 0;
function assert(name, cond, extra) {
  if (cond) { console.log('✅ ' + name); passed++; }
  else { console.error('❌ ' + name + (extra ? ' → ' + extra : '')); failed++; }
}

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

const CAPS = { dust: 1000, energy: 500, civ: 100, metals: 200 };

function save(over) {
  return Object.assign({
    dust: 0, energy: 0, civLevel: 0, metalAmount: 0,
    shieldUntil: 0, nightDefenseLevel: 0, nightDefenseExpiresAt: 0,
  }, over || {});
}

function ids(result) {
  return result.notices.map((n) => n.id);
}

(async function run() {
  ({
    collectNotices: collectNotices,
    sleepNotice: sleepNotice,
    buildDigest: buildDigest,
    formatNumber: formatNumber,
    STORAGE_RESOURCES: STORAGE_RESOURCES,
  } = await import('../lib/push-notices.js'));
  console.log('🧪 ТЕСТЫ СЕРВЕРНЫХ ПОВОДОВ ДЛЯ ОПОВЕЩЕНИЙ');

  // 1. Хранилище заполнено — уведомление уходит без игры.
  {
    const r = collectNotices(save({ dust: 1000 }), CAPS, NOW, null);
    assert('1. Заполненная пыль попала в уведомления', ids(r).indexOf('storage:dust') !== -1, ids(r).join(','));
    assert('1. В тексте есть значение и лимит', /1\.0K/.test(r.notices[0].line), r.notices[0].line);
    assert('1. Состояние помечено как filled', r.next.storage.dust === true);
  }

  // 2. Повторный проход не дублирует сообщение.
  {
    const first = collectNotices(save({ dust: 1000 }), CAPS, NOW, null);
    const second = collectNotices(save({ dust: 1000 }), CAPS, NOW + 5 * 60 * 1000, first.next);
    assert('2. Повторный проход не дублирует пуш', second.notices.length === 0);
  }

  // 3. Потратил ресурсы и снова заполнил — новый эпизод, новый пуш.
  {
    const first = collectNotices(save({ dust: 1000 }), CAPS, NOW, null);
    const spent = collectNotices(save({ dust: 10 }), CAPS, NOW + HOUR, first.next);
    assert('3. После траты состояние сброшено', spent.next.storage.dust === false);
    const again = collectNotices(save({ dust: 1000 }), CAPS, NOW + HOUR + 1, spent.next);
    assert('3. Новое заполнение снова уведомляет', ids(again).indexOf('storage:dust') !== -1);
  }

  // 4. Несколько ресурсов — одно сообщение-дайджест.
  {
    const r = collectNotices(save({ dust: 1000, energy: 500, civLevel: 100, metalAmount: 200 }), CAPS, NOW, null);
    assert('4. Все 4 ресурса дали уведомления', r.notices.length === 4, 'n=' + r.notices.length);
    const digest = buildDigest(r.notices);
    assert('4. Дайджест содержит все строки', (digest.match(/📦/g) || []).length === 4);
    assert('4. Дайджест — одно сообщение с заголовком', digest.indexOf('Требует внимания') !== -1);
  }

  // 5. Ресурс выше лимита тоже считается заполненным.
  {
    const r = collectNotices(save({ dust: 1200 }), CAPS, NOW, null);
    assert('5. Значение больше лимита = заполнено', ids(r).indexOf('storage:dust') !== -1);
  }

  // 6. Щит: предупреждение за час, один раз на конкретный until.
  {
    const until = NOW + 30 * 60 * 1000; // 30 минут
    const r = collectNotices(save({ shieldUntil: until }), CAPS, NOW, null);
    assert('6. Щит скоро кончится → пуш', ids(r).indexOf('shield') !== -1);
    assert('6. Указано оставшееся время', /30 мин/.test(r.notices[0].line), r.notices[0].line);
    const again = collectNotices(save({ shieldUntil: until }), CAPS, NOW + 5 * 60 * 1000, r.next);
    assert('6. Повторно о том же щите не пишем', ids(again).indexOf('shield') === -1);
  }

  // 7. Сервер спал дольше часа: щит уже истёк — всё равно сообщаем.
  {
    const until = NOW - 2 * HOUR;
    const r = collectNotices(save({ shieldUntil: until }), CAPS, NOW, null);
    assert('7. Истёкший щит → пуш «отключился»', ids(r).indexOf('shield') !== -1);
    assert('7. Текст про отключение', /отключился/.test(r.notices[0].line), r.notices[0].line);
  }

  // 8. Давний истёкший щит (неделя) не спамим.
  {
    const r = collectNotices(save({ shieldUntil: NOW - 7 * DAY }), CAPS, NOW, null);
    assert('8. Очень старый щит не уведомляет', ids(r).indexOf('shield') === -1);
  }

  // 9. Новый щит (другой until) после старого — снова предупреждение.
  {
    const oldUntil = NOW - 2 * HOUR;
    const first = collectNotices(save({ shieldUntil: oldUntil }), CAPS, NOW, null);
    const newUntil = NOW + 40 * 60 * 1000;
    const second = collectNotices(save({ shieldUntil: newUntil }), CAPS, NOW + HOUR, first.next);
    assert('9. Новый щит уведомляет заново', ids(second).indexOf('shield') !== -1);
  }

  // 10. Автоборона: активна и скоро кончится.
  {
    const r = collectNotices(save({ nightDefenseLevel: 3, nightDefenseExpiresAt: NOW + 20 * 60 * 1000 }), CAPS, NOW, null);
    assert('10. Автоборона скоро кончится → пуш', ids(r).indexOf('defense') !== -1);
    const again = collectNotices(save({ nightDefenseLevel: 3, nightDefenseExpiresAt: NOW + 20 * 60 * 1000 }), CAPS, NOW + 60 * 1000, r.next);
    assert('10. Повторно не пишем', ids(again).indexOf('defense') === -1);
  }

  // 11. Автоборона истекла, пока сервер спал.
  {
    const r = collectNotices(save({ nightDefenseLevel: 3, nightDefenseExpiresAt: NOW - 10 * 60 * 1000 }), CAPS, NOW, null);
    assert('11. Истёкшая автоборона → пуш', ids(r).indexOf('defense') !== -1);
    assert('11. Текст про окончание', /закончилась/.test(r.notices[0].line), r.notices[0].line);
  }

  // 12. Автоборона не настроена — молчим.
  {
    const r = collectNotices(save({ nightDefenseLevel: 0, nightDefenseExpiresAt: NOW - HOUR }), CAPS, NOW, null);
    assert('12. Без автобороны пуш не нужен', ids(r).indexOf('defense') === -1);
  }

  // 13. «Давно не виделись»: не чаще одного раза за отлучку.
  {
    const lastActive = NOW - 2 * DAY;
    const first = sleepNotice(save({}), lastActive, NOW, null);
    assert('13. Отсутствие 2 суток → пуш', !!first);
    const again = sleepNotice(save({}), lastActive, NOW + HOUR, { sleep: first.anchor });
    assert('13. Повторно за ту же отлучку не пишем', again === null);
    const nextAway = sleepNotice(save({}), lastActive, NOW + HOUR, { sleep: String(lastActive - 1000) });
    assert('13. Новая отлучка → новый пуш', !!nextAway && nextAway.anchor === String(lastActive));
  }

  // 14. Меньше суток — не пишем.
  {
    assert('14. 23 часа отсутствия — без пуша', sleepNotice(save({}), NOW - 23 * HOUR, NOW, null) === null);
    assert('14. Ровно сутки — без пуша', sleepNotice(save({}), NOW - DAY, NOW, null) === null);
  }

  // 15. Нет сейва/пустое состояние не ломают функцию.
  {
    const r = collectNotices(null, null, NOW, null);
    assert('15. null-сейв безопасен', r.notices.length === 0);
    assert('15. buildDigest пустого набора — пусто', buildDigest([]) === '');
    assert('15. sleepNotice без lastActive — null', sleepNotice({}, 0, NOW, null) === null);
  }

  // 16. Изменение состояния фиксируется даже без уведомлений.
  {
    const r = collectNotices(save({ dust: 10 }), CAPS, NOW, { storage: { dust: true } });
    assert('16. Сброс filled виден в changed', r.changed === true);
    assert('16. Пушей при этом нет', r.notices.length === 0);
  }

  // 17. Форматирование чисел.
  {
    assert('17. 1500 → 1.5K', formatNumber(1500) === '1.5K');
    assert('17. 2e6 → 2.00M', formatNumber(2e6) === '2.00M');
    assert('17. 42 → 42', formatNumber(42) === '42');
  }

  // 18. Каталог ресурсов стабилен (значения читаются из сейва).
  {
    const fields = STORAGE_RESOURCES.map((r) => r.field).join(',');
    assert('18. Поля ресурсов корректны', fields === 'dust,energy,civLevel,metalAmount', fields);
  }

  console.log('========================================');
  console.log('ИТОГО: Пройдено ' + passed + ', Провалено ' + failed);
  console.log('========================================');
  if (failed > 0) process.exit(1);
})();
