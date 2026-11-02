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
      planetRate: planetRate,
      CHEST_CFG: CHEST_CFG,
      clickGain: clickGain,
      planetCost: planetCost,
      systemCost: systemCost,
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
    const earned = { dust: 0, energy: 0, civ: 0 };
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

    return { data: updated, earned };
  }

  return {
    setState,
    rates,
    resourceCap,
    storageCapHours,
    // Таблица лута сундука (для серверного RNG)
    chestLoot: function() {
      try { return JSON.parse(JSON.stringify(api.CHEST_CFG.lootTable || [])); }
      catch (e) { return []; }
    },
    // Доход за один клик при текущем состоянии игры
    clickGain: function() { return Number(api.clickGain()) || 0; },
    // Стоимость планет и систем по игровым ценам
    planetCost: function(n) { return Number(api.planetCost(n)) || 0; },
    systemCost: function(n) { return Number(api.systemCost(n)) || 0; },
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
      };
    },
    accrueOffline,
    config: { offlineEfficiency: Number(api.CFG.offlineEfficiency) || 0 },
  };
}
