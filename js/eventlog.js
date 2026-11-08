// ═══════════════════════════════════════════════════════════════
//  EVENTLOG.JS — журнал событий игры
//
//  Хранит последние 100 событий в S.eventLog.
//  Показывает в модалке с иконкой 📜 в правом верхнем углу.
//  При непрочитанных — бейдж на иконке.
//
//  API:
//    addEvent(type, text, opts)     — добавить событие
//    renderEventLog()               — перерисовать панель
//    toggleEventLog()               — открыть/закрыть панель
//    markEventLogRead()             — сбросить счётчик непрочитанных
// ═══════════════════════════════════════════════════════════════

const EVENT_ICONS = {
  // Вторжения
  invasion_spawn:     '⚔️',
  defense_active:     '🛡',
  invasion_deflect:   '🛡️',
  invasion_repelled:  '🛡️',
  invasion_destroy:   '💀',
  invasion_robbery:   '💰',
  galaxy_neglect:     '☠️',
  // Космические события
  comet_spawn:        '☄️',
  comet_arrive:       '🌠',
  comet_lost:         '💨',
  comet_destroy_planet: '💥',
  // Планеты
  planet_formed:      '✨',
  planet_collision:   '💫',
  planet_merge:       '🪐',
  planet_destroyed:   '💥',
  // Системы
  system_formed:      '🌌',
  system_lost:        '🌫️',
  // Престиж
  prestige_done:      '💥',
  prime_found:        '🌟',
  // Прочее
  offline_income:     '💤',
  milestone:          '🎯',
  random_event:       '🎲',
  random_event_win:   '🏆',
  random_event_fail:  '💀',
  random_event_shield:'🛡',
  weekly_event:       '🌟',
  weekly_event_buff:  '🌟',
  weekly_event_debuff:'🌑',
  weekly_event_mixed: '🎭',
  world_event:        '🌍',
  world_event_buff:   '🌿',
  world_event_debuff: '☠️',
  world_event_mixed:  '🎭',
};

const EVENT_COLORS = {
  invasion_spawn:    '#ff5e5e',
  defense_active:    '#7ee0a8',
  invasion_deflect:  '#7ee0a8',
  invasion_repelled: '#7ee0a8',
  invasion_destroy:  '#ff2a2a',
  invasion_robbery:  '#ff9944',
  galaxy_neglect:    '#ff2a2a',
  comet_spawn:       '#7ec8e3',
  comet_arrive:      '#7ec8e3',
  comet_lost:        '#8b7fd4',
  comet_destroy_planet: '#ff3030',
  planet_formed:     '#b9a8ff',
  planet_collision:  '#ffb347',
  planet_merge:      '#7ee0a8',
  planet_destroyed:  '#ff2a2a',
  system_formed:     '#b9a8ff',
  system_lost:       '#8b7fd4',
  prestige_done:     '#ffb347',
  prime_found:       '#ffcc55',
  offline_income:    '#a89ce0',
  milestone:         '#ffcc55',
  random_event:      '#7ec8e3',
  random_event_win:  '#7ee0a8',
  random_event_fail: '#ff5e5e',
  random_event_shield:'#7ee0a8',
  weekly_event:      '#ffcc55',
  weekly_event_buff: '#ffcc55',
  weekly_event_debuff:'#ff5e5e',
  weekly_event_mixed:'#ffb347',
  world_event:       '#b9a8ff',
  world_event_buff:  '#7ee0a8',
  world_event_debuff:'#ff5e5e',
  world_event_mixed: '#ffb347',
};

// Иконки типов планет для строк журнала.
const EVENT_PLANET_ICONS = {
  rocky:      '🪨',
  superEarth: '🌍',
  iceGiant:   '🧊',
  gasGiant:   '🪐',
  lava:       '🌋',
};

