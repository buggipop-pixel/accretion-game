// ═══════════════════════════════════════════════════════════════
//  EVOLUTION.JS — эволюционные окна с минииграми
//  Star type now determined by ignite quality
// ═══════════════════════════════════════════════════════════════

let evolutionModalOpen = false;

function checkEvolution() {
  if (evolutionModalOpen) return;
  if (S.activeMinigame) return;
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

function tryMinigame(type, onSuccess) {
  closeEvolutionModal();
  if (typeof startMinigame === 'function') {
    try {
      startMinigame(type, (success) => {
        if (success) onSuccess();
        else toast('Не получилось', 'Возвращайся, когда будешь готов');
      });
    } catch (e) {
      console.warn('Minigame error:', e);
      onSuccess();
    }
  } else {
    onSuccess();
  }
}

function closeEvolutionModal() {
  evolutionModalOpen = false;
  const modal = document.getElementById('modal');
  if (modal) modal.classList.remove('show');
}

// ─── Диспетчер ──────────────────────────────────────────────────
function openEvolution() {
  if (evolutionModalOpen) return;
  if (S.activeMinigame) return;
  const stage = S.stage;

  // ═══ ФАЗА I → II ═══
  if (stage === 'cloud') {
    setModal(
      buildModal('Критическая масса',
        'Облако готово к гравитационному коллапсу.',
        [{ id: 'go', name: 'Запустить коллапс',
           desc: 'Собери критическую массу в мини-игре',
           stats: 'Переход к уплотнению',
           color: '#6b4de6', icon: '🌀' }]),
      { go: () => {
          tryMinigame('mass', () => {
            S.stage = 'condense';
            toast('Коллапс начался', 'Гравитация сжимает облако');
          });
        }
      }
    );
    return;
  }

  // ═══ ФАЗА II → III: ядро формируется ═══
  if (stage === 'condense') {
    setModal(
      buildModal('Протозвезда формируется',
        'Плотное ядро разогревается. Скоро запустится термоядерный синтез.',
        [{ id: 'go', name: 'Продолжить',
           desc: 'Начать накопление топлива',
           stats: 'Следующая цель: 200 000 пыли',
           color: '#ff9500', icon: '🔥' }]),
      { go: () => {
          S.stage = 'protostar';
          closeEvolutionModal();
          toast('Протозвезда', 'Накапливай пыль до 200 000');
        }
      }
    );
    return;
  }

  // ═══ ФАЗА III → IV: зажигание + определение звезды ═══
  if (stage === 'protostar') {
    setModal(
      buildModal('Зажги синтез',
        'Ядро достигло критической температуры. Заполни шкалу и удержи 3 секунды.',
        [{ id: 'ignite', name: 'Запустить синтез',
           desc: 'Качество зажигания определит тип звезды',
           stats: 'От красного карлика до голубой звезды',
           color: '#ff9500', icon: '🔥' }]),
      { ignite: () => {
                    tryMinigame('ignite', () => {
            // ★ Тип звезды по остатку топлива:
            // 90%+ → M (красный карлик, rateMult 6) — очень сложно
            // 70-90% → B (голубая)
            // 45-70% → K (оранжевая)
            // 25-45% → A (белая)
            // 0-25%  → G (жёлтая) — самый слабый результат
            const q = (typeof MG !== 'undefined' && MG.quality) ? MG.quality : 0.5;
            let starType;
            if (q >= 0.90)      starType = 'M';
            else if (q >= 0.70) starType = 'B';
            else if (q >= 0.45) starType = 'K';
            else if (q >= 0.25) starType = 'A';
            else                starType = 'G';

            S.starType = starType;
            showStarReveal(starType, q);
          });
        }
      }
    );
    return;
  }

  // ═══ ФАЗА IV → V: первая планета ═══
  if (stage === 'firstPlanet') {
    const cost = planetCost(0);
    const choices = Object.keys(PLANET_TYPES).map(k => {
      const pt = PLANET_TYPES[k];
      const hasCiv = S.starType && STAR_TYPES[S.starType].civ;
      const canCiv = !pt.civ || hasCiv;
      const canAfford = S.dust >= cost;
      return {
        id: k, name: pt.name, desc: pt.desc,
        stats: '+' + pt.rate + '/с · ' +
               (canAfford ? 'Цена ' + fmt(cost) : 'Нужно ' + fmt(cost - S.dust)),
        color: pt.color, icon: '🪐',
        disabled: !canAfford || !canCiv,
      };
    });
    setModal(
      buildModal('Первая планета',
        'Выбери первую планету. Цена: ' + fmt(cost) + '.', choices),
      buildHandlers(choices, (id) => {
        if (S.dust < cost) return;
        S.dust -= cost;
        tryMinigame('accretion', () => {
          addPlanet(id);
          S.stage = 'system';
          toast(PLANET_TYPES[id].name + ' сформирована', 'Орбита 1');
        });
      })
    );
    return;
  }

  // ═══ ФАЗА V: остальные планеты ═══
  if (stage === 'system') {
    if (S.planets.length >= 8) {
      setModal(
        buildModal('Система сформирована',
          'Все 8 планет на орбитах. Пора расширяться.',
          [{ id: 'expand', name: 'Основать новую систему',
             desc: 'Отправить экспедицию к соседней звезде',
             stats: '+50% к глобальному доходу',
             color: '#6b4de6', icon: '🌌' }]),
        { expand: () => {
            S.stage = 'galaxy';
            S.systems = Math.max(S.systems, 2);
            S.totalSystemsCreated = Math.max(S.totalSystemsCreated || 1, 2);
            closeEvolutionModal();
            toast('Первая колония', 'Галактика расширяется');
          }
        }
      );
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
    setModal(
      buildModal('Новая планета',
        'Планета №' + (S.planets.length + 1) + '. Цена: ' + fmt(cost) + '.', choices),
      buildHandlers(choices, (id) => {
        if (S.dust < cost) return;
        S.dust -= cost;
        addPlanet(id);
        closeEvolutionModal();
        toast(PLANET_TYPES[id].name + ' сформирована', 'Орбита ' + S.planets.length);
      })
    );
    return;
  }

  // ═══ ФАЗА VI: расширение ═══
  if (stage === 'galaxy') {
    const cost = Math.floor(50e9 * Math.pow(4, S.systems - 1));
    const canAfford = S.dust >= cost;
    setModal(
      buildModal('Новая система',
        'Стоимость системы №' + (S.systems + 1) + ': ' + fmt(cost) + ' пыли.',
        [{ id: 'build', name: 'Основать систему',
           desc: canAfford ? 'Заложить фундамент' : 'Не хватает ' + fmt(cost - S.dust),
           stats: '+50% к доходу',
           color: '#8b5cf6', icon: '🌌',
           disabled: !canAfford }]),
      { build: () => {
          if (S.dust < cost) return;
          S.dust -= cost;
          const newName = prompt('Имя новой системы:', 'Система ' + (S.systems + 1));
          const finalName = (newName || 'Система ' + (S.systems + 1)).trim().slice(0, 16);
          S.otherSystems.push({
            name: finalName, starType: 'G',
            systemType: 'single', planets: [],
          });
          S.systems++;
          S.totalSystemsCreated = (S.totalSystemsCreated || 1) + 1;
          closeEvolutionModal();
          toast('Система основана', finalName + ' · Всего: ' + S.systems);
        }
      }
    );
    return;
  }
}

// ─── Показ звезды по итогу ignite ═══════════════════════════════
function showStarReveal(starType, quality) {
  const st = STAR_TYPES[starType];
  let qualityText = '';
  if (quality >= 0.75) qualityText = '🔥 ИДЕАЛЬНОЕ ЗАЖИГАНИЕ';
  else if (quality >= 0.55) qualityText = '✨ Отличное зажигание';
  else if (quality >= 0.35) qualityText = '✓ Хорошее зажигание';
  else if (quality >= 0.15) qualityText = '~ Слабое зажигание';
  else qualityText = '💤 Едва тлеет';

  const html =
    '<div class="modal-title">Звезда зажглась</div>' +
    '<div class="modal-sub">' + qualityText + '</div>' +
    '<div style="text-align:center;padding:24px 0">' +
      '<div style="font-size:52px;letter-spacing:12px;' +
        'color:hsl(' + st.color + ',' + st.sat + '%,' + st.light + '%);' +
        'text-shadow:0 0 40px hsla(' + st.color + ',' + st.sat + '%,60%,0.8)">★</div>' +
      '<div style="font-size:18px;font-weight:700;margin-top:14px;color:#fff">' +
        st.name + '</div>' +
      '<div style="font-size:11px;color:#a89ce0;margin-top:10px;line-height:1.5">' +
        st.desc + '</div>' +
      '<div style="font-size:15px;color:#b9a8ff;font-weight:700;margin-top:14px">' +
        'Доход ×' + st.rateMult + '</div>' +
    '</div>' +
    '<div class="choices">' +
      '<button class="choice" data-id="next">' +
        '<div class="choice-icon" style="background:#2eaa77">→</div>' +
        '<div class="choice-body"><div class="choice-name">' +
          'Определить систему</div></div>' +
      '</button>' +
    '</div>';
  setModalRaw(html, {
    next: () => {
      // Определяем тип системы (одиночная/двойная/кратная)
      doSystemRoll();
    }
  });
}

function doSystemRoll() {
  setModalRaw(
    '<div class="modal-title">Формирование системы</div>' +
    '<div class="modal-sub">Гравитационный коллапс...</div>' +
    '<div class="collapse-anim"><span>✦</span><span>✦</span><span>✦</span></div>',
    null
  );
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
  const html =
    '<div class="modal-title">Система сформирована</div>' +
    '<div style="text-align:center;padding:20px 0">' +
      '<div style="font-size:44px;letter-spacing:10px">' + st.icon + '</div>' +
      '<div style="font-size:16px;font-weight:700;margin-top:12px;color:#fff">' +
        st.name + ' система</div>' +
      '<div style="font-size:11px;color:#a89ce0;margin-top:8px;line-height:1.5">' +
        st.desc + '</div>' +
      '<div style="font-size:15px;color:#b9a8ff;font-weight:700;margin-top:14px">' +
        'Доход ×' + st.rateMult + '</div>' +
    '</div>' +
    '<div class="choices">' +
      '<button class="choice" data-id="done">' +
        '<div class="choice-icon" style="background:#2eaa77">✓</div>' +
        '<div class="choice-body"><div class="choice-name">Продолжить</div></div>' +
      '</button>' +
    '</div>';
  setModalRaw(html, {
        done: () => {
      S.stage = 'firstPlanet';
      // ★ Сбрасываем таймер газа — теперь он начнёт отсчёт с момента
      //   выбора звезды (или первой планеты)
      if (typeof resetGas === 'function') resetGas();
      closeEvolutionModal();
      toast('Диск остывает', 'Накопи 800 000 пыли для первой планеты');
    }
  });
}

// ─── Хелперы ────────────────────────────────────────────────────
function buildModal(title, sub, choices) {
  let html = '<div class="modal-title">' + title + '</div>';
  if (sub) html += '<div class="modal-sub">' + sub + '</div>';
  html += '<div class="choices">';
  for (const c of choices) {
    html += '<button class="choice" data-id="' + c.id + '"' +
            (c.disabled ? ' disabled' : '') + '>';
    html += '<div class="choice-icon" style="background:' + c.color +
            ';box-shadow:0 0 20px ' + c.color + '80">' + (c.icon || '') + '</div>';
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

function setModal(html, handlers) {
  const modal = document.getElementById('modal');
  const card = document.getElementById('modalCard');
  card.innerHTML = html;
  modal.classList.add('show');
  evolutionModalOpen = true;

  const buttons = card.querySelectorAll('.choice');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (btn.disabled) return;
      if (handlers && handlers[id]) handlers[id]();
      else closeEvolutionModal();
    });
  });
}

function setModalRaw(html, handlers) {
  setModal(html, handlers);
}

window.checkEvolution = checkEvolution;
window.openEvolution = openEvolution;
