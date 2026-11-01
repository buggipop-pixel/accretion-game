
'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  balance-v2.js — проектная модель экономики «Аккреции» v2.1
//
//  Принципы:
//   1. Каждый престиж ускоряет игру (цены АБСОЛЮТНЫЕ -> множитель дохода режет
//      время; сейчас цена = «N минут текущего дохода» и множители бесполезны).
//   2. Пассивная игра возможна, но в ~2.2x дольше активной.
//   3. Вторжения — РЕАЛЬНАЯ угроза: урон = украденные ресурсы + «оккупация»
//      (штраф к доходу) + повреждение планет. Ночь без защиты ~3.3 ч прогресса,
//      с обороной ур.2 ~2 ч, ур.5 — 0. Не стирают прогресс полностью.
//   4. Металлы — дефицит с капом; оборона реально окупается.
//
//  Скрипт ничего в игре не меняет. Запуск: node tools/balance-v2.js
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadGameConfig() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8');
  const ctx = { window: {}, Math, Date, JSON, console, isFinite, isNaN,
                parseInt, parseFloat, Number, String, Object, Array };
  vm.createContext(ctx);
  const epilogue = ';__EXPORT__ = { CFG, STAGES, STORAGE_CFG, PLANET_TYPES, STAR_TYPES, SYSTEM_TYPES, INVASION_CFG, MISSIONS_CFG, PREMIUM_CFG, PRESTIGE_CFG, ORBIT_GEOMETRY, PHYS, STANDARD_ORBIT_MATRIX, STAR_WEIGHTS, planetMass, planetDiameter, getOrbitR };';
  vm.runInContext(src + epilogue, ctx, { filename: 'js/config.js' });
  return ctx.__EXPORT__;
}
const C = loadGameConfig();
const { STORAGE_CFG, PLANET_TYPES, STAR_TYPES, SYSTEM_TYPES, PREMIUM_CFG,
        STANDARD_ORBIT_MATRIX, PHYS, planetMass, planetDiameter, getOrbitR } = C;

// ═══════════════════════════════════════════════════════════════════════════
//  V2 — ПАРАМЕТРЫ
// ═══════════════════════════════════════════════════════════════════════════
const V2 = {
  starMult: { M: 2.2, K: 2.1, G: 1.8, A: 1.9, B: 2.0 },
  starWeights: { M: 60, K: 15, G: 10, A: 10, B: 5 },
  baseRate: { firstPlanet: 800, system: 1200, galaxy: 2500 },
  planetBaseCost: 3_530_000,
  planetCostExp: 2.0,
  systemBaseCost: 71_000_000,
  systemCostExp: 1.5,
  expeditionRewardShare: 0.5,
  expeditionFailChance: 0.25,
  cometRewardMult: 1.35,
  cometFailChance: 0.20,
  offlineEfficiency: 0.6,
  metalsPerLava: 0.15,
  metalsCapBase: 750,
  metalsCapGrowth: 2.0,
  defenseCost: [0, 150, 350, 750, 1500, 3000],
  defenseCostMultiplierPerSystem: 0.15,
  prestigeReq: [5, 8, 11, 14, 18],
  multiplierPerGalaxy: 2.0,
  keepMinFactor: 1.5,
  // ─── ВТОРЖЕНИЯ v2.1 ───────────────────────────────────────────────────
  invasion: {
    intervalHoursAvg: 5.5,       // спавн раз в 3-8 ч (70%)
    offlinePerHours: 3,          // офлайн: 1 атака на 3 ч отсутствия
    offlineMax: 5,
    tiers: {
      // theft = сколько «минут дохода» уносит, debuff = штраф к доходу на N часов
      scout: { w: 0.55, theftMin: 25, debuffPct: 0.15, debuffH: 2.0, targets: 1, disableH: 1.5 },
      raid:  { w: 0.30, theftMin: 50, debuffPct: 0.25, debuffH: 3.0, targets: 2, disableH: 2.0 },
      siege: { w: 0.15, theftMin: 90, debuffPct: 0.35, debuffH: 5.0, targets: 3, disableH: 3.0 },
    },
    defReduce: 0.20,           // -20% к урону за уровень обороны (ур.5 = иммунитет)
    debuffStackCap: 0.60,      // суммарный штраф к доходу не более -60%
    nightCapHours: 4.0,        // не более 4 ч прогресса за одну офлайн-сессию
    planetDisabledH: 2,
  },
};

