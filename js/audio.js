// ═══════════════════════════════════════════════════════════════
//  AUDIO.JS — Web Audio API (стабильный звук в Telegram/Web)
//  Полная замена старого HTML5 Audio на AudioContext
// ═══════════════════════════════════════════════════════════════

const SFX_FILES = {
  'click':        'audio/ui_click.wav',
  'ui_open':      'audio/ui_click.wav',
  'ui_close':     'audio/ui_click.wav',
  'ui_error':     'audio/UI Error.wav',
  'ui_purchase':  'audio/ui_purchase.wav',
  'ui_levelup':   'audio/ui_levelup.wav',
  'explosion':    'audio/explosion.wav',
  'merge':        'audio/merge.wav',
  'planet_form':  'audio/planet_form.wav',
  'star_ignite':  'audio/star_ignite.wav',
  'evolution':    'audio/evolution.wav',
  'prestige':     'audio/prestige.wav',
  'invasion':     'audio/invasion.wav',
  'comet':        'audio/comet.wav',
  'system_form':  'audio/system_form.wav',
  'expedition':   'audio/comet.wav',
  'pulsar':       'audio/ui_levelup.wav',
  'blackhole_hum':'audio/ambient_deep.wav',
  'wormhole':     'audio/ui_purchase.wav',
  'quasar':       'audio/prestige.wav',
  'ambient':      'audio/ambient_deep.wav'
};

const audioBuffers = {}; // Здесь хранятся декодированные звуки в памяти
let audioCtx = null;
let isAudioUnlocked = false;
let ambientSource = null;
let ambientGain = null;

function initAudio() {
  if (audioCtx) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  
  audioCtx = new AudioContextClass();
  
  // Загружаем все файлы в память (асинхронно)
  for (let key in SFX_FILES) {
    fetch(SFX_FILES[key])
      .then(res => res.arrayBuffer())
      .then(buf => audioCtx.decodeAudioData(buf))
      .then(decoded => {
        audioBuffers[key] = decoded;
      })
      .catch(e => console.warn('Ошибка загрузки звука: ' + key));
  }
}

function unlockAudio() {
  if (isAudioUnlocked || !audioCtx) return;
  isAudioUnlocked = true;
  
  // Telegram и браузеры требуют возобновить контекст после клика
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  
  if (S.settings && S.settings.sound) {
    startAmbient();
  }
}

function playSFX(type) {
  if (!S.settings || !S.settings.sound || !isAudioUnlocked || !audioCtx) return;
  
  let key = type;
  if (!audioBuffers[key] && type.indexOf('sfx_') === 0) key = type.replace('sfx_', '');
  if (!audioBuffers[key] && type.indexOf('sfx_') !== 0) key = 'sfx_' + type;
  
  const buffer = audioBuffers[key];
  if (!buffer) return;

  // Создаем независимый источник звука (позволяет наслаивать звуки)
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  
  // Настраиваем громкость
  const gainNode = audioCtx.createGain();
  if (type.indexOf('explosion') !== -1 || type.indexOf('invasion') !== -1) {
    gainNode.gain.value = 0.3; // Взрывы чуть тише
  } else {
    gainNode.gain.value = 0.6;
  }
  
  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  source.start(0);
}

function startAmbient() {
  if (ambientSource || !isAudioUnlocked || !audioCtx) return;
  
  // Ждем, пока эмбиент загрузится в память
  const checkBuffer = setInterval(() => {
    if (audioBuffers['ambient']) {
      clearInterval(checkBuffer);
      
      ambientSource = audioCtx.createBufferSource();
      ambientSource.buffer = audioBuffers['ambient'];
      ambientSource.loop = true;
      
      ambientGain = audioCtx.createGain();
      ambientGain.gain.value = 0.15; // Тихий космический фон
      
      ambientSource.connect(ambientGain);
      ambientGain.connect(audioCtx.destination);
      ambientSource.start(0);
    }
  }, 500);
}

function stopAmbient() {
  if (ambientSource) {
    try { ambientSource.stop(); } catch(e) {}
    ambientSource = null;
  }
}

function toggleSound() {
  if (!S.settings) S.settings = { brightness: 1.0, sound: true };
  S.settings.sound = !S.settings.sound;
  
  if (S.settings.sound) {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    unlockAudio();
  } else {
    stopAmbient();
  }
  if (typeof saveGame === 'function') saveGame();
  if (typeof updateUI === 'function') updateUI();
  return S.settings.sound;
}

window.playSFX = playSFX;
window.toggleSound = toggleSound;
window.unlockAudio = unlockAudio;
window.initAudio = initAudio;
window.startAmbient = startAmbient;
window.stopAmbient = stopAmbient;