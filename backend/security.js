const { createHash, randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const deriveKey = promisify(scrypt);
const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await deriveKey(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  if (/^[a-f0-9]{64}$/.test(stored || '')) {
    return timingSafeEqual(Buffer.from(sha256(password), 'hex'), Buffer.from(stored, 'hex'));
  }
  const [, salt, hash] = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(stored || '') || [];
  const key = await deriveKey(password, salt || '00000000000000000000000000000000', 64);
  return !!hash && timingSafeEqual(key, Buffer.from(hash, 'hex'));
}

function issueToken(db, userId) {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  db.tokens = db.tokens.filter((record) => record.hash && record.expiresAt > now);
  db.tokens.push({ hash: sha256(token), userId, expiresAt: now + sessionLifetime });
  return token;
}

function tokenRecord(db, header) {
  const token = typeof header === 'string' && /^Bearer ([a-f0-9]{64})$/.exec(header)?.[1];
  if (!token) return null;
  const hash = sha256(token);
  return db.tokens.find((record) => record.hash === hash && record.expiresAt > Date.now());
}

module.exports = { hashPassword, verifyPassword, issueToken, tokenRecord };