const E_STAR = Object.keys(V2.starWeights).reduce((a, k) => a + V2.starWeights[k] * V2.starMult[k], 0)
              / Object.values(V2.starWeights).reduce((a, b) => a + b, 0);
const E_SYSTYPE = Object.values(SYSTEM_TYPES).reduce((a, t) => a + t.chance * t.rateMult, 0);
const MULT = E_STAR * E_SYSTYPE;

function planetEff(type, i) {
  const r = getOrbitR(i);
  const tempF = 0.8 + Math.min(1, (280 * Math.sqrt(100 / r)) / 400) * 0.4;
  const m = planetMass(type), d = planetDiameter(type);
  const vEsc = Math.sqrt(2 * m / d) * 0.5, focus = 1 + vEsc * vEsc;
  const sigma = Math.pow(100 / Math.max(1, r), 1.5);
  const omega = 1 / (PHYS.refPeriod * Math.pow(r / 100, 1.5));
  const acc = Math.PI * d * 8 * d * 8 * sigma * omega * focus * 0.001;
  const massF = m > 1 ? 1 + Math.log(m) * 0.35 : 1;
  return PLANET_TYPES[type].rate * (1 + acc * 10) * massF * tempF;
}
const ORBIT_RATE = Array.from({ length: 8 }, (_, i) => {
  const row = STANDARD_ORBIT_MATRIX[i];
  return row.reduce((a, t) => a + planetEff(t, i), 0) / row.length;
});
const ORBIT_TYPE = Array.from({ length: 8 }, (_, i) => STANDARD_ORBIT_MATRIX[i][0]);

function incomeBefore(n) {
  const base = n === 0 ? V2.baseRate.firstPlanet : V2.baseRate.system;
  let s = 0; for (let i = 0; i < n; i++) s += ORBIT_RATE[i];
  return (base + s) * MULT;
}
const income8 = incomeBefore(8);
const MISSION_MULT = 1 + V2.expeditionRewardShare * (1 - V2.expeditionFailChance);

function planetTimeline(P0, mult, fromPlanet, speed) {
  speed = speed || 1;
  let t = 0; const out = [];
  for (let n = 0; n < 8; n++) {
    const cost = P0 * Math.pow(n + 1, V2.planetCostExp);
    const m = (n + 1) >= (fromPlanet || 99) ? mult : 1;
    const wait = cost / (incomeBefore(n) * m * speed);
    t += wait;
    out.push({ n, type: ORBIT_TYPE[n], cost, wait, t, income: incomeBefore(n) });
  }
  return out;
}
const passiveSpeed = (checkH, lvl) => V2.offlineEfficiency * Math.min(checkH, STORAGE_CFG.getDustCapHours(lvl)) / checkH;
function systemTimes(startSystems, target, galaxyMult, S0) {
  let t = 0; const out = [];
  for (let k = startSystems; k < target; k++) {
    const cost = S0 * Math.pow(k, V2.systemCostExp);
    const income = income8 * k * galaxyMult;
    const wait = cost / income;
    t += wait; out.push({ k: k + 1, cost, income, wait, t });
  }
  return out;
}
const keptAfter = s => Math.max(1, Math.floor(Math.sqrt(Math.max(0, s)) * V2.keepMinFactor));

// ─── вторжения: урон в «минутах прогресса» ─────────────────────────────
const IV = V2.invasion;
function theftAndDebuff(tierKey, def) {
  const t = IV.tiers[tierKey];
  const k = 1 - Math.min(1, def * IV.defReduce);
  const theft = t.theftMin * k;                    // минут дохода украдено
  const debuffMin = t.debuffPct * k * t.debuffH * 60; // потерянные минуты дохода от штрафа
  return { theft, debuffMin, total: theft + debuffMin, k };
}
function expectedAttack(def) {
  let sum = 0;
  for (const k of Object.keys(IV.tiers)) sum += IV.tiers[k].w * theftAndDebuff(k, def).total;
  return sum;
}
function nightLoss(def, hoursAway) {
  const attacks = Math.min(IV.offlineMax, hoursAway / IV.offlinePerHours);
  // штрафы к доходу перекрываются (а не суммируются линейно): берём ~0.75 от суммы
  const raw = attacks * expectedAttack(def) * 0.75;
  return Math.min(raw, IV.nightCapHours * 60);
}

const hh = s => (s / 3600).toFixed(2);
const mm = s => Math.round(s / 60);
const nf = n => {
  if (!isFinite(n)) return 'inf';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
};
const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);
const LINE = '='.repeat(104);
const hdr = t => { console.log('\n' + LINE); console.log('  ' + t); console.log(LINE); };