// Человекочитаемые названия типов и полей — для разворачиваемого отчёта.
const EVENT_TYPE_LABELS = {
  invasion_spawn: 'Вторжение', defense_active: 'Активная оборона',
  invasion_deflect: 'Вторжение отбито', invasion_repelled: 'Вторжение отбито',
  invasion_destroy: 'Разрушение', invasion_robbery: 'Ограбление',
  galaxy_neglect: 'Запустение галактики',
  comet_spawn: 'Запуск миссии', comet_arrive: 'Миссия вернулась',
  comet_lost: 'Миссия потеряна', comet_destroy_planet: 'Комета уничтожила планету',
  planet_formed: 'Появилась планета', planet_collision: 'Столкновение',
  planet_merge: 'Слияние планет', planet_destroyed: 'Планета уничтожена',
  system_formed: 'Основана система', system_lost: 'Система потеряна',
  prestige_done: 'Вспышка сверхновой', prime_found: 'Прайм-объект',
  offline_income: 'Офлайн-прогресс', milestone: 'Веха',
  random_event: 'Случайное событие', random_event_win: 'Событие пройдено',
  random_event_fail: 'Событие провалено', random_event_shield: 'Щит поглотил событие', weekly_event: 'Недельное событие',
  weekly_event_buff: 'Недельный бафф', weekly_event_debuff: 'Недельный дебафф',
  weekly_event_mixed: 'Недельное событие', world_event: 'Мировое событие',
  world_event_buff: 'Мировой бафф', world_event_debuff: 'Мировой дебафф',
  world_event_mixed: 'Мировое событие',
};

const META_LABELS = {
  tierKey: 'Тип атаки', tierLabel: 'Тип атаки', ships: 'Кораблей',
  rewardAmount: 'Награда', count: 'Количество', hours: 'Длительность, ч',
  defenseLevel: 'Уровень Автобороны', repelPercent: 'Шанс отбития, %',
  defensePct: 'Бонус обороны, %', fleetPct: 'Бонус флота, %',
  expeditionPenalty: 'Штраф экспедиции, %', source: 'Источник',
  awayHours: 'Отсутствие, ч', attacks: 'Атак', defended: 'Отбито',
  lostDust: 'Украдено пыли', lostEnergy: 'Украдено энергии',
  lostCiv: 'Украдено цивилизации', lostMetals: 'Украдено металлов',
  systemsDamaged: 'Повреждено систем', planetsDisabled: 'Планет в простое',
  shieldProtected: 'Щит', galaxy: 'Галактика', multiplier: 'Множитель',
  starType: 'Тип звезды', planetName: 'Планета', planetType: 'Тип планеты',
  reason: 'Причина', primeName: 'Прайм-объект', primeBonus: 'Бонус',
  missionType: 'Миссия', flightTime: 'Время полёта, мин', sizePct: 'Размер, %',
  failChance: 'Шанс провала, %', distance: 'Дистанция', eventId: 'Событие',
  description: 'Описание', effects: 'Эффекты', choice: 'Выбор', mode: 'Режим',
  systemName: 'Система', planetSeed: 'Планета', energyEarned: 'Энергия',
  civEarned: 'Цивилизация', metalsEarned: 'Металлы', dustEarned: 'Пыль',
};

const _openEventKeys = new Set();

function _eventKey(ev) {
  return String(ev.ts) + '|' + String(ev.type) + '|' + String(ev.text || '').slice(0, 32);
}

