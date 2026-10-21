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
  invasion_deflect:   '🛡️',
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
};

const EVENT_COLORS = {
  invasion_spawn:    '#ff5e5e',
  invasion_deflect:  '#7ee0a8',
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
};

let _eventPanelOpen = false;

// ─── Добавить событие ──────────────────────────────────────────
function addEvent(type, text, opts) {
  opts = opts || {};
  if (!S.eventLog) S.eventLog = [];
  if (!S.eventLogUnread) S.eventLogUnread = 0;

  const ev = {
    ts: Date.now(),
    type: type,
    text: text,
    icon: EVENT_ICONS[type] || '•',
    color: EVENT_COLORS[type] || '#b9a8ff',
    meta: opts.meta || null,
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
      const clickAttr = ev.meta && typeof ev.meta.systemIdx !== 'undefined' 
      ? ' onclick="navigateToEvent(' + i + ')" style="cursor:pointer"' 
      : '';
    html += '<div class="event-row" style="border-left-color:' + ev.color + '"' + clickAttr + '>';
    html += '<div class="event-icon">' + ev.icon + '</div>';
    html += '<div class="event-body">';
    html += '<div class="event-text" style="color:' + ev.color + '">' + ev.text + '</div>';
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
  if (btn) btn.addEventListener('click', toggleEventLog);

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
  if (!ev.meta || typeof ev.meta.systemIdx === 'undefined') return;

  // Закрываем модалку журнала
  if (typeof toggleEventLog === 'function') toggleEventLog();

  // Переключаемся на нужную систему
  const targetIdx = ev.meta.systemIdx;
  if (targetIdx !== S.activeSystemIdx) {
    if (typeof switchToSystem === 'function') switchToSystem(targetIdx);
  }

  // Если событие системное — уходим в галактику. Если планетное — в систему.
  if (ev.type === 'invasion_spawn' && ev.text.indexOf('систему') !== -1) {
    S.stage = 'galaxy';
  } else {
    S.stage = 'system';
  }

  // Обновляем камеру и интерфейс
  S.panX = 0; S.panY = 0; S.zoom = 1; S.rotation = 0;
  if (typeof updateUI === 'function') updateUI();
  if (typeof updateSystemSwitcher === 'function') updateSystemSwitcher();
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