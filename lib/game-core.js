// ═══════════════════════════════════════════════════════════════
//  GAME-CORE.JS — headless-запуск игровых формул на сервере.
//
//  Серверу нужен доход в секунду и лимиты ресурсов, чтобы самому
//  считать офлайн-прогресс, а не верить клиенту. Тащить формулы
//  копипастой нельзя: при любом ребалансе сервер разойдётся с игрой.
//  Поэтому мы загружаем те же самые js/*.js в vm-контекст без DOM
//  (ровно как tests/smoke-test.js) и вызываем настоящие функции.
//
//  Модуль ничего не знает про Express и Redis. Если файлы игры
//  недоступны — createGameCore() бросает ошибку, сервер работает
//  без серверного начисления (деградация, а не падение).
// ═══════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR = path.resolve(__dirname, '../js');

// Порядок важен: economy.js и invasions.js используют константы из config.js
const FILES = ['config.js', 'physics.js', 'state.js', 'economy.js', 'invasions.js'];

function noop() {}

function makeElement() {
  const el = {
    style: {}, dataset: {}, innerHTML: '', textContent: '', value: '',
    children: [], width: 0, height: 0,
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop, removeChild: noop, remove: noop,
    setAttribute: noop, getAttribute: () => null,
    addEventListener: noop, removeEventListener: noop,
    querySelector: () => makeElement(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }),
    getContext: () => null,
  };
  return el;
}

function makeDomStub() {
  return {
    getElementById: () => makeElement(),
    querySelector: () => makeElement(),
    querySelectorAll: () => [],
    getElementsByClassName: () => [],
    createElement: () => makeElement(),
    addEventListener: noop,
    removeEventListener: noop,
    body: makeElement(),
    documentElement: makeElement(),
    visibilityState: 'visible',
    cookie: '',
  };
}

function makeStorageStub() {
  return {
    getItem: () => null,
    setItem: noop,
    removeItem: noop,
    clear: noop,
  };
}

/**
 * Загружает игровые скрипты в изолированный vm-контекст.
 * @returns {{
 *   setState: (save:object)=>void,
 *   rates: ()=>{dust:number,energy:number,civ:number},
 *   resourceCap: (res:string)=>number,
 *   accrueOffline: (save:object, elapsedSec:number)=>{data:object,earned:object},
 *   config: {offlineEfficiency:number}
 * }}
 */
