// ═══════════════════════════════════════════════════════════════
//  AUDIO TEST — проверка жизненного цикла звука (js/audio.js)
//  Запуск:  node tests/audio-test.js
//  Регресс: после «Выкл → Вкл» фоновый звук должен возвращаться,
//  а уснувший AudioContext — просыпаться на жесте пользователя.
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const AUDIO_PATH = path.join(__dirname, '..', 'js', 'audio.js');

// ─── Счётчики и моки браузерного окружения ─────────────────────
let results = { pass: 0, fail: 0 };

function check(name, condition, details) {
  if (condition) {
    results.pass++;
    console.log('✅ ' + name);
  } else {
    results.fail++;
    console.log('❌ ' + name + (details ? ' — ' + details : ''));
  }
}

function makeSandbox() {
  const stats = {
    audioElements: 0,
    plays: 0,
    pauses: 0,
    resumes: 0,
    resumeCalls: 0,
  };
  const warnings = [];
  const consoleMock = {
    log: (...args) => console.log(...args),
    warn: (...args) => warnings.push(args.map(String).join(' ')),
    error: (...args) => console.error(...args),
  };

  // Мок <audio>: один элемент на сеанс, играет/на паузе
  class AudioMock {
    constructor(src) {
      this.src = src;
      this.loop = false;
      this.preload = '';
      this.volume = 1;
      this.currentTime = 0;
      this.paused = true;
      stats.audioElements++;
    }
    play() {
      stats.plays++;
      if (AudioMock.nextPlayError) {
        AudioMock.nextPlayError = false;
        return Promise.reject(new Error('NotAllowedError'));
      }
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      stats.pauses++;
      this.paused = true;
    }
  }
  AudioMock.nextPlayError = false;

  // Мок AudioContext: стартует suspended, как в реальном браузере
  class AudioContextMock {
    constructor() {
      this.state = 'suspended';
      this.sampleRate = 44100;
      this.currentTime = 0;
      this.destination = {};
    }
    resume() {
      stats.resumeCalls++;
      this.state = 'running';
      return Promise.resolve();
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        start() {},
        stop() {},
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
      };
    }
    createBuffer() {
      return { getChannelData: () => new Float32Array(8) };
    }
    createBufferSource() {
      return { buffer: null, connect() {}, start() {} };
    }
    createBiquadFilter() {
      return {
        type: 'lowpass',
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
      };
    }
  }

  const listeners = {};
  const documentMock = {
    visibilityState: 'visible',
    addEventListener(type, handler) {
      (listeners[type] = listeners[type] || []).push(handler);
    },
  };

  const sandbox = {
    console: consoleMock,
    Promise,
    Math,
    Float32Array,
    Uint8ClampedArray,
    Audio: AudioMock,
    document: documentMock,
    S: { settings: { brightness: 1, sound: true } },
  };
  sandbox.window = sandbox;
  sandbox.window.AudioContext = AudioContextMock;

  return { sandbox, stats, listeners, AudioMock, warnings };
}

function loadAudioModule() {
  const { sandbox, stats, listeners, AudioMock, warnings } = makeSandbox();
  const code = fs.readFileSync(AUDIO_PATH, 'utf8');
  const context = vm.createContext(sandbox);
  vm.runInContext(code, context, { filename: 'js/audio.js' });
  // Доступ к лексическим (let) переменным модуля для проверок
  vm.runInContext(
    'globalThis.__audioState = () => ({ ctx: audioCtx, unlocked: isAudioUnlocked, source: ambientSource });',
    context,
    { filename: 'audio-test-probe.js' }
  );
  sandbox.getState = () => vm.runInContext('__audioState()', context);
  sandbox.getCtx = () => vm.runInContext('audioCtx', context);
  sandbox.getAmbient = () => vm.runInContext('ambientAudio', context);
  sandbox.fireVisibility = () => {
    (listeners.visibilitychange || []).forEach((fn) => fn());
  };
  return { sandbox, context, stats, listeners, AudioMock, warnings };
}

// ─── Тесты ─────────────────────────────────────────────────────
async function testFirstUnlockStartsAmbient() {
  const { sandbox, stats } = loadAudioModule();

  sandbox.initAudio();
  sandbox.unlockAudio();

  check('первый жест: контекст разбужен', stats.resumeCalls >= 1, 'resumeCalls=' + stats.resumeCalls);
  check('первый жест: фоновый звук запущен', stats.plays === 1, 'plays=' + stats.plays);
  check('создан ровно один audio-элемент', stats.audioElements === 1, 'elements=' + stats.audioElements);
  check('фон не на паузе', sandbox.getAmbient().paused === false);
}

