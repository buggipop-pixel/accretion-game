// ═══════════════════════════════════════════════════════════════
//  EVOLUTION.JS — эволюционные окна и переходы фаз
//  Фаза galaxy без модалки — системы создаются в main.js
// ═══════════════════════════════════════════════════════════════

let evolutionModalOpen = false;

// ─── Проверка перехода ──────────────────────────────────────────
function checkEvolution() {
  if (evolutionModalOpen) return;
  if (S.activeMinigame) return;
  const modal = document.getElementById('modal');
  if (modal && modal.classList.contains('show')) return;

  if (S.stage === 'system' && S.planets.length >= 8) { openEvolution(); return; }

  const goal = currentGoal();
  if (goal === null) return;
  if (S.dust >= goal) openEvolution();
}

// ─── Мини-игры ──────────────────────────────────────────────────
function tryMinigame(type, onSuccess) {
  closeEvolutionModal();
  if (typeof startMinigame === 'function') {
    try {
      startMinigame(type, function(success) {
        if (success) onSuccess();
        else toast('Не получилось', 'Возвращайся, когда будешь готов');
      });
    } catch (e) { console.warn('Minigame error:', e); onSuccess(); }
  } else { onSuccess(); }
}

function tryMinigameFull(type, onSuccess, onFail) {
  closeEvolutionModal();
  if (typeof startMinigame === 'function') {
    try {
      startMinigame(type, function(success) {
        if (success) onSuccess();
        else if (onFail) onFail();
        else toast('Не получилось', 'Возвращайся, когда будешь готов');
      });
    } catch (e) { console.warn('Minigame error:', e); onSuccess(); }
  } else { onSuccess(); }
}

function closeEvolutionModal() {
  evolutionModalOpen = false;
  const modal = document.getElementById('modal');
  if (modal) modal.classList.remove('show');
}

// ─── Подсказка: какие типы планет доступны ──────────────────────
// Возвращает { label, hint, types } — что можно собрать в системе
function getOrbitHint() {
  const star = S.starType || 'G';

  // Все типы, разрешённые для этой звезды
  const allTypes = (typeof getAllowedTypesForSystem === 'function')
    ? getAllowedTypesForSystem(star) : ['rocky', 'gasGiant', 'iceGiant'];

  // Какие орбиты свободны
  const freeTypes = [];
  for (let i = 0; i < 8; i++) {
    const orbitR = (typeof getOrbitR === 'function') ? getOrbitR(i) : 90 + i * 50;
    // Проверка занятости орбиты
    let occupied = false;
    for (let pi = 0; pi < S.planets.length; pi++) {
      if (Math.abs(S.planets[pi].baseOrbitR - orbitR) < 25) { occupied = true; break; }
    }
    if (occupied) continue;

    // Какие типы разрешены на этой орбите
    const allowed = (typeof getAllowedTypesAtOrbit === 'function')
      ? getAllowedTypesAtOrbit(star, i) : allTypes;
    for (let ai = 0; ai < allowed.length; ai++) {
      if (freeTypes.indexOf(allowed[ai]) === -1) freeTypes.push(allowed[ai]);
    }
  }

  const names = freeTypes.map(function(t) {
    return PLANET_TYPES[t] ? PLANET_TYPES[t].name : t;
  });

  return {
    label: 'Свободные орбиты',
    hint: names.length > 0
      ? 'Доступно: ' + names.join(', ')
      : 'Все орбиты заполнены',
    types: freeTypes,
  };
}
window.getOrbitHint = getOrbitHint;

