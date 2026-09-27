// ═══════════════════════════════════════════════════════════════
//  EVOLUTION.JS — эволюционные окна, выбор звезды, планет, систем
// ═══════════════════════════════════════════════════════════════

let evolutionModalOpen = false;

// ─── ПРОВЕРКА КАЖДЫЙ КАДР ───────────────────────────────────────
function checkEvolution() {
  if (evolutionModalOpen) return;
  const modal = document.getElementById('modal');
  if (modal && modal.classList.contains('show')) return;

  if (S.stage === 'system' && S.planets.length >= 8) {
    openEvolution();
    return;
  }
  const goal = currentGoal();
  if (goal === null) return;
  if (S.dust >= goal) openEvolution();
}

// ─── ГЛАВНЫЙ ДИСПЕТЧЕР ──────────────────────────────────────────
function openEvolution() {
  const stage = S.stage;

  if (stage === 'cloud') {
    setModal(buildModal(
      'Сжатие облака',
      'Пыль собрана в плотное облако. Гравитация начинает сжимать его.',
      [{
        id: 'go', name: 'Запустить коллапс',
        desc: 'Облако сжимается, формируется ядро',
        stats: 'Переход к уплотнению',
        color: '#6b4de6', icon: '🌀',
      }]
    ), {
      go: () => {
        S.stage = 'condense';
        toast('Коллапс начался', 'Гравитация берёт верх');
      }
    });
    return;
  }

  if (stage === 'condense') {
    // Выбор спектрального класса
    const choices = Object.keys(STAR_TYPES).map(k => {
      const st = STAR_TYPES[k];
      return {
        id: k, name: st.name, desc: st.desc,
        stats: 'Доход ×' + st.rateMult + ' · ' +
               (st.civ ? 'Цив. до ' + st.maxCiv : 'Без цивилизаций'),
        color: 'hsl(' + st.color + ',' + st.sat + '%,' + st.light + '%)',
        icon: '⭐',
      };
    });
    setModal(buildModal(
      'Спектральный класс',
      'Выбери тип будущей звезды. Это определит судьбу системы.',
      choices
    ), buildHandlers(choices, (id) => {
      S.starType = id;
      const st = STAR_TYPES[id];
      toast(st.name, 'Ядро формируется');
      setTimeout(showSystemInfo, 400);
    }));
    return;
  }

  if (stage === 'protostar' || stage === 'firstPlanet') {
    const idx = S.planets.length;
    const cost = planetCost(idx);
    const choices = Object.keys(PLANET_TYPES).map(k => {
      const pt = PLANET_TYPES[k];
      const hasCiv = S.starType && STAR_TYPES[S.starType].civ;
      const canCiv = !pt.civ || hasCiv;
      const canAfford = S.dust >= cost;
      return {
        id: k, name: pt.name, desc: pt.desc,
        stats: '+' + pt.rate + '/с · ' +
               (canAfford ? 'Стоимость ' + fmt(cost)
                          : 'Не хватает ' + fmt(cost - S.dust)),
        color: pt.color, icon: '🪐',
        disabled: !canAfford || !canCiv,
      };
    });
    setModal(buildModal(
      'Первая планета',
      'Планета №' + (idx + 1) + '. Стоимость: ' + fmt(cost) + ' пыли.',
      choices
    ), buildHandlers(choices, (id) => {
      if (S.dust < cost) return;
      S.dust -= cost;
      addPlanet(id);
      if (S.stage === 'protostar' || S.stage === 'firstPlanet') {
        S.stage = 'system';
      }
      toast(PLANET_TYPES[id].name + ' сформирована',
            'Орбита ' + S.planets.length);
    }));
    return;
  }

  if (stage === 'system') {
    if (S.planets.length >= 8) {
      setModal(buildModal(
        'Система сформирована',
        'Все 8 планет на орбитах. Пора расширяться в галактику.',
        [{
          id: 'expand', name: 'Основать новую систему',
          desc: 'Отправить экспедицию к соседней звезде',
          stats: '+50% к глобальному доходу',
          color: '#6b4de6', icon: '🌌',
        }]
      ), {
        expand: () => {
          S.stage = 'galaxy';
          S.systems = 2;
          toast('Первая колония', 'Галактика расширяется');
        }
      });
      return;
    }
    const cost = planetCost(S.planets.length);
    const choices = Object.keys(PLANET_TYPES).map(k => {
      const pt = PLANET_TYPES[k];
      const hasCiv = S.starType && STAR_TYPES[S.starType].civ;
      const canCiv = !pt.civ || hasCiv;
      const canAfford = S.dust >= cost;
      return {
        id: k, name: pt.name, desc: pt.desc,
        stats: '+' + pt.rate + '/с · ' +
               (canAfford ? fmt(cost) : 'Нужно ' + fmt(cost)),
        color: pt.color, icon: '🪐',
        disabled: !canAfford || !canCiv,
      };
    });
    setModal(buildModal(
      'Новая планета',
      'Планета №' + (S.planets.length + 1) + '. Цена: ' + fmt(cost) + '.',
      choices
    ), buildHandlers(choices, (id) => {
      if (S.dust < cost) return;
      S.dust -= cost;
      addPlanet(id);
      toast(PLANET_TYPES[id].name + ' сформирована',
            'Орбита ' + S.planets.length);
    }));
    return;
  }

  if (stage === 'galaxy') {
    const cost = systemCost(S.systems - 1);
    const canAfford = S.dust >= cost;
    setModal(buildModal(
      'Новая система',
      'Стоимость системы №' + (S.systems + 1) + ': ' + fmt(cost) + ' пыли.',
      [{
        id: 'build', name: 'Основать систему',
        desc: 'Отправить корабль-ковчег',
        stats: canAfford ? '+50% к доходу' : 'Не хватает ' + fmt(cost - S.dust),
        color: '#8b5cf6', icon: '🌌',
        disabled: !canAfford,
      }]
    ), {
      build: () => {
        if (S.dust < cost) return;
        S.dust -= cost;
        S.systems++;
        toast('Система основана', 'Всего: ' + S.systems);
      }
    });
    return;
  }
}

