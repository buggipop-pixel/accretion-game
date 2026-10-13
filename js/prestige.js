// ═══════════════════════════════════════════════════════════════
//  PRESTIGE.JS — система Престижа (Вспышка Сверхновой)
// ═══════════════════════════════════════════════════════════════

// ─── Формы галактик ──────────────────────────────────────────────
const GALAXY_FORMS = [
  'spiral',     // Спиральная
  'elliptical', // Эллиптическая
  'irregular',  // Иррегулярная
  'ring'        // Кольцевая
];

// ─── Требования по системам для каждой сверхновой ───────────────
// 1-я на 5 систем, каждая следующая ×2: 5, 10, 20, 40, 80
function prestigeRequirements() {
  const first = PRESTIGE_CFG.firstRequirement || 5;
  const step = PRESTIGE_CFG.stepMultiplier || 2;
  const list = [];
  for (let i = 0; i < 5; i++) list.push(first * Math.pow(step, i));
  return list;
}

// ─── Проверка доступности престижа ───────────────────────────────
// Возвращает номер доступной сверхновой (1..5) или 0.
function checkPrestigeAvailability() {
  const requirements = prestigeRequirements();
  const prestigeLevel = S.prestigeLevel || 0;
  const need = requirements[prestigeLevel];
  if (need && S.systems >= need) return prestigeLevel + 1;
  return 0;
}


function activateSupernova() {
  const availableLevel = checkPrestigeAvailability();
  if (!availableLevel) {
    toast('Вспышка Сверхновой', 'Недостаточно систем для престижа');
    return;
  }

  const formNames = {
    'spiral': 'Спиральная',
    'elliptical': 'Эллиптическая',
    'irregular': 'Иррегулярная',
    'ring': 'Кольцевая',
  };
  const order = ['первая', 'вторая', 'третья', 'четвёртая', 'пятая'];
  const curMult = S.galaxyMultiplier || 1;
  const nextMult = curMult * (PRESTIGE_CFG.multiplierPerGalaxy || 2);
  const curForm = S.galaxyForm || 'spiral';
  const nextForm = GALAXY_FORMS[(GALAXY_FORMS.indexOf(curForm) + 1) % GALAXY_FORMS.length];

  const info = `
    <div class="info-box">
      <div class="row-stat"><span>Галактик:</span><span>${S.galaxies || 1} ➔ ${(S.galaxies || 1) + 1}</span></div>
      <div class="row-stat"><span>Множитель дохода:</span><span>×${curMult.toFixed(1)} ➔ ×${nextMult.toFixed(1)}</span></div>
      <div class="row-stat"><span>Форма галактики:</span><span>${formNames[curForm]} ➔ ${formNames[nextForm]}</span></div>
      <div class="row-stat"><span>Металлы:</span><span>останется 50%</span></div>
      <div class="row-stat"><span>Хранилище:</span><span>сохраняется</span></div>
    </div>
    <div class="modal-sub" style="color:#ff5e5e;font-weight:bold;">
      Сбрасываются: пыль, энергия, цивилизация, планеты, системы
    </div>
  `;

  const choices = [
    {
      id: 'confirm', name: 'Активировать Вспышку',
      desc: 'Это необратимо!', color: '#ff5e5e', icon: '💥',
    },
    {
      id: 'cancel', name: 'Отмена',
      desc: 'Остаться в текущей галактике', color: '#6b6b6b', icon: '✕',
    },
  ];

  let html = buildModal('ВСПЫШКА СВЕРХНОВОЙ',
    `${order[availableLevel - 1] || availableLevel + '-я'} вспышка · уровень ${availableLevel}`,
    choices);
  html = html.replace('<div class="choices">', info + '<div class="choices">');

  const handlers = {
    confirm: function() { performSupernova(availableLevel); },
    cancel: function() { closeEvolutionModal(); },
  };

  setModal(html, handlers);
}


