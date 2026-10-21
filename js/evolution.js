// ═══════════════════════════════════════════════════════════════
//  EVOLUTION.JS — переходы фаз, heat-таймер III, сборка планет
// ═══════════════════════════════════════════════════════════════

let evolutionModalOpen = false;
let evolutionSuppressUntil = 0;
let _protostarTimerStart = 0;
let _protostarTimerActive = false;

// ─── Проверка перехода ──────────────────────────────────────────
function checkEvolution() {
  if (evolutionModalOpen) return;
  if (performance.now() < evolutionSuppressUntil) return;
  if (S.activeMinigame) return;
  if (S.stage === 'protostar') return;
  if (S.stage === 'galaxy') return;
  if (S.stage === 'system' && S.prestigeLevel > 0) return;

  const modal = document.getElementById('modal');
  if (modal && modal.classList.contains('show')) return;

  if (S.stage === 'system') {
    if (S.planets.length >= 8) { openEvolution(); return; }
    if (!_canPlaceAnyPlanet()) return;
    if (S.dust >= currentGoal()) openEvolution();
    return;
  }

  const goal = currentGoal();
  if (goal === null) return;
  if (S.dust >= goal) openEvolution();
}

function _canPlaceAnyPlanet() {
  if (S.planets.length >= 8) return false;
  if (typeof getAllowedOrbitsForType !== 'function') return true;
  if (typeof getOrbitR !== 'function') return true;

  const allTypes = ['rocky', 'lava', 'iceGiant', 'gasGiant'];
  const gap = (typeof ORBIT_GEOMETRY !== 'undefined' && ORBIT_GEOMETRY.minGap)
    ? ORBIT_GEOMETRY.minGap : 25;

  for (let ti = 0; ti < allTypes.length; ti++) {
    const orbits = getAllowedOrbitsForType(S.starType, allTypes[ti]);
    if (!orbits || orbits.length === 0) continue;
    for (let oi = 0; oi < orbits.length; oi++) {
      const orbitR = getOrbitR(orbits[oi]);
      let free = true;
      for (let pi = 0; pi < S.planets.length; pi++) {
        if (Math.abs(S.planets[pi].baseOrbitR - orbitR) < gap) { free = false; break; }
      }
      if (free) return true;
    }
  }
  return false;
}

// ─── Таймер фазы III ────────────────────────────────────────────
function tickProtostar(dt) {
  if (S.stage !== 'protostar') { _protostarTimerActive = false; return; }
  if (!_protostarTimerActive) {
    _protostarTimerStart = performance.now();
    _protostarTimerActive = true;
    if (typeof S.protostarHeat !== 'number') S.protostarHeat = 0;
  }

  const b = (CFG.activeBoost && CFG.activeBoost.protostar) || {};
  const elapsed = (performance.now() - _protostarTimerStart) / 1000;
  const decay = (b.heatDecayBase || 0.10) *
                (1 + elapsed * (b.heatDecayAccel || 0.18));

  S.protostarHeat = Math.max(0, (S.protostarHeat || 0) - decay * dt);

  if (elapsed >= (b.duration || 30)) {
    _protostarTimerActive = false;
    finishProtostar();
  }
}

function startProtostarTimer() {
  _protostarTimerStart = performance.now();
  _protostarTimerActive = true;
}

function getProtostarTimeLeft() {
  if (S.stage !== 'protostar' || !_protostarTimerActive) return 0;
  const b = (CFG.activeBoost && CFG.activeBoost.protostar) || {};
  const duration = b.duration || 30;
  const elapsed = (performance.now() - _protostarTimerStart) / 1000;
  return Math.max(0, duration - elapsed);
}

