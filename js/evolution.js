// ═══════════════════════════════════════════════════════════════
//  EVOLUTION.JS — эволюционные окна с минииграми и защитой
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

// ─── Безопасный вызов миниигры ──────────────────────────────────
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
    // Нет миниигры — просто выполняем переход
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
        'Облако готово к гравитационному коллапсу. Помоги собрать массу.',
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

  // ═══ ФАЗА II: выбор спектра ═══
  if (stage === 'condense') {
    if (!S.starType) {
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
      setModal(
        buildModal('Спектральный класс',
          'Выбери тип будущей звезды.', choices),
        buildHandlers(choices, (id) => {
          S.starType = id;
          closeEvolutionModal();
          toast(STAR_TYPES[id].name, 'Ядро формируется');
          setTimeout(showSystemInfo, 400);
        })
      );
      return;
    }
    if (!S.systemType) {
      closeEvolutionModal();
      showSystemInfo();
      return;
    }
    return;
  }

  // ═══ ФАЗА III → IV: зажигание ═══
  if (stage === 'protostar') {
    setModal(
      buildModal('Зажигание синтеза',
        'Ядро достигло критической температуры.',
        [{ id: 'ignite', name: 'Запустить синтез',
           desc: 'Тапай по ядру, чтобы разжечь звезду',
           stats: 'Переход к первой планете',
           color: '#ff9500', icon: '🔥' }]),
      { ignite: () => {
          tryMinigame('ignite', () => {
            S.stage = 'firstPlanet';
            toast('🌟 Поздравляем!', 'Звезда зажглась. Диск остывает');
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
            name: finalName,
            starType: 'G',
            systemType: 'single',
            planets: [],
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

// ─── Инфо о системах ────────────────────────────────────────────
function showSystemInfo() {
  const html = `
    <div class="modal-title">Формирование системы</div>
    <div class="modal-sub">Может образоваться <b>одна, две или три</b> звезды.</div>
    <div class="info-box">
      <div class="row-stat"><span>⭐ Одиночная</span><span>50%</span></div>
      <div class="sub-desc">Доход ×1.0. Стабильные орбиты.</div>
      <div class="row-stat"><span>✨ Двойная</span><span>38%</span></div>
      <div class="sub-desc">Доход ×1.7. Редкие столкновения.</div>
      <div class="row-stat"><span>💫 Кратная</span><span>12%</span></div>
      <div class="sub-desc">Доход ×2.5. Частые столкновения.</div>
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
  setModalRaw(
    '<div class="modal-title">Гравитационный коллапс</div>' +
    '<div class="modal-sub">Облако сжимается...</div>' +
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
      S.stage = 'protostar';
      closeEvolutionModal();
      toast('Протозвезда', 'Накапливай пыль до 200 000');
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
      if (handlers && handlers[id]) {
        handlers[id]();
      } else {
        closeEvolutionModal();
      }
    });
  });
}

function setModalRaw(html, handlers) {
  setModal(html, handlers);
}

window.checkEvolution = checkEvolution;
window.openEvolution = openEvolution;