console.log(LINE);
console.log('  ЭКОНОМИКА v2.1  ·  tools/balance-v2.js');
console.log(LINE);
console.log('  Звезда x' + E_STAR.toFixed(3) + ' | тип системы x' + E_SYSTYPE.toFixed(3) +
            ' | база этапов 800/1200/2500 dust/s');
console.log('  Цены: planet ' + nf(V2.planetBaseCost) + 'x(n+1)^' + V2.planetCostExp +
            ' | system ' + nf(V2.systemBaseCost) + 'xk^' + V2.systemCostExp +
            ' | доход после 8 планет ' + nf(income8) + '/с');

// ── A ────────────────────────────────────────────────────────────────────
hdr('A. ПЛАНЕТЫ: 8 планет за 10 ч (активно, с миссиями)');
const P = planetTimeline(V2.planetBaseCost, MISSION_MULT, 4, 1);
console.log(' ' + pad('#', 4) + pad('орбита/тип', 15) + padL('цена, ✦', 12) + padL('доход, ✦/с', 12) +
            padL('ждать, ч', 10) + padL('итого, ч', 10));
console.log(' ' + '-'.repeat(66));
for (const e of P) console.log(' ' + pad(e.n + 1, 4) + pad(PLANET_TYPES[e.type].name, 15) + padL(nf(e.cost), 12) +
            padL(nf(e.income), 12) + padL(hh(e.wait), 10) + padL(hh(e.t), 10));
console.log('\n  8 планет: ' + hh(P[7].t) + ' ч.  Первая система — сразу после, на ~' +
            (P[7].t / 3600 + 0.9).toFixed(1) + '-м часу.');

console.log('\n ' + pad('профиль игры', 48) + padL('8 планет', 12) + padL('vs актив', 11));
console.log(' ' + '-'.repeat(74));
const prof = [
  ['АКТИВНЫЙ: раз в 1-2 ч, миссии', P[7].t],
  ['активный без миссий', planetTimeline(V2.planetBaseCost, 1, 99, 1)[7].t],
  ['ПАССИВНЫЙ: 2 захода в день, хранилище ур.4', planetTimeline(V2.planetBaseCost, 1, 99, passiveSpeed(24, 4))[7].t],
  ['пассивный: раз в 12 ч, хранилище ур.1', planetTimeline(V2.planetBaseCost, 1, 99, passiveSpeed(12, 1))[7].t],
  ['ПАССИВНЫЙ: 1 заход в сутки, хранилище ур.1', planetTimeline(V2.planetBaseCost, 1, 99, passiveSpeed(24, 1))[7].t],
];
for (const [n, v] of prof) console.log(' ' + pad(n, 48) + padL(hh(v) + ' ч', 12) + padL('x' + (v / P[7].t).toFixed(2), 11));

// ── B ────────────────────────────────────────────────────────────────────
hdr('B. ЭКСПАНСИЯ И ПРЕСТИЖ');
const S0 = V2.systemBaseCost;
const first5 = systemTimes(1, 5, 1, S0);
console.log('  Первая система: ' + nf(systemTimes(1, 2, 1, S0)[0].cost) + ' ✦ = ' +
            hh(systemTimes(1, 2, 1, S0)[0].wait) + ' ч дохода');
console.log('  До 5 систем в #1: ' + first5.map(e => hh(e.wait)).join(' + ') + ' = ' +
            (first5.reduce((a, e) => a + e.wait, 0) / 3600).toFixed(2) + ' ч');
let startSys = 1; const ladder = [];
console.log('\n ' + pad('галактика', 10) + padL('множ.', 8) + padL('систем', 10) + padL('закупок', 8) +
            padL('время, ч', 10) + padL('ср. закупка', 13));
console.log(' ' + '-'.repeat(64));
for (let g = 0; g < 5; g++) {
  if (startSys >= V2.prestigeReq[g]) break;
  const m = Math.pow(V2.multiplierPerGalaxy, g);
  const st = systemTimes(startSys, V2.prestigeReq[g], m, S0);
  const hours = st.reduce((a, e) => a + e.wait, 0) / 3600;
  ladder.push({ g: g + 1, hours, to: V2.prestigeReq[g] });
  console.log(' ' + pad('#' + (g + 1), 10) + padL('x' + m, 8) + padL(startSys + '→' + V2.prestigeReq[g], 10) +
              padL(st.length, 8) + padL(hours.toFixed(1), 10) + padL((hours / st.length).toFixed(2) + ' ч', 13));
  startSys = 1 + keptAfter(V2.prestigeReq[g]);
}
const prestige1 = P[7].t / 3600 + first5.reduce((a, e) => a + e.wait, 0) / 3600 + 0.5;
console.log('\n  ПРЕСТИЖ 1: ' + prestige1.toFixed(1) + ' ч  ->  ' + ladder.slice(1).map(r => r.hours.toFixed(1) + ' ч').join(' -> '));

