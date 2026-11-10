import { safeStorage } from 'electron';

const PREFIX = 'protected:v1:';
function requireEncryption() {
  if (!safeStorage.isEncryptionAvailable() ||
      (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) {
    throw new Error('Secure OS storage is unavailable. Unlock your keychain and restart the app.');
  }
}

export function protectData(value) {
  requireEncryption();
  return PREFIX + safeStorage.encryptString(JSON.stringify(value)).toString('base64');
}

export function readProtectedData(value) {
  if (!value.startsWith(PREFIX)) throw new Error('Local data is not encrypted. Restart to complete migration.');
  requireEncryption();
  return JSON.parse(safeStorage.decryptString(Buffer.from(value.slice(PREFIX.length), 'base64')));
}

export function migrateProtectedData(db) {
  requireEncryption();
  let changed = db.pragma('user_version', { simple: true }) < 1;
  db.pragma('secure_delete = ON');
  db.transaction(() => {
    for (const table of ['students', 'sbfp_enrolment']) {
      const update = db.prepare(`UPDATE ${table} SET data = ? WHERE rowid = ?`);
      for (const row of db.prepare(`SELECT rowid, data FROM ${table}`).all()) {
        if (row.data.startsWith(PREFIX)) continue;
        update.run(protectData(JSON.parse(row.data)), row.rowid);
        changed = true;
      }
    }
  })();
  if (changed) {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.pragma('user_version = 1');
    db.exec('VACUUM');
    db.pragma('wal_checkpoint(TRUNCATE)');
  }
}
