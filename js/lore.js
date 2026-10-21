// ═══════════════════════════════════════════════════════════════
//  LORE.JS — обучающие анимированные карточки фаз
//  Показываются при ПЕРВОМ входе в фазу. При престиже — пропускаются.
// ═══════════════════════════════════════════════════════════════

const LORE = {
  cloud: {
    title: 'Молекулярное облако',
    text: 'Холодный водород дрейфует в пустоте миллиарды лет. Каждая пылинка — будущее светило.',
    hint: 'Удерживай палец — гравитация стянет пыль к центру',
    anim: 'cloud',
  },
  condense: {
    title: 'Протопланетный диск',
    text: 'Облако сжалось. Частицы вращаются вокруг ядра, сталкиваются и слипаются в комки.',
    hint: 'Крути пальцем вокруг центра — раскрути диск',
    anim: 'disk',
  },
  protostar: {
    title: 'Протозвезда',
    text: 'Ядро раскалилось до миллионов градусов. Вот-вот запустится термоядерный синтез.',
    hint: 'Быстро тапай по экрану — разогрей ядро',
    anim: 'ignite',
  },
  firstPlanet: {
    title: 'Первая планета',
    text: 'Диск остывает. Обломки слипаются в шар — твоя первая планета рождается из хаоса.',
    hint: 'Соедини шары одинакового цвета — собери планету',
    anim: 'planet',
  },
};

let loreActive = false;
let loreAnimId = null;

function showLoreCard(stageId, onComplete) {
  if (loreActive) { if (onComplete) onComplete(); return; }
  if (!S.seenLore) S.seenLore = [];
  if (S.seenLore.indexOf(stageId) !== -1) { if (onComplete) onComplete(); return; }

  const data = LORE[stageId];
  if (!data) { if (onComplete) onComplete(); return; }
  loreActive = true;

  const overlay = document.createElement('div');
  overlay.className = 'lore-overlay';
  overlay.innerHTML =
    '<canvas class="lore-canvas"></canvas>' +
    '<div class="lore-content">' +
      '<div class="lore-title">' + data.title + '</div>' +
      '<div class="lore-text">' + data.text + '</div>' +
      '<div class="lore-hint">' + data.hint + '</div>' +
      '<button class="lore-btn">Продолжить</button>' +
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
  setTimeout(closeLore, 8000);
}

window.showLoreCard = showLoreCard;