function finishProtostar() {
  const b = (CFG.activeBoost && CFG.activeBoost.protostar) || {};
  const heat = S.protostarHeat || 0;
  S.lastIgnitionQuality = heat;

  const thresholds = b.starThresholds || [
    { q: 0.90, star: 'M', color: '#ff3030' },
    { q: 0.70, star: 'B', color: '#5577ff' },
    { q: 0.45, star: 'K', color: '#ff9944' },
    { q: 0.25, star: 'A', color: '#ccccff' },
    { q: 0.00, star: 'G', color: '#ffcc55' },
  ];
  let starType = 'G', starColor = '#ffcc55';
  for (let i = 0; i < thresholds.length; i++) {
    if (heat >= thresholds[i].q) {
      starType = thresholds[i].star;
      starColor = thresholds[i].color;
      break;
    }
  }
  S.starType = starType;

  _ignitionFlash(starColor);

  if (typeof resetAllParticlesToSpiral === 'function') {
    resetAllParticlesToSpiral();
  }

  S.systemType = (typeof rollSystemType === 'function') ? rollSystemType() : 'single';

  if (typeof resetGas === 'function') resetGas();

  setTimeout(function() {
    S.stage = 'firstPlanet';
    const st = STAR_TYPES[starType];
    const sysSt = SYSTEM_TYPES[S.systemType];

    toast('★ ' + st.name, sysSt.name + ' система · доход ×' + st.rateMult);

    setTimeout(function() {
      if (typeof showLoreCard === 'function') {
        showLoreCard('firstPlanet', function() {
          setTimeout(function() {
            toast('Диск остывает',
              'Накопи ' + fmt(planetCost(0)) + ' пыли для первой планеты');
          }, 5000);
        });
      }
    }, 10000);
  }, 900);
}

function _ignitionFlash(color) {
  const f = document.createElement('div');
  f.style.cssText =
    'position:fixed;inset:0;background:' + color + ';opacity:0;' +
    'pointer-events:none;z-index:9998;transition:opacity 0.15s ease;';
  document.body.appendChild(f);
  requestAnimationFrame(function() { f.style.opacity = '0.7'; });
  setTimeout(function() {
    f.style.opacity = '0';
    setTimeout(function() { f.remove(); }, 300);
  }, 400);
}

