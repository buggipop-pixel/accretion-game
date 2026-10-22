// ═══════════════════════════════════════════════════════════════
//  UI.JS — HUD, квесты, тосты, переключатель систем, ночной режим
// ═══════════════════════════════════════════════════════════════

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
  if (sec < 3600) return Math.floor(sec/60) + ':' + String(Math.floor(sec%60)).padStart(2, '0');
  return Math.floor(sec/3600) + 'ч ' + Math.floor((sec%3600)/60) + 'м';
}

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
  if (rateEl) {
    let rateText;
    if (S.stage === 'cloud' || S.stage === 'condense' || S.stage === 'protostar') {
      const r = (typeof PART !== 'undefined' && PART.absorbRate) ? PART.absorbRate : 0;
      rateText = '+' + r.toFixed(1) + ' / сек';
    } else {
      rateText = '+' + fmt(dustPerSec() * 3600) + ' / час';
    }
    rateEl.textContent = rateText;
  }
  
  const energyRateEl = document.getElementById('energyRate');
  if (energyRateEl && typeof energyPerSec === 'function') {
    energyRateEl.textContent = '+' + fmt(energyPerSec() * 3600) + ' / ч';
  }

  const civRateEl = document.getElementById('civRate');
  if (civRateEl) {
    civRateEl.textContent = '+' + fmt(0) + ' / ч';
  }

  const gasEl = document.getElementById('gasIndicator');
  if (gasEl && typeof gasPercent === 'function') {
    const pct = gasPercent();
    if (pct > 1 && S.starType) {
      gasEl.style.display = 'block';
      gasEl.textContent = '💨 Газ: ' + pct + '%';
      gasEl.style.color = pct > 50 ? '#7ec8e3' : (pct > 20 ? '#ff9500' : '#ff5e5e');
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
    if (S.stage === 'galaxy' || S.prestigeLevel > 0) ready = false;
    else if (S.planets.length >= 8) ready = false;
    else if (goal !== null && S.dust >= goal) ready = true;

    if (ready && !S.activeMinigame) btn.classList.add('show');
    else btn.classList.remove('show');
  }

  const backBtn = document.getElementById('backToGalaxyBtn');
  if (backBtn) {
    if (S.stage === 'system' && S.prestigeLevel > 0) backBtn.style.display = 'block';
    else backBtn.style.display = 'none';
  }

  const soundToggleBtn = document.getElementById('soundToggleBtn');
  if (soundToggleBtn) {
    soundToggleBtn.textContent = S.settings.sound ? 'Вкл' : 'Выкл';
    soundToggleBtn.classList.toggle('active', S.settings.sound);
  }
  
  updateStorageUI();
  
  const app = document.getElementById('app');
  if (app && S.settings) {
    app.style.filter = `brightness(${S.settings.brightness})`;
  }
}

// ─── Хранилище ресурсов ───────────────────────────────────────────
function updateStorageUI() {
  const resources = ['dust', 'energy', 'civ', 'metals'];
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
    else if (res === 'metals') current = S.metalAmount || 0;

    if (valEl) valEl.textContent = fmt(current);

    if (rateEl) {
      if (res === 'dust') {
        if (S.stage === 'cloud' || S.stage === 'condense' || S.stage === 'protostar') {
          const r = (typeof PART !== 'undefined' && PART.absorbRate) ? PART.absorbRate : 0;
          rateEl.textContent = '+' + r.toFixed(1) + ' / сек';
        } else {
          rateEl.textContent = '+' + fmt(dustPerSec() * 3600) + ' / час';
        }
      } else if (res === 'energy') {
        rateEl.textContent = '+' + fmt(energyPerSec() * 3600) + ' / час';
      } else if (res === 'civ') {
        rateEl.textContent = '+' + fmt(civPerSec() * 3600) + ' / час';
      } else if (res === 'metals') {
        rateEl.textContent = '+' + fmt(metalsPerSec()) + ' / сек';
      }
    }

    if (!progFill) return;

    let cap = 1;
    if (typeof getResourceCap === 'function') {
      cap = getResourceCap(res);
    }

    const pct = Math.min(100, Math.max(0, (current / cap) * 100));
    if (progFill) progFill.style.width = pct + '%';

    const isFull = current >= cap;
    if (isFull) cell.classList.add('full');
    else cell.classList.remove('full');

    if (progText) progText.textContent = fmt(current) + ' / ' + fmt(cap);

    const btn = cell.querySelector('.storage-upgrade-btn');
    if (btn) {
      const lvl = S.storageLevels[res] || 1;
      const cost = STORAGE_CFG.getUpgradeCost(res, lvl);
      if (lvl >= STORAGE_CFG.maxLevel) {
        btn.textContent = 'МАКС';
        btn.disabled = true;
      } else {
        btn.disabled = false;
        const poured = S.storageProgress[res] || 0;
        btn.textContent = poured > 0
          ? 'Улучшить ' + Math.min(99, Math.floor((poured / cost) * 100)) + '%'
          : 'Улучшить';
      }
    }
  });
}

