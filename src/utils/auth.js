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
 
const DEFAULT_USERS = [
  {
    id:        '1',
    username:  'admin',
    password:  'deped2025',
    lastName:  'Administrator',
    firstName: '',
    middleInitial: '',
    fullName:  'Administrator',
    role:      ROLES.SCHOOL,
    position:  'Administrative Officer II',
  },
];
 
// ── User store ─────────────────────────────────────────────────────────────
 
export function loadUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_USERS;
  } catch { return DEFAULT_USERS; }
}
 
export function saveUsers(users) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(users)); } catch {}
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
    localStorage.removeItem(SESSION_KEY); // Remove legacy key if exists
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

// ── Offline credential cache (Stored in localStorage permanently) ─────────
const OFFLINE_CACHE_KEY = 'deped_bmi_offline_cache';

export function cacheOfflineCredentials(profile, password) {
  try {
    const cache = loadOfflineCache();
    const key = (profile.username || '').toLowerCase();
    if (!key) return;

    cache[key] = { profile, password };
    localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

function loadOfflineCache() {
  try {
    const raw = localStorage.getItem(OFFLINE_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function attemptOfflineLogin(username, password) {
  const cache = loadOfflineCache();
  const entry = cache[(username || '').toLowerCase()];

  if (!entry || entry.password !== password) return null;

  return entry.profile;
}

export function hasOfflineCredentials(username) {
  const cache = loadOfflineCache();
  return Boolean(cache[(username || '').toLowerCase()]);
}