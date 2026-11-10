// Uses an isolated profile and synthetic records; never opens the user's database.
import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
const root = path.resolve('out/security-check');
fs.mkdirSync(root, { recursive: true });
const profile = fs.mkdtempSync(path.join(root, 'profile-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    assert.ok(safeStorage.isEncryptionAvailable(), 'OS encryption is available');
    const filename = path.join(profile, 'students.db');
    const legacy = new Database(filename);
    legacy.exec('CREATE TABLE students (id TEXT PRIMARY KEY, data TEXT NOT NULL, dirty INTEGER DEFAULT 0)');
    legacy.prepare('INSERT INTO students VALUES (?, ?, 1)').run('old', JSON.stringify({ id: 'old', name: 'SYNTHETIC_PRIVATE_LEARNER', records: [] }));
    legacy.close();
    const data = await import('../electron/database.js');
    const protection = await import('../electron/protected-data.js');
    protection.migrateProtectedData(data.default);
    assert.equal(data.loadStudents()[0].name, 'SYNTHETIC_PRIVATE_LEARNER');
    assert.equal(fs.readFileSync(filename).includes(Buffer.from('SYNTHETIC_PRIVATE_LEARNER')), false);
    data.saveStudents([{ id: 'new', name: 'SYNTHETIC_NEW_LEARNER', records: [] }], true);
    assert.equal(data.getDirtyStudents()[0].name, 'SYNTHETIC_NEW_LEARNER');
    data.saveEnrolmentLocally('test', '2026', { private: 'SYNTHETIC_ENROLMENT' }, 1);
    assert.equal(data.loadEnrolmentLocally('test', '2026').data.private, 'SYNTHETIC_ENROLMENT');
    data.updateLocalProfile({ id: 'test', email: 'test@example.invalid', username: 'test', role: 'school', password: 'SYNTHETIC_PASSWORD' });
    const cached = data.default.prepare('SELECT * FROM bmi_profiles WHERE id = ?').get('test');
    assert.match(cached.password_hash, /^scrypt:/);
    assert.equal(protection.readProtectedData(cached.profile_data).password, undefined);
    assert.equal(data.offlineLoginCheck('TEST', 'SYNTHETIC_PASSWORD').success, true);
    assert.equal(data.offlineLoginCheck('test', 'wrong').success, false);
    const encrypted = protection.protectData({ private: 'synthetic' });
    assert.deepEqual(protection.readProtectedData(encrypted), { private: 'synthetic' });
    assert.throws(() => protection.readProtectedData(encrypted.slice(0, -12) + 'AAAAAAAAAAAA'));
    assert.throws(() => protection.readProtectedData('{"plain":true}'));
    data.default.pragma('wal_checkpoint(TRUNCATE)');
    for (const value of ['SYNTHETIC_PASSWORD', 'SYNTHETIC_NEW_LEARNER', 'SYNTHETIC_ENROLMENT']) {
      assert.equal(fs.readFileSync(filename).includes(Buffer.from(value)), false);
    }
    data.default.close();
    console.log('PASS: real OS encryption, plaintext migration, database writes, offline password hashing, corruption rejection.');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
