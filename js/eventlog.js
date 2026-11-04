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
    const clickable = ev.meta && typeof ev.meta.systemIdx !== 'undefined';
    const clickAttr = clickable ? ' onclick="navigateToEvent(' + i + ')"' : '';
    let planetIcon = '';
    if (ev.meta && ev.meta.planetSeed !== undefined && ev.meta.planetSeed !== null) {
      const ptype = _findPlanetTypeBySeed(ev.meta.planetSeed);
      planetIcon = (ptype && EVENT_PLANET_ICONS[ptype]) ? EVENT_PLANET_ICONS[ptype] : '🪐';
    }
    html += '<div class="event-row" style="border-left-color:' + color +
      (clickable ? ';cursor:pointer' : '') + '"' + clickAttr + '>';
    html += '<div class="event-icon">' + ev.icon +
      (planetIcon ? '<span class="event-planet-icon">' + planetIcon + '</span>' : '') + '</div>';
    html += '<div class="event-body">';
    html += '<div class="event-text" style="color:' + color + '">' + ev.text + '</div>';
    html += '<div class="event-time">' + _fmtEventTime(ev.ts) + '</div>';
    html += '</div></div>';
  }
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
  addEvent(type, text);
}

function logPlanetFormed(planetName) {
  addEvent('planet_formed', 'Сформирована планета «' + planetName + '»');
}

function logSystemFormed(systemName, starType) {
  addEvent('system_formed', 'Основана система «' + systemName + '» · ' + starType);
}

function logPrestige(galaxy, multiplier) {
  addEvent('prestige_done', 'Вспышка сверхновой · Галактика ' + galaxy + ' · ×' + multiplier.toFixed(1));
}

function logOfflineIncome(seconds, earned) {
  if (seconds < 60) return;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const ts = h > 0 ? h + ' ч ' + m + ' мин' : m + ' мин';
  addEvent('offline_income', 'Отсутствовали ' + ts + ' · +' + fmt(earned) + ' пыли');
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