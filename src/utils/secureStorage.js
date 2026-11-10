// Persistent browser caches use the same OS protection as SQLite records.
const nativeStorage = globalThis.localStorage;
const transient = new Map();
const PREFIX = 'protected:v1:';
const obsolete = new Set(['deped_bmi_offline_cache_division_v1', 'deped_bmi_offline_cache', 'deped_bmi_users']);
export const secureStorage = {
  getItem(key) {
    if (!window.dataProtection) return transient.get(key) ?? null;
    const value = nativeStorage.getItem(key);
    if (value == null) return null;
    if (value.startsWith(PREFIX)) return window.dataProtection.open(value);
    secureStorage.setItem(key, value);
    return value;
  },
  setItem(key, value) {
    if (!window.dataProtection) { transient.set(key, String(value)); return; }
    nativeStorage.setItem(key, window.dataProtection.seal(String(value)));
  },
  removeItem(key) { transient.delete(key); nativeStorage.removeItem(key); },
};

if (typeof window !== 'undefined' && window.dataProtection) {
  for (const key of Object.keys(nativeStorage)) {
    if (obsolete.has(key)) nativeStorage.removeItem(key);
    else secureStorage.getItem(key);
  }
}