// ─── Модальное окно улучшения хранилища ──────────────────────────
function openStorageModal(res) {
  const names = { dust: 'Пыли', energy: 'Энергии', civ: 'Цивилизации' };
  const icons = { dust: '✦', energy: '⚡', civ: '🧬' };
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
  const poured = isMax ? 0 : Math.min(S.storageProgress[res] || 0, cost);
  const pct = isMax ? 100 : Math.min(100, (poured / cost) * 100);
  const starsPrice = (CFG && CFG.storageInstantStars) || 50;

  card.innerHTML = `
    <div class="modal-title">${icons[res]} Улучшение Хранилища ${names[res]}</div>
    <div class="modal-sub">Уровень ${lvl} из ${STORAGE_CFG.maxLevel}</div>
    <div class="info-box">
      <div class="row-stat">
        <span>Параметры капа:</span>
        <span>${capInfo}</span>
      </div>
      <div class="row-stat">
        <span>Стоимость уровня:</span>
        <span>${isMax ? 'МАКСИМУМ' : fmt(cost) + ' ✦ пыли'}</span>
      </div>
      ${!isMax ? `
      <div class="row-stat">
        <span>Вложено:</span>
        <span>${fmt(poured)} / ${fmt(cost)}</span>
      </div>
      <div class="storage-progress" style="height:8px; margin-top:6px;">
        <div class="storage-progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="pour-btn-group">
        <button class="pour-btn" onclick="pourStorage('${res}', 0.1)">+10%</button>
        <button class="pour-btn" onclick="pourStorage('${res}', 0.25)">+25%</button>
        <button class="pour-btn" onclick="pourStorage('${res}', 'max')">Вложить всё</button>
      </div>
      <button class="stars-btn" onclick="buyStorageWithStars('${res}')">
        ⭐ Мгновенно за ${starsPrice} Stars
      </button>
      ` : '<div style="text-align:center; color:#b9a8ff; font-weight:700; margin-top:15px;">Достигнут максимальный уровень!</div>'}
  `;
  if (typeof playSFX === 'function') playSFX('ui_open');
  document.getElementById('modal').classList.add('show');
}

function pourStorage(res, part) {
  const lvl = S.storageLevels[res] || 1;
  if (lvl >= STORAGE_CFG.maxLevel) {
    toast('Максимальный уровень', 'Хранилище уже прокачано до предела.');
    return;
  }

  const cost = STORAGE_CFG.getUpgradeCost(res, lvl);
  const poured = S.storageProgress[res] || 0;
  const remaining = cost - poured;

  const want = (part === 'max') ? remaining : Math.floor(cost * part);
  const amount = Math.floor(Math.min(want, remaining, S.dust));

  if (amount <= 0) {
    if (typeof playSFX === 'function') playSFX('ui_error');
    toast('Недостаточно пыли', 'Осталось вложить ' + fmt(remaining) + ' ✦, а у вас ' + fmt(S.dust));
    return;
  }

  S.dust -= amount;
  S.storageProgress[res] = poured + amount;

  if (S.storageProgress[res] >= cost) {
    S.storageLevels[res] = lvl + 1;
    S.storageProgress[res] = 0;
    toast('Хранилище улучшено! 🎉', namesTitle(res) + ': уровень ' + S.storageLevels[res]);
    if (typeof playSFX === 'function') playSFX('ui_levelup');
  }

  saveGame();
  updateUI();
  openStorageModal(res);
}

function buyStorageWithStars(res) {
  const lvl = S.storageLevels[res] || 1;
  if (lvl >= STORAGE_CFG.maxLevel) {
    toast('Максимальный уровень', 'Хранилище уже прокачано до предела.');
    return;
  }
  const starsPrice = (CFG && CFG.storageInstantStars) || 50;
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg && typeof tg.openInvoice === 'function') {
    toast('⭐ Оплата', 'Инвойс на ' + starsPrice + ' Stars — заглушка.');
  } else {
    toast('⭐ Telegram Stars', starsPrice + ' Stars за мгновенный апгрейд. Оплата откроется внутри Telegram.');
  }
}

