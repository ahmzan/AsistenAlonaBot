const { readFileSync, existsSync, unlinkSync } = require('fs');
const { resolve } = require('path');
const { Composer, session, Telegraf } = require('telegraf');
const { writeFileAndDir } = require('./util');
const database = require('./database');
const bot = new Composer();
const db = new database({ connectionString: process.env.DATABASE_URL });

// bot.use(session());
// bot.use(Telegraf.log());

bot.use(async (ctx, next) => {
  console.time(`${ctx.update.update_id}-${ctx.updateType}`);
  await next();
  console.timeEnd(`${ctx.update.update_id}-${ctx.updateType}`);
});

bot.start((ctx) => {
  console.log('Command /start');
  let user = ctx.from;
  let params = ctx.message.text.split(' ');
  if (params[1] == 'add') {
    return;
  }
  let msg = readFileSync(resolve('text/start'), 'utf8');
  msg = msg.replace(
    /{name}/,
    `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`
  );
  db.query({
    text: 'SELECT * FROM users where user_id = $1',
    values: [user.id],
  }).then((res) => {
    if (res.rowCount == 0) {
      db.query({
        text:
          'INSERT INTO users(user_id, name, first_started) VALUES($1, $2, $3)',
        values: [user.id, user.first_name, new Date().getTime()],
      });
    }
  });
  return ctx.replyWithHTML(msg, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Tambahkan ke group',
            url: 'https://t.me/asistenalonabot?startgroup=add',
          },
        ],
      ],
    },
  });
});

bot.help((ctx) => {
  console.log('Command /help');
  let msg = readFileSync(resolve('text/help'), 'utf8');
  return ctx.replyWithHTML(msg);
});

bot.on('new_chat_members', (ctx) => {
  let new_members = ctx.message.new_chat_members;
  new_members.forEach((member) => {
    if (member.username == ctx.botInfo.username) {
      // Bot ditambahkan ke group
      let user_added = ctx.from;
      let group = ctx.chat;
      let code = Math.floor(Math.random() * (999999 - 100000 + 1) + 100000);
      console.log(`New Member on ${group.title}`);
      writeFileAndDir(
        `tmp/verif/${code}`,
        JSON.stringify({
          code: code,
          userid: user_added.id,
          groupid: group.id,
          groupname: group.title,
        })
      );
      let msg = readFileSync(resolve('text/success'), 'utf-8');
      msg = msg.replace(/{groupname}/, group.title).replace(/{code}/, code);
      db.query({
        text: 'SELECT * FROM groups WHERE group_id = $1',
        values: [group.id],
      })
        .then((res) => {
          if (res.rowCount == 0) {
            db.query({
              text:
                'INSERT INTO groups(group_id, group_title, first_added) VALUES($1, $2, $3)',
              values: [group.id, group.title, new Date().getTime()],
            });
          }
        })
        .catch((e) => {
          console.error(e.message);
        });
      return db
        .query({
          text: 'SELECT * FROM users WHERE user_id = $1',
          values: [user_added.id],
        })
        .then((res) => {
          if (res.rowCount >= 0 && !res.rows[0].blocked) {
            ctx.reply(
              'Terima kasih, kode verifikasi telah di kirim melalui private message'
            );
            return ctx.telegram.sendMessage(user_added.id, msg, {
              parse_mode: 'HTML',
            });
          }
        })
        .catch((e) => {
          console.error(e.message);
        });
    } else {
      // Member lain yang ditambahkan
      return;
    }
  });
});

bot.on('channel_post', (ctx) => {
  let channel_post = ctx.channelPost;
  if (existsSync(resolve(`tmp/verif/${channel_post.text}`))) {
    let temp_data = JSON.parse(
      readFileSync(resolve(`tmp/verif/${channel_post.text}`), 'utf8')
    );
    let data = {
      groupid: temp_data.groupid,
      channelid: channel_post.chat.id,
      trigger: '#post',
    };
    let msg = readFileSync(resolve('text/done'), 'utf8');
    msg = msg
      .replace(/{groupname}/, temp_data.groupname)
      .replace(/{channelname}/, channel_post.chat.title);
    writeFileAndDir(`data/${temp_data.groupid}.json`, JSON.stringify(data));
    ctx.deleteMessage(channel_post.message_id).catch((err) => {
      console.log('Message already deleted');
    });
    unlinkSync(`tmp/verif/${channel_post.text}`);
    db.query({
      text: 'SELECT * FROM channels WHERE channel_id = $1',
      values: [channel_post.chat.id],
    }).then((res) => {
      if (res.rowCount == 0) {
        db.query({
          text:
            'INSERT INTO channels(channel_id, channel_title, first_added) VALUES($1, $2, $3)',
          values: [
            channel_post.chat.id,
            channel_post.chat.title,
            new Date().getTime(),
          ],
        });
      }
    });
    db.query({
      text:
        'SELECT * FROM groups_forward WHERE group_id = $1 OR channel_id = $2',
      values: [data.groupid, data.channelid],
    }).then((res) => {
      if (res.rowCount == 0) {
        db.query({
          text:
            'INSERT INTO groups_forward(group_id, channel_id, data) VALUES($1, $2, $3)',
          values: [data.groupid, data.channelid, JSON.stringify(data)],
        });
      }
    });
    return ctx.telegram.sendMessage(temp_data.userid, msg, {
      parse_mode: 'HTML',
    });
  }
});

bot.on('text', (ctx) => {
  let group = ctx.chat;
  let msg = ctx.message;
  if (!existsSync(`data/${group.id}.json`)) {
    db.query({
      text: 'SELECT * FROM groups_forward WHERE group_id = $1',
      values: [group.id],
    }).then((res) => {
      if (res.rowCount > 0) {
        writeFileAndDir(
          `data/${group.id}.json`,
          JSON.stringify(res.rows[0].data)
        );
      }
      var data = res.rows[0].data;
      if (new RegExp(data.trigger, 'g').test(msg.text)) {
        return ctx.telegram
          .forwardMessage(data.channelid, group.id, msg.message_id)
          .then((f_msg) => {
            ctx.deleteMessage(msg.message_id);
          });
      }
    });
  } else {
    var data = JSON.parse(readFileSync(`data/${group.id}.json`, 'utf-8'));
    if (new RegExp(data.trigger, 'g').test(msg.text)) {
      return ctx.telegram
        .forwardMessage(data.channelid, group.id, msg.message_id)
        .then((f_msg) => {
          ctx.deleteMessage(msg.message_id);
        });
    }
  }
});

module.exports = bot;

// Closing database connection
process.once('SIGINT', () => {
  console.log('DB : Closing');
  db.close();
});
process.once('SIGTERM', () => {
  console.log('DB : Closing');
  db.close();
});
