// This is a runner file to handle all parameter are given
const { existsSync } = require('fs');
const { resolve } = require('path');
const { Telegraf } = require('telegraf');
const parse = require('minimist');

const defaultCb = (req, res) => {
  res.statusCode = 404;
  res.end();
};

const config = parse(process.argv, {
  alias: {
    p: 'port',
    H: 'host',
    d: 'domain',
    e: 'env',
    t: 'token',
  },
  default: {
    H: '0.0.0.0',
  },
});

if (typeof config.env == 'string') {
  if (existsSync(config.env)) {
    require('dotenv').config({ path: resolve(config.env) });
  } else {
    console.log(`Error : No such file on ${resolve(config.env)}`);
    process.exit();
  }
}

if (!process.env.BOT_TOKEN) {
  if (!config.token) {
    console.log(`Error: Please provide BOT TOKEN`);
    process.exit();
  }
  process.env.BOT_TOKEN = config.token;
}

const bot = new Telegraf(process.env.BOT_TOKEN);
// Catch all errors
bot.catch((err) => {
  console.log('Program Error : ', err);
});

let botServer, botModule;
try {
  botServer = require(resolve('src/server'));
} catch (err) {
  botServer = defaultCb;
}
try {
  botModule = require(resolve('src/bot'));
  bot.use(botModule);
} catch (err) {
  console.log('Error: ' + err.message);
  process.exit(0);
}

if (config.port) {
  console.log('Bot : Webhook starting');
  bot
    .launch({
      webhook: {
        domain: process.env.BOT_DOMAIN || config.domain,
        host: config.host,
        port: config.port,
        cb: botServer,
      },
    })
    .catch((err) => {
      console.log(err);
    });
} else {
  console.log('Bot : Polling starting');
  bot.launch().catch((err) => {
    console.log(err);
  });
}

// grateful stop
process.once('SIGINT', () => {
  console.log('Bot : Stopping');
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  console.log('Bot : Stopping');
  bot.stop('SIGTERM');
});