function namesTitle(res) {
  if (res === 'dust') return 'Пыли';
  if (res === 'energy') return 'Энергии';
  return 'Цивилизации';
}

// ─── Квесты ─────────────────────────────────────────────────────
function getQuests() {
  const list = [];
  const st = (S.prestigeLevel > 0 && S.stage === 'system') ? 'galaxy' : S.stage;

  if (st === 'cloud' && STAGES.cloud.goal) {
    list.push({ title: 'Собери ' + fmt(STAGES.cloud.goal) + ' пылинок', cur: S.dustTotal, max: STAGES.cloud.goal });
  }
  else if (st === 'condense' && STAGES.condense.goal) {
    list.push({ title: 'Накопи ' + fmt(STAGES.condense.goal) + ' пыли', cur: S.dustTotal, max: STAGES.condense.goal });
  }
  else if (st === 'protostar') {
    const left = (typeof getProtostarTimeLeft === 'function') ? getProtostarTimeLeft() : 0;
    const b = (CFG.activeBoost && CFG.activeBoost.protostar) || {};
    const total = b.duration || 30;
    const passed = Math.max(0, total - left);
    list.push({ title: '🔥 Разогрев · ' + left.toFixed(1) + 'с', cur: passed, max: total });
  }
  else if (st === 'firstPlanet') {
    const cost = planetCost(0);
    list.push({ title: 'Собери первую планету · ' + fmt(cost) + ' ✦', cur: S.dust, max: cost });
  }
     else if (st === 'system') {
    if (S.systems === 1) {
      const built = S.planets.filter(p => p && !p.forming).length;
      if (built < 8) {
        list.push({ title: 'Собери 8 планет', cur: built, max: 8 });
        const nextCost = planetCost(built);
        list.push({ title: 'Следующая планета · ' + fmt(nextCost) + ' ✦', cur: S.dust, max: nextCost });
      } else {
        list.push({ title: 'Система готова · расширяйся', cur: 1, max: 1 });
      }
    } else {
      const shopCost = (typeof systemShopCosts === 'function') ? systemShopCosts().dust : systemCost(Math.max(0, S.systems - 1));
      list.push({ title: 'До Галактики (5 систем)', cur: S.systems, max: 5 });
      list.push({ title: 'Следующая система · ' + fmt(shopCost) + ' ✦', cur: S.dust, max: shopCost });
    }
  }
  else if (st === 'galaxy') {
    const systems = S.systems;
    const nextCost = systemCost(Math.max(0, systems - 1));
    if (systems < 2) {
      list.push({ title: 'Основай 2-ю систему · ' + fmt(nextCost) + ' ✦', cur: S.dust, max: nextCost });
    } else {
      const avail = (typeof checkPrestigeAvailability === 'function') ? checkPrestigeAvailability() : 0;
      if (avail > 0) {
        list.push({ title: '💥 Престиж доступен!', cur: 1, max: 1 });
      } else {
        const reqs = (typeof prestigeRequirements === 'function') ? prestigeRequirements() : [];
        const nextReq = reqs[S.prestigeLevel || 0];
        if (nextReq) list.push({ title: '💥 До престижа', cur: systems, max: nextReq });
      }
      list.push({ title: 'Следующая система · ' + fmt(nextCost) + ' ✦', cur: S.dust, max: nextCost });
    }
  }
  return list;
}

