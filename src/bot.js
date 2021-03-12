const { readFileSync, existsSync, unlinkSync } = require('fs');
const { resolve } = require('path');
const { Composer, session, Telegraf } = require('telegraf');
const { writeFileAndDir } = require('./util');
const database = require('./database');
const bot = new Composer();
const db = new database({ connectionString: process.env.DATABASE_URL });

bot.use(session());
// bot.use(Telegraf.log());

bot.use(async (ctx, next) => {
  console.time(`${ctx.update.update_id}-${ctx.updateType}`);
  await next();
  console.timeEnd(`${ctx.update.update_id}-${ctx.updateType}`);
});

bot.start((ctx) => {
  console.log('Command /start');
  let user = ctx.from;
  if (ctx.chat.type != 'private') {
    let params = ctx.message.text.split(' ');
    if (params[1] == 'add') {
      return;
    } else {
      return ctx.reply('ada yang bisa dibantu');
    }
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
            url: `https://t.me/${ctx.botInfo.username}?startgroup=add`,
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

bot.command('settag', (ctx) => {
  let user = ctx.from;
  let inkey = [];
  if (!ctx.session) {
    db.query({
      text: 'SELECT * FROM groups WHERE added_by = $1',
      values: [user.id],
    }).then((res) => {
      if (res.rowCount == 0) {
        inkey = [{ text: 'Tidak ada' }];
      } else {
        res.rows.forEach((row) => {
          inkey.push([
            { text: row.group_title, callback_data: `editTag_${row.group_id}` },
          ]);
        });
      }
      return ctx.reply('Berikut Group yang anda kelola', {
        reply_markup: { inline_keyboard: inkey },
      });
    });
  } else {
    if (ctx.session.action == 'editTag') {
      return ctx.reply('Silahkan kirimkan tag pemicu');
    }
  }
});

bot.command('code', (ctx) => {
  console.log('Command /code');
  if (ctx.chat.type == 'private') {
    return;
  } else if (ctx.chat.type == 'group' || ctx.chat.type == 'supergroup') {
    let code = Math.floor(Math.random() * (999999 - 100000 + 1) + 100000);
    writeFileAndDir(
      `tmp/verif/${code}`,
      JSON.stringify({
        code: code,
        userid: ctx.from.id,
        groupid: ctx.chat.id,
        groupname: ctx.chat.title,
      })
    );
    return ctx.replyWithHTML(`Berikut kode anda <code>${code}</code>`);
  }
});

bot.on('callback_query', (ctx) => {
  let query = ctx.callbackQuery;
  if (/editTag/.test(query.data)) {
    let [cmd, group_id] = query.data.split('_');
    ctx.session = { action: cmd, group_id };
    return ctx.editMessageText(
      'Oke silahkan tulis pemicu tag, pemicu tag dapat lebih dari satu pisahkan dengan spasi\nContoh #post #ch'
    );
  }
  ctx.answerCbQuery();
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
                'INSERT INTO groups(group_id, group_title, first_added, added_by) VALUES($1, $2, $3, $4)',
              values: [
                group.id,
                group.title,
                new Date().getTime(),
                user_added.id,
              ],
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
          if (res.rowCount > 0) {
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

bot.on('text', async (ctx) => {
  if (ctx.chat.type == 'private') {
    let data;
    if (ctx.session?.action == 'editTag') {
      if (!existsSync(`data/${ctx.session}.json`)) {
        data = await db
          .query({
            text: 'SELECT * FROM groups_forward WHERE group_id = $1',
            values: [ctx.session.group_id],
          })
          .then((res) => {
            if (res.rowCount > 0) {
              return res.rows[0].data;
            }
          });
      } else {
        data = JSON.parse(
          readFileSync(`data/${ctx.session.group_id}.json`, 'utf-8')
        );
      }
      let trigger = ctx.message.text.match(/#[a-zA-Z0-9]*/g);
      trigger = '(' + trigger.join('|') + ')';
      return db
        .query({
          text: 'UPDATE groups_forward SET data = $1 WHERE group_id = $2',
          values: [JSON.stringify({ ...data, trigger }), ctx.session.group_id],
        })
        .catch((e) => {
          console.error(e.message);
          return ctx.reply(
            'Terjadi kesalahan saat mengupdate tag\nCoba lagi beberapa saat'
          );
        })
        .then((_) => {
          writeFileAndDir(
            `data/${ctx.session.group_id}.json`,
            JSON.stringify({
              ...data,
              trigger,
            })
          );
          ctx.reply('Pemicu tag berhasil dirubah');
          ctx.session = null;
        });
    }
  } else if (ctx.chat.type == 'supergroup' || ctx.chat.type == 'group') {
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
          var data = res.rows[0].data;
          if (new RegExp(data.trigger, 'g').test(msg.text)) {
            return ctx.telegram
              .forwardMessage(data.channelid, group.id, msg.message_id)
              .then((f_msg) => {
                ctx.deleteMessage(msg.message_id);
              });
          }
        } else {
          return;
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