// ── C ────────────────────────────────────────────────────────────────────
hdr('C. ВТОРЖЕНИЯ: из чего состоит урон (в минутах ПРОГРЕССА)');
console.log('  Урон = украденные ресурсы (пыль->энергия->цив) + ШТРАФ К ДОХОДУ на N часов + повреждение планет.');
console.log('  Спавн: раз в 3-8 ч (70%). Офлайн: 1 атака / 3 ч, максимум ' + IV.offlineMax + '.');
console.log('\n ' + pad('атака', 9) + padL('вес', 6) + padL('кража', 9) + padL('штраф', 12) +
            padL('итого', 9) + padL('с ур.2', 9) + padL('с ур.3', 9) + padL('с ур.5', 9));
console.log(' ' + '-'.repeat(72));
for (const key of Object.keys(IV.tiers)) {
  const t = IV.tiers[key];
  const a = theftAndDebuff(key, 0), b = theftAndDebuff(key, 2), c = theftAndDebuff(key, 3), d = theftAndDebuff(key, 5);
  console.log(' ' + pad(key, 9) + padL((t.w * 100).toFixed(0) + '%', 6) + padL(a.theft.toFixed(0) + ' мин', 9) +
              padL('-' + (t.debuffPct * 100).toFixed(0) + '% x ' + t.debuffH + ' ч', 12) +
              padL(a.total.toFixed(0) + ' мин', 9) + padL(b.total.toFixed(0) + ' мин', 9) +
              padL(c.total.toFixed(0) + ' мин', 9) + padL(d.total.toFixed(0) + ' мин', 9));
}
console.log('\n  Средняя атака без защиты: ' + expectedAttack(0).toFixed(0) + ' мин = ' +
            (expectedAttack(0) / 60).toFixed(1) + ' ч прогресса.');
console.log('  То есть за КАЖДЫЙ час отсутствия игрок теряет ~' + (expectedAttack(0) / IV.intervalHoursAvg).toFixed(0) +
            ' мин прогресса (' + (expectedAttack(0) / IV.intervalHoursAvg / 60 * 100).toFixed(0) + '% дохода).');
console.log('  Из этого ~' + ((0.55*0.15*2*60 + 0.30*0.25*3*60 + 0.15*0.35*5*60) / IV.intervalHoursAvg).toFixed(0) +
            ' мин/час — гарантированный ШТРАФ К ПРОИЗВОДСТВУ (не зависит от запасов),');
console.log('  остальное — кража с накоплений (ограничена тем, что реально лежит в кошельке).');

console.log('\n ' + pad('ночь / оборона', 30) + padL('атак', 8) + padL('потеря, ч', 12) +
            padL('% от 10 ч сессии', 20));
console.log(' ' + '-'.repeat(70));
for (const def of [0, 1, 2, 3, 4, 5]) {
  const loss = nightLoss(def, 10);
  console.log(' ' + pad(def === 0 ? '10 ч без защиты' : '10 ч, оборона ур.' + def, 30) +
              padL(Math.min(IV.offlineMax, Math.floor(10 / IV.offlinePerHours)), 8) +
              padL((loss / 60).toFixed(2), 12) + padL((loss / 600 * 100).toFixed(0) + '%', 20));
}
console.log('  Кап: не более ' + IV.nightCapHours + ' ч прогресса и 40% каждой валюты за офлайн-сессию.');
console.log('  Планеты НЕ удаляются: «повреждена» на ' + IV.planetDisabledH + ' ч (доход 0). Системы не теряются.');

// ROI обороны
hdr('D. ОКУПАЕМОСТЬ ОБОРОНЫ (2 лава-планеты, civ 3000)');
const metalsRate = 2 * V2.metalsPerLava * 1.3;    // ⚙/с
const savedNight = nightLoss(0, 10);
console.log('  Металлы: ' + (metalsRate * 3600).toFixed(0) + ' ⚙/ч   |   ночь без защиты = ' +
            (savedNight / 60).toFixed(1) + ' ч прогресса');