// ─── Диспетчер эволюции ─────────────────────────────────────────
function openEvolution() {
  if (evolutionModalOpen) return;
  if (S.activeMinigame) return;
  const stage = S.stage;

  // ═══ ФАЗА I → II ═══
  if (stage === 'cloud') {
    setModal(buildModal('Критическая масса',
      'Облако готово к гравитационному коллапсу.',
      [{ id:'go', name:'Запустить коллапс', desc:'Собери критическую массу',
        stats:'Переход к уплотнению', color:'#6b4de6', icon:'🌀' }]),
      { go: function() {
          tryMinigame('mass', function() {
            S.stage = 'condense';
            toast('Коллапс начался', 'Гравитация сжимает облако');
          });
        }
      });
    return;
  }

  // ═══ ФАЗА II → III ═══
  if (stage === 'condense') {
    setModal(buildModal('Протозвезда формируется',
      'Плотное ядро разогревается.',
      [{ id:'go', name:'Продолжить', desc:'Начать накопление топлива',
        stats:'Цель: 200 000 пыли', color:'#ff9500', icon:'🔥' }]),
      { go: function() {
          S.stage = 'protostar';
          closeEvolutionModal();
          toast('Протозвезда', 'Накапливай пыль до 200 000');
        }
      });
    return;
  }

  // ═══ ФАЗА III → IV ═══
  if (stage === 'protostar') {
    setModal(buildModal('Зажги синтез',
      'Заполни шкалу и держи топливо 30 секунд.',
      [{ id:'ignite', name:'Запустить синтез',
        desc:'Качество зажигания определит тип звезды',
        stats:'От жёлтой G до красной M', color:'#ff9500', icon:'🔥' }]),
      { ignite: function() {
          tryMinigame('ignite', function() {
            const q = (typeof MG !== 'undefined' && MG.quality) ? MG.quality : 0.5;
            let starType;
            if (q >= 0.90) starType = 'M';
            else if (q >= 0.70) starType = 'B';
            else if (q >= 0.45) starType = 'K';
            else if (q >= 0.25) starType = 'A';
            else starType = 'G';
            S.starType = starType;
            showStarReveal(starType, q);
          });
        }
      });
    return;
  }

  // ═══ ФАЗА IV → V: первая планета ═══
  if (stage === 'firstPlanet') {
    const cost = planetCost(0);
    const canAfford = S.dust >= cost;
    const zone = getOrbitHint();

    setModal(buildModal('Сборка первой планеты',
      'Орбита 1 · Стоимость: ' + fmt(cost) + ' пыли.',
      [{ id:'go', name:'Начать сборку',
        desc: canAfford ? 'Собери планету из частиц' : 'Не хватает ' + fmt(cost - S.dust),
        stats: zone.hint,
        color:'#6b4de6', icon:'🪐', disabled: !canAfford }]),
      { go: function() {
          if (S.dust < cost) return;
          S.dust -= cost;
          tryMinigameFull('assemble',
            function() {
              const type = (typeof MG !== 'undefined' && MG.result) ? MG.result : 'rocky';
              const ok = addPlanet(type);
              S.stage = 'system';
              if (!ok) toast('⚠ Не удалось разместить', PLANET_TYPES[type].name);
              else toast(PLANET_TYPES[type].name + ' сформирована', 'Орбита 1');
            },
            function() {
              S.dust += cost;
              toast('Сборка не удалась', 'Возврат ' + fmt(cost) + ' пыли');
            }
          );
        }
      });
    return;
  }

  // ═══ ФАЗА V: остальные планеты ═══
  if (stage === 'system') {
    if (S.planets.length >= 8) {
      setModal(buildModal('Система сформирована',
        'Все 8 планет на орбитах. Пора расширяться.',
        [{ id:'expand', name:'Основать новую систему',
          desc:'Автоматически заселить соседнюю систему',
          stats:'+50% к глобальному доходу · Бесплатно',
          color:'#6b4de6', icon:'🌌' }]),
        { expand: function() {
            closeEvolutionModal();
            S.stage = 'galaxy';
            if (S.otherSystems.length === 0 || S.otherSystems[0] === undefined) {
              S.otherSystems[0] = null;
            }
            const newSys = generateRandomSystem({ isColony: true });
            const newIdx = S.otherSystems.length;
            S.otherSystems.push(newSys);
            S.systems++;
            S.totalSystemsCreated = (S.totalSystemsCreated || 1) + 1;
            toast('Система основана',
              newSys.name + ' · ' + STAR_TYPES[newSys.starType].name);
            if (typeof switchToSystem === 'function') switchToSystem(newIdx);
          }
        });
      return;
    }

    const cost = planetCost(S.planets.length);
    const canAfford = S.dust >= cost;
    const zone = getOrbitHint();

    setModal(buildModal('Сборка планеты №' + (S.planets.length + 1),
      'Орбита ' + (S.planets.length + 1) + ' · Стоимость: ' + fmt(cost) + ' пыли.',
      [{ id:'go', name:'Начать сборку',
        desc: canAfford ? 'Собери планету из частиц' : 'Не хватает ' + fmt(cost - S.dust),
        stats: zone.hint,
        color:'#6b4de6', icon:'🪐', disabled: !canAfford }]),
      { go: function() {
          if (S.dust < cost) return;
          S.dust -= cost;
          tryMinigameFull('assemble',
            function() {
              const type = (typeof MG !== 'undefined' && MG.result) ? MG.result : 'rocky';
              const ok = addPlanet(type);
              if (!ok) toast('⚠ Не удалось разместить', PLANET_TYPES[type].name);
              else toast(PLANET_TYPES[type].name + ' сформирована',
                         'Орбита ' + S.planets.length);
            },
            function() {
              S.dust += cost;
              toast('Сборка не удалась', 'Возврат ' + fmt(cost) + ' пыли');
            }
          );
        }
      });
    return;
  }
}

