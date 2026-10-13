// ═══════════════════════════════════════════════════════════════
//  UI.JS — HUD, квесты, тосты, переключатель систем
// ═══════════════════════════════════════════════════════════════

// ─── Формат чисел ───────────────────────────────────────────────
const UNITS = ['', 'К', 'М', 'Б', 'Т', 'Кв', 'Кт', 'Сх', 'Сп', 'Ок'];
function fmt(n) {
  if (n < 1000) return Math.floor(n).toString();
  let i = 0;
  while (n >= 1000 && i < UNITS.length - 1) { n /= 1000; i++; }
  return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + UNITS[i];
}

function fmtTime(sec) {
  if (sec < 0) sec = 0;
  if (sec < 60) return Math.floor(sec) + 'с';
  if (sec < 3600) return Math.floor(sec/60) + ':' +
    String(Math.floor(sec%60)).padStart(2, '0');
  return Math.floor(sec/3600) + 'ч ' + Math.floor((sec%3600)/60) + 'м';
}

// ─── Тосты ──────────────────────────────────────────────────────
function toast(title, sub) {
  const el = document.getElementById('toasts');
  if (!el) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = '<b>' + title + '</b>' + (sub || '');
  el.appendChild(t);
  setTimeout(function() { t.remove(); }, 3500);
}

// ─── Обновление HUD ─────────────────────────────────────────────
function updateUI() {
  const ids = ['dustVal','energyVal','civVal','systemsVal'];
  for (let i = 0; i < ids.length; i++) {
    const el = document.getElementById(ids[i]);
    if (!el) continue;
    if (ids[i] === 'dustVal') el.textContent = fmt(S.dust);
    if (ids[i] === 'energyVal') el.textContent = fmt(S.energy);
    if (ids[i] === 'civVal') el.textContent = fmt(S.civLevel);
    if (ids[i] === 'systemsVal') el.textContent = S.systems;
  }

  const rateEl = document.getElementById('dustRate');
  if (rateEl && typeof dustPerSec === 'function') {
    rateEl.textContent = '+' + fmt(dustPerSec() * 3600) + ' / ч';
  }
  
  const energyRateEl = document.getElementById('energyRate');
  if (energyRateEl && typeof energyPerSec === 'function') {
    energyRateEl.textContent = '+' + fmt(energyPerSec() * 3600) + ' / ч';
  }

  const civRateEl = document.getElementById('civRate');
  if (civRateEl) {
    // Если есть логика расчета прироста цивилизации в час, здесь можно обновить
    // Пока оставим заглушку, так как civ растет через tickCiv
    civRateEl.textContent = '+' + fmt(0) + ' / ч';
  }

  const gasEl = document.getElementById('gasIndicator');
  if (gasEl && typeof gasPercent === 'function') {
    const pct = gasPercent();
    if (pct > 1 && S.starType) {
      gasEl.style.display = 'block';
      gasEl.textContent = '💨 Газ: ' + pct + '%';
      gasEl.style.color = pct > 50 ? '#7ec8e3' :
                          (pct > 20 ? '#ff9500' : '#ff5e5e');
    } else { gasEl.style.display = 'none'; }
  }

  const orbLabel = document.getElementById('orbLabel');
  const orbProgress = document.getElementById('orbProgress');
  const stages = ['cloud','condense','protostar','firstPlanet','system','galaxy'];
  const stageIdx = stages.indexOf(S.stage);
  const roman = ['I','II','III','IV','V','VI'][stageIdx] || 'I';
  if (orbLabel) orbLabel.textContent = roman;

  if (orbProgress) {
    const goal = currentGoal();
    let prog = 0;
    if (goal) prog = Math.min(1, S.dust / goal);
    else if (S.stage === 'system') prog = S.planets.length / 8;
    else prog = 1;
    orbProgress.style.strokeDashoffset = (264 * (1 - prog)).toString();
  }

  const btn = document.getElementById('evolveBtn');
  if (btn) {
    const goal = currentGoal();
    let ready = false;
    if (S.stage === 'system' && S.planets.length >= 8) ready = true;
    if (goal !== null && S.dust >= goal) ready = true;
    if (S.stage === 'galaxy') {
      const sysCost = Math.floor(50e9 * Math.pow(4, S.systems - 1));
      if (S.dust >= sysCost) ready = true;
    }
    if (ready && !S.activeMinigame) btn.classList.add('show');
    else btn.classList.remove('show');
  }
  updateStorageUI();
}
// ─── Хранилище ресурсов (шкала и улучшение) ────────────────────────
function updateStorageUI() {
  const resources = ['dust', 'energy', 'civ'];
  resources.forEach(res => {
    const cell = document.querySelector(`.storage-cell[data-res="${res}"]`);
    if (!cell) return;
    const valEl = cell.querySelector('.storage-val');
    const rateEl = cell.querySelector('.storage-rate');
    const progFill = cell.querySelector('.storage-progress-fill');
    const progText = cell.querySelector('.storage-progress-text');

    let current = 0;
    if (res === 'dust') current = S.dust;
    else if (res === 'energy') current = S.energy;
    else if (res === 'civ') current = S.civLevel;

    if (valEl) valEl.textContent = fmt(current);

    if (rateEl) {
      if (res === 'dust') {
        rateEl.textContent = '+' + fmt(dustPerSec() * 3600) + ' / час';
      } else if (res === 'energy') {
        rateEl.textContent = '+' + fmt(energyPerSec() * 3600) + ' / час';
      } else if (res === 'civ') {
        rateEl.textContent = '+' + fmt(civPerSec() * 3600) + ' / час';
      }
    }

    let cap = 1;
    if (typeof getResourceCap === 'function') {
      cap = getResourceCap(res);
    }

    const pct = Math.min(100, Math.max(0, (current / cap) * 100));
    if (progFill) progFill.style.width = pct + '%';

    const isFull = current >= cap;
    if (isFull) {
      cell.classList.add('full');
    } else {
      cell.classList.remove('full');
    }

    if (progText) {
      progText.textContent = fmt(current) + ' / ' + fmt(cap);
    }
  });
}

