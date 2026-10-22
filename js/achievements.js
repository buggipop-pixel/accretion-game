// ═══════════════════════════════════════════════════════════════
//  ACHIEVEMENTS.JS — Достижения и Ежедневные задания
// ═══════════════════════════════════════════════════════════════

const ACHIEVEMENTS = [
  { id: 'first_dust', name: 'Первая пылинка', desc: 'Собери 100 пыли', check: () => S.dustTotal >= 100, reward: 50 },
  { id: 'planet_1', name: 'Творец', desc: 'Собери первую планету', check: () => S.planets.length >= 1 || S.totalSystemsCreated > 1, reward: 100 },
  { id: 'planet_8', name: 'Архитектор', desc: 'Собери 8 планет в одной системе', check: () => S.planets.length >= 8, reward: 500 },
  { id: 'system_2', name: 'Экспансия', desc: 'Построй 2-ю систему', check: () => S.systems >= 2, reward: 200 },
  { id: 'system_5', name: 'Империя', desc: 'Построй 5 систем', check: () => S.systems >= 5, reward: 500 },
  { id: 'prestige_1', name: 'Сверхновая', desc: 'Соверши первый престиж', check: () => S.prestigeLevel >= 1, reward: 1000 },
  { id: 'comet_1', name: 'Комета', desc: 'Запусти комету', check: () => (S.stats && S.stats.comets >= 1), reward: 100 },
  { id: 'exp_1', name: 'Экспедиция', desc: 'Запусти экспедицию', check: () => (S.stats && S.stats.expeditions >= 1), reward: 200 },
  { id: 'inv_defeat', name: 'Оборона', desc: 'Отбей вторжение', check: () => (S.stats && S.stats.invasionsDefeated >= 1), reward: 300 },
  { id: 'metal_100', name: 'Шахтер', desc: 'Накопи 100 металлов', check: () => S.metalAmount >= 100, reward: 150 },
  { id: 'dust_1m', name: 'Миллионер', desc: 'Накопи 1M пыли', check: () => S.dustTotal >= 1000000, reward: 500 },
  { id: 'galaxy_1', name: 'Галактика', desc: 'Достигни фазы Галактики', check: () => S.stage === 'galaxy' || S.galaxies > 1, reward: 1000 },
];

function checkAchievements() {
  if (!S.unlockedAch) S.unlockedAch = {};
  let earnedAny = false;

  for (let i = 0; i < ACHIEVEMENTS.length; i++) {
    const a = ACHIEVEMENTS[i];
    if (!S.unlockedAch[a.id] && a.check()) {
      S.unlockedAch[a.id] = true;
      S.metalAmount = (S.metalAmount || 0) + a.reward;
      toast('🏆 Достижение: ' + a.name, 'Награда: ⚙ ' + a.reward);
      earnedAny = true;
    }
  }
  if (earnedAny) {
    saveGame();
    if (document.getElementById('achModal').classList.contains('show')) {
      renderAchievements();
    }
  }
}

// ─── Ежедневные задания (3 штуки в день) ───────────────────────
const DAILY_QUESTS = [
  { id: 'd_dust', name: 'Собери 100K пыли', desc: 'За сегодня', target: 100000, reward: 50 },
  { id: 'd_click', name: 'Сделай 50 кликов', desc: 'За сегодня', target: 50, reward: 30 },
  { id: 'd_planet', name: 'Собери 3 планеты', desc: 'За сегодня', target: 3, reward: 100 },
];

function checkDailyReset() {
  const now = Date.now();
  const lastReset = S.lastDailyReset || 0;
  
  // Если прошло больше 24 часов или это первый вход
  if (now - lastReset > 24 * 60 * 60 * 1000 || lastReset === 0) {
    S.lastDailyReset = now;
    S.dailyProgress = { d_dust: 0, d_click: 0, d_planet: 0 };
    S.dailyClaimed = {};
    saveGame();
  }
}

function trackDaily(type, amount) {
  if (!S.dailyProgress) S.dailyProgress = { d_dust: 0, d_click: 0, d_planet: 0 };
  if (S.dailyProgress[type] !== undefined) {
    S.dailyProgress[type] += amount;
  }
}

function claimDaily(id) {
  const q = DAILY_QUESTS.find(function(q) { return q.id === id; });
  if (!q) return;
  if (!S.dailyClaimed) S.dailyClaimed = {};
  if (S.dailyClaimed[id]) return;
  
  const progress = (S.dailyProgress && S.dailyProgress[id]) || 0;
  if (progress >= q.target) {
    S.dailyClaimed[id] = true;
    S.metalAmount = (S.metalAmount || 0) + q.reward;
    toast('🎁 Награда получена', '+' + q.reward + ' ⚙');
    saveGame();
    renderAchievements();
  }
}

// ─── UI Модалки ─────────────────────────────────────────────────
function openAchievements() {
  const modal = document.getElementById('achModal');
  if (!modal) return;
  modal.classList.add('show');
  renderAchievements();
}

function renderAchievements() {
  const body = document.getElementById('achBody');
  if (!body) return;

  let html = '<div class="modal-title">🏆 Достижения и Задания</div>';
  
  // --- Ежедневные ---
  html += '<div class="ach-section"><div class="ach-sec-title">📅 Ежедневные</div>';
  for (let i = 0; i < DAILY_QUESTS.length; i++) {
    const q = DAILY_QUESTS[i];
    const prog = (S.dailyProgress && S.dailyProgress[q.id]) || 0;
    const isClaimed = S.dailyClaimed && S.dailyClaimed[q.id];
    const isReady = prog >= q.target;
    
    html += '<div class="ach-item">';
    html += '<div class="ach-info"><div class="ach-name">' + q.name + '</div>';
    html += '<div class="ach-prog">' + Math.min(prog, q.target) + ' / ' + q.target + '</div></div>';
    if (isClaimed) {
      html += '<button class="ach-btn claimed" disabled>✓</button>';
    } else if (isReady) {
      html += '<button class="ach-btn ready" onclick="claimDaily(\'' + q.id + '\')">Забрать ⚙' + q.reward + '</button>';
    } else {
      html += '<button class="ach-btn" disabled>⚙' + q.reward + '</button>';
    }
    html += '</div>';
  }
  html += '</div>';

  // --- Достижения ---
  html += '<div class="ach-section"><div class="ach-sec-title">🏆 Достижения</div>';
  for (let i = 0; i < ACHIEVEMENTS.length; i++) {
    const a = ACHIEVEMENTS[i];
    const unlocked = S.unlockedAch && S.unlockedAch[a.id];
    html += '<div class="ach-item ' + (unlocked ? 'unlocked' : '') + '">';
    html += '<div class="ach-info"><div class="ach-name">' + (unlocked ? a.name : '???') + '</div>';
    html += '<div class="ach-desc">' + (unlocked ? a.desc : 'Скрыто') + '</div></div>';
    html += '<div class="ach-reward">' + (unlocked ? '✓' : '⚙' + a.reward) + '</div>';
    html += '</div>';
  }
  html += '</div>';

  body.innerHTML = html;
}

window.checkAchievements = checkAchievements;
window.checkDailyReset = checkDailyReset;
window.trackDaily = trackDaily;
window.claimDaily = claimDaily;
window.openAchievements = openAchievements;