function _escEvent(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _fmtEventNum(n) {
  const v = Number(n);
  if (!isFinite(v)) return String(n);
  if (typeof fmt === 'function') return fmt(v);
  return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('ru-RU') : String(Math.round(v * 100) / 100);
}

function _fmtEventTimeFull(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

function _fmtDurationMs(ms, compact) {
  const sec = Math.max(0, Math.round(Number(ms) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return h + ' ч ' + m + ' мин';
  if (m > 0) return m + ' мин';
  return sec + ' с';
}

function _eventMetaValue(key, value) {
  if (value === undefined || value === null) return '';
  if (key === 'tierKey' && typeof INVASION_CFG !== 'undefined') {
    const t = INVASION_CFG.tiers && INVASION_CFG.tiers[value];
    if (t && t.label) return t.label;
  }
  if (key === 'difficulty') return String(value) + '/3';
  if (key === 'source') {
    if (value === 'offline') return 'офлайн-вторжение';
    if (value === 'live') return 'живое вторжение';
    return String(value);
  }
  if (key === 'shieldProtected') return value ? 'да, покрыл часть отсутствия' : 'нет';
  if (key === 'primeBonus' || key === 'effects') {
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') {
      return Object.keys(value).map(function(k) { return k + ': ' + value[k]; }).join(', ');
    }
  }
  if (key === 'flightTime') {
    const n = Number(value);
    if (isFinite(n)) return String(Math.round(n / 60000 * 10) / 10) + ' мин';
  }
  if (key.indexOf('lost') === 0) {
    const n = Number(value);
    if (isFinite(n)) return '−' + _fmtEventNum(Math.abs(n));
  }
  if (key === 'rewardAmount' || key === 'reward' || key === 'dustEarned' ||
      key === 'energyEarned' || key === 'civEarned' || key === 'metalsEarned') {
    const n = Number(value);
    if (isFinite(n)) return (n > 0 ? '+' : '') + _fmtEventNum(n);
  }
  if (typeof value === 'number' && isFinite(value)) {
    if (key === 'planetSeed') return 'seed ' + Math.round(value);
    return _fmtEventNum(value);
  }
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  return String(value).slice(0, 300);
}

function _buildEventDetails(ev) {
  const meta = ev.meta || {};
  const rows = [];
  const used = new Set();
  function add(label, value, key) {
    if (value === undefined || value === null || value === '') return;
    if (key) used.add(key);
    rows.push({ label: String(label), value: String(value) });
  }
  function metaRow(key) {
    if (!META_LABELS[key]) return;
    add(META_LABELS[key], _eventMetaValue(key, meta[key]), key);
  }

  add('Время', _fmtEventTimeFull(ev.ts));
  add('Тип события', EVENT_TYPE_LABELS[ev.type] || ev.type || 'Событие');

  if (typeof meta.systemIdx === 'number' && isFinite(meta.systemIdx)) {
    add('Система', '«' + _eventSystemName(meta.systemIdx) + '»');
  }
  if (meta.planetSeed !== undefined && meta.planetSeed !== null) {
    const ptype = _findPlanetTypeBySeed(meta.planetSeed);
    const pname = ptype && typeof PLANET_TYPES !== 'undefined' && PLANET_TYPES[ptype]
      ? PLANET_TYPES[ptype].name : 'планета';
    add('Планета', pname + ' (seed ' + Math.round(Number(meta.planetSeed) || 0) + ')');
  }

  // Тип-специфичные подробности.
  if (ev.type === 'galaxy_neglect') {
    if (meta.awayHours) add('Отсутствие', _fmtEventNum(meta.awayHours) + ' ч', 'awayHours');
    if (meta.attacks !== undefined) add('Атак', _fmtEventNum(meta.attacks), 'attacks');
    if (meta.defended !== undefined) add('Отбито', _fmtEventNum(meta.defended), 'defended');
    if (meta.lostDust) add('Украдено пыли', '−' + _fmtEventNum(meta.lostDust), 'lostDust');
    if (meta.lostEnergy) add('Украдено энергии', '−' + _fmtEventNum(meta.lostEnergy), 'lostEnergy');
    if (meta.lostCiv) add('Украдено цивилизации', '−' + _fmtEventNum(meta.lostCiv), 'lostCiv');
    if (meta.lostMetals) add('Украдено металлов', '−' + _fmtEventNum(meta.lostMetals), 'lostMetals');
    if (meta.systemsDamaged) add('Повреждено систем', _fmtEventNum(meta.systemsDamaged), 'systemsDamaged');
    if (meta.planetsDisabled) add('Планет в простое', _fmtEventNum(meta.planetsDisabled), 'planetsDisabled');
    if (meta.shieldProtected) add('Щит', 'покрыл часть отсутствия', 'shieldProtected');
  } else if (ev.type === 'offline_income') {
    if (meta.awaySeconds) add('Отсутствие', _fmtDurationMs(meta.awaySeconds * 1000), 'awaySeconds');
    metaRow('dustEarned'); metaRow('energyEarned'); metaRow('civEarned'); metaRow('metalsEarned');
    metaRow('lostDust'); metaRow('lostEnergy'); metaRow('lostCiv'); metaRow('lostMetals');
  } else if (ev.type === 'invasion_spawn') {
    metaRow('tierKey'); metaRow('ships'); metaRow('systemName'); metaRow('source');
    if (meta.robberyMinutes) add('Фаза ограбления', _fmtEventNum(meta.robberyMinutes) + ' мин', 'robberyMinutes');
    if (meta.destructionMinutes) add('Фаза разрушения', _fmtEventNum(meta.destructionMinutes) + ' мин', 'destructionMinutes');
  } else if (ev.type === 'invasion_repelled' || ev.type === 'invasion_deflect') {
    metaRow('defenseLevel'); metaRow('repelPercent'); metaRow('defensePct');
    metaRow('fleetPct'); metaRow('expeditionPenalty'); metaRow('systemName');
  } else if (ev.type === 'invasion_destroy' || ev.type === 'invasion_robbery') {
    metaRow('count'); metaRow('hours'); metaRow('planetName'); metaRow('reason');
    metaRow('source'); metaRow('lostDust'); metaRow('lostEnergy'); metaRow('lostCiv'); metaRow('lostMetals');
  } else if (ev.type === 'defense_active') {
    metaRow('defenseLevel'); metaRow('hours'); metaRow('repelPercent');
  } else if (ev.type === 'comet_spawn') {
    metaRow('missionType'); metaRow('flightTime'); metaRow('sizePct'); metaRow('failChance');
    metaRow('rewardAmount'); metaRow('distance'); metaRow('source');
  } else if (ev.type === 'comet_arrive' || ev.type === 'comet_lost') {
    metaRow('missionType'); metaRow('rewardAmount'); metaRow('flightTime'); metaRow('source');
  } else if (ev.type === 'prestige_done') {
    metaRow('galaxy'); metaRow('multiplier');
  } else if (ev.type === 'system_formed' || ev.type === 'system_lost') {
    metaRow('starType'); metaRow('systems'); metaRow('systemName');
  } else if (ev.type === 'planet_formed' || ev.type === 'planet_destroyed' ||
             ev.type === 'planet_merge' || ev.type === 'planet_collision') {
    metaRow('planetName'); metaRow('planetType'); metaRow('reason');
  } else if (ev.type === 'prime_found') {
    metaRow('primeName'); metaRow('primeBonus');
  } else if (ev.type.indexOf('random_event') === 0 || ev.type.indexOf('world_event') === 0 ||
             ev.type.indexOf('weekly_event') === 0) {
    metaRow('eventId'); metaRow('description'); metaRow('effects'); metaRow('choice'); metaRow('source');
  }

  // Дополнительные поля из meta, которые не разобрали выше.
  for (const key in meta) {
    if (used.has(key)) continue;
    if (key === 'systemIdx' || key === 'planetSeed') continue;
    if (!META_LABELS[key]) continue;
    if (meta[key] === undefined || meta[key] === null || meta[key] === '' || meta[key] === 0) continue;
    metaRow(key);
    if (rows.length >= 16) break;
  }

  return rows.slice(0, 16);
}

function _renderEventDetails(ev, index) {
  const rows = _buildEventDetails(ev);
  let html = '<div class="event-detail-grid">';
  for (let i = 0; i < rows.length; i++) {
    html += '<div class="event-detail-row">' +
      '<span class="event-detail-label">' + _escEvent(rows[i].label) + '</span>' +
      '<span class="event-detail-value">' + _escEvent(rows[i].value) + '</span>' +
      '</div>';
  }
  html += '</div>';
  const meta = ev.meta || {};
  const canNavigate = (typeof meta.systemIdx === 'number' && isFinite(meta.systemIdx)) ||
    meta.planetSeed !== undefined;
  if (canNavigate) {
    html += '<button class="event-nav-btn" type="button" data-event-idx="' + index + '">' +
      '→ Перейти к событию</button>';
  }
  return html;
}

let _eventPanelOpen = false;

// ─── Контекст события: система и планета ──────────────────────
function _eventSystemName(systemIdx) {
  if (typeof systemIdx !== 'number' || !isFinite(systemIdx)) return 'Родная';
  if (S && systemIdx === S.activeSystemIdx && S.systemName) return S.systemName;
  const sys = (S && Array.isArray(S.otherSystems)) ? S.otherSystems[systemIdx] : null;
  if (sys && sys.name) return sys.name;
  return 'Родная';
}

function _findPlanetTypeBySeed(seed) {
  if (seed === undefined || seed === null) return null;
  const lists = [];
  if (S && Array.isArray(S.planets)) lists.push(S.planets);
  if (S && Array.isArray(S.otherSystems)) {
    for (let i = 0; i < S.otherSystems.length; i++) {
      const sys = S.otherSystems[i];
      if (sys && Array.isArray(sys.planets)) lists.push(sys.planets);
    }
  }
  for (let l = 0; l < lists.length; l++) {
    for (let i = 0; i < lists[l].length; i++) {
      const p = lists[l][i];
      if (p && p.seed === seed && p.type) return p.type;
    }
  }
  return null;
}

// Цвет строки: награды — зелёные, потери — красные.
function _eventDisplayColor(ev) {
  const meta = ev.meta || {};
  if (typeof meta.rewardAmount === 'number') {
    if (meta.rewardAmount > 0) return '#7ee0a8';
    if (meta.rewardAmount < 0) return '#ff5e5e';
  }
  const lossTypes = {
    comet_lost: 1, planet_destroyed: 1, invasion_destroy: 1,
    invasion_robbery: 1, planet_collision: 1, comet_destroy_planet: 1, system_lost: 1,
  };
  if (lossTypes[ev.type]) return '#ff5e5e';
  const rewardTypes = {
    comet_arrive: 1, planet_formed: 1, planet_merge: 1, system_formed: 1,
    prime_found: 1, offline_income: 1, milestone: 1, prestige_done: 1,
    invasion_deflect: 1, invasion_repelled: 1,
  };
  if (rewardTypes[ev.type]) return '#7ee0a8';
  return ev.color || '#b9a8ff';
}

// ─── Добавить событие ──────────────────────────────────────────
function addEvent(type, text, opts) {
  opts = opts || {};
  if (!S.eventLog) S.eventLog = [];
  if (!S.eventLogUnread) S.eventLogUnread = 0;

  const meta = opts.meta ? Object.assign({}, opts.meta) : null;
  let eventText = text;

  // Если известно место — добавляем контекст в текст события.
  if (meta && typeof meta.systemIdx === 'number' && isFinite(meta.systemIdx)) {
    eventText = 'В системе «' + _eventSystemName(meta.systemIdx) + '»: ' + eventText;
  }

  const ev = {
    ts: Date.now(),
    type: type,
    text: eventText,
    icon: EVENT_ICONS[type] || '•',
    color: EVENT_COLORS[type] || '#b9a8ff',
    meta: meta,
  };

  S.eventLog.unshift(ev);
  if (S.eventLog.length > 100) S.eventLog.length = 100;
  S.eventLogUnread = (S.eventLogUnread || 0) + 1;

  // Обновляем UI бейджа
  _updateEventBadge();
  if (_eventPanelOpen) renderEventLog();
}

// ─── Формат времени ────────────────────────────────────────────
function _fmtEventTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return hh + ':' + mm;
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  return dd + '.' + mo + ' ' + hh + ':' + mm;
}

// ─── Бейдж непрочитанных ───────────────────────────────────────
function _updateEventBadge() {
  const badge = document.getElementById('eventBadge');
  if (!badge) return;
  const n = S.eventLogUnread || 0;
  if (n > 0) {
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

// ─── Отрисовка панели ──────────────────────────────────────────
function renderEventLog() {
  const body = document.getElementById('eventLogBody');
  if (!body) return;

  if (!S.eventLog || S.eventLog.length === 0) {
    body.innerHTML = '<div class="event-empty">Пока ничего не произошло...</div>';
    return;
  }

  let html = '';
  for (let i = 0; i < S.eventLog.length; i++) {
    const ev = S.eventLog[i];
    const color = _eventDisplayColor(ev);
    const key = _eventKey(ev);
    const open = _openEventKeys.has(key);
    let planetIcon = '';
    if (ev.meta && ev.meta.planetSeed !== undefined && ev.meta.planetSeed !== null) {
      const ptype = _findPlanetTypeBySeed(ev.meta.planetSeed);
      planetIcon = (ptype && EVENT_PLANET_ICONS[ptype]) ? EVENT_PLANET_ICONS[ptype] : '🪐';
    }
    html += '<div class="event-item' + (open ? ' open' : '') + '" data-event-key="' + _escEvent(key) + '">';
    html += '<div class="event-summary" role="button" tabindex="0" aria-expanded="' + (open ? 'true' : 'false') +
      '" style="border-left-color:' + color + '">';
    html += '<div class="event-icon">' + ev.icon +
      (planetIcon ? '<span class="event-planet-icon">' + planetIcon + '</span>' : '') + '</div>';
    html += '<div class="event-body">';
    html += '<div class="event-text" style="color:' + color + '">' + ev.text + '</div>';
    html += '<div class="event-time">' + _fmtEventTime(ev.ts) + ' · <span class="event-expand-hint">подробнее</span></div>';
    html += '</div>';
    html += '<span class="event-chevron" aria-hidden="true">⌄</span>';
    html += '</div>';
    html += '<div class="event-details">' + _renderEventDetails(ev, i) + '</div>';
    html += '</div>';
  }
  body.innerHTML = html;
  body.innerHTML = html;
}

// ─── Открыть / закрыть ─────────────────────────────────────────
function toggleEventLog() {
  const modal = document.getElementById('eventLogModal');
  if (!modal) return;
  if (_eventPanelOpen) {
    modal.classList.remove('show');
    _eventPanelOpen = false;
  } else {
    modal.classList.add('show');
    _eventPanelOpen = true;
    renderEventLog();
    // Сбрасываем счётчик непрочитанных через 1 сек
    setTimeout(markEventLogRead, 1000);
  }
}

function markEventLogRead() {
  S.eventLogUnread = 0;
  _updateEventBadge();
  saveGame();
}

// ─── Инициализация ─────────────────────────────────────────────
function _toggleEventItem(summary) {
  if (!summary) return;
  const item = summary.parentElement;
  if (!item) return;
  const opened = item.classList.toggle('open');
  summary.setAttribute('aria-expanded', opened ? 'true' : 'false');
  const key = item.getAttribute('data-event-key');
  if (key) {
    if (opened) _openEventKeys.add(key);
    else _openEventKeys.delete(key);
  }
}

function initEventLog() {
  if (!S.eventLog) S.eventLog = [];
  if (typeof S.eventLogUnread !== 'number') S.eventLogUnread = 0;

  const btn = document.getElementById('eventBtn');
  if (btn) btn.addEventListener('click', function() {
    if (typeof playSFX === 'function') playSFX('ui_click');
    toggleEventLog();
  });

  const modal = document.getElementById('eventLogModal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) toggleEventLog();
    });
  }

  // Делегирование: клик по краткому событию разворачивает подробный отчёт.
  const logBody = document.getElementById('eventLogBody');
  if (logBody && !logBody.__eventlogBound) {
    logBody.__eventlogBound = true;
    logBody.addEventListener('click', function(e) {
      const nav = e.target && e.target.closest ? e.target.closest('.event-nav-btn') : null;
      if (nav) {
        e.stopPropagation();
        const idx = Number(nav.getAttribute('data-event-idx'));
        if (isFinite(idx)) navigateToEvent(idx);
        return;
      }
      const summary = e.target && e.target.closest ? e.target.closest('.event-summary') : null;
      if (summary) _toggleEventItem(summary);
    });
    logBody.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const summary = e.target && e.target.closest ? e.target.closest('.event-summary') : null;
      if (!summary) return;
      e.preventDefault();
      _toggleEventItem(summary);
    });
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && _eventPanelOpen) toggleEventLog();
  });

  _updateEventBadge();
}