// ─── Модальное окно улучшения хранилища ──────────────────────────
function openStorageModal(res) {
  const names = { dust: 'Пыли', energy: 'Энергии', civ: 'Цивилизации' };
  const icons = { dust: '✦', energy: '⚡', civ: '🧬' };
  const resKey = res === 'dust' ? 'dust' : res === 'energy' ? 'energy' : 'civLevel';
  const lvl = S.storageLevels[res] || 1;
  const cost = STORAGE_CFG.getUpgradeCost(res, lvl);

  const card = document.getElementById('modalCard');
  if (!card) return;

  let capInfo = '';
  if (res === 'dust') {
    const curH = STORAGE_CFG.getDustCapHours(lvl);
    const nextH = lvl < 7 ? STORAGE_CFG.getDustCapHours(lvl + 1) : curH;
    capInfo = `Кап хранения: <b>${curH} ч</b> ${lvl < 7 ? '➔ <b>' + nextH + ' ч</b>' : '(МАКС)'}`;
  } else if (res === 'energy') {
    const curM = STORAGE_CFG.getEnergyCapMult(lvl);
    const nextM = lvl < 7 ? STORAGE_CFG.getEnergyCapMult(lvl + 1) : curM;
    capInfo = `Множитель капа: <b>×${curM}</b> ${lvl < 7 ? '➔ <b>×' + nextM + '</b>' : '(МАКС)'}`;
  } else if (res === 'civ') {
    const curM = STORAGE_CFG.getCivCapMult(lvl);
    const nextM = lvl < 7 ? STORAGE_CFG.getCivCapMult(lvl + 1) : curM;
    capInfo = `Множитель капа: <b>×${curM.toFixed(2)}</b> ${lvl < 7 ? '➔ <b>×' + nextM.toFixed(2) + '</b>' : '(МАКС)'}`;
  }

  const isMax = lvl >= STORAGE_CFG.maxLevel;

  card.innerHTML = `
    <div class="modal-title">${icons[res]} Улучшение Хранилища ${names[res]}</div>
    <div class="modal-sub">Уровень ${lvl} из ${STORAGE_CFG.maxLevel}</div>
    <div class="info-box">
      <div class="row-stat">
        <span>Текущий уровень:</span>
        <span>${lvl}</span>
      </div>
      <div class="row-stat">
        <span>Параметры капа:</span>
        <span>${capInfo}</span>
      </div>
      <div class="row-stat">
        <span>Стоимость апгрейда:</span>
        <span>${isMax ? 'МАКСИМУМ' : fmt(cost) + ' ' + names[res]}</span>
      </div>
    </div>
    ${!isMax ? `
      <button class="storage-upgrade-action-btn" onclick="upgradeStorageInstant('${res}')" style="width:100%; padding:12px; background:linear-gradient(135deg, #7b2cbf, #9d4edd); color:white; border:none; border-radius:8px; font-weight:700; cursor:pointer; font-size:15px; margin-top:10px;">
        Улучшить уровень (⚡ ${fmt(cost)})
      </button>
    ` : '<div style="text-align:center; color:#b9a8ff; font-weight:700; margin-top:15px;">Достигнут максимальный уровень!</div>'}
  `;

  document.getElementById('modal').classList.add('show');
}

