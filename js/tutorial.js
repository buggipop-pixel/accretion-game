// ═══════════════════════════════════════════════════════════════
//  TUTORIAL.JS — поэтапное обучение игрока
//  Каждая фаза и каждая новая механика объясняются в момент,
//  когда они впервые становятся доступны. Подсказка подсвечивает
//  нужный элемент и говорит, ЧТО сделать и ГДЕ это найти.
//
//  Точка входа: window.Tutorial / openTutorialPanel()
//  Рендер вызывается из updateUI() через renderTutorial() (ui.js).
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var VERSION = 2;

  // Порядок фаз для «догоняющей» миграции старых сейвов.
  var STAGE_RANK = { cloud: 1, condense: 2, protostar: 3, firstPlanet: 4, system: 5, galaxy: 6 };

  var CHAPTERS = [
    { id: 'start', tag: 'СТАРТ', title: 'Первые шаги' },
    { id: 'cloud', tag: 'ФАЗА I', title: 'Молекулярное облако' },
    { id: 'condense', tag: 'ФАЗА II', title: 'Протопланетный диск' },
    { id: 'protostar', tag: 'ФАЗА III', title: 'Протозвезда' },
    { id: 'firstPlanet', tag: 'ФАЗА IV', title: 'Первая планета' },
    { id: 'system', tag: 'ФАЗА V', title: 'Формирование системы' },
    { id: 'galaxy', tag: 'ФАЗА VI', title: 'Галактика' },
    { id: 'meta', tag: 'МЕТА', title: 'Долгосрочные системы' }
  ];

  // Шаги идут строго по порядку массива. Шаг с mode:'action' ждёт,
  // пока игрок реально сделает действие. mode:'info' просто объясняет
  // и сам перелистывается через autoNext мс (или по кнопке «Понятно»).
  //
  // when(s) — показывать ли шаг в текущем состоянии.
  // done(s) — выполнено ли действие игроком.
  // target  — CSS-селектор элемента, который нужно подсветить.
  // open()  — что открыть по кнопке «Где это?».
  var STEPS = [
    // ─── СТАРТ ────────────────────────────────────────────────
    {
      id: 'cloud_goal', ch: 'cloud', mode: 'info', autoNext: 7000,
      title: '🎯 Твоя цель',
      sub: 'Собирай ✦ пыль и заполняй кольцо фазы слева внизу. Заполнилось — жми «Эволюция».',
      target: '#phaseOrb'
    },
    {
      id: 'cloud_drag', ch: 'cloud', mode: 'action',
      title: '☝️ Собери пыль',
      sub: 'Зажми палец и води им по экрану — гравитация стянет пыль к центру. Так растёт ✦ пыль.',
      done: function (s) { return (s.stats && s.stats.clicks >= 5) || s.dust >= 300; }
    },
    {
      id: 'start_storage', ch: 'start', mode: 'info', autoNext: 8000,
      when: function (s) { return s.dust >= 300; },
      title: '📦 Хранилища',
      sub: 'Внизу — ✦ пыль, ⚡ энергия и 🧬 цивилизация. «Улучшить» поднимает лимит и скорость накопления.',
      target: '#storagePanel',
      open: function () { if (typeof openStorageModal === 'function') openStorageModal('dust'); }
    },
    {
      id: 'start_menu', ch: 'start', mode: 'info', autoNext: 7000,
      when: function (s) { return s.dust >= 300; },
      title: '⚙ Меню настроек',
      sub: 'Справа вверху ⚙: звук, яркость, полный экран, гид и обучение. Здесь же Верфь, оборона и премиум-магазин.',
      target: '#settingsBtn',
      open: function () { var b = document.getElementById('settingsBtn'); if (b) b.click(); }
    },
    {
      id: 'start_help', ch: 'start', mode: 'info', autoNext: 6000,
      when: function (s) { return s.dust >= 300; },
      title: '❓ Гид по игре',
      sub: 'Кнопка ❓ вверху и «Гид» в панели квестов открывают полный справочник по фазам и механикам.',
      target: '#helpBtn',
      open: function () { if (typeof openGameGuide === 'function') openGameGuide(); }
    },
    {
      id: 'cloud_progress', ch: 'cloud', mode: 'info', autoNext: 7000,
      when: function (s) { return s.dust >= 1000 && s.stage === 'cloud'; },
      title: '⭕ Кольцо фазы',
      sub: 'Кольцо показывает прогресс до перехода. Для облака нужно 2000 ✦ пыли.',
      target: '#phaseOrb'
    },
    {
      id: 'cloud_evolve', ch: 'cloud', mode: 'action', after: ['cloud_drag'],
      title: '✨ Жми «Эволюция»',
      sub: 'Когда кольцо заполнится, кнопка «Эволюция» станет активной. Нажми её, чтобы перейти к диску.',
      target: '#evolveBtn',
      done: function (s) { return s.stage !== 'cloud'; }
    },

    // ─── ФАЗА II: ДИСК ───────────────────────────────────────
    {
      id: 'condense_twist', ch: 'condense', mode: 'action',
      when: function (s) { return s.stage === 'condense'; },
      title: '🌀 Раскрути диск',
      sub: 'Крути пальцем по кругу — диск раскручивается и собирает пыль быстрее. Цель фазы: 25 000 ✦.',
      done: function (s) { return s.stage !== 'condense' || s.dust >= 25000; }
    },
    {
      id: 'condense_evolve', ch: 'condense', mode: 'action',
      when: function (s) { return s.stage === 'condense'; },
      title: '✨ Сожми облако в звезду',
      sub: 'Набери 25 000 ✦ и нажми «Эволюция» — начнётся фаза протозвезды.',
      target: '#evolveBtn',
      done: function (s) { return s.stage !== 'condense'; }
    },

    // ─── ФАЗА III: ПРОТОЗВЕЗДА ───────────────────────────────
    {
      id: 'proto_tap', ch: 'protostar', mode: 'action',
      when: function (s) { return s.stage === 'protostar'; },
      title: '🔥 Разожги звезду',
      sub: 'Быстро тапай по экрану и не давай жару упасть. Чем жарче — тем сильнее будущая звезда.',
      done: function (s) { return s.stage !== 'protostar'; }
    },
    {
      id: 'proto_class', ch: 'protostar', mode: 'info', autoNext: 9000,
      when: function (s) { return s.stage === 'protostar'; },
      title: '⭐ Класс звезды',
      sub: 'Итоговый нагрев определяет класс: M, K, G, A или B. Класс влияет на доход всей системы.',
      target: '#orbLabel'
    },

    // ─── ФАЗА IV: ПЕРВАЯ ПЛАНЕТА ─────────────────────────────
    {
      id: 'fp_control', ch: 'firstPlanet', mode: 'info', autoNext: 10000,
      when: function (s) { return s.stage === 'firstPlanet'; },
      title: '🪐 Сборка планеты',
      sub: 'Тяни шары по одному: при касании они сливаются. Большинство шаров задаёт тип планеты.',
      target: '#phaseOrb'
    },
    {
      id: 'fp_build', ch: 'firstPlanet', mode: 'action',
      when: function (s) { return s.stage === 'firstPlanet'; },
      title: '🪐 Собери первую планету',
      sub: 'Перетаскивай шары друг к другу, пока не соберёшь планету. Потом нажми «Эволюция».',
      done: function (s) { return (s.planets && s.planets.length > 0) || s.stage === 'system' || s.stage === 'galaxy'; }
    },

    // ─── ФАЗА V: СИСТЕМА ─────────────────────────────────────
    {
      id: 'sys_goal', ch: 'system', mode: 'info', autoNext: 9000,
      when: function (s) { return s.stage === 'system'; },
      title: '🌍 Формируем систему',
      sub: 'Цель — 8 планет на орбитах. Кольцо фазы показывает, сколько уже занято. Потом откроется галактика.',
      target: '#phaseOrb'
    },
    {
      id: 'sys_types', ch: 'system', mode: 'info', autoNext: 11000,
      when: function (s) { return s.stage === 'system'; },
      title: '🌈 Типы планет',
      sub: 'Лава даёт ⚙ металлы, Земля — ⚡ энергию и 🧬 цивилизацию, гиганты — доход. После 4-й орбиты проходит снеговая линия.',
      target: '#storagePanel'
    },
    {
      id: 'sys_merge', ch: 'system', mode: 'action',
      when: function (s) { return s.stage === 'system'; },
      title: '💥 Слияния и столкновения',
      sub: 'Планеты на близких орбитах сталкиваются сами: слияние, отскок или разрушение с луной. Следи за тостами.',
      done: function (s) { return (s.planets && s.planets.length >= 2); }
    },
    {
      id: 'sys_quests', ch: 'system', mode: 'info', autoNext: 9000,
      when: function (s) { return s.stage === 'system'; },
      title: '📋 Квесты',
      sub: 'Кольцо фазы слева внизу открывает панель ежедневных квестов. За них дают награды и ускоряют прогресс.',
      target: '#phaseOrb'
    },
    {
      id: 'sys_storage_up', ch: 'system', mode: 'action',
      when: function (s) { return s.stage === 'system'; },
      title: '📦 Улучши хранилище',
      sub: 'Нажми «Улучшить» на карточке ✦ пыли — лимит вырастет, и офлайн-доход будет больше.',
      target: '.storage-cell[data-res="dust"] .storage-upgrade-btn',
      done: function (s) { return s.storageLevels && s.storageLevels.dust > 1; }
    },
    {
      id: 'sys_mission', ch: 'system', mode: 'action',
      when: function (s) { return s.stage === 'system'; },
      title: '☄️ Запусти миссию',
      sub: 'Кнопки миссий справа внизу. Комета даёт пыль, экспедиция — металлы и шанс колонии.',
      target: '#missionButtons',
      done: function (s) { return (s.stats && (s.stats.comets >= 1 || s.stats.expeditions >= 1)); }
    },
    {
      id: 'sys_journal', ch: 'system', mode: 'info', autoNext: 9000,
      when: function (s) { return (s.stats && (s.stats.comets >= 1 || s.stats.expeditions >= 1)) || (s.invasions && s.invasions.length); },
      title: '📜 Журнал событий',
      sub: 'Кнопка 📜 вверху: итоги атак, миссий и событий — что украдено, что уничтожено, сколько флота потеряно.',
      target: '#eventBtn',
      open: function () { if (typeof toggleEventLog === 'function') toggleEventLog(); }
    },
    {
      id: 'sys_invasion', ch: 'system', mode: 'info', autoNext: 9000,
      when: function (s) { return !!(s.invasions && s.invasions.length); },
      title: '⚔️ Вторжение!',
      sub: 'Красное кольцо — атака. Тапни по кораблю, чтобы нанести урон. Флот и Автоборона снижают урон и повышают шанс отбиться.',
      target: null
    },
    {
      id: 'sys_fleet', ch: 'system', mode: 'action',
      when: function (s) { return s.stage === 'system' || s.stage === 'galaxy'; },
      title: '🚀 Построй флот',
      sub: '⚙ Настройки → 🚀 Верфь. Купи первый перехватчик: корабли отбивают вторжения и несут потери.',
      target: '#settingsBtn',
      open: function () { if (typeof openShipyard === 'function') openShipyard(); },
      done: function (s) { return fleetTotal() > 0; }
    },
    {
      id: 'sys_defense', ch: 'system', mode: 'action',
      when: function (s) { return s.stage === 'system' || s.stage === 'galaxy'; },
      title: '🛡 Автоборона',
      sub: '⚙ Настройки → 🛡 Активная оборона. Уровень 1+ даёт шанс отбить атаку ещё до высадки.',
      target: '#defenseChip',
      open: function () { if (typeof openNightMode === 'function') openNightMode(); },
      done: function (s) { return defenseLevel(s) >= 1; }
    },
    {
      id: 'sys_achievements', ch: 'system', mode: 'info', autoNext: 8000,
      when: function (s) { return s.stage === 'system' || s.stage === 'galaxy'; },
      title: '🏆 Достижения',
      sub: 'Кнопка 🏆 вверху. За достижения дают куски Прайм-системы — из них собирается бонусная система.',
      target: '#achBtn',
      open: function () { if (typeof openAchievements === 'function') openAchievements(); }
    },
    {
      id: 'sys_daily', ch: 'system', mode: 'info', autoNext: 8000,
      when: function (s) { return s.stage === 'system' || s.stage === 'galaxy'; },
      title: '📅 Ежедневные награды',
      sub: 'Заходи каждый день и забирай награду: пыль, энергию, металлы и бустеры. Пропуск дня сбрасывает серию.',
      target: null
    },
    {
      id: 'sys_switch', ch: 'system', mode: 'info', autoNext: 9000,
      when: function (s) { return s.systems > 1 || (s.otherSystems && s.otherSystems.length); },
      title: '🪐 Переключение систем',
      sub: 'Нажми на плашку с ником вверху — откроется список систем. Там же переименование и профиль.',
      target: '#systemSwitcherBtn'
    },
    {
      id: 'sys_shop', ch: 'system', mode: 'info', autoNext: 10000,
      when: function (s) { return s.stage === 'galaxy' || (s.stage === 'system' && (s.planets || []).length >= 8); },
      title: '🏗 Купи новую систему',
      sub: 'Магазин систем: вкладывай ✦/⚡/🧬 и покупай системы. Первая покупка открывает галактику.',
      target: '.mission-btn.sys',
      open: function () { if (typeof openSystemShop === 'function') openSystemShop(); }
    },
    {
      id: 'sys_events', ch: 'system', mode: 'info', autoNext: 9000,
      when: function (s) { return s.systems > 1; },
      title: '🌠 Случайные события',
      sub: 'Баннер сверху сообщает о событии: босс, сбор ресурсов, выбор. Не игнорируй — награды и штрафы реальные.',
      target: '#eventBanner'
    },
    {
      id: 'sys_camera', ch: 'system', mode: 'info', autoNext: 9000,
      when: function (s) { return s.stage === 'system' || s.stage === 'galaxy'; },
      title: '🎥 Камера',
      sub: 'Щипок двумя пальцами — зум, двойной тап — сброс камеры. Кнопка 🌐 3D включает объёмный обзор.',
      target: '#view3dBtn'
    },
    {
      id: 'sys_galaxy', ch: 'system', mode: 'action',
      when: function (s) { return s.stage === 'system' && s.planets && s.planets.length >= 8; },
      title: '🌌 Пора в галактику',
      sub: 'Все 8 орбит заняты — внизу справа появилась кнопка «Новая система». Купи систему, и откроется галактика.',
      target: '.mission-btn.sys',
      done: function (s) { return s.stage === 'galaxy'; }
    },

    // ─── ФАЗА VI: ГАЛАКТИКА ──────────────────────────────────
    {
      id: 'gal_intro', ch: 'galaxy', mode: 'info', autoNext: 9000,
      when: function (s) { return s.stage === 'galaxy'; },
      title: '🌌 Галактика',
      sub: 'Двойной тап по системе — войти в неё, одиночный — выбрать. «🌌 В галактику» возвращает на карту.',
      target: '#backToGalaxyBtn'
    },
    {
      id: 'gal_expand', ch: 'galaxy', mode: 'info', autoNext: 10000,
      when: function (s) { return s.stage === 'galaxy'; },
      title: '🏗 Расширяйся',
      sub: 'Строй системы через магазин и копи ресурсы. Цель галактической фазы — всё больше систем и дохода.',
      target: '#systemSwitcherBtn',
      open: function () { if (typeof openSystemShop === 'function') openSystemShop(); },
      done: function (s) { return s.systems >= 3; }
    },
    {
      id: 'gal_prime', ch: 'galaxy', mode: 'info', autoNext: 9000,
      when: function (s) { return s.stage === 'galaxy'; },
      title: '🌑 Прайм-объекты',
      sub: '11 типов: чёрные дыры, квазары, пульсары, кротовые норы. Собирай куски за достижения или открывай сундуки.',
      target: '#achBtn',
      open: function () { if (typeof openAchievements === 'function') openAchievements(); }
    },
    {
      id: 'gal_premium', ch: 'galaxy', mode: 'info', autoNext: 9000,
      when: function (s) { return s.stage === 'galaxy'; },
      title: '⚙ Премиум-магазин',
      sub: '⚙ Настройки → Премиум: щиты, бустеры дохода и сундуки Прайм за ⭐ звёзды.',
      target: '#settingsBtn',
      open: function () { if (typeof openPremiumShop === 'function') openPremiumShop(); }
    },
    {
      id: 'gal_prestige', ch: 'galaxy', mode: 'info', autoNext: 11000,
      when: function (s) { return s.stage === 'galaxy' || (s.prestigeLevel || 0) > 0; },
      title: '💥 Сверхновая',
      sub: 'Престиж: сбрасывает прогресс, но навсегда повышает множитель дохода. Кнопка появляется в панели квестов, когда хватает систем.',
      target: '#phaseOrb'
    },
    {
      id: 'gal_prestige_do', ch: 'galaxy', mode: 'info', autoNext: 11000,
      when: function (s) { return (s.prestigeLevel || 0) > 0; },
      title: '💥 Переживи вспышку',
      sub: 'После вспышки ты снова в облаке, но с постоянным бонусом. Прогресс пойдёт быстрее — это основная петля игры.',
      target: '#phaseOrb',
      done: function (s) { return (s.stats && s.stats.prestiges >= 1) || (s.prestigeLevel || 0) >= 1; }
    },

    // ─── МЕТА ────────────────────────────────────────────────
    {
      id: 'meta_guide', ch: 'meta', mode: 'info', autoNext: 9000,
      when: function (s) { return (s.stage === 'system' || s.stage === 'galaxy'); },
      title: '📖 Всё всегда под рукой',
      sub: '❓ — гид по фазам, ⚙ → 🎓 Обучение — полный чек-лист с прогрессом и сбросом. Можно вернуться в любой момент.',
      target: '#helpBtn',
      open: function () { if (typeof openGameGuide === 'function') openGameGuide(); }
    },
    {
      id: 'meta_save', ch: 'meta', mode: 'info', autoNext: 8000,
      when: function (s) { return (s.dustTotal || 0) > 1000; },
      title: '💾 Прогресс сохраняется',
      sub: 'Игра сохраняется автоматически, в том числе в облако. Офлайн-доход начисляется при возвращении.',
      target: '#settingsBtn'
    }
  ];

  // Шаги, которые уже были в старой обучалке: если игрок её прошёл,
  // не показываем их повторно.
  var LEGACY_SHOWN = {
    cloud_drag: 1, cloud_evolve: 1, condense_twist: 1, condense_evolve: 1,
    proto_tap: 1, fp_build: 1, sys_mission: 1, sys_fleet: 1, sys_defense: 1, sys_journal: 1
  };

  var mem = {
    key: '',
    shownAt: 0,
    hideAt: 0,
    hiddenUntil: 0,
    pulseEl: null,
    lastStepId: null,
    saveTimer: null,
    completedToast: false,
    focusId: null,
    focusUntil: 0
  };

  var ready = false;

  // ─── Утилиты ────────────────────────────────────────────────
  function now() { return Date.now(); }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fleetTotal() {
    try {
      if (typeof fleetShipTotal === 'function') return Math.max(0, fleetShipTotal() || 0);
    } catch (e) { /* ignore */ }
    var f = (S && S.fleet) || {};
    return (f.interceptor || 0) + (f.cruiser || 0) + (f.dreadnought || 0);
  }

  function defenseLevel(s) {
    try {
      if (typeof activeDefenseLevel === 'function') {
        var lv = activeDefenseLevel();
        if (lv > 0) return lv;
      }
    } catch (e) { /* ignore */ }
    return Number((s && s.nightDefenseLevel) || 0);
  }

  function stepById(id) {
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) return STEPS[i];
    return null;
  }

  function chapterById(id) {
    for (var i = 0; i < CHAPTERS.length; i++) if (CHAPTERS[i].id === id) return CHAPTERS[i];
    return null;
  }

  // ─── Состояние ──────────────────────────────────────────────
  function ensureState() {
    if (typeof S === 'undefined' || !S) return;
    if (!S.tut || typeof S.tut !== 'object') {
      var fresh = !(S.tutorialDone) && (S.dustTotal || 0) < 1000 &&
        (!S.stage || S.stage === 'cloud');
      S.tut = { v: VERSION, done: {}, off: false, isNew: fresh, migrated: 0 };
    }
    var t = S.tut;
    if (!t.done || typeof t.done !== 'object' || Array.isArray(t.done)) t.done = {};
    if (typeof t.off !== 'boolean') t.off = false;
    if (typeof t.v !== 'number') t.v = 0;
    if (typeof t.isNew !== 'boolean') {
      t.isNew = !(S.tutorialDone) && (S.dustTotal || 0) < 1000 && (!S.stage || S.stage === 'cloud');
    }

    if (!t.migrated) {
      t.migrated = 1;
      if (S.tutorialDone) {
        for (var id in LEGACY_SHOWN) if (LEGACY_SHOWN[id]) t.done[id] = 1;
      }
      catchUp(t);
    } else if (t.v < VERSION) {
      // Вышло обновление обучения — новые шаги просто станут доступны.
      catchUp(t);
    }
    syncPassedPhases(t);
    t.v = VERSION;
  }

  // Как только игрок ушёл из фазы, все её шаги автоматически считаются
  // пройденными: не показываем «собери пыль» тому, кто уже в системе.
  function syncPassedPhases(t) {
    if (!t) return;
    var rank = STAGE_RANK[S.stage] || 0;
    if (t.syncedRank === rank) return;
    t.syncedRank = rank;
    if (!rank) return;
    var changed = false;
    for (var i = 0; i < STEPS.length; i++) {
      var st = STEPS[i];
      if (st.ch === 'meta' || t.done[st.id]) continue;
      var cRank = STAGE_RANK[chapterStage(st.ch)];
      if (cRank && cRank < rank) { t.done[st.id] = 1; changed = true; }
    }
    if (changed) queueSave();
  }

  // Старые игроки не должны заново проходить ранние фазы.
  function catchUp(t) {
    if (!t || t.isNew) return;
    var rank = STAGE_RANK[S.stage] || 0;
    if (!S.tutorialDone && rank <= 1 && (S.systems || 1) <= 1 && !(S.prestigeLevel || 0)) return;
    for (var i = 0; i < STEPS.length; i++) {
      var st = STEPS[i];
      if (st.ch === 'meta') continue;
      var cRank = STAGE_RANK[chapterStage(st.ch)];
      if (cRank && cRank < rank) t.done[st.id] = 1;
    }
  }

  function chapterStage(ch) {
    return (ch === 'start') ? 'cloud' : ch;
  }

  function isDone(id) {
    return !!(S && S.tut && S.tut.done && S.tut.done[id]);
  }

  function whenStep(st) {
    if (!st.when) return true;
    try { return !!st.when(S); } catch (e) { return false; }
  }

  function actionDone(st) {
    if (st.mode !== 'action' || !st.done) return false;
    try { return !!st.done(S); } catch (e) { return false; }
  }

  function afterDone(st) {
    if (!st.after || !st.after.length) return true;
    for (var i = 0; i < st.after.length; i++) if (!isDone(st.after[i])) return false;
    return true;
  }

  function markDone(id, silent) {
    if (!S.tut.done[id]) {
      S.tut.done[id] = 1;
      queueSave();
    }
    if (!silent && typeof toast === 'function') {
      var st = stepById(id);
      if (st) toast('✅ ' + st.title.replace(/^[^\s]+\s/, ''), 'Шаг обучения пройден');
    }
    mem.hiddenUntil = 0;
    mem.key = '';
  }

  function queueSave() {
    if (mem.saveTimer) return;
    mem.saveTimer = setTimeout(function () {
      mem.saveTimer = null;
      try { if (typeof saveGame === 'function') saveGame(); } catch (e) { /* ignore */ }
    }, 900);
  }

  function doneCount() {
    var n = 0;
    for (var i = 0; i < STEPS.length; i++) if (isDone(STEPS[i].id)) n++;
    return n;
  }

  // ─── Разрешение текущего шага ───────────────────────────────
  function resolveStep() {
    for (var guard = 0; guard < STEPS.length + 5; guard++) {
      var found = null;
      for (var i = 0; i < STEPS.length; i++) {
        var st = STEPS[i];
        if (isDone(st.id)) continue;
        if (!afterDone(st)) continue;
        if (!whenStep(st)) continue;
        if (st.mode === 'action' && actionDone(st)) {
          markDone(st.id, true);
          found = 'retry';
          break;
        }
        found = st;
        break;
      }
      if (found === 'retry') continue;
      return found;
    }
    return null;
  }

  // ─── Подсветка ──────────────────────────────────────────────
  function pulse(target) {
    if (mem.pulseEl) {
      try { mem.pulseEl.classList.remove('tutorial-pulse'); } catch (e) { /* ignore */ }
      mem.pulseEl = null;
    }
    if (!target) return;
    var el = null;
    try { el = document.querySelector(target); } catch (e) { el = null; }
    if (!el) return;
    var cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0)) return;
    el.classList.add('tutorial-pulse');
    mem.pulseEl = el;
  }

  function isOverlayBlocked() {
    try {
      if (document.querySelector('.modal.show')) return true;
      if (document.querySelector('.guide-overlay')) return true;
      if (document.querySelector('.lore-overlay')) return true;
      if (document.querySelector('.tut-panel-overlay')) return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  // ─── Куда ведёт шаг ─────────────────────────────────────────
  function openTarget(st) {
    if (st.open) {
      try { st.open(); } catch (e) { /* ignore */ }
      return true;
    }
    if (st.target) {
      var el = null;
      try { el = document.querySelector(st.target); } catch (e) { el = null; }
      if (el) {
        pulse(st.target);
        if (typeof toast === 'function') toast('Подсказка', 'Смотри на подсвеченный элемент');
        return true;
      }
    }
    if (typeof toast === 'function') toast('Подсказка', 'Действие выполняется прямо на экране');
    return false;
  }

  // ─── Отрисовка подсказки ────────────────────────────────────
  function render() {
    ensureState();
    var el = document.getElementById('tutorialOverlay');
    if (!el) return;
    if (!S || !S.tut || S.tut.off) { hideBubble(el); return; }
    if (isOverlayBlocked()) { hideBubble(el); return; }

    var t = now();

    // Ручной просмотр шага из панели (не меняет прогресс).
    var focusStep = null;
    if (mem.focusId && t < mem.focusUntil) {
      focusStep = stepById(mem.focusId);
    } else if (mem.focusId) {
      mem.focusId = null;
      mem.key = '';
    }

    var st = focusStep || resolveStep();
    if (!st) {
      hideBubble(el);
      pulse(null);
      mem.key = '';
      if (!mem.completedToast && doneCount() >= STEPS.length) {
        mem.completedToast = true;
        if (typeof toast === 'function') toast('🎓 Обучение завершено', 'Все шаги пройдены. Гид и обучение — в меню ⚙');
      }
      return;
    }

    // info-шаг сам перелистывается
    if (!focusStep && st.mode === 'info' && mem.lastStepId === st.id && mem.shownAt) {
      var limit = st.autoNext || 8000;
      if (t - mem.shownAt >= limit) {
        markDone(st.id, true);
        mem.lastStepId = null;
        mem.key = '';
        render();
        return;
      }
    }

    if (mem.lastStepId !== st.id) {
      mem.lastStepId = st.id;
      mem.key = '';
      mem.hiddenUntil = 0;
      mem.stepSince = t;
      pulse(st.target);
      if (st.mode === 'action' && st.done && actionDone(st)) {
        markDone(st.id, true);
        render();
        return;
      }
      if (st.mode === 'info') mem.shownAt = t;
      else mem.shownAt = 0;
    }

    // Анти-зависание: шаг-действие не должен блокировать обучение
    // навсегда (например, у игрока пока нет ресурсов на флот).
    if (!focusStep && st.mode === 'action' && mem.lastStepId === st.id && mem.stepSince) {
      var maxWait = st.maxWait || 240000;
      if (t - mem.stepSince >= maxWait) {
        markDone(st.id, true);
        mem.lastStepId = null;
        mem.key = '';
        render();
        return;
      }
    }

    if (!focusStep && mem.hiddenUntil && t < mem.hiddenUntil) { hideBubble(el); return; }

    var key = st.id + '|' + (focusStep ? 'f' : 'n') + '|' + (st.title || '');
    if (key === mem.key) {
      if (el.style.display !== 'flex' && (!mem.hiddenUntil || t >= mem.hiddenUntil)) {
        el.style.display = 'flex';
      }
      return;
    }
    mem.key = key;

    var idx = STEPS.indexOf(st);
    var total = STEPS.length;
    var ch = chapterById(st.ch) || { tag: 'ШАГ', title: '' };
    var chSteps = STEPS.filter(function (x) { return x.ch === st.ch; });
    var chDone = chSteps.filter(function (x) { return isDone(x.id); }).length;
    var pct = Math.round((doneCount() / total) * 100);

    el.style.display = 'flex';
    el.innerHTML =
      '<div class="tutorial-bubble tut-bubble" role="dialog" aria-live="polite">' +
        '<div class="tut-topline">' +
          '<span class="tut-badge">' + esc(ch.tag) + '</span>' +
          '<span class="tut-count">' + (idx + 1) + '/' + total + ' · ' + chDone + '/' + chSteps.length + ' в главе</span>' +
        '</div>' +
        '<div class="tut-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="tutorial-title">' + esc(st.title) + '</div>' +
        '<div class="tutorial-sub">' + esc(st.sub) + '</div>' +
        '<div class="tut-actions">' +
          (st.mode === 'action'
            ? '<span class="tut-wait">Ждём действие…</span>'
            : '<button type="button" class="tut-btn tut-open">Где это?</button>') +
          '<button type="button" class="tut-btn tut-ok">Понятно</button>' +
        '</div>' +
      '</div>';

    var bubble = el.querySelector('.tut-bubble');
    if (bubble) {
      var ok = bubble.querySelector('.tut-ok');
      if (ok) ok.addEventListener('click', function (ev) {
        ev.stopPropagation();
        onAck(st, focusStep);
      });
      var op = bubble.querySelector('.tut-open');
      if (op) op.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openTarget(st);
        mem.hiddenUntil = now() + 15000;
        hideBubble(el);
      });
      bubble.addEventListener('click', function (ev) {
        // Клик по пустому месту не должен закрывать шаг действия.
        if (ev.target === bubble && st.mode === 'info') onAck(st, focusStep);
      });
    }

    mem.hideAt = now() + (st.mode === 'action' ? 18000 : Math.max(9000, (st.autoNext || 8000) + 2500));
  }

  function onAck(st, focusStep) {
    if (focusStep) {
      mem.focusId = null;
      mem.key = '';
      mem.hiddenUntil = 0;
      hideBubble(document.getElementById('tutorialOverlay'));
      return;
    }
    if (st.mode === 'info') {
      markDone(st.id, true);
      mem.lastStepId = null;
      mem.key = '';
    } else {
      // Шаг-действие: прячем на время, но не считаем пройденным.
      mem.hiddenUntil = now() + 60000;
      mem.key = '';
    }
    hideBubble(document.getElementById('tutorialOverlay'));
  }

  function hideBubble(el) {
    if (!el) el = document.getElementById('tutorialOverlay');
    if (!el) return;
    var b = el.querySelector('.tut-bubble');
    if (b) b.classList.add('tutorial-hide');
    el.style.display = 'none';
    if (el.innerHTML && !b) el.innerHTML = '';
  }

  // ─── Панель «Обучение» ──────────────────────────────────────
  function closePanel() {
    var p = document.querySelector('.tut-panel-overlay');
    if (p && p.parentNode) p.parentNode.removeChild(p);
  }

  function openPanel() {
    ensureState();
    closePanel();
    var total = STEPS.length;
    var done = doneCount();
    var current = resolveStep();

    var html =
      '<div class="tut-panel" role="dialog" aria-label="Обучение">' +
        '<div class="tut-panel-head">' +
          '<div>' +
            '<div class="tut-panel-title">🎓 Обучение</div>' +
            '<div class="tut-panel-sub">Пошаговый разбор фаз и механик</div>' +
          '</div>' +
          '<button class="tut-panel-x" type="button" aria-label="Закрыть">×</button>' +
        '</div>' +
        '<div class="tut-panel-progress">' +
          '<div class="tut-panel-progress-text"><b>' + done + '</b> из ' + total + ' шагов · ' + Math.round(done / total * 100) + '%</div>' +
          '<div class="tut-bar tut-bar--big"><i style="width:' + Math.round(done / total * 100) + '%"></i></div>' +
        '</div>' +
        '<div class="tut-panel-body">';

    for (var c = 0; c < CHAPTERS.length; c++) {
      var ch = CHAPTERS[c];
      var list = STEPS.filter(function (x) { return x.ch === ch.id; });
      if (!list.length) continue;
      var cdone = list.filter(function (x) { return isDone(x.id); }).length;
      html += '<div class="tut-chapter">' +
        '<div class="tut-chapter-head"><span class="tut-badge">' + esc(ch.tag) + '</span>' +
        '<span class="tut-chapter-title">' + esc(ch.title) + '</span>' +
        '<span class="tut-chapter-count">' + cdone + '/' + list.length + '</span></div>';
      for (var i = 0; i < list.length; i++) {
        var st = list[i];
        var status = isDone(st.id) ? 'done' : (current && current.id === st.id ? 'now' : 'later');
        var icon = status === 'done' ? '✅' : (status === 'now' ? '▶️' : '○');
        var where = st.target ? 'Где: ' + st.target : 'Где: на игровом экране';
        html += '<details class="tut-step tut-step--' + status + '"' + (status === 'now' ? ' open' : '') + '>' +
          '<summary><span class="tut-step-ico">' + icon + '</span>' +
          '<span class="tut-step-title">' + esc(st.title) + '</span></summary>' +
          '<div class="tut-step-body"><div>' + esc(st.sub) + '</div>' +
          '<div class="tut-step-where">' + esc(where) + '</div></div>' +
        '</details>';
      }
      html += '</div>';
    }

    html += '</div>' +
      '<div class="tut-panel-foot">' +
        (S.tut.off
          ? '<button class="tut-btn tut-panel-resume" type="button">▶️ Продолжить обучение</button>'
          : '<button class="tut-btn tut-panel-pause" type="button">⏸ Пауза</button>') +
        '<button class="tut-btn tut-panel-reset" type="button">🔄 Сбросить прогресс</button>' +
        '<button class="tut-btn tut-panel-ok" type="button">Закрыть</button>' +
      '</div>' +
    '</div>';

    var root = document.createElement('div');
    root.className = 'tut-panel-overlay';
    root.innerHTML = html;

    var x = root.querySelector('.tut-panel-x');
    if (x) x.addEventListener('click', closePanel);
    var ok = root.querySelector('.tut-panel-ok');
    if (ok) ok.addEventListener('click', closePanel);
    var reset = root.querySelector('.tut-panel-reset');
    if (reset) reset.addEventListener('click', function () { resetProgress(); closePanel(); });
    var pause = root.querySelector('.tut-panel-pause');
    if (pause) pause.addEventListener('click', function () {
      S.tut.off = true; queueSave(); closePanel();
      if (typeof toast === 'function') toast('Обучение на паузе', 'Включить снова: ⚙ → 🎓 Обучение');
    });
    var resume = root.querySelector('.tut-panel-resume');
    if (resume) resume.addEventListener('click', function () {
      S.tut.off = false; queueSave(); closePanel();
      if (typeof toast === 'function') toast('Обучение включено', 'Продолжаем с текущего шага');
    });
    root.addEventListener('click', function (ev) { if (ev.target === root) closePanel(); });

    document.body.appendChild(root);
    if (typeof S !== 'undefined' && S && S.tut) S.tut.off = S.tut.off; // no-op: сохраняем ссылку для читаемости
  }

  function resetProgress() {
    ensureState();
    S.tut.done = {};
    S.tut.off = false;
    S.tut.migrated = 1;
    S.tut.isNew = true;
    mem.key = '';
    mem.lastStepId = null;
    mem.hiddenUntil = 0;
    mem.completedToast = false;
    queueSave();
    if (typeof toast === 'function') toast('🎓 Обучение сброшено', 'Начинаем с первых шагов');
  }

  function status() {
    ensureState();
    return {
      total: STEPS.length,
      done: doneCount(),
      current: resolveStep(),
      off: !!(S && S.tut && S.tut.off)
    };
  }

  // ─── Инициализация ──────────────────────────────────────────
  function init() {
    ensureState();
    ready = true;
    window.Tutorial = {
      version: VERSION,
      steps: STEPS,
      chapters: CHAPTERS,
      render: render,
      openPanel: openPanel,
      reset: resetProgress,
      status: status,
      done: isDone,
      markDone: markDone
    };
    window.openTutorialPanel = openPanel;
    window.resetTutorial = resetProgress;
    // Первый рендер — после того как UI точно построен.
    setTimeout(render, 600);
  }

  init();
})();
