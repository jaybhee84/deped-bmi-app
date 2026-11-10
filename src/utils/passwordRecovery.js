export function passwordRecoveryUrl(configured, location) {
  const fallback = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname)
    ? `${location.origin}/reset-password` : '';
  const url = new URL(configured || fallback);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Configure a secure password recovery website.');
  }
  if (url.username || url.password) throw new Error('Invalid recovery website.');
  return url.href;
}