// ─── Мгновенный апгрейд хранилища за полную стоимость ───────────
function upgradeStorageInstant(res) {
  const lvl = S.storageLevels[res] || 1;
  if (lvl >= STORAGE_CFG.maxLevel) {
    toast('Максимальный уровень', 'Хранилище уже прокачено до предела.');
    return;
  }

  const cost = STORAGE_CFG.getUpgradeCost(res, lvl);
  const resKey = res === 'dust' ? 'dust' : res === 'energy' ? 'energy' : 'civLevel';
  const available = S[resKey] || 0;

  if (available < cost) {
    toast('Недостаточно ресурсов', 'Требуется ' + fmt(cost) + ' ' + namesTitle(res) + ', а у вас ' + fmt(available));
    return;
  }

  // Списываем полную стоимость и повышаем уровень мгновенно
  S[resKey] -= cost;
  S.storageLevels[res] = lvl + 1;
  S.storageProgress[res] = 0; // сбрасываем старый прогресс на всякий случай

  toast('Хранилище улучшено! 🎉', 'Новый уровень ' + namesTitle(res) + ': ' + (lvl + 1));
  saveGame();
  updateUI();
  openStorageModal(res);
}

function namesTitle(res) {
  if (res === 'dust') return 'Пыли';
  if (res === 'energy') return 'Энергии';
  return 'Цивилизации';
}

// ─── Квесты ─────────────────────────────────────────────────────
function getQuests() {
  const list = [];
  const st = S.stage;
  if (st === 'cloud') list.push({ title:'Собери 500 пылинок', cur: S.dustTotal, max: 500 });
  else if (st === 'condense') list.push({ title:'Накопи 25 000 пыли', cur: S.dustTotal, max: 25000 });
  else if (st === 'protostar') list.push({ title:'Накопи 200 000 пыли', cur: S.dust, max: 200000 });
  else if (st === 'firstPlanet') list.push({ title:'Накопи 800 000 пыли', cur: S.dust, max: 800000 });
  else if (st === 'system') {
    list.push({ title:'Сформируй 8 планет', cur: S.planets.length, max: 8 });
    if (S.planets.length < 8)
      list.push({ title:'Следующая планета', cur: S.dust, max: planetCost(S.planets.length) });
  } else if (st === 'galaxy') {
    list.push({ title:'Основай 3 системы', cur: S.systems, max: 3 });
    list.push({ title:'Основай 5 систем → галактика', cur: S.systems, max: 5 });
    list.push({ title:'Основай 10 систем', cur: S.systems, max: 10 });
  }
  return list;
}

function updateQuestPanel() {
  const panel = document.getElementById('questPanel');
  if (!panel || !panel.classList.contains('open')) return;
  const quests = getQuests();
  let html = '';
  for (let i = 0; i < quests.length; i++) {
    const q = quests[i];
    const pct = Math.min(100, Math.floor(q.cur / q.max * 100));
    const done = pct >= 100;
    html += '<div class="quest-item">' +
      '<div class="quest-title' + (done ? ' quest-done' : '') + '">' +
        '<span>' + q.title + '</span>' +
        '<span class="q-progress">' + fmt(q.cur) + ' / ' + fmt(q.max) + '</span>' +
      '</div><div class="quest-bar"><div style="width:' + pct + '%"></div></div></div>';
  }
  panel.innerHTML = html;
}

// ─── Переключатель систем ───────────────────────────────────────
function updateSystemSwitcher() {
  const el = document.getElementById('systemSwitcher');
  if (!el) return;
  if (S.totalSystemsCreated < 2) { el.style.display = 'none'; return; }
  el.style.display = 'flex';

  const list = [];
  if (S.activeSystemIdx === 0) list.push({ idx:0, name: S.systemName });
  else if (S.otherSystems[0]) list.push({ idx:0, name: S.otherSystems[0].name });
  else list.push({ idx:0, name:'Родная' });
  for (let i = 1; i < S.otherSystems.length; i++) {
    if (S.otherSystems[i]) list.push({ idx:i, name: S.otherSystems[i].name });
  }

  let key = '';
  for (let i = 0; i < list.length; i++) key += list[i].idx + ':' + list[i].name + '|';
  if (el.dataset.key === key) return;
  el.dataset.key = key;

  el.innerHTML = '';
  for (let i = 0; i < list.length; i++) {
    const sys = list[i];
    const btn = document.createElement('button');
    btn.className = 'sys-btn' + (S.activeSystemIdx === sys.idx ? ' active' : '');
    btn.textContent = sys.name;
    (function(idx) {
      btn.onclick = function() { switchToSystem(idx); };
    })(sys.idx);
    el.appendChild(btn);
  }

  const renameBtn = document.createElement('button');
  renameBtn.className = 'sys-btn rename';
  renameBtn.textContent = '✎';
  renameBtn.onclick = function() {
    const newName = prompt('Новое имя системы:', S.systemName);
    if (newName && newName.trim()) {
      S.systemName = newName.trim().slice(0, 16);
      if (S.activeSystemIdx > 0 && S.otherSystems[S.activeSystemIdx]) {
        S.otherSystems[S.activeSystemIdx].name = S.systemName;
      }
      document.getElementById('systemSwitcher').dataset.key = '';
    }
  };
  el.appendChild(renameBtn);
}