// ─── Хелперы для частых событий ────────────────────────────────
function logPlanetDestroyed(planetName, reason) {
  let type = 'planet_destroyed';
  let text = 'Планета «' + planetName + '» уничтожена';
  if (reason === 'invasion') {
    type = 'invasion_destroy';
    text = 'Планета «' + planetName + '» разорена вторжением';
  } else if (reason === 'comet') {
    type = 'comet_destroy_planet';
    text = 'Комета уничтожила «' + planetName + '»';
  } else if (reason === 'collision') {
    text = 'Столкновение разрушило «' + planetName + '»';
  }
  addEvent(type, text, { meta: { planetName: planetName, reason: reason } });
}

function logPlanetFormed(planetName) {
  addEvent('planet_formed', 'Сформирована планета «' + planetName + '»', { meta: { planetName: planetName } });
}

function logSystemFormed(systemName, starType) {
  addEvent('system_formed', 'Основана система «' + systemName + '» · ' + starType, { meta: { systemName: systemName, starType: starType } });
}

function logPrestige(galaxy, multiplier) {
  addEvent('prestige_done', 'Вспышка сверхновой · Галактика ' + galaxy + ' · ×' + multiplier.toFixed(1), { meta: { galaxy: galaxy, multiplier: multiplier } });
}

