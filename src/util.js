const fs = require('fs');
const { dirname } = require('path');
exports.writeFileAndDir = (path = '', context, options = { flag: 'w' }) =>
  new Promise((resolve, reject) => {
    fs.promises
      .mkdir(dirname(path), { recursive: true })
      .then(() => {
        fs.writeFileSync(path, context, options);
        resolve(true);
      })
      .catch((err) => reject(err));
  });