// ─── Показ звезды после зажигания ───────────────────────────────
function showStarReveal(starType, quality) {
  const st = STAR_TYPES[starType];
  let qualityText = '';
  if (quality >= 0.90) qualityText = '🔥 ИДЕАЛЬНОЕ ЗАЖИГАНИЕ';
  else if (quality >= 0.70) qualityText = '✨ Отличное зажигание';
  else if (quality >= 0.45) qualityText = '✓ Хорошее зажигание';
  else if (quality >= 0.25) qualityText = '~ Слабое зажигание';
  else qualityText = '💤 Едва тлеет';

  const html =
    '<div class="modal-title">Звезда зажглась</div>' +
    '<div class="modal-sub">' + qualityText + '</div>' +
    '<div style="text-align:center;padding:24px 0">' +
      '<div style="font-size:52px;letter-spacing:12px;color:hsl(' +
        st.color + ',' + st.sat + '%,' + st.light + '%);text-shadow:0 0 40px hsla(' +
        st.color + ',' + st.sat + '%,60%,0.8)">★</div>' +
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
        '<div class="choice-body"><div class="choice-name">Определить систему</div></div>' +
      '</button>' +
    '</div>';
  setModal(html, { next: function() { doSystemRoll(); } });
}

function doSystemRoll() {
  setModal('<div class="modal-title">Формирование системы</div>' +
    '<div class="modal-sub">Гравитационный коллапс...</div>' +
    '<div class="collapse-anim"><span>✦</span><span>✦</span><span>✦</span></div>', null);
  setTimeout(function() {
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
  setModal(html, {
    done: function() {
      S.stage = 'firstPlanet';
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
  for (let i = 0; i < choices.length; i++) {
    const c = choices[i];
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
  for (let i = 0; i < choices.length; i++) {
    const c = choices[i];
    handlers[c.id] = (function(id) {
      return function() { runFn(id); };
    })(c.id);
  }
  return handlers;
}

function setModal(html, handlers) {
  const modal = document.getElementById('modal');
  const card = document.getElementById('modalCard');
  card.innerHTML = html;
  modal.classList.add('show');
  evolutionModalOpen = true;
  const buttons = card.querySelectorAll('.choice');
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', function() {
      const id = this.dataset.id;
      if (this.disabled) return;
      if (handlers && handlers[id]) handlers[id]();
      else closeEvolutionModal();
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else { attach(); }
})();

window.checkEvolution = checkEvolution;
window.openEvolution = openEvolution;
window.closeEvolutionModal = closeEvolutionModal;
