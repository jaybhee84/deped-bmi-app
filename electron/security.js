import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password) {
  if (typeof password !== 'string' || !password || password.length > 1024) throw new Error('Invalid password.');
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 1024 || typeof stored !== 'string') return false;
  if (!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored)) return false;
  const [, salt, hash] = stored.split(':');
  return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 64));
}

export function validateMacUpdate(dmgUrl, dmgName, repo) {
  const url = new URL(dmgUrl);
  if (url.origin !== 'https://github.com' || url.username || url.password ||
      !url.pathname.startsWith(`/${repo}/releases/download/`) ||
      typeof dmgName !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.dmg$/.test(dmgName) ||
      decodeURIComponent(url.pathname.split('/').pop()) !== dmgName) {
    throw new Error('Invalid update download.');
  }
}