// ─── ИНФО О ТИПАХ СИСТЕМ + БРОСОК ───────────────────────────────
function showSystemInfo() {
  const html = `
    <div class="modal-title">Формирование системы</div>
    <div class="modal-sub">При коллапсе может образоваться <b>одна, две или три</b> звезды. Чем больше звёзд — тем выше доход, но и нестабильнее орбиты.</div>
    <div class="info-box">
      <div class="row-stat"><span>⭐ Одиночная</span><span>50% шанс</span></div>
      <div class="sub-desc">Стабильные орбиты. Доход ×1.0. Без рисков.</div>
      <div class="row-stat"><span>✨ Двойная</span><span>38% шанс</span></div>
      <div class="sub-desc">Доход ×1.7. Редкие столкновения планет.</div>
      <div class="row-stat"><span>💫 Кратная</span><span>12% шанс</span></div>
      <div class="sub-desc">Доход ×2.5. Частые столкновения. Для опытных.</div>
    </div>
    <div class="choices">
      <button class="choice" data-id="create">
        <div class="choice-icon" style="background:#6b4de6">🌟</div>
        <div class="choice-body">
          <div class="choice-name">Создать звезду</div>
          <div class="choice-desc">Исход определится случайно</div>
        </div>
      </button>
    </div>`;
  setModalRaw(html, { create: doStarRoll });
}

function doStarRoll() {
  setModalRaw(`
    <div class="modal-title">Гравитационный коллапс</div>
    <div class="modal-sub">Облако сжимается...</div>
    <div class="collapse-anim"><span>✦</span><span>✦</span><span>✦</span></div>
  `, null);
  setTimeout(() => {
    const roll = Math.random();
    let type;
    if (roll < 0.50) type = 'single';
    else if (roll < 0.88) type = 'binary';
    else type = 'trinary';
    revealSystem(type);
  }, 1400);
}

function revealSystem(type) {
  S.systemType = type;
  const st = SYSTEM_TYPES[type];
  const html = `
    <div class="modal-title">Система сформирована</div>
    <div style="text-align:center;padding:20px 0">
      <div style="font-size:44px;letter-spacing:10px">${st.icon}</div>
      <div style="font-size:16px;font-weight:700;margin-top:12px;color:#fff">${st.name} система</div>
      <div style="font-size:11px;color:#a89ce0;margin-top:8px;line-height:1.5">${st.desc}</div>
      <div style="font-size:15px;color:#b9a8ff;font-weight:700;margin-top:14px">Доход ×${st.rateMult}</div>
    </div>
    <div class="choices">
      <button class="choice" data-id="done">
        <div class="choice-icon" style="background:#2eaa77">✓</div>
        <div class="choice-body"><div class="choice-name">Продолжить</div></div>
      </button>
    </div>`;
  setModalRaw(html, {
    done: () => {
      S.stage = 'protostar';
      setTimeout(() => {
        toast('🌟 Поздравляем!',
              'Звезда зажглась. Её гравитация собирает пыль за вас');
      }, 400);
    }
  });
}

// ─── ПОСТРОЕНИЕ HTML ────────────────────────────────────────────
function buildModal(title, sub, choices) {
  let html = '<div class="modal-title">' + title + '</div>';
  if (sub) html += '<div class="modal-sub">' + sub + '</div>';
  html += '<div class="choices">';
  for (const c of choices) {
    html += '<button class="choice" data-id="' + c.id + '"' +
            (c.disabled ? ' disabled' : '') + '>';
    html += '<div class="choice-icon" style="background:' + c.color +
            ';box-shadow:0 0 20px ' + c.color + '80">' +
            (c.icon || '') + '</div>';
    html += '<div class="choice-body">';
    html += '<div class="choice-name">' + c.name + '</div>';
    if (c.desc) html += '<div class="choice-desc">' + c.desc + '</div>';
    if (c.stats) html += '<div class="choice-stat">' + c.stats + '</div>';
    html += '</div></button>';
  }
  html += '</div>';
  return html;
}

function buildHandlers(choices, runFn) {
  const handlers = {};
  for (const c of choices) handlers[c.id] = () => runFn(c.id);
  return handlers;
}

// ─── ПОКАЗ МОДАЛА ───────────────────────────────────────────────
function setModal(html, handlers) {
  const modal = document.getElementById('modal');
  const card = document.getElementById('modalCard');
  card.innerHTML = html;
  modal.classList.add('show');
  evolutionModalOpen = true;
  card.querySelectorAll('.choice').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (btn.disabled) return;
      evolutionModalOpen = false;
      modal.classList.remove('show');
      if (handlers && handlers[id]) handlers[id]();
    });
  });
}

function setModalRaw(html, handlers) {
  setModal(html, handlers);
}

window.checkEvolution = checkEvolution;
window.openEvolution = openEvolution;
