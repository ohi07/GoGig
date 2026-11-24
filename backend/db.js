const fs = require('node:fs/promises');
const path = require('node:path');

const dbFile = process.env.GOGIG_DB_FILE
  ? path.resolve(process.env.GOGIG_DB_FILE)
  : path.join(__dirname, 'db.json');
const collections = [
  'users', 'jobs', 'proposals', 'tokens', 'messages', 'dms', 'posts',
  'postComments', 'reviews', 'tickets', 'ticketMessages', 'orders',
];

async function readDb() {
  let data;
  try {
    data = JSON.parse(await fs.readFile(dbFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    data = {};
  }
  for (const name of collections) {
    data[name] ??= [];
    if (!Array.isArray(data[name])) throw new Error(`Invalid data collection: ${name}`);
  }
  for (const entry of [...data.posts, ...data.postComments]) entry.reactions ??= {};
  for (const user of data.users) {
    user.moderator ??= false;
    user.avatar ??= null;
    user.banned ??= false;
    user.sysop ??= false;
    user.prevRole ??= null;
    user.warned ??= false;
    user.warnReason ??= null;
  }
  return data;
}

async function writeDb(data) {
  await fs.mkdir(path.dirname(dbFile), { recursive: true });
  const temporary = `${dbFile}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
  await fs.rename(temporary, dbFile);
}

module.exports = { readDb, writeDb };
