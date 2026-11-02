// ═══════════════════════════════════════════════════════════════
//  LORE.JS — обучающие анимированные карточки фаз
//  Показываются при ПЕРВОМ входе в фазу. При престиже — пропускаются.
// ═══════════════════════════════════════════════════════════════

const LORE = {
  cloud: {
    tag: 'ФАЗА I · ОБЛАКО',
    title: 'Молекулярное облако',
    text: 'Холодный водород дрейфует в пустоте миллиарды лет. Каждая пылинка — будущее светило.',
    goal: 'собрать 2 000 ✦ пыли',
    steps: [
      'Зажми палец и веди по экрану — пыль потянется за ним.',
      'Отпусти палец: пылинки упадут в ядро и превратятся в ✦ пыль.',
      'Заполни кольцо фазы внизу и нажми кнопку «Эволюция».',
    ],
    hint: 'Веди палец рядом с пылинками — они ускоряются к ядру и быстрее превращаются в пыль.',
    anim: 'cloud',
  },
  condense: {
    tag: 'ФАЗА II · ПРОТОПЛАНЕТНЫЙ ДИСК',
    title: 'Протопланетный диск',
    text: 'Облако сжалось. Частицы вращаются вокруг ядра, сталкиваются и слипаются в комки.',
    goal: 'накопить 25 000 ✦ пыли',
    steps: [
      'Води пальцем по кругу вокруг центра — раскручивай диск.',
      'Быстрое вращение ускоряет слияние частиц и падение пыли в ядро.',
      'Следи за кольцом фазы: когда заполнится — нажми «Эволюция».',
    ],
    hint: 'Не отпускай палец: чем дольше и ровнее вращение, тем выше скорость сбора пыли.',
    anim: 'disk',
  },
  protostar: {
    tag: 'ФАЗА III · ПРОТОЗВЕЗДА',
    title: 'Протозвезда',
    text: 'Ядро раскалилось до миллионов градусов. Вот-вот запустится термоядерный синтез.',
    goal: 'удержать жар ядра 30 секунд',
    steps: [
      'Быстро тапай по экрану — каждый тап поднимает жар ядра.',
      'Жар постоянно остывает и со временем всё быстрее — не останавливайся.',
      'Продержись 30 секунд. Чем горячее ядро в финале, тем лучше звезда.',
    ],
    hint: 'Тип звезды (M, K, G, A, B) определяется жаром в момент вспышки.',
    anim: 'ignite',
  },
  firstPlanet: {
    tag: 'ФАЗА IV · ПЕРВАЯ ПЛАНЕТА',
    title: 'Первая планета',
    text: 'Диск остывает. Обломки слипаются в шар — твоя первая планета рождается из хаоса.',
    goal: 'собрать первую планету',
    steps: [
      'Дождись, пока накопится пыль на планету — доход идёт автоматически.',
      'Нажми «Эволюция» и выбери «Начать сборку».',
      'В мини-игре тяни шары: при касании они сливаются и растут.',
      'Собери шар до массы 4 и уложись в 30 секунд.',
    ],
    hint: 'Провал не страшен: пыль вернут, но следующая попытка будет доступна через 30 секунд.',
    anim: 'planet',
  },
  system: {
    tag: 'ФАЗА V · СИСТЕМА',
    title: 'Формирование системы',
    text: 'Твоя звезда обзавелась планетами. Стройте инфраструктуру, добывайте энергию и расширяйтесь!',
    goal: 'застроить 8 орбит и расшириться до 5 систем',
    steps: [
      'Собирай новые планеты через «Эволюция» — у каждой орбиты свой доступный тип.',
      'Прокачивай хранилища пыли, энергии и цивилизации кнопкой «Улучшить».',
      'Открывай другие системы через плашку систем вверху и магазин систем.',
      'Когда систем станет 5, откроется галактическая карта (Фаза VI).',
    ],
    hint: 'Планеты дают пассивный доход. Лава-планеты добывают металлы для флота.',
    anim: 'planet',
  },
  galaxy: {
    tag: 'ФАЗА VI · ГАЛАКТИКА',
    title: 'Межзвёздная экспансия',
    text: 'Ты вышел за пределы родной системы. Покупай новые системы, развивай флот и готовься к Вспышке Сверхновой!',
    goal: 'накопить системы и выполнить престиж',
    steps: [
      'Покупай новые системы на галактической карте — они повышают общий доход.',
      'Строй флот на Верфи и защищай системы от вторжений.',
      'Запускай кометы и экспедиции ради наград и новых территорий.',
      'Накопи нужное число систем и активируй «Вспышку Сверхновой» — престиж.',
    ],
    hint: 'Первый престиж доступен при 5 системах. Он навсегда повышает множитель дохода.',
    anim: 'disk',
  },
};

