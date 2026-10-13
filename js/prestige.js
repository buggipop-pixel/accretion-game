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

// ─── Проверка доступности престижа ───────────────────────────────
function checkPrestigeAvailability() {
  const systems = S.systems;
  const prestigeLevel = S.prestigeLevel || 0;
  
  // Требования систем для каждого уровня престижа
  const requirements = [
    5,   // 1-я сверхновая на 5 систем
    10,  // 2-я на 10 систем
    20,  // 3-я на 20 систем
    40,  // 4-я на 40 систем
    80   // 5-я на 80 систем
  ];
  
  // Проверяем, есть ли доступный следующий уровень
  const nextRequirement = requirements[prestigeLevel];
  if (nextRequirement && systems >= nextRequirement) {
    return prestigeLevel + 1;
  }
  
  return 0; // Престиж недоступен
}

// ─── Активация Вспышки Сверхновой ────────────────────────────────
function activateSupernova() {
  const availableLevel = checkPrestigeAvailability();
  if (!availableLevel) {
    toast('Вспышка Сверхновой', 'Недостаточно систем для престижа');
    return;
  }
  
  // Показываем модальное подтверждение
  const modal = document.getElementById('modal');
  const card = document.getElementById('modalCard');
  
  const galaxyFormName = {
    'spiral': 'Спиральная',
    'elliptical': 'Эллиптическая',
    'irregular': 'Иррегулярная',
    'ring': 'Кольцевая'
  }[S.galaxyForm || 'spiral'];
  
  const html = `
    <div class="modal-title">ВСПЫШКА СВЕРХНОВОЙ</div>
    <div class="modal-sub">
      Уровень ${availableLevel}: ${availableLevel === 1 ? 'первая' : 
        availableLevel === 2 ? 'вторая' : 
        availableLevel === 3 ? 'третья' : 
        availableLevel === 4 ? 'четвертая' : 'пятая'} вспышка
    </div>
    <div style="margin: 15px 0; font-size: 14px; color: #aaa;">
      • Форма галактики: ${galaxyFormName}<br>
      • Пассивный доход: ×${S.galaxyMultiplier || 2}<br>
      • Сохранено: галактики, множители, достижения, 50% металлов
    </div>
    <div class="modal-sub" style="color: #ff5e5e; font-weight: bold;">
      ⚠️ Сбрасываются: пыль, энергия, цивилизация, планеты, системы
    </div>
    <div class="choices">
      <button class="choice" data-id="confirm">
        <div class="choice-icon" style="background:#ff5e5e">💥</div>
        <div class="choice-body">
          <div class="choice-name">Активировать Вспышку</div>
          <div class="choice-desc">Это необратимо!</div>
        </div>
      </button>
      <button class="choice" data-id="cancel">
        <div class="choice-icon" style="background:#666">✕</div>
        <div class="choice-body">
          <div class="choice-name">Отмена</div>
        </div>
      </button>
    </div>
  `;
  
  card.innerHTML = html;
  modal.classList.add('show');
  
  // Обработчики кнопок
  const confirmBtn = card.querySelector('[data-id="confirm"]');
  const cancelBtn = card.querySelector('[data-id="cancel"]');
  
  confirmBtn.addEventListener('click', function() {
    performSupernova(availableLevel);
    modal.classList.remove('show');
  });
  
  cancelBtn.addEventListener('click', function() {
    modal.classList.remove('show');
  });
}

// ─── Выполнение Вспышки Сверхновой ──────────────────────────────
function performSupernova(level) {
  // Сохраняем важные данные перед сбросом
  const savedData = {
    galaxies: S.galaxies || 1,
    galaxyForm: S.galaxyForm || 'spiral',
    galaxyMultiplier: S.galaxyMultiplier || 2,
    achievements: S.achievements || [],
    metalAmount: S.metalAmount || 0,
    prestigeLevel: level
  };
  
  // Сохраняем 50% металлов
  savedData.metalAmount = Math.floor((S.metalAmount || 0) * 0.5);
  
  // Сбрасываем ресурсы и системы
  S.dust = 0;
  S.dustTotal = 0;
  S.energy = 0;
  S.civLevel = 0;
  S.planets = [];
  S.systems = 1;
  S.totalSystemsCreated = 1;
  S.storageLevels = { dust: 1, energy: 1, civ: 1 };
  S.storageProgress = { dust: 0, energy: 0, civ: 0 };
  
  // Восстанавливаем сохраненные данные
  S.galaxies = savedData.galaxies;
  S.galaxyForm = savedData.galaxyForm;
  S.galaxyMultiplier = savedData.galaxyMultiplier;
  S.achievements = savedData.achievements;
  S.metalAmount = savedData.metalAmount;
  S.prestigeLevel = level;
  
  // Меняем форму галактики циклически
  const currentFormIndex = GALAXY_FORMS.indexOf(S.galaxyForm);
  const nextFormIndex = (currentFormIndex + 1) % GALAXY_FORMS.length;
  S.galaxyForm = GALAXY_FORMS[nextFormIndex];
  
  // Запускаем визуальную вспышку
  if (typeof triggerSupernovaFlash === 'function') {
    triggerSupernovaFlash();
  }
  
  // Обновляем UI
  updateUI();
  updateSystemSwitcher();
  
  // Показываем уведомление
  const formNames = {
    'spiral': 'Спиральная',
    'elliptical': 'Эллиптическая',
    'irregular': 'Иррегулярная',
    'ring': 'Кольцевая'
  };
  
  toast('🌟 Вспышка Сверхновой!', 
    `Уровень ${level} · Новая форма: ${formNames[S.galaxyForm]}`);
  
  // Сохраняем игру
  saveGame();
}

// ─── Обновление кнопки престижа в UI ───────────────────────────
function updatePrestigeButton() {
  const availableLevel = checkPrestigeAvailability();
  const prestigeBtn = document.getElementById('prestigeBtn');
  
  if (!prestigeBtn) return;
  
  if (availableLevel) {
    prestigeBtn.style.display = 'block';
    prestigeBtn.textContent = `ВСПЫШКА СВЕРХНОВОЙ (${availableLevel})`;
    prestigeBtn.title = `Доступна ${availableLevel === 1 ? 'первая' : 
      availableLevel === 2 ? 'вторая' : 
      availableLevel === 3 ? 'третья' : 
      availableLevel === 4 ? 'четвертая' : 'пятья'} Вспышка Сверхновая`;
  } else {
    prestigeBtn.style.display = 'none';
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
    prestigeBtn.textContent = 'ВСПЫШКА СВЕРХНОВОЙ';
    prestigeBtn.style.display = 'none';
    prestigeBtn.addEventListener('click', activateSupernova);
    hud.appendChild(prestigeBtn);
  }
  
  // Обновляем кнопку при изменении количества систем
  setInterval(updatePrestigeButton, 2000);
}

// ─── Экспорт функций ─────────────────────────────────────────────
window.checkPrestigeAvailability = checkPrestigeAvailability;
window.activateSupernova = activateSupernova;
window.performSupernova = performSupernova;
window.updatePrestigeButton = updatePrestigeButton;
window.initPrestige = initPrestige;