// ─── Переключатель систем ───────────────────────────────────────
function updateSystemSwitcher() {
  const el = document.getElementById('systemSwitcher');
  if (!el) return;
  if (S.prestigeLevel > 0) { el.style.display = 'none'; return; }
  if (S.stage === 'galaxy') { el.style.display = 'none'; return; }
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
    (function(idx) { btn.onclick = function() { switchToSystem(idx); }; })(sys.idx);
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
  const questArrowEl = document.getElementById('phaseOrb');
  if (questArrowEl) {
    questArrowEl.addEventListener('click', function() {
      if (typeof playSFX === 'function') playSFX('ui_click');
      document.getElementById('questsPanel').classList.toggle('open');
      this.classList.toggle('open');
      updateQuestPanel();
    });
  }

  const evolveBtnEl = document.getElementById('evolveBtn');
  if (evolveBtnEl) {
    evolveBtnEl.addEventListener('click', function() {
      if (typeof playSFX === 'function') playSFX('ui_click');
      if (S.stage === 'galaxy') return;
      if (typeof openEvolution === 'function') openEvolution();
    });
  }

  const backBtn = document.getElementById('backToGalaxyBtn');
  if (backBtn) {
    backBtn.onclick = function() {
      if (typeof playSFX === 'function') playSFX('ui_click');
      S.stage = 'galaxy';
      S.panX = 0; S.panY = 0; S.zoom = 1; S.rotation = 0;
      updateUI();
      updateSystemSwitcher();
      if (typeof checkEvolution === 'function') checkEvolution();
    };
  }

  const resetEl = document.getElementById('resetBtn');
  if (resetEl) {
    resetEl.addEventListener('click', function() {
      if (confirm('Сбросить прогресс?')) resetGame();
    });
  }

  document.querySelectorAll('.storage-upgrade-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (typeof playSFX === 'function') playSFX('ui_click');
      openStorageModal(btn.dataset.res);
    });
  });

  updateStorageUI();
  setInterval(updateSystemSwitcher, 2000);

  const achBtn = document.getElementById('achBtn');
  if (achBtn) {
    achBtn.addEventListener('click', () => {
      if (typeof playSFX === 'function') playSFX('ui_click');
      if (typeof openAchievements === 'function') openAchievements();
    });
  }

  // Настройки
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const brightnessSlider = document.getElementById('brightnessSlider');
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const settingsResetBtn = document.getElementById('settingsResetBtn');

  if (settingsBtn && settingsModal) {
    settingsBtn.addEventListener('click', () => {
      if (typeof playSFX === 'function') playSFX('ui_click');
      if (brightnessSlider) brightnessSlider.value = S.settings.brightness;
      if (soundToggleBtn) {
        soundToggleBtn.textContent = S.settings.sound ? 'Вкл' : 'Выкл';
        soundToggleBtn.classList.toggle('active', S.settings.sound);
      }
      settingsModal.classList.add('show');
    });
  }

  if (brightnessSlider) {
    brightnessSlider.addEventListener('input', (e) => {
      S.settings.brightness = parseFloat(e.target.value);
      const app = document.getElementById('app');
      if (app) app.style.filter = `brightness(${S.settings.brightness})`;
    });
  }

  if (soundToggleBtn) {
    soundToggleBtn.addEventListener('click', () => {
      if (typeof playSFX === 'function') playSFX('ui_click');
      const isOn = (typeof toggleSound === 'function') ? toggleSound() : !S.settings.sound;
      soundToggleBtn.textContent = isOn ? 'Вкл' : 'Выкл';
      soundToggleBtn.classList.toggle('active', isOn);
    });
  }

  if (settingsResetBtn) {
    settingsResetBtn.addEventListener('click', () => {
      if (confirm('Вы уверены? Весь прогресс будет полностью удален.')) resetGame();
    });
  }
}

// ─── Закрытие модалки кликом снаружи ────────────────────────────
(function setupModalClose() {
  function attach() {
    const modal = document.getElementById('modal');
    if (!modal) { setTimeout(attach, 200); return; }
    if (modal.dataset.closeAttached === '1') return;
    modal.dataset.closeAttached = '1';
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        if (typeof closeEvolutionModal === 'function') closeEvolutionModal();
        else modal.classList.remove('show');
      }
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && modal.classList.contains('show')) {
        if (typeof closeEvolutionModal === 'function') closeEvolutionModal();
        else modal.classList.remove('show');
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();

// ─── Квесты (обновление без перерисовки) ────────────────────────
let _lastQuestKey = '';
function updateQuestPanel() {
  const panel = document.getElementById('questsPanel');
  if (!panel || !panel.classList.contains('open')) return;
  const quests = getQuests();

  let key = '';
  for (let i = 0; i < quests.length; i++) key += quests[i].title + '|';

  if (key !== _lastQuestKey) {
    _lastQuestKey = key;
    let html = '<div class="quests-title">КВЕСТЫ</div>';
    for (let i = 0; i < quests.length; i++) {
      const q = quests[i];
      let pct = 0;
      if (q.max > 0) pct = Math.min(100, Math.floor(q.cur / q.max * 100));
      if (pct < 0 || !isFinite(pct)) pct = 0;
      html += '<div class="quest-item">' +
        '<div class="quest-title' + (pct >= 100 ? ' quest-done' : '') + '">' +
          '<span>' + q.title + '</span>' +
          '<span class="q-progress">' + fmt(q.cur) + ' / ' + fmt(q.max) + '</span>' +
        '</div>' +
        '<div class="quest-bar"><div style="width:' + pct + '%"></div></div>' +
      '</div>';
    }
    panel.innerHTML = html;
  } else {
    const items = panel.querySelectorAll('.quest-item');
    for (let i = 0; i < quests.length && i < items.length; i++) {
      const q = quests[i];
      let pct = 0;
      if (q.max > 0) pct = Math.min(100, Math.floor(q.cur / q.max * 100));
      if (pct < 0 || !isFinite(pct)) pct = 0;

      const bar = items[i].querySelector('.quest-bar > div');
      if (bar) bar.style.width = pct + '%';

      const prog = items[i].querySelector('.q-progress');
      if (prog) prog.textContent = fmt(q.cur) + ' / ' + fmt(q.max);

      const titleRow = items[i].querySelector('.quest-title');
      if (titleRow) {
        if (pct >= 100) titleRow.classList.add('quest-done');
        else titleRow.classList.remove('quest-done');
      }
    }
  }
}

// ─── Вспышка Сверхновой ─────────────────────────────────────────
function triggerSupernovaFlash() {
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:white;opacity:0;pointer-events:none;z-index:9999;';
  document.body.appendChild(flash);
  flash.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 500, easing: 'ease-out' })
    .onfinish = function() { flash.remove(); };
}

