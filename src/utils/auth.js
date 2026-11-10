import { secureStorage } from './secureStorage';
// ── Auth utility ───────────────────────────────────────────────────────────
const STORAGE_KEY = 'deped_bmi_users';
const SESSION_KEY = 'deped_bmi_session';
 
export const ROLES = {
  SCHOOL:   'school',
  DIVISION: 'division',
};
 
export const SCHOOL_POSITIONS = [
  'Administrative Officer II',
  'Project Development Officer I',
  'Administrative Assistant III',
  'Administrative Assistant II',
];
 
export const DIVISION_POSITIONS = [
  'Nurse II',
];
 
const DEFAULT_USERS = [];
 
// ── User store ─────────────────────────────────────────────────────────────
 
export function loadUsers() {
  try {
    const raw = secureStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_USERS;
  } catch { return DEFAULT_USERS; }
}
 
export function saveUsers(users) {
  try { secureStorage.setItem(STORAGE_KEY, JSON.stringify(users)); } catch {}
}
 
export function addUser(user) {
  const users = loadUsers();
  if (users.find(u => u.username.toLowerCase() === user.username.toLowerCase())) return { ok: false, error: 'Username already exists.' };
  users.push({ ...user, id: Date.now().toString() });
  saveUsers(users);
  return { ok: true };
}
 
export function deleteUser(id) {
  saveUsers(loadUsers().filter(u => u.id !== id));
}
 
export function updateUser(id, changes) {
  saveUsers(loadUsers().map(u => u.id === id ? { ...u, ...changes } : u));
}
 
// ── Build full name ────────────────────────────────────────────────────────
export function buildFullName(lastName, firstName, middleInitial) {
  const mi = middleInitial?.trim() ? ` ${middleInitial.trim()}.` : '';
  return `${firstName.trim()} ${lastName.trim()}${mi}`.trim();
}
 
// ── Username generator ────────────────────────────────────────────────────
export function suggestUsername(firstName, lastName) {
  if (!firstName || !lastName) return '';
  return (firstName.trim()[0] + lastName.trim()).toLowerCase().replace(/\s+/g, '');
}
 
// ── Session (Stored in sessionStorage to auto-logout on app close) ─────────
 
export function login(username, password) {
  const user = loadUsers().find(
    u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
  );
  if (!user) return null;
  const session = { ...user, loginTime: new Date().toISOString() };
  delete session.password;
  saveSession(session);
  return session;
}
 
export function logout() {
  try { 
    sessionStorage.removeItem(SESSION_KEY); 
    secureStorage.removeItem(SESSION_KEY); // Remove legacy key if exists
  } catch {}
}
 
export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveSession(session) {
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify(session)
    );
  } catch {}
}

// ── Permission helpers ─────────────────────────────────────────────────────
 
export function canEdit(session) {
  return session?.role === ROLES.SCHOOL;
}
 
export function canViewOnly(session) {
  return session?.role === ROLES.DIVISION;
}

// ── Offline credential cache (Stored in secureStorage permanently) ─────────
// Discard legacy plaintext credentials; users must sign in online once after upgrading.
for (const key of ['deped_bmi_offline_cache_division_v1', 'deped_bmi_offline_cache', 'deped_bmi_users']) {
  secureStorage.removeItem(key);
}

export async function cacheOfflineCredentials(profile, password) {
  if (!window.sqlite?.saveUserLocally) return false;
  const result = await window.sqlite.saveUserLocally(profile, password);
  return result?.success === true;
}

export async function deleteOfflineCredentials(username) {
  return window.sqlite?.deleteLocalProfile?.({ username });
}

export async function attemptOfflineLogin(username, password) {
  try {
    const result = await window.sqlite?.offlineLoginCheck?.(username, password);
    return result?.success ? result.user : null;
  } catch { return null; }
}
