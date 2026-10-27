// ═══════════════════════════════════════════════════════════════
//  AUDIO.JS — Процедурный синтез звука (Web Audio API)
// ═══════════════════════════════════════════════════════════════

// Глобальная громкость (от 0.0 до 1.0) - настраивай здесь
const MASTER_VOLUME = 0.4; 
const AMBIENT_VOLUME = 0.15;

let audioCtx = null;
let isAudioUnlocked = false;
let ambientSource = null;
let ambientGain = null;

function initAudio() {
  if (audioCtx) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioCtx = new AudioContextClass();
}

function unlockAudio() {
  if (isAudioUnlocked || !audioCtx) return;
  isAudioUnlocked = true;
  
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  if (S.settings && S.settings.sound) startAmbient();
}

// ─── Базовые генераторы звука ───────────────────────────────────
function playTone(freq, type, duration, vol, slideToFreq) {
  if (!audioCtx || !isAudioUnlocked) return;
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = type; // 'sine', 'square', 'sawtooth', 'triangle'
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  
  if (slideToFreq) {
    osc.frequency.exponentialRampToValueAtTime(slideToFreq, audioCtx.currentTime + duration);
  }
  
  gain.gain.setValueAtTime(vol * MASTER_VOLUME, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function playNoise(duration, vol, filterFreq) {
  if (!audioCtx || !isAudioUnlocked) return;
  
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFreq || 1000, audioCtx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + duration);
  
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(vol * MASTER_VOLUME, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
  
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  
  noise.start();
}

// ─── ПРОИГРЫВАНИЕ ЗВУКОВ ────────────────────────────────────────
function playSFX(type) {
  if (!S.settings || !S.settings.sound || !isAudioUnlocked || !audioCtx) return;
  
  switch (type) {
    case 'click':
    case 'ui_click':
      // Мягкий, короткий клик
      playTone(600, 'sine', 0.05, 0.2);
      break;
      
    case 'ui_open':
      // Восходящий свист
      playTone(400, 'sine', 0.15, 0.3, 800);
      break;
      
    case 'ui_close':
      // Нисходящий свист
      playTone(600, 'sine', 0.1, 0.2, 300);
      break;
      
    case 'ui_error':
      // Низкий неприятный гудок
      playTone(150, 'square', 0.2, 0.3);
      break;
      
    case 'ui_purchase':
      // Двойной приятный "блип"
      playTone(600, 'triangle', 0.1, 0.3);
      setTimeout(() => playTone(800, 'triangle', 0.15, 0.3), 100);
      break;
      
    case 'ui_levelup':
    case 'sfx_system_form':
      // Арпеджио вверх (победа)
      playTone(400, 'sine', 0.1, 0.3);
      setTimeout(() => playTone(500, 'sine', 0.1, 0.3), 100);
      setTimeout(() => playTone(700, 'sine', 0.2, 0.4), 200);
      break;
      
    case 'explosion':
    case 'sfx_explosion':
    case 'invasion_destroy':
      // Взрыв: шум + низкий бас
      playNoise(0.8, 0.8, 1500);
      playTone(80, 'sawtooth', 0.5, 0.5, 30);
      break;
      
    case 'merge':
    case 'sfx_merge':
    case 'planet_form':
    case 'sfx_planet_form':
      // Слияние: мягкий колокольчик
      playTone(300, 'sine', 0.2, 0.3, 500);
      break;
      
    case 'invasion':
    case 'sfx_invasion':
      // Вторжение: тревожная сирена
      playTone(200, 'sawtooth', 0.4, 0.3, 400);
      playTone(205, 'square', 0.4, 0.2, 405); // Диссонанс
      break;
      
    case 'prestige':
    case 'sfx_prestige':
    case 'evolution':
    case 'sfx_evolution':
      // Мощный бум и свист
      playNoise(1.5, 0.6, 800);
      playTone(100, 'sine', 1.5, 0.5, 800);
      break;
      
    default:
      // Дефолтный клик, если звук не найден
      playTone(400, 'sine', 0.05, 0.1);
  }
}

// ─── ФОНОВЫЙ ЭМБИЕНТ ────────────────────────────────────────────
function startAmbient() {
  if (ambientSource || !isAudioUnlocked || !audioCtx) return;
  
  // Оставляем .wav для фона, так как он хорошо звучит
  const audio = new Audio('audio/ambient_deep.wav');
  audio.loop = true;
  audio.volume = AMBIENT_VOLUME;
  
  audio.play().catch(e => console.warn('Фон не запустился:', e));
  
  // Заглушка для совместимости со старой логикой
  ambientSource = { stop: () => { audio.pause(); audio.currentTime = 0; } };
}

function stopAmbient() {
  if (ambientSource) {
    ambientSource.stop();
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