let loreActive = false;
let loreAnimId = null;
let guideActive = false;

function showLoreCard(stageId, onComplete, force) {
  if (loreActive) { if (onComplete) onComplete(); return; }
  if (!S.seenLore) S.seenLore = [];
  if (!force && S.seenLore.indexOf(stageId) !== -1) { if (onComplete) onComplete(); return; }

  const data = LORE[stageId];
  if (!data) { if (onComplete) onComplete(); return; }
  loreActive = true;

  const overlay = document.createElement('div');
  overlay.className = 'lore-overlay';
  const stepsHtml = (data.steps && data.steps.length) ? _loreStepsHtml(data.steps) : '';
  overlay.innerHTML =
    '<canvas class="lore-canvas"></canvas>' +
    '<div class="lore-content">' +
      '<div class="lore-tag">' + (data.tag || '') + '</div>' +
      '<div class="lore-title">' + data.title + '</div>' +
      '<div class="lore-text">' + data.text + '</div>' +
      (data.goal ? '<div class="lore-goal"><b>Цель фазы:</b> ' + data.goal + '</div>' : '') +
      (stepsHtml ? '<div class="lore-steps-title">Что делать</div><ol class="lore-steps">' + stepsHtml + '</ol>' : '') +
      (data.hint ? '<div class="lore-hint">💡 ' + data.hint + '</div>' : '') +
      '<button class="lore-btn" type="button">Понятно, продолжить</button>' +
    '</div>';
  document.body.appendChild(overlay);

  const canvas = overlay.querySelector('.lore-canvas');
  const ctx = canvas.getContext('2d');
  const startAt = performance.now();
  let W, H, cx, cy;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = W / 2; cy = H / 2;
  }
  resize();
  window.addEventListener('resize', resize);

  const particles = [];
  for (let i = 0; i < 80; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 120 + Math.random() * 180;
    particles.push({
      x: Math.cos(a) * r, y: Math.sin(a) * r,
      hue: 200 + Math.random() * 80,
      size: 0.8 + Math.random() * 1.5,
    });
  }

  function draw() {
    const t = (performance.now() - startAt) / 1000;
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.8);
    bg.addColorStop(0, '#0a0620');
    bg.addColorStop(1, '#02010a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    if (data.anim === 'cloud') {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const d = Math.hypot(p.x, p.y) || 1;
        const pull = (1 - Math.min(1, d / 300)) * 40;
        p.x -= (p.x / d) * pull * 0.016;
        p.y -= (p.y / d) * pull * 0.016;
        if (d < 30) {
          const a = Math.random() * Math.PI * 2;
          const r = 200 + Math.random() * 150;
          p.x = Math.cos(a) * r; p.y = Math.sin(a) * r;
        }
        ctx.globalAlpha = Math.max(0.1, 0.3 + 0.5 * (1 - d / 350));
        ctx.fillStyle = 'hsl(' + p.hue + ', 80%, 80%)';
        ctx.beginPath();
        ctx.arc(cx + p.x, cy + p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      const coreR = 20 + Math.sin(t * 3) * 4;
      ctx.globalAlpha = 0.8;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3);
      cg.addColorStop(0, 'rgba(255, 240, 220, 0.9)');
      cg.addColorStop(0.4, 'rgba(255, 180, 120, 0.4)');
      cg.addColorStop(1, 'rgba(255, 100, 60, 0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 4);
      ctx.strokeStyle = '#b9a8ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.arc(cx, cy + 120, 40 + Math.sin(t * 3) * 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (data.anim === 'disk') {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const angle = Math.atan2(p.y, p.x);
        const r = Math.hypot(p.x, p.y);
        const newAngle = angle + (0.5 / Math.max(0.3, r / 100)) * 0.016;
        p.x = Math.cos(newAngle) * r;
        p.y = Math.sin(newAngle) * r * 0.5;
        ctx.globalAlpha = Math.max(0.15, 0.4 + 0.4 * (1 - r / 300));
        ctx.fillStyle = 'hsl(' + p.hue + ', 80%, 75%)';
        ctx.beginPath();
        ctx.arc(cx + p.x, cy + p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60);
      cg.addColorStop(0, 'rgba(255, 250, 230, 1)');
      cg.addColorStop(0.3, 'rgba(255, 200, 120, 0.7)');
      cg.addColorStop(1, 'rgba(255, 100, 60, 0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(cx, cy, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 3);
      ctx.strokeStyle = '#b9a8ff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, 100, t * 2, t * 2 + Math.PI * 1.5);
      ctx.stroke();
    }

    if (data.anim === 'ignite') {
      const tapPulse = Math.max(0, Math.sin(t * 8) * 0.5 + 0.5);
      const coreR = 30 + tapPulse * 25;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 4);
      cg.addColorStop(0, 'rgba(255, 250, 230, 1)');
      cg.addColorStop(0.2, 'rgba(255, 200, 80, 0.9)');
      cg.addColorStop(0.5, 'rgba(255, 100, 30, 0.4)');
      cg.addColorStop(1, 'rgba(255, 40, 10, 0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 4, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const angle = Math.atan2(p.y, p.x) + 1.5 * 0.016;
        const r = Math.hypot(p.x, p.y);
        p.x = Math.cos(angle) * r;
        p.y = Math.sin(angle) * r;
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = 'hsl(20, 90%, 70%)';
        ctx.beginPath();
        ctx.arc(cx + p.x, cy + p.y, p.size * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.7 * (1 - (t % 0.4) / 0.4);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx, cy, 80 + (t % 0.4) * 200, 0, Math.PI * 2);
      ctx.fill();
    }

    if (data.anim === 'planet') {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const d = Math.hypot(p.x, p.y) || 1;
        const pull = (1 - Math.min(1, d / 250)) * 30;
        p.x -= (p.x / d) * pull * 0.016;
        p.y -= (p.y / d) * pull * 0.016;
        if (d < 50) {
          const a = Math.random() * Math.PI * 2;
          const r = 150 + Math.random() * 150;
          p.x = Math.cos(a) * r; p.y = Math.sin(a) * r;
        }
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = 'hsl(' + p.hue + ', 70%, 70%)';
        ctx.beginPath();
        ctx.arc(cx + p.x, cy + p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      const planetR = Math.min(50, 15 + t * 8);
      const pg = ctx.createRadialGradient(cx - planetR * 0.3, cy - planetR * 0.3, 0, cx, cy, planetR);
      pg.addColorStop(0, '#a89070');
      pg.addColorStop(0.7, '#5a4630');
      pg.addColorStop(1, '#2a1a10');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(cx, cy, planetR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#b9a8ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 100, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
    if (loreActive) loreAnimId = requestAnimationFrame(draw);
  }
  draw();

  let closed = false;
  function closeLore() {
    if (closed) return;
    closed = true;
    if (S.seenLore.indexOf(stageId) === -1) {
      S.seenLore.push(stageId);
      if (typeof saveGame === 'function') saveGame();
    }
    if (loreAnimId) cancelAnimationFrame(loreAnimId);
    window.removeEventListener('resize', resize);
    overlay.style.animation = 'loreFadeOut 0.3s ease forwards';
    setTimeout(function() {
      overlay.remove();
      loreActive = false;
      if (onComplete) onComplete();
    }, 300);
  }

  overlay.querySelector('.lore-btn').addEventListener('click', closeLore);
}

window.showLoreCard = showLoreCard;

// ═══════════════════════════════════════════════════════════════
//  ОБЩИЙ ГИД ПО ИГРЕ И ФАЗАМ
// ═══════════════════════════════════════════════════════════════
const STAGE_ORDER = ['cloud', 'condense', 'protostar', 'firstPlanet', 'system', 'galaxy'];

function _loreStepsHtml(steps) {
  let html = '';
  for (let i = 0; i < steps.length; i++) html += '<li>' + steps[i] + '</li>';
  return html;
}

function openCurrentPhaseHelp() {
  if (typeof S === 'undefined' || !S.stage) return;
  if (loreActive || guideActive) return;
  showLoreCard(S.stage, null, true);
}
window.openCurrentPhaseHelp = openCurrentPhaseHelp;

function showGameGuide() {
  if (guideActive || loreActive) return;
  guideActive = true;
  if (!S.seenLore) S.seenLore = [];

  const curIdx = STAGE_ORDER.indexOf(S.stage);
  let phasesHtml = '';
  for (let i = 0; i < STAGE_ORDER.length; i++) {
    const id = STAGE_ORDER[i];
    const d = LORE[id];
    if (!d) continue;
    const isNow = i === curIdx;
    const isDone = i < curIdx;
    phasesHtml +=
      '<div class="guide-phase' + (isNow ? ' guide-phase--now' : '') + (isDone ? ' guide-phase--done' : '') + '">' +
        '<div class="guide-phase-head">' +
          '<span class="guide-phase-name">' + d.tag + ' · ' + d.title + '</span>' +
          '<span class="guide-phase-state">' + (isNow ? 'СЕЙЧАС' : (isDone ? 'ПРОЙДЕНА' : 'ВПЕРЕДИ')) + '</span>' +
        '</div>' +
        '<div class="guide-phase-goal">🎯 ' + d.goal + '</div>' +
        '<ol class="lore-steps guide-steps">' + _loreStepsHtml(d.steps) + '</ol>' +
        '<button class="guide-phase-btn" type="button" data-stage="' + id + '">💡 Подсказка фазы</button>' +
      '</div>';
  }

  const overlay = document.createElement('div');
  overlay.className = 'guide-overlay';
  overlay.innerHTML =
    '<div class="guide-panel">' +
      '<div class="guide-head">' +
        '<div class="guide-title">📖 Как играть</div>' +
        '<button class="guide-x" type="button" aria-label="Закрыть">×</button>' +
      '</div>' +
      '<div class="guide-body">' +
        '<div class="guide-lead">Аккреция — idle-игра о рождении звёздной системы. ' +
          'Ты собираешь пыль, зажигаешь звезду, строишь планеты и расширяешься по галактике.</div>' +
        '<div class="guide-section">' +
          '<div class="guide-h">🎮 Основы</div>' +
          '<ul class="guide-list">' +
            '<li><b>Тяни пальцем по экрану</b> — пыль летит в ядро и превращается в ✦ пыль.</li>' +
            '<li><b>Кольцо фазы</b> внизу показывает прогресс. Заполнилось — жми «Эволюция».</li>' +
            '<li><b>Хранилища</b> копят пыль, ⚡ энергию и 🧬 цивилизацию. Кнопка «Улучшить» повышает лимит.</li>' +
            '<li><b>Прогресс сохраняется</b> автоматически — можно возвращаться в любой момент.</li>' +
            '<li>Кнопка <b>?</b> вверху и кнопка «Гид» в панели квестов всегда открывают эту подсказку.</li>' +
          '</ul>' +
        '</div>' +
        '<div class="guide-section">' +
          '<div class="guide-h">🪐 Фазы игры</div>' +
          '<div class="guide-sub">У каждой фазы своя цель и свой способ добычи пыли.</div>' +
          phasesHtml +
        '</div>' +
        '<div class="guide-section">' +
          '<div class="guide-h">⚙ Ресурсы и механики</div>' +
          '<ul class="guide-list">' +
            '<li><b>⚡ Энергия</b> и <b>🧬 цивилизация</b> нужны для улучшений хранилищ и покупки систем. Их приносят планеты.</li>' +
            '<li><b>⚙ Металлы</b> добывают лава-планеты. Металлы нужны для кораблей на Верфи.</li>' +
            '<li><b>🚀 Флот</b> строится на Верфи (Настройки → Верфь) и защищает от вторжений.</li>' +
            '<li><b>☄️ Кометы</b> и <b>🚀 экспедиции</b> запускаются кнопками миссий справа внизу и приносят награды.</li>' +
            '<li><b>🛡 Оборона</b> и щиты спасают от атак. Активная оборона открывается в Настройках.</li>' +
            '<li><b>💥 Вспышка Сверхновой</b> — престиж. Сбрасывает прогресс, но навсегда повышает множитель дохода.</li>' +
          '</ul>' +
        '</div>' +
      '</div>' +
      '<div class="guide-foot"><button class="lore-btn guide-ok" type="button">Понятно</button></div>' +
    '</div>';
  document.body.appendChild(overlay);

  function closeGuide(then) {
    if (!guideActive) return;
    guideActive = false;
    if (S.seenLore.indexOf('gameguide') === -1) {
      S.seenLore.push('gameguide');
      if (typeof saveGame === 'function') saveGame();
    }
    overlay.style.animation = 'loreFadeOut 0.3s ease forwards';
    setTimeout(function() {
      overlay.remove();
      if (typeof then === 'function') then();
    }, 300);
  }

  overlay.querySelector('.guide-x').addEventListener('click', function() { closeGuide(); });
  overlay.querySelector('.guide-ok').addEventListener('click', function() { closeGuide(); });
  overlay.querySelectorAll('[data-stage]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const id = btn.getAttribute('data-stage');
      closeGuide(function() { showLoreCard(id, null, true); });
    });
  });
}
window.showGameGuide = showGameGuide;
window.openGameGuide = showGameGuide;

let _guideRetry = 0;
function maybeShowGameGuide() {
  if (typeof S === 'undefined' || !S.stage) return;
  if (!S.seenLore) S.seenLore = [];
  if (S.seenLore.indexOf('gameguide') !== -1) return;
  if ((S.prestigeLevel || 0) > 0) return;
  if (STAGE_ORDER.indexOf(S.stage) > 2) return;
  if (loreActive || guideActive || document.querySelector('.modal.show')) {
    if (_guideRetry++ < 20) setTimeout(maybeShowGameGuide, 1200);
    return;
  }
  _guideRetry = 0;
  showGameGuide();
}
window.maybeShowGameGuide = maybeShowGameGuide;