// ─── Инициализация UI ───────────────────────────────────────────
function initUI() {
  const questArrowEl = document.getElementById('questArrow');
  if (questArrowEl) {
    questArrowEl.addEventListener('click', function() {
      document.getElementById('questPanel').classList.toggle('open');
      this.classList.toggle('open');
      updateQuestPanel();
    });
  }

  const evolveBtnEl = document.getElementById('evolveBtn');
  if (evolveBtnEl) {
    evolveBtnEl.addEventListener('click', function() {
      if (typeof openEvolution === 'function') openEvolution();
    });
  }

  const turboEl = document.getElementById('turbo');
  if (turboEl) {
    turboEl.addEventListener('click', function() {
      const goal = currentGoal();
      const amount = goal ? Math.max(10000, goal * 3) : 1e12;
      S.dust += amount; S.dustTotal += amount;
      toast('🚀 Turbo', '+' + fmt(amount));
    });
  }

  const resetEl = document.getElementById('resetBtn');
  if (resetEl) {
    resetEl.addEventListener('click', function() {
      if (confirm('Сбросить прогресс?')) {
        const ids = ['dustVal','energyVal','civVal','systemsVal'];
        for (let i = 0; i < ids.length; i++) {
          const e = document.getElementById(ids[i]);
          if (e) e.textContent = '0';
        }
        resetGame();
      }
    });
  }
  // Add event listeners for storage upgrade buttons
  document.querySelectorAll('.storage-upgrade-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const res = btn.dataset.res;
      openStorageModal(res);
    });
  });

  // Initial update of storage UI
  updateStorageUI();

  setInterval(updateSystemSwitcher, 2000);

  setInterval(updateSystemSwitcher, 2000);
}
// ─── Закрытие модалки кликом снаружи или крестиком ─────────────
// Решает проблему «мёртвого» окна, когда кнопка disabled.
(function setupModalClose() {
  function attach() {
    const modal = document.getElementById('modal');
    if (!modal) { setTimeout(attach, 200); return; }
    if (modal.dataset.closeAttached === '1') return;
    modal.dataset.closeAttached = '1';

    // Клик по затемнённому фону (не по карточке) — закрывает
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        // Меняем флаг через evolution.js
        if (typeof closeEvolutionModal === 'function') closeEvolutionModal();
        else modal.classList.remove('show');
      }
    });

    // Esc тоже закрывает
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && modal.classList.contains('show')) {
        if (typeof closeEvolutionModal === 'function') closeEvolutionModal();
        else modal.classList.remove('show');
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else { attach(); }
})();
window.fmt = fmt;
window.fmtTime = fmtTime;
window.toast = toast;
window.updateUI = updateUI;
window.updateQuestPanel = updateQuestPanel;
window.updateSystemSwitcher = updateSystemSwitcher;
window.initUI = initUI;
window.openStorageModal = openStorageModal;
window.upgradeStorageInstant = upgradeStorageInstant;

// ─── Вспышка Сверхновой (визуальный эффект) ─────────────────────
function triggerSupernovaFlash() {
  // Создаем белый flash эффект
  const flash = document.createElement('div');
  flash.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: white;
    opacity: 0;
    pointer-events: none;
    z-index: 9999;
  `;
  document.body.appendChild(flash);
  
  // Анимация вспышки
  flash.animate([
    { opacity: 0 },
    { opacity: 1 },
    { opacity: 0 }
  ], {
    duration: 500,
    easing: 'ease-out'
  }).onfinish = function() {
    flash.remove();
  };
}

window.triggerSupernovaFlash = triggerSupernovaFlash;