export function createGameCore() {
  const sandbox = {
    console: { log: noop, warn: noop, error: noop, info: noop },
    document: makeDomStub(),
    localStorage: makeStorageStub(),
    sessionStorage: makeStorageStub(),
    performance: { now: () => Date.now() },
    navigator: { userAgent: 'node-game-core', language: 'ru-RU' },
    location: { href: 'http://localhost/', origin: 'http://localhost', reload: noop },
    setTimeout: () => 0,
    clearTimeout: noop,
    setInterval: () => 0,
    clearInterval: noop,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: noop,
    fetch: () => Promise.reject(new Error('no network in game-core')),
    alert: noop, confirm: () => false, prompt: () => '',
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    Audio: function Audio() { return { play: noop, pause: noop, volume: 1, loop: false, currentTime: 0, src: '' }; },
    Image: function Image() { return makeElement(); },
  };
  // window обязан быть тем же объектом, что и глобальный контекст:
  // игра вешает публичное API на window.
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.top = sandbox;
  sandbox.parent = sandbox;

  vm.createContext(sandbox);

  for (const file of FILES) {
    const code = fs.readFileSync(path.join(GAME_DIR, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }

  // const-биндинги не попадают в глобальный объект, поэтому забираем
  // их отдельным скриптом в том же контексте (как в smoke-тесте).
  const api = vm.runInContext(
    `({
      STAGES: STAGES,
      CFG: CFG,
      STORAGE_CFG: STORAGE_CFG,
      getResourceCap: getResourceCap,
      dustPerSec: dustPerSec,
      energyPerSec: energyPerSec,
      civPerSec: civPerSec,
      metalsPerSec: metalsPerSec,
      planetRate: planetRate,
      CHEST_CFG: CHEST_CFG,
      PREMIUM_CFG: PREMIUM_CFG,
      clickGain: clickGain,
      planetCost: planetCost,
      systemCost: systemCost,
      INVASION_CFG: INVASION_CFG,
      S: S
    })`,
    sandbox,
    { filename: 'game-core-bridge.js' }
  );

  const baseState = JSON.parse(JSON.stringify(api.S));
  const state = api.S;

  function setState(save) {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, JSON.parse(JSON.stringify(baseState)));
    for (const key of Object.keys(save || {})) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
      state[key] = save[key];
    }
  }

  function rates() {
    return {
      dust: Number(api.dustPerSec()) || 0,
      energy: Number(api.energyPerSec()) || 0,
      civ: Number(api.civPerSec()) || 0,
      metals: Number(api.metalsPerSec()) || 0,
    };
  }

  function resourceCap(res) {
    const cap = Number(api.getResourceCap(res));
    return isFinite(cap) ? cap : 0;
  }

  function storageCapHours(res, levels) {
    const lv = (levels || {})[res] || 1;
    const hours = Number(api.STORAGE_CFG.getDustCapHours(lv));
    return isFinite(hours) && hours > 0 ? hours : 0;
  }

  /**
   * Повторяет блок начисления из economy.js:applyOfflineProgress(),
   * но только ресурсы (пыль/энергия/цив). Миссии и вторжения остаются
   * на клиенте: это геймплей, а не валюта.
   * Входной сейв не мутируется.
   */
  function accrueOffline(save, elapsedSec) {
    const updated = JSON.parse(JSON.stringify(save));
    setState(updated);

    const eff = Number(api.CFG.offlineEfficiency) || 0;
    const levels = updated.storageLevels || { dust: 1, energy: 1, civ: 1 };
    const earned = { dust: 0, energy: 0, civ: 0, metals: 0 };
    const seconds = Math.max(0, Number(elapsedSec) || 0);

    const r = rates();

    // Пыль (с накоплением dustTotal, как в игре)
    if (r.dust > 0) {
      const cappedSec = Math.min(seconds, storageCapHours('dust', levels) * 3600);
      const want = Math.floor(r.dust * cappedSec * eff);
      if (want > 0) {
        const available = resourceCap('dust') - Number(updated.dust);
        if (available > 0) {
          const actual = Math.min(want, available);
          updated.dust = Number(updated.dust) + actual;
          updated.dustTotal = (Number(updated.dustTotal) || 0) + actual;
          earned.dust = actual;
        }
      }
    }

    // Энергия
    if (r.energy > 0) {
      const cappedSec = Math.min(seconds, storageCapHours('energy', levels) * 3600);
      const want = Math.floor(r.energy * cappedSec * eff);
      if (want > 0) {
        const available = resourceCap('energy') - Number(updated.energy);
        if (available > 0) {
          const actual = Math.min(want, available);
          updated.energy = Number(updated.energy) + actual;
          earned.energy = actual;
        }
      }
    }

    // Цивилизация (дробная, без floor — как в игре)
    if (r.civ > 0) {
      const cappedSec = Math.min(seconds, storageCapHours('civ', levels) * 3600);
      const want = r.civ * cappedSec * eff;
      if (want > 0) {
        const available = resourceCap('civ') - Number(updated.civLevel);
        if (available > 0) {
          const actual = Math.min(want, available);
          updated.civLevel = Number(updated.civLevel) + actual;
          earned.civ = Math.floor(actual);
        }
      }
    }

    // Металлы (кап metalsCap() уже включает часы, секунды не режем отдельно)
    if (r.metals > 0) {
      const available = resourceCap('metals') - Number(updated.metalAmount);
      if (available > 0) {
        const want = Math.floor(r.metals * seconds * eff);
        const actual = Math.min(want, available);
        updated.metalAmount = Number(updated.metalAmount) + actual;
        earned.metals = actual;
      }
    }

    return { data: updated, earned };
  }

  /**
   * Предпросмотр офлайн-вторжений по серверному времени. Нужен только для
   * уведомлений («пока вас не было, вас атаковали»), игровые потери всё
   * равно считает клиент при возвращении.
   */
  function previewOfflineInvasions(save, elapsedSec) {
    try {
      const updated = JSON.parse(JSON.stringify(save));
      setState(updated);
      const cfg = api.INVASION_CFG || {};
      const now = Date.now();
      const totalMs = Math.max(0, (Number(elapsedSec) || 0) * 1000);
      if (totalMs < 30 * 1000) return { skipped: true, reason: 'too_short' };
      if (!(state.stage === 'system' || state.stage === 'galaxy')) return { skipped: true, reason: 'stage' };

      const startMs = now - totalMs;
      const shieldUntil = Math.max(0, Number(state.shieldUntil) || 0);
      const protectedMs = Math.max(0, Math.min(now, shieldUntil) - startMs);
      const unprotectedMs = totalMs - Math.min(totalMs, protectedMs);
      if (unprotectedMs < 30 * 1000) return { skipped: true, reason: 'shield' };

      const hours = unprotectedMs / 3600000;
      const n = cfg.neglect || {};
      const level = (typeof sandbox.invasionNeglectLevel === 'function')
        ? Number(sandbox.invasionNeglectLevel(hours)) || 0 : 0;
      const intervalH = Math.max(0.25, (Number(cfg.offlineAttackInterval) || 3 * 3600 * 1000) / 3600000);
      let attacks = Math.floor(hours / intervalH);
      if (level > 0) attacks += level * Math.max(0, Number(n.attacksPerLevel) || 0);
      const maxAttacks = Math.max(0, Number(n.maxAttacks) || Number(cfg.offlineAttackMax) || 5);
      attacks = Math.min(maxAttacks, attacks);
      if (attacks <= 0) return { skipped: true, reason: 'no_attacks' };

      // ★ Расписание волн тем же способом, что и в клиенте
      //   (js/economy.js simulateOfflineInvasions): сервер по нему решает,
      //   когда присылать «Вторжение!», пока игрок офлайн.
      const attackWindowStartMs = startMs + Math.min(totalMs, protectedMs);
      const attackStepMs = unprotectedMs / attacks;

      // Максимальная сложность, которая может выпасть: чем выше запустение,
      // тем чаще тяжёлые волны. Точный бросок остаётся за клиентом.
      const tiers = cfg.tiers || {};
      let maxDifficulty = 1;
      for (const key of Object.keys(tiers)) {
        maxDifficulty = Math.max(maxDifficulty, Number(tiers[key].difficulty) || 1);
      }

      return {
        attacks: attacks,
        neglectLevel: level,
        awayHours: Math.round(hours * 100) / 100,
        shieldProtected: protectedMs > 0,
        maxDifficulty: maxDifficulty,
        lossCapShare: Math.min(
          Number(n.lossCapShareMax) || 0.8,
          (Number(cfg.nightLossCapShare) || 0.4) + level * (Number(n.lossCapSharePerLevel) || 0)
        ),
        attackWindowStartMs: Math.round(attackWindowStartMs),
        attackStepMs: Math.round(attackStepMs),
      };
    } catch (e) {
      return null;
    }
  }
  /**
   * Сколько часов осталось до запустения галактики и какой уровень уже активен.
   * Порог берётся из INVASION_CFG.neglect — тех же данных, что читает клиент,
   * чтобы предупреждение срабатывало ровно за столько же часов до штрафа.
   * @param {number} hours — часы отсутствия БЕЗ учёта щита
   */
  function neglectStatus(hours) {
    try {
      const cfg = (api.INVASION_CFG && api.INVASION_CFG.neglect) || {};
      const thresholdHours = Number(cfg.thresholdHours) || 72;
      const h = Math.max(0, Number(hours) || 0);
      const level = (typeof sandbox.invasionNeglectLevel === 'function')
        ? Number(sandbox.invasionNeglectLevel(h)) || 0
        : 0;
      return {
        level: level,
        thresholdHours: thresholdHours,
        hoursToNeglect: level > 0 ? 0 : Math.max(0, thresholdHours - h),
      };
    } catch (e) {
      return null;
    }
  }

  return {
    setState,
    rates,
    resourceCap,
    storageCapHours,
    neglectStatus,
    // Параметры вторжений: сервер должен строить объект ровно по тем же
    // длительностям/HP, что и клиент (js/config.js: INVASION_CFG).
    invasionConfig: function() {
      try {
        const c = api.INVASION_CFG || {};
        const tiers = {};
        const src = c.tiers || {};
        for (const key of Object.keys(src)) {
          tiers[key] = {
            label: String(src[key].label || key),
            weight: Number(src[key].weight) || 0,
          };
        }
        return {
          shipsBase: Number(c.shipsBase) || 3,
          shipsMax: Number(c.shipsMax) || 5,
          robberyDuration: Number(c.robberyDuration) || 45 * 60 * 1000,
          destructionDuration: Number(c.destructionDuration) || 15 * 60 * 1000,
          totalDuration: Number(c.totalDuration) || 60 * 60 * 1000,
          planetMaxHP: Number(c.planetMaxHP) || 100,
          tiers: tiers,
        };
      } catch (e) {
        return null;
      }
    },
    // Доход за один клик при текущем состоянии игры
    chestLoot: function() {
      try { return JSON.parse(JSON.stringify(api.CHEST_CFG.lootTable || [])); }
      catch (e) { return []; }
    },
    // Доход за один клик при текущем состоянии игры
    clickGain: function() { return Number(api.clickGain()) || 0; },
    // Стоимость планет и систем по игровым ценам
    planetCost: function(n) { return Number(api.planetCost(n)) || 0; },
    systemCost: function(n) { return Number(api.systemCost(n)) || 0; },
    // Суммарная цена `count` орбит — так же, как её считает capability()
    planetCostSum: function(count) {
      const n = Math.max(0, Math.floor(Number(count) || 0));
      let total = 0;
      for (let i = 0; i < n; i++) total += Number(api.planetCost(i)) || 0;
      return Number.isFinite(total) ? total : 0;
    },
    // Параметры платного бустера дохода (из PREMIUM_CFG)
    boosterConfig: function() {
      const b = (api.PREMIUM_CFG && api.PREMIUM_CFG.booster) || {};
      return {
        costMetals: Number(b.costMetals) || 0,
        hours: Number(b.hours) || 0,
        incomeMult: Number(b.incomeMult) || 1,
      };
    },
    // Стоимость текущих «возможностей» (все планеты + все системы) в пыли
    capability: function() {
      try {
        let total = 0;
        const planets = Array.isArray(api.S.planets) ? api.S.planets : [];
        for (let i = 0; i < planets.length; i++) total += Number(api.planetCost(i)) || 0;

        const systems = Array.isArray(api.S.otherSystems) ? api.S.otherSystems : [];
        for (let s = 0; s < systems.length; s++) {
          const list = systems[s] && Array.isArray(systems[s].planets) ? systems[s].planets : [];
          for (let i = 0; i < list.length; i++) total += Number(api.planetCost(i)) || 0;
        }

        const count = Math.max(0, Number(api.S.systems) || 0);
        for (let i = 0; i < count; i++) total += Number(api.systemCost(i)) || 0;

        return Number.isFinite(total) ? total : 0;
      } catch (e) {
        return 0;
      }
    },
    // Все три лимита сразу (для кошелька)
    caps: function() {
      return {
        dust: resourceCap('dust'),
        energy: resourceCap('energy'),
        civ: resourceCap('civ'),
        metals: resourceCap('metals'),
      };
    },
    accrueOffline,
    previewOfflineInvasions,
    config: { offlineEfficiency: Number(api.CFG.offlineEfficiency) || 0 },
  };
}
