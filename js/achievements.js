// ═══════════════════════════════════════════════════════════════
//  ACHIEVEMENTS.JS — Достижения и Ежедневные задания
// ═══════════════════════════════════════════════════════════════

// ★ Достижения — долгие цели, а не «первые 5 минут». За каждое —
//   1 кусок Прайм-системы. 5 кусков = 1 система, всего 10 ачивок = 2 системы.
const ACHIEVEMENTS = [
  { id: 'ach_systems_10',  name: 'Экспансия',        desc: 'Основано 10 систем',            check: () => S.systems >= 10 },
  { id: 'ach_systems_50',  name: 'Империя',         desc: 'Основано 50 систем',            check: () => S.systems >= 50 },
  { id: 'ach_systems_150', name: 'Галактический дом', desc: 'Основано 150 систем',          check: () => S.systems >= 150 },
  { id: 'ach_prestige_1',  name: 'Первая сверхновая', desc: 'Соверши 1-й престиж',          check: () => S.prestigeLevel >= 1 },
  { id: 'ach_prestige_3',  name: 'Ветеран вспышек',  desc: 'Соверши 3-й престиж',           check: () => S.prestigeLevel >= 3 },
  { id: 'ach_dust_1e12',   name: 'Пылевой магнат',   desc: 'Добудь 1 трлн пыли всего',      check: () => S.dustTotal >= 1e12 },
  { id: 'ach_defend_25',   name: 'Щит галактики',    desc: 'Отбей 25 вторжений',            check: () => (S.stats && S.stats.invasionsDefeated >= 25) },
  { id: 'ach_defend_100',  name: 'Несокрушимый',     desc: 'Отбей 100 вторжений',           check: () => (S.stats && S.stats.invasionsDefeated >= 100) },
  { id: 'ach_missions_50', name: 'Космический волк', desc: 'Заверши 50 миссий (кометы/экспедиции)', check: () => ((S.stats?.comets || 0) + (S.stats?.expeditions || 0) >= 50) },
  { id: 'ach_planets_300', name: 'Архитектор миров', desc: '300 планет в империи',          check: () => (typeof totalPlanetCount === 'function' ? totalPlanetCount() : 0) >= 300 },
];

// Сколько всего кусков можно получить и сколько нужно на систему.
const PRIME_PART_TOTAL = 10;
const PRIME_PART_PER_SYSTEM = 5;
const PRIME_MAX_CRAFTS = 2;

function checkAchievements() {
  if (!S.unlockedAch) S.unlockedAch = {};
  let earnedAny = false;

  for (let i = 0; i < ACHIEVEMENTS.length; i++) {
    const a = ACHIEVEMENTS[i];
    if (!S.unlockedAch[a.id] && a.check()) {
      S.unlockedAch[a.id] = true;
      S.primeParts = Math.min(PRIME_PART_TOTAL, (Number(S.primeParts) || 0) + 1);
      toast('🏆 Достижение: ' + a.name, '🧩 Кусков Прайма: ' + S.primeParts + '/' + PRIME_PART_TOTAL);
      if (typeof addEvent === 'function') {
        addEvent('milestone', '🏆 «' + a.name + '» · кусок Прайма ' + S.primeParts + '/' + PRIME_PART_TOTAL);
      }
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
  // ★ Ежедневки сбрасываются по единому серверному дню (04:00 МСК),
  //   а не «через 24 часа от последнего входа».
  const dayIdx = (typeof serverDayIndex === 'function') ? serverDayIndex(now) : Math.floor(now / 86400000);
  const newDay = Number(S.dailyDayIndex) !== dayIdx;
  if (newDay || lastReset === 0) {
    S.lastDailyReset = now;
    S.dailyDayIndex = dayIdx;
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
  html += '<button class="pour-btn" style="width:100%; margin:8px 0 4px;" onclick="openLeaderboard()">🏆 Топ игроков</button>';

  // --- Куски Прайма ---
  const parts = Number(S.primeParts) || 0;
  const crafts = Number(S.primeCrafts) || 0;
  const canCraft = parts >= PRIME_PART_PER_SYSTEM && crafts < PRIME_MAX_CRAFTS;
  html += '<div class="ach-section"><div class="ach-sec-title">🧩 Куски Прайма</div>';
  html += '<div class="ach-item"><div class="ach-info">' +
    '<div class="ach-name">' + parts + ' / ' + PRIME_PART_TOTAL + ' кусков</div>' +
    '<div class="ach-desc">Собрано систем: ' + crafts + ' / ' + PRIME_MAX_CRAFTS +
    ' · 5 кусков = 1 Прайм-система</div></div>';
  if (crafts >= PRIME_MAX_CRAFTS) {
    html += '<button class="ach-btn claimed" disabled>МАКС</button>';
  } else if (canCraft) {
    html += '<button class="ach-btn ready" onclick="craftPrimeFromParts()">Собрать 🧩5</button>';
  } else {
    html += '<button class="ach-btn" disabled>🧩' + PRIME_PART_PER_SYSTEM + '</button>';
  }
  html += '</div></div>';
  
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
    html += '<div class="ach-reward">' + (unlocked ? '✓' : '🧩') + '</div>';
    html += '</div>';
  }
  html += '</div>';
  body.innerHTML = html;
}

// ★ Сборка Прайм-системы из 5 кусков. Тот же пул, что и у сундука.
function craftPrimeFromParts() {
  const parts = Number(S.primeParts) || 0;
  const crafts = Number(S.primeCrafts) || 0;
  if (crafts >= PRIME_MAX_CRAFTS) { toast('Прайм уже собран', 'Максимум ' + PRIME_MAX_CRAFTS + ' систем за достижения'); return false; }
  if (parts < PRIME_PART_PER_SYSTEM) { toast('Мало кусков', 'Нужно ' + PRIME_PART_PER_SYSTEM + ', есть ' + parts); return false; }
  if (typeof CHEST_CFG === 'undefined' || !Array.isArray(CHEST_CFG.lootTable)) return false;

  const loot = CHEST_CFG.lootTable;
  const total = loot.reduce(function(sum, item) { return sum + (Number(item.weight) || 0); }, 0);
  let roll = Math.random() * total;
  let key = loot[0].key;
  for (let i = 0; i < loot.length; i++) {
    roll -= Number(loot[i].weight) || 0;
    if (roll <= 0) { key = loot[i].key; break; }
  }
  const prime = (typeof createPrimeSystem === 'function') ? createPrimeSystem(key) : null;
  if (!prime) return false;

  S.primeParts = parts - PRIME_PART_PER_SYSTEM;
  S.primeCrafts = crafts + 1;
  saveGame();
  if (typeof showChestResult === 'function') showChestResult(prime, { free: true });
  renderAchievements();
  return true;
}


window.checkAchievements = checkAchievements;
window.craftPrimeFromParts = craftPrimeFromParts;
window.checkDailyReset = checkDailyReset;
window.trackDaily = trackDaily;
window.claimDaily = claimDaily;
window.openAchievements = openAchievements;