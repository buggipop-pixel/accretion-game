// ═══════════════════════════════════════════════════════════════
//  EVOLUTION.JS — эволюционные окна и переходы фаз
//  Модалка galaxy удалена — системы создаются автоматически
//  в main.js, когда пыли достаточно.
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
    setModal(buildModal('Сборка первой планеты',
      'Собери планету из обломков. Стоимость: ' + fmt(cost) + ' пыли.',
      [{ id:'go', name:'Начать сборку',
        desc: canAfford ? 'Собери планету из частиц' : 'Не хватает ' + fmt(cost - S.dust),
        stats:'Тип планеты зависит от состава',
        color:'#6b4de6', icon:'🪐', disabled: !canAfford }]),
      { go: function() {
          if (S.dust < cost) return;
          S.dust -= cost;
          tryMinigameFull('assemble',
            function() {
              const type = (typeof MG !== 'undefined' && MG.result) ? MG.result : 'rocky';
              const orbitR = 90 + S.planets.length * 50;
              const corrected = (typeof correctPlanetTypeByZone === 'function')
                ? correctPlanetTypeByZone(type, orbitR) : { type: type, reason: null };
              addPlanet(corrected.type);
              S.stage = 'system';
              if (corrected.reason) toast('⚠ ' + corrected.reason, PLANET_TYPES[corrected.type].name);
              else toast(PLANET_TYPES[corrected.type].name + ' сформирована', 'Орбита 1');
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
            // Первая система — обитаемая (как из экспедиции)
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
    setModal(buildModal('Сборка планеты №' + (S.planets.length + 1),
      'Стоимость входа: ' + fmt(cost) + ' пыли.',
      [{ id:'go', name:'Начать сборку',
        desc: canAfford ? 'Собери планету из частиц' : 'Не хватает ' + fmt(cost - S.dust),
        stats:'Тип планеты зависит от состава',
        color:'#6b4de6', icon:'🪐', disabled: !canAfford }]),
      { go: function() {
          if (S.dust < cost) return;
          S.dust -= cost;
          tryMinigameFull('assemble',
            function() {
              const type = (typeof MG !== 'undefined' && MG.result) ? MG.result : 'rocky';
              const orbitR = 90 + S.planets.length * 50;
              const corrected = (typeof correctPlanetTypeByZone === 'function')
                ? correctPlanetTypeByZone(type, orbitR) : { type: type, reason: null };
              addPlanet(corrected.type);
              if (corrected.reason) toast('⚠ ' + corrected.reason, PLANET_TYPES[corrected.type].name);
              else toast(PLANET_TYPES[corrected.type].name + ' сформирована',
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

  // Фаза galaxy — без модалки, системы создаются автоматически в main.js
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

window.checkEvolution = checkEvolution;
window.openEvolution = openEvolution;
window.closeEvolutionModal = closeEvolutionModal;