// ═══════════════════════════════════════════════════════════════
//  НОЧНОЙ РЕЖИМ
// ═══════════════════════════════════════════════════════════════
let _tempNightConfig = null;

function openNightMode() {
  const card = document.getElementById('modalCard');
  if (!card) return;
  
  if (!_tempNightConfig) {
    _tempNightConfig = JSON.parse(JSON.stringify(S.nightConfig || { mode: 'balanced', defenseEnabled: true, cometHours: 0, expeditionPercent: 0 }));
  }
  const nc = _tempNightConfig;
  const presets = NIGHT_CFG.presets;
  const curMode = nc.mode || 'balanced';

  const presetsHTML = Object.keys(presets).map(function(mode) {
    const labels = { cautious: '🛡️ Осторожный', balanced: '⚖️ Сбалансированный', aggressive: '🚀 Агрессивный', insane: '☠️ Безумный' };
    const caps = NIGHT_CFG.lossCaps[mode];
    const active = curMode === mode ? 'active' : '';
    return `<button class="pour-btn ${active}" onclick="applyNightPreset('${mode}')" style="flex-direction:column;padding:8px 4px;font-size:10px; ${active ? 'background:rgba(139,127,212,0.5);border-color:#b9a8ff;' : ''}">
      ${labels[mode]}<br><span style="font-size:9px;opacity:0.7;">потери ${Math.round(caps * 100)}%</span>
    </button>`;
  }).join('');

  function calcPreviewChance(tierKey) {
    const tier = INVASION_CFG.tiers[tierKey];
    if (!tier) return 0;
    if (S.shieldUntil && S.shieldUntil > Date.now()) return 1.0;
    
    const capE = Math.max(1, getResourceCap('energy'));
    const capC = Math.max(1, getResourceCap('civ'));
    const thresh = INVASION_CFG.resourceThresholdShare || 0.25;
    const eF = Math.min(1, S.energy / (thresh * capE));
    const cF = Math.min(1, S.civLevel / (thresh * capC));
    const resFactor = Math.min(eF, cF);
    let chance = tier.baseChance * resFactor;
    
    const isDefActive = S.nightDefenseExpiresAt && S.nightDefenseExpiresAt > Date.now();
    const activeLvl = isDefActive ? (S.nightDefenseLevel || 0) : 0;
    let bonus = 0;
    if (activeLvl > 0 && nc.defenseEnabled) {
      bonus = (INVASION_CFG.defenseBonusBase || 6) * Math.pow(activeLvl, INVASION_CFG.defenseBonusExp || 0.8) / 100;
    }
    if (S.activeTrophyEffects) {
      for (let i = 0; i < S.activeTrophyEffects.length; i++) {
        const e = S.activeTrophyEffects[i];
        if (e.type === 'defense_level' && e.expiresAt > Date.now() && nc.defenseEnabled) {
          const tmp = (INVASION_CFG.defenseBonusBase || 6) * Math.pow(e.value, INVASION_CFG.defenseBonusExp || 0.8) / 100;
          bonus = Math.max(bonus, tmp);
        }
      }
    }
    chance += bonus;
    
    const pct = nc.expeditionPercent || 0;
    const expPenalty = (pct / 100) * (NIGHT_CFG.expeditionDefensePenaltyMax || 0.30);
    chance -= expPenalty;
    
    return Math.max(0, Math.min(tier.chanceCap, chance));
  }

  const isDefActive = S.nightDefenseExpiresAt && S.nightDefenseExpiresAt > Date.now();
  const activeLvl = isDefActive ? (S.nightDefenseLevel || 0) : 0;
  
  function getDefBonus() {
    if (!nc.defenseEnabled) return 0;
    const lvl = isDefActive ? (S.nightDefenseLevel || 0) : 0;
    let b = 0;
    if (lvl > 0) b = (INVASION_CFG.defenseBonusBase || 6) * Math.pow(lvl, INVASION_CFG.defenseBonusExp || 0.8);
    if (S.activeTrophyEffects) {
      for (let i = 0; i < S.activeTrophyEffects.length; i++) {
        const e = S.activeTrophyEffects[i];
        if (e.type === 'defense_level' && e.expiresAt > Date.now()) {
          const tmp = (INVASION_CFG.defenseBonusBase || 6) * Math.pow(e.value, INVASION_CFG.defenseBonusExp || 0.8);
          b = Math.max(b, tmp);
        }
      }
    }
    return b;
  }
  
  const rawBonus = getDefBonus();
  const expPenalty = (nc.expeditionPercent / 100) * (NIGHT_CFG.expeditionDefensePenaltyMax || 0.30) * 100;
  
  const scoutChance = calcPreviewChance('scout') * 100;
  const raidChance = calcPreviewChance('raid') * 100;
  const siegeChance = calcPreviewChance('siege') * 100;

  const lossCap = NIGHT_CFG.lossCaps[curMode] || 0.25;
  const objCount = S.stage === 'galaxy' ? S.systems : S.planets.length;
  const maxLoss = Math.floor(objCount * lossCap);

  const defenseButtons = [1, 2, 3, 4, 5].map(lvl => {
    const cost = INVASION_CFG.defenseCost[lvl];
    const bonus = (INVASION_CFG.defenseBonusBase * Math.pow(lvl, INVASION_CFG.defenseBonusExp)).toFixed(1);
    const isCurrent = isDefActive && activeLvl === lvl;
    return `<button class="pour-btn" style="flex-direction:column;padding:6px 2px;font-size:9px; line-height:1.2; ${isCurrent ? 'background:rgba(46,170,119,0.4);border-color:#2eaa77;' : ''}"
      onclick="activateNightDefense(${lvl})" ${ (S.metalAmount || 0) >= cost ? '' : 'disabled' }>
      Ур.${lvl}<br><span style="font-size:8px;">${cost}⚙</span><br>+${bonus}%
    </button>`;
  }).join('');

  const defenseLabel = isDefActive 
    ? `Ур.${activeLvl} · +${rawBonus.toFixed(1)}% (до ${new Date(S.nightDefenseExpiresAt).getHours()}:00)` 
    : 'Выключена';

  card.innerHTML = `
    <div class="modal-title">🌙 Ночной режим</div>
    <div class="modal-sub">Настрой риск и награду на время отсутствия</div>

    <div class="info-box">
      <div class="ach-sec-title">Пресеты</div>
      <div class="pour-btn-group">${presetsHTML}</div>
    </div>

    <div class="info-box">
      <div class="row-stat">
        <span>🛡 Автооборона (на 24ч)</span>
        <span style="color:${isDefActive ? '#7ee0a8' : '#ff8a8a'}">${defenseLabel}</span>
      </div>
      <div class="pour-btn-group" style="flex-wrap:wrap;gap:4px;margin-top:8px;">
        ${defenseButtons}
      </div>
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;margin-top:4px;">
        <span>Металлы: ${fmt(S.metalAmount || 0)} ⚙</span>
        <span>Активация съедает металл</span>
      </div>
      <div class="pour-btn-group" style="margin-top:4px;">
        <button class="pour-btn" onclick="toggleNightDefense()" style="background:${nc.defenseEnabled ? 'rgba(46,170,119,0.4)' : 'rgba(255,94,94,0.2)'};border-color:${nc.defenseEnabled ? '#2eaa77' : 'rgba(255,94,94,0.5)'};">
          ${nc.defenseEnabled ? '✓ ВКЛ' : '✕ ВЫКЛ'}
        </button>
      </div>
    </div>

    <div class="info-box">
      <div class="row-stat">
        <span>☄️ Комета на ночь</span>
        <span>${nc.cometHours > 0 ? nc.cometHours + ' ч' : 'ВЫКЛ'}</span>
      </div>
      <input type="range" min="0" max="8" step="1" value="${nc.cometHours || 0}"
        oninput="setNightComet(this.value)" style="width:100%;accent-color:#3d6dd4;">
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;">
        <span>Стоимость: ~${Math.round((nc.cometHours || 0) * 150)} ⚙ эскорт</span>
        <span>Без штрафа к обороне</span>
      </div>
    </div>

    <div class="info-box">
      <div class="row-stat">
        <span>🚀 Экспедиция</span>
        <span>${nc.expeditionPercent || 0}% ресурсов</span>
      </div>
      <input type="range" min="0" max="100" step="10" value="${nc.expeditionPercent || 0}"
        oninput="setNightExpedition(this.value)" style="width:100%;accent-color:#2eaa77;">
      <div class="row-stat" style="font-size:10px;color:#ffb347;">
        <span>Штраф к обороне: −${expPenalty.toFixed(1)}%</span>
        <span>Списывает ⚡, ⚙ и 🧬</span>
      </div>
    </div>

    <div class="info-box">
      <div class="ach-sec-title">Прогноз защиты</div>
      <div class="row-stat" style="font-size:10px;color:#8b7fd4;margin-top:4px;"><span>Офлайн-атаки:</span><span>только при отсутствии >1 часа</span></div>
      <div class="row-stat"><span>Разведка:</span><span style="color:${scoutChance > 60 ? '#7ee0a8' : scoutChance > 30 ? '#ffb347' : '#ff5e5e'}">${Math.round(scoutChance)}%</span></div>
      <div class="row-stat"><span>Рейд:</span><span style="color:${raidChance > 60 ? '#7ee0a8' : raidChance > 30 ? '#ffb347' : '#ff5e5e'}">${Math.round(raidChance)}%</span></div>
      <div class="row-stat"><span>Осада:</span><span style="color:${siegeChance > 60 ? '#7ee0a8' : siegeChance > 30 ? '#ffb347' : '#ff5e5e'}">${Math.round(siegeChance)}%</span></div>
      <div class="row-stat"><span>Макс. потерь:</span><span style="color:#ff5e5e">${maxLoss} ${S.stage === 'galaxy' ? 'систем' : 'планет'}</span></div>
    </div>

    <div class="pour-btn-group" style="margin-top:10px;">
      <button class="pour-btn" style="background:rgba(46,170,119,0.3);border-color:#2eaa77;"
        onclick="saveNightConfig()">
        ✓ Готово
      </button>
      <button class="pour-btn" style="background:rgba(255,94,94,0.2);border-color:rgba(255,94,94,0.5);color:#ff8a8a;"
        onclick="cancelNightConfig()">
        ✕ Отмена
      </button>
    </div>
  `;
  document.getElementById('modal').classList.add('show');
}