console.log(' ' + pad('уровень', 9) + padL('цена, ⚙', 10) + padL('цена, мин', 12) +
            padL('ночь, ч', 9) + padL('экономия, ч', 13) + padL('ROI', 8));
console.log(' ' + '-'.repeat(64));
for (const lvl of [1, 2, 3, 4, 5]) {
  const costMin = V2.defenseCost[lvl] / metalsRate / 60;
  const nl = nightLoss(lvl, 10) / 60;
  const saved = savedNight / 60 - nl;
  console.log(' ' + pad('ур.' + lvl, 9) + padL(V2.defenseCost[lvl], 10) + padL(costMin.toFixed(0), 12) +
              padL(nl.toFixed(2), 9) + padL(saved.toFixed(2), 13) + padL('x' + (saved / (costMin / 60)).toFixed(1), 8));
}
console.log('\n  Вывод: ур.2 (350 ⚙) стоит ~15 мин металлов и экономит ~1.3 ч — обязательная покупка на ночь.');
console.log('  Ур.5 (3000 ⚙) = ~2.1 ч металлов и требует хранилища ур.3 — только перед долгим отсутствием.');

// ── E ────────────────────────────────────────────────────────────────────
hdr('E. ПРОВЕРКА ПРИНЦИПОВ');
const passiveL4 = planetTimeline(V2.planetBaseCost, 1, 99, passiveSpeed(24, 4))[7].t;
console.log('  1. ПРЕСТИЖ: ' + prestige1.toFixed(1) + ' ч -> ' + ladder.slice(1).map(r => r.hours.toFixed(1) + ' ч').join(' -> '));
console.log('  2. ПАССИВ: ' + hh(passiveL4) + ' ч против ' + hh(P[7].t) + ' ч = x' + (passiveL4 / P[7].t).toFixed(2) + ' (актив с миссиями)');
console.log('  3. ВТОРЖЕНИЯ: ' + expectedAttack(0).toFixed(0) + ' мин за атаку (~' +
            (expectedAttack(0) / IV.intervalHoursAvg).toFixed(0) + ' мин на час отсутствия); ночь без защиты ' +
            (nightLoss(0, 10) / 60).toFixed(1) + ' ч, с ур.2 ' + (nightLoss(2, 10) / 60).toFixed(1) +
            ' ч, с ур.5 ' + (nightLoss(5, 10) / 60).toFixed(1) + ' ч; кап ' + IV.nightCapHours + ' ч, системы не теряются.');
console.log('  4. МЕТАЛЛЫ: кап ' + nf(V2.metalsCapBase) + 'x2^(ур.-1) заставляет тратить; оборона ур.2 окупается x' +
            ((nightLoss(0, 10) / 60 - nightLoss(2, 10) / 60) / (V2.defenseCost[2] / metalsRate / 3600)).toFixed(0) + ' за ночь.');

// ── F ────────────────────────────────────────────────────────────────────
hdr('F. СВОДКА ПРАВОК');
console.log('  config.js:');
console.log('    planetBaseCost 500000 -> ' + V2.planetBaseCost + '   planetCostExp -> ' + V2.planetCostExp);
console.log('    systemBaseCost 20M -> ' + nf(S0) + '   systemCostExp -> ' + V2.systemCostExp);
console.log('    STAGES.baseRate 40/200/2000 -> 800/1200/2500');
console.log('    STAR_TYPES rateMult 6/3/1.5/2/3.5 -> 2.2/1.9/1.5/1.7/2.0');
console.log('    offlineEfficiency 1.0 -> ' + V2.offlineEfficiency);
console.log('    metalsPerSec 0.5 -> ' + V2.metalsPerLava + ' + кап ' + V2.metalsCapBase + 'x2^(ур.-1)');
console.log('    defenseCost [0,300,700,1500,3000,6000] -> [' + V2.defenseCost.join(', ') + ']');
console.log('    ВТОРЖЕНИЯ: вместо robberyMultiplier 4 x 45 мин -> theftMin 15/30/55 + debuff 10/20/30% x 1.5/2.5/4 ч');
console.log('    PRESTIGE_CFG: требования [' + V2.prestigeReq.join(', ') + ']');
console.log('  код: economy.js (planetCost/systemCost/metalsCap/дебафф дохода),');
console.log('       missions.js (награды миссий), invasions.js (модель урона), shop.js (шкалы), prestige.js (массив).');