async function testToggleOffOnRestoresAmbient() {
  const { sandbox, stats } = loadAudioModule();

  sandbox.initAudio();
  sandbox.unlockAudio();
  const playsAfterUnlock = stats.plays;

  const turnedOff = sandbox.toggleSound();
  check('toggleSound выключает звук', turnedOff === false);
  check('выключение ставит фон на паузу', sandbox.getAmbient().paused === true);
  check('выключение не создаёт новый элемент', stats.audioElements === 1, 'elements=' + stats.audioElements);

  const turnedOn = sandbox.toggleSound();
  check('toggleSound включает звук обратно', turnedOn === true);
  check('★ после «Выкл → Вкл» фон снова играет', sandbox.getAmbient().paused === false);
  check('★ после «Выкл → Вкл» play() вызван повторно', stats.plays > playsAfterUnlock, 'plays=' + stats.plays);
  check('повторное включение не плодит audio-элементы', stats.audioElements === 1, 'elements=' + stats.audioElements);

  // Многократное переключение не должно ломать состояние (чётное — снова Вкл)
  for (let i = 0; i < 4; i++) sandbox.toggleSound();
  check('4 переключения подряд: фон снова играет', sandbox.getAmbient().paused === false);
  check('4 переключения подряд: элемент всё ещё один', stats.audioElements === 1, 'elements=' + stats.audioElements);
}

async function testRejectedPlayDoesNotWedgeAudio() {
  const { sandbox, stats, AudioMock, warnings } = loadAudioModule();

  // Автоплей-политика блокирует первый play()
  AudioMock.nextPlayError = true;
  sandbox.initAudio();
  sandbox.unlockAudio();
  await Promise.resolve(); // даём отработать .catch()
  await Promise.resolve();
  check('отказ play() залогирован предупреждением', warnings.length >= 1, 'warnings=' + warnings.length);

  check('отклонённый play() не считается запущенным фоном', sandbox.getAmbient().paused === true);
  check('после отказа фона ambientSource сброшен', sandbox.getState().source === null);

  // Следующий жест должен снова попробовать запустить фон, а не «залипнуть»
  const playsBefore = stats.plays;
  sandbox.unlockAudio();
  check('после отказа unlockAudio снова пытается запустить фон', stats.plays > playsBefore, 'plays=' + stats.plays);
  check('после отказа фон всё же заиграл', sandbox.getAmbient().paused === false);
}

async function testSuspendedContextResumesOnClick() {
  const { sandbox, stats } = loadAudioModule();

  sandbox.initAudio();
  sandbox.unlockAudio();
  const before = stats.resumeCalls;

  // Браузер усыпил контекст уже после разблокировки
  sandbox.getCtx().state = 'suspended';
  sandbox.unlockAudio();

  check('★ уснувший AudioContext просыпается повторно', stats.resumeCalls > before, 'resumeCalls=' + stats.resumeCalls);
  check('контекст снова running', sandbox.getCtx().state === 'running');
}

async function testVisibilityChangeRestoresAudio() {
  const { sandbox, stats } = loadAudioModule();

  sandbox.initAudio();
  sandbox.unlockAudio();

  sandbox.getCtx().state = 'suspended';
  sandbox.getAmbient().paused = true;
  const playsBefore = stats.plays;
  const resumesBefore = stats.resumeCalls;

  sandbox.fireVisibility();
  check('возврат на вкладку будит контекст', stats.resumeCalls > resumesBefore);
  check('возврат на вкладку возобновляет фон', stats.plays > playsBefore, 'plays=' + stats.plays);
}

async function testSoundDisabledNeverStarts() {
  const { sandbox, stats } = loadAudioModule();

  sandbox.S.settings.sound = false;
  sandbox.initAudio();
  sandbox.unlockAudio();
  check('при выключенном звуке фон не запускается', stats.plays === 0, 'plays=' + stats.plays);

  const on = sandbox.toggleSound();
  check('включение из выключенного состояния работает', on === true && sandbox.getAmbient().paused === false);
}

async function main() {
  console.log('========================================');
  console.log('🔊 ТЕСТЫ ЗВУКА');
  console.log('========================================');

  await testFirstUnlockStartsAmbient();
  await testToggleOffOnRestoresAmbient();
  await testRejectedPlayDoesNotWedgeAudio();
  await testSuspendedContextResumesOnClick();
  await testVisibilityChangeRestoresAudio();
  await testSoundDisabledNeverStarts();

  console.log('========================================');
  console.log('ИТОГО: Пройдено ' + results.pass + ', Провалено ' + results.fail);
  if (results.fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Ошибка теста:', e);
  process.exit(1);
});
