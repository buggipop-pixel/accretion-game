// ═══════════════════════════════════════════════════════════════
//  WEBHOOK API TEST — защита от опечаток в именах методов
//  node-telegram-bot-api.
//
//  История: в server.js было `bot.setWebhook(...)`/`getWebhookInfo()`,
//  а в библиотеке методы называются `setWebHook`/`getWebHookInfo`
//  (большая H). Сервер падал на старте с TypeError и Render отдавал 502.
//  Запуск: node tests/webhook-api-test.js
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) { console.log('✅ ' + name); passed++; }
  else { console.error('❌ ' + name + (extra ? ' → ' + extra : '')); failed++; }
}

const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot('123456:TESTTOKEN', { polling: false });

check('Библиотека: bot.setWebHook — функция', typeof bot.setWebHook === 'function');
check('Библиотека: bot.getWebHookInfo — функция', typeof bot.getWebHookInfo === 'function');
check('Библиотека: bot.deleteWebHook — функция', typeof bot.deleteWebHook === 'function');

const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
check('server.js использует setWebHook (не setWebhook)',
  server.indexOf('bot.setWebHook(') !== -1 && server.indexOf('bot.setWebhook(') === -1);
check('server.js использует getWebHookInfo (не getWebhookInfo)',
  server.indexOf('bot.getWebHookInfo(') !== -1 && server.indexOf('bot.getWebhookInfo(') === -1);
check('Регистрация вебхука обёрнута в try/catch (падение не роняет сервер)',
  /function tryRegister\(\)[\s\S]{0,400}try \{/.test(server) &&
  /try \{\s*registerTelegramWebhook\(\);/.test(server));

console.log('========================================');
console.log('ИТОГО: Пройдено ' + passed + ', Провалено ' + failed);
console.log('========================================');
if (failed > 0) process.exit(1);