// ─── Модалка ────────────────────────────────────────────────────
function closeEvolutionModal() {
  evolutionModalOpen = false;
  const modal = document.getElementById('modal');
  if (modal) modal.classList.remove('show');
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

function getOrbitHint() {
  const star = S.starType || 'G';
  const allTypes = (typeof getAllowedTypesForSystem === 'function')
    ? getAllowedTypesForSystem(star) : ['rocky', 'gasGiant', 'iceGiant'];
  const freeTypes = [];
  for (let i = 0; i < 8; i++) {
    const orbitR = (typeof getOrbitR === 'function') ? getOrbitR(i) : 90 + i * 50;
    let occupied = false;
    for (let pi = 0; pi < S.planets.length; pi++) {
      if (Math.abs(S.planets[pi].baseOrbitR - orbitR) < 25) { occupied = true; break; }
    }
    if (occupied) continue;
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
    hint: names.length > 0 ? 'Доступно: ' + names.join(', ') : 'Все орбиты заполнены',
    types: freeTypes,
  };
}
window.getOrbitHint = getOrbitHint;

function assembleRulesHTML() {
  return '<div style="margin-top:10px;font-size:11px;line-height:1.6;color:#b9a8ff;text-align:left">' +
    '<b>Как играть:</b> тяни шары по одному — при касании они сливаются.<br>' +
    'Шар растёт до массы 4 и фиксируется как планета. На сборку 30 секунд.' +
    '</div>';
}

// ─── Общий обработчик успеха сборки ─────────────────────────────
function _handlePlanetPlaced() {
  const wasFirst = (S.stage === 'firstPlanet');
  const preferred = (typeof MG !== 'undefined' && MG.result) ? MG.result : 'rocky';
  const placedType = addPlanet(preferred);
  closeEvolutionModal();

  if (wasFirst && placedType) {
    S.stage = 'system';
  }

  if (!placedType) {
    toast('⚠ Система заполнена', 'Все орбиты заняты планетами');
  } else if (placedType !== preferred) {
    toast(PLANET_TYPES[placedType].name + ' (вместо ' + PLANET_TYPES[preferred].name + ')',
          'Орбита для ' + PLANET_TYPES[preferred].name + ' была занята');
    if (typeof logPlanetFormed === 'function') logPlanetFormed(PLANET_TYPES[placedType].name);
  } else {
    toast(PLANET_TYPES[placedType].name + ' сформирована', 'Новая планета в системе');
    if (typeof logPlanetFormed === 'function') logPlanetFormed(PLANET_TYPES[placedType].name);
  }
}

function _buildPlanetModal(stepNumber, titleOverride) {
  if (S.stage === 'galaxy') return;
  if (S.prestigeLevel > 0) return;

  const cost = planetCost(S.planets.length);
  const canAfford = S.dust >= cost;
  const zone = getOrbitHint();
  const title = titleOverride
    || (stepNumber === 1 ? 'Сборка первой планеты' : ('Сборка планеты №' + stepNumber));

  setModal(buildModal(title,
    'Стоимость: ' + fmt(cost) + ' пыли.' + assembleRulesHTML(),
    [{ id:'go', name:'Начать сборку',
      desc: canAfford ? 'Собери планету из частиц' : 'Не хватает ' + fmt(cost - S.dust),
      stats: zone.hint,
      color:'#6b4de6', icon:'🪐', disabled: !canAfford }]),
    { go: function() {
        if (S.dust < cost) return;
        S.dust -= cost;
        tryMinigameFull('assemble',
          _handlePlanetPlaced,
          function() {
            S.dust += cost;
            evolutionSuppressUntil = performance.now() + 3000;
            toast('Сборка не удалась', 'Возврат ' + fmt(cost) + ' пыли');
          }
        );
      }
    });
}

// ─── Диспетчер ──────────────────────────────────────────────────
function openEvolution() {
  if (evolutionModalOpen) return;
  if (S.activeMinigame) return;
  if (S.stage === 'protostar') return;
  if (S.stage === 'galaxy') return;
  if (S.stage === 'system' && S.prestigeLevel > 0) return;

  const stage = S.stage;

  if (stage === 'cloud') {
    S.stage = 'condense';
    S.phaseProgress.cloud = 0;
    closeEvolutionModal();
    showLoreCard('condense', function() {
      setTimeout(function() {
        toast('Коллапс начался', 'Гравитация сжимает облако');
      }, 5000);
    });
    return;
  }

  if (stage === 'condense') {
    S.stage = 'protostar';
    S.phaseProgress.condense = 0;
    S.protostarHeat = 0.2;
    closeEvolutionModal();
    startProtostarTimer();
    showLoreCard('protostar', function() {
      setTimeout(function() {
        toast('Протозвезда', 'Тапай по экрану — держи жар!');
      }, 5000);
    });
    return;
  }

  if (stage === 'firstPlanet') {
    _buildPlanetModal(1, 'Сборка первой планеты');
    return;
  }

  if (stage === 'system') {
    if (S.planets.length >= 8) {
      closeEvolutionModal();
      S.stage = 'galaxy';
      if (S.otherSystems.length === 0 || S.otherSystems[0] === undefined) {
        S.otherSystems[0] = null;
      }
      setTimeout(function() {
        toast('Система сформирована', 'Пора расширяться — купи новую систему');
      }, 500);
      return;
    }
    _buildPlanetModal(S.planets.length + 1);
    return;
  }
}

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

window.checkEvolution = checkEvolution;
window.openEvolution = openEvolution;
window.closeEvolutionModal = closeEvolutionModal;
window.tickProtostar = tickProtostar;
window.startProtostarTimer = startProtostarTimer;
window.getProtostarTimeLeft = getProtostarTimeLeft;