const { readFileSync } = require('fs');
const { resolve } = require('path');
const { Composer } = require('telegraf');
const bot = new Composer();

bot.use(async (ctx, next) => {
  console.time(ctx.update.update_id);
  await next();
  console.timeEnd(ctx.update.update_id);
});

bot.start((ctx) => {
  console.log('Command /start');
  let user = ctx.from;
  let msg = readFileSync(resolve('text/start'), 'utf8');
  msg = msg.replace(
    /{name}/,
    `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`
  );
  return ctx.replyWithHTML(msg);
});

module.exports = bot;