function performSupernova(level) {
  // ─── Что сохраняется между галактиками ───
  const keep = {
    galaxies: (S.galaxies || 1) + 1,
    galaxyMultiplier: (S.galaxyMultiplier || 1) * (PRESTIGE_CFG.multiplierPerGalaxy || 2),
    galaxyForm: GALAXY_FORMS[(GALAXY_FORMS.indexOf(S.galaxyForm || 'spiral') + 1) % GALAXY_FORMS.length],
    achievements: S.achievements || [],
    metalAmount: Math.floor((S.metalAmount || 0) * 0.5),
    prestigeLevel: level,
    storageLevels: Object.assign({ dust: 1, energy: 1, civ: 1 }, S.storageLevels),
    storageProgress: Object.assign({ dust: 0, energy: 0, civ: 0 }, S.storageProgress),
  };

  // ─── Полный сброс прогресса (фаза, планеты, системы, миссии, вторжения) ───
  resetStateValues();
  Object.assign(S, keep);

  // Частицы и камера — как в начале новой игры
  if (typeof initParticles === 'function') initParticles();

  // ─── Визуальная вспышка ───
  if (typeof triggerSupernovaFlash === 'function') triggerSupernovaFlash();

  updateUI();
  updateSystemSwitcher();
  saveGame();

  const formNames = {
    'spiral': 'Спиральная',
    'elliptical': 'Эллиптическая',
    'irregular': 'Иррегулярная',
    'ring': 'Кольцевая',
  };
  toast('🌟 Вспышка Сверхновой!',
    `Галактика ${S.galaxies} · доход ×${S.galaxyMultiplier.toFixed(1)} · ${formNames[S.galaxyForm]}`);
}


// ─── Обновление кнопки престижа в UI ───────────────────────────
function updatePrestigeButton() {
  const availableLevel = checkPrestigeAvailability();
  const prestigeBtn = document.getElementById('prestigeBtn');
  if (!prestigeBtn) return;

  const order = ['первая', 'вторая', 'третья', 'четвёртая', 'пятая'];
  const requirements = prestigeRequirements();
  const nextNeed = requirements[S.prestigeLevel || 0];

  if (availableLevel) {
    prestigeBtn.style.display = 'block';
    prestigeBtn.textContent = '💥 ВСПЫШКА СВЕРХНОВОЙ';
    prestigeBtn.title = 'Доступна ' + (order[availableLevel - 1] || availableLevel + '-я') +
      ' вспышка (уровень ' + availableLevel + ')';
  } else {
    prestigeBtn.style.display = 'none';
    if (nextNeed) {
      prestigeBtn.title = 'Нужно ' + nextNeed + ' систем (сейчас ' + S.systems + ')';
    }
  }
}

// ─── Инициализация престижа ─────────────────────────────────────
function initPrestige() {
  // Добавляем кнопку престижа в HUD, если ее нет
  const hud = document.querySelector('.hud');
  if (hud && !document.getElementById('prestigeBtn')) {
    const prestigeBtn = document.createElement('button');
    prestigeBtn.id = 'prestigeBtn';
    prestigeBtn.className = 'prestige-btn';
    prestigeBtn.textContent = '💥 ВСПЫШКА СВЕРХНОВОЙ';
    prestigeBtn.style.display = 'none';
    prestigeBtn.addEventListener('click', activateSupernova);
    hud.appendChild(prestigeBtn);
  }

  // Обновляем кнопку при изменении количества систем (интервал не дублируем)
  if (!window.__prestigeTimer) {
    window.__prestigeTimer = setInterval(updatePrestigeButton, 2000);
  }
  updatePrestigeButton();
}

// ─── Экспорт функций ─────────────────────────────────────────────
window.prestigeRequirements = prestigeRequirements;
window.checkPrestigeAvailability = checkPrestigeAvailability;
window.activateSupernova = activateSupernova;
window.performSupernova = performSupernova;
window.updatePrestigeButton = updatePrestigeButton;
window.initPrestige = initPrestige;