function saveNightConfig() {
  if (_tempNightConfig) {
    const oldComet = S.nightConfig ? S.nightConfig.cometHours : 0;
    const oldExp = S.nightConfig ? S.nightConfig.expeditionPercent : 0;
    
    // Проверка и списание ресурсов
    let mCostComet = _tempNightConfig.cometHours * 100;
    let dCostComet = Math.floor(Math.max(500000, dustPerSec() * 600));
    let eCostExp = Math.floor(S.energy * (_tempNightConfig.expeditionPercent / 100));
    let mCostExp = Math.floor((S.metalAmount || 0) * (_tempNightConfig.expeditionPercent / 100));
    let cCostExp = Math.floor(S.civLevel * (_tempNightConfig.expeditionPercent / 100));

    if (_tempNightConfig.cometHours > 0 && (S.metalAmount < mCostComet || S.dust < dCostComet)) {
      toast('Ошибка', 'Не хватает на комету');
      _tempNightConfig.cometHours = 0;
      mCostComet = 0; dCostComet = 0;
    }
    if (_tempNightConfig.expeditionPercent > 0 && (eCostExp <= 0 || mCostExp <= 0 || cCostExp <= 0)) {
      toast('Ошибка', 'Не хватает на экспедицию');
      _tempNightConfig.expeditionPercent = 0;
      eCostExp = 0; mCostExp = 0; cCostExp = 0;
    }

    // Списываем
    if (mCostComet > 0) { S.metalAmount -= mCostComet; S.dust -= dCostComet; }
    if (eCostExp > 0) { S.energy -= eCostExp; S.metalAmount -= mCostExp; S.civLevel -= cCostExp; }

    S.nightConfig = JSON.parse(JSON.stringify(_tempNightConfig));
    _tempNightConfig = null;
    
    saveGame();
    document.getElementById('modal').classList.remove('show');
    
    let totalCostText = '';
    if (mCostComet > 0) totalCostText += `Комета: ${mCostComet}⚙ ${fmt(dCostComet)}✦. `;
    if (eCostExp > 0) totalCostText += `Экспедиция: ${eCostExp}⚡ ${mCostExp}⚙ ${cCostExp}🧬. `;
    
    if (totalCostText) {
      toast('🌙 Ночной режим активирован', 'Списано: ' + totalCostText);
    } else {
      toast('🌙 Настройки сохранены', 'Ресурсы на миссии не списаны');
    }
  }
}

