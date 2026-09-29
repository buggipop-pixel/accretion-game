// ═══════════════════════════════════════════════════════════════
//  EVOLUTION.JS — эволюционные окна и переходы фаз
// ═══════════════════════════════════════════════════════════════

let evolutionModalOpen = false;

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

function openEvolution() {
  if (evolutionModalOpen) return;
  if (S.activeMinigame) return;
  const stage = S.stage;

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
 