function logOfflineIncome(seconds, earned, report) {
  if (seconds < 60) return;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const ts = h > 0 ? h + ' ч ' + m + ' мин' : m + ' мин';
  const meta = { awaySeconds: seconds, dustEarned: earned || 0 };
  if (report) {
    meta.energyEarned = report.energyEarned || 0;
    meta.civEarned = report.civEarned || 0;
    meta.metalsEarned = report.metalsEarned || 0;
    meta.lostDust = report.invasionLostDust || 0;
    meta.lostEnergy = report.invasionDrainE || 0;
    meta.lostCiv = report.invasionDrainC || 0;
    meta.lostMetals = report.invasionLostMetals || 0;
  }
  const text = 'Отсутствовали ' + ts + (earned > 0 ? ' · +' + fmt(earned) + ' пыли' : ' · без дохода пыли');
  addEvent('offline_income', text, { meta: meta });
}
// ─── Навигация к месту события ──────────────────────────────────
window.navigateToEvent = function(idx) {
  if (!S.eventLog || !S.eventLog[idx]) return;
  const ev = S.eventLog[idx];
  const meta = ev.meta || {};

  // Закрываем модалку журнала, если она открыта.
  if (_eventPanelOpen && typeof toggleEventLog === 'function') toggleEventLog();

  const hasSystem = typeof meta.systemIdx === 'number' && isFinite(meta.systemIdx);
  const targetIdx = hasSystem ? meta.systemIdx : S.activeSystemIdx;

  // Переключаемся на нужную систему (для всех типов событий).
  if (hasSystem && targetIdx !== S.activeSystemIdx) {
    if (typeof switchToSystem === 'function') switchToSystem(targetIdx);
  }

  // Планетное событие — в систему, системное вторжение — в галактику.
  const hasPlanet = meta.planetSeed !== undefined && meta.planetSeed !== null;
  if (hasPlanet) {
    S.stage = 'system';
  } else if (ev.type === 'invasion_spawn' || ev.type === 'invasion_repelled' || ev.type === 'invasion_deflect') {
    S.stage = (hasSystem && S.systems > 1) ? 'galaxy' : 'system';
  } else {
    S.stage = 'system';
  }

  // Обновляем камеру и интерфейс
  S.panX = 0; S.panY = 0; S.zoom = 1; S.rotation = 0;
  if (typeof updateUI === 'function') updateUI();
  if (typeof updateSystemSwitcher === 'function') updateSystemSwitcher();
  if (typeof saveGame === 'function') saveGame();
};
// ─── Экспорт ───────────────────────────────────────────────────
window.addEvent            = addEvent;
window.renderEventLog      = renderEventLog;
window.toggleEventLog      = toggleEventLog;
window.markEventLogRead    = markEventLogRead;
window.initEventLog        = initEventLog;
window.logPlanetDestroyed  = logPlanetDestroyed;
window.logPlanetFormed     = logPlanetFormed;
window.logSystemFormed     = logSystemFormed;
window.logPrestige         = logPrestige;
window.logOfflineIncome    = logOfflineIncome;