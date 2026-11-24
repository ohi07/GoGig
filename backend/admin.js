const { randomUUID } = require('node:crypto');
const { readDb, writeDb } = require('./db');
const { hashPassword } = require('./security');

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'GoGig Admin';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 12 || password.length > 128) {
    throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD between 12 and 128 characters.');
  }
  const db = await readDb();
  let user = db.users.find((entry) => entry.email.toLowerCase() === email);
  if (user && user.role !== 'admin') throw new Error('That email is already used by a non-admin account.');
  if (!user) {
    const sysop = !db.users.some((entry) => entry.role === 'admin' && entry.sysop);
    user = { id: randomUUID(), email, name, role: 'admin', sysop, createdAt: new Date().toISOString() };
    db.users.push(user);
  }
  user.password = await hashPassword(password);
  user.banned = false;
  db.tokens = db.tokens.filter((token) => token.userId !== user.id && token.hash);
  await writeDb(db);
  console.log('Administrator account is ready.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