function cancelNightConfig() {
  _tempNightConfig = null;
  document.getElementById('modal').classList.remove('show');
}

function applyNightPreset(mode) {
  if (!NIGHT_CFG.presets[mode] || !_tempNightConfig) return;
  const p = NIGHT_CFG.presets[mode];
  _tempNightConfig.mode = mode;
  _tempNightConfig.defenseEnabled = p.defense > 0;
  _tempNightConfig.cometHours = p.cometHours;
  _tempNightConfig.expeditionPercent = p.expPercent;
  openNightMode();
}

function toggleNightDefense() {
  if (!_tempNightConfig) return;
  _tempNightConfig.defenseEnabled = !_tempNightConfig.defenseEnabled;
  openNightMode();
}

function setNightComet(hours) {
  if (!_tempNightConfig) return;
  _tempNightConfig.cometHours = parseInt(hours) || 0;
  _tempNightConfig.mode = 'custom';
  openNightMode();
}

function setNightExpedition(pct) {
  if (!_tempNightConfig) return;
  _tempNightConfig.expeditionPercent = parseInt(pct) || 0;
  _tempNightConfig.mode = 'custom';
  openNightMode();
}

function activateNightDefense(lvl) {
  const cost = INVASION_CFG.defenseCost[lvl];
  if ((S.metalAmount || 0) < cost) {
    toast('Не хватает металла', 'Нужно ' + cost + ' ⚙');
    return;
  }
  S.metalAmount -= cost;
  S.nightDefenseLevel = lvl;
  S.nightDefenseExpiresAt = Date.now() + 24 * 3600 * 1000;
  if (_tempNightConfig) _tempNightConfig.defenseEnabled = true;
  S.nightConfig.defenseEnabled = true;
  
  toast('🛡 Оборона активирована', 'Ур.' + lvl + ' на 24 ч');
  saveGame();
  updateUI();
  openNightMode();
}
function updateTrophyBadge() {
  const el = document.getElementById('trophyBadge');
  const countEl = document.getElementById('trophyCount');
  if (!el || !countEl) return;
  const c = S.trophyContracts ? S.trophyContracts.length : 0;
  if (c > 0) { el.style.display = 'block'; countEl.textContent = c; }
  else { el.style.display = 'none'; }
}
window.openTrophyModal = function() { /* ... (код модалки трофеев из прошлого сообщения) ... */ };

const oldUpdateUI = updateUI;
updateUI = function() { oldUpdateUI(); updateTrophyBadge(); };
// Экспорт
window.updatePrimeBadge = function() {};
window.fmt = fmt;
window.fmtTime = fmtTime;
window.toast = toast;
window.updateUI = updateUI;
window.updateQuestPanel = updateQuestPanel;
window.updateSystemSwitcher = updateSystemSwitcher;
window.initUI = initUI;
window.openStorageModal = openStorageModal;
window.pourStorage = pourStorage;
window.buyStorageWithStars = buyStorageWithStars;
window.triggerSupernovaFlash = triggerSupernovaFlash;
window.openNightMode = openNightMode;
window.saveNightConfig = saveNightConfig;
window.cancelNightConfig = cancelNightConfig;
window.applyNightPreset = applyNightPreset;
window.toggleNightDefense = toggleNightDefense;
window.setNightComet = setNightComet;
window.setNightExpedition = setNightExpedition;
window.activateNightDefense = activateNightDefense;