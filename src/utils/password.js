import crypto from 'crypto';

const ITERATIONS = 120000; // reasonable default
const KEYLEN = 32;
const DIGEST = 'sha256';

export function hashPassword(plain, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.pbkdf2Sync(plain, salt, ITERATIONS, KEYLEN, DIGEST).toString('hex');
  return { salt, hash: `${DIGEST}$${ITERATIONS}$${salt}$${derived}` };
}

export function verifyPassword(plain, stored) {
  try {
    const [digest, iterStr, salt, hashHex] = String(stored).split('$');
    const iters = Number(iterStr || ITERATIONS);
    const derived = crypto.pbkdf2Sync(plain, salt, iters, KEYLEN, digest || DIGEST).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hashHex, 'hex'));
  } catch (_) {
    return false;
  }
}

