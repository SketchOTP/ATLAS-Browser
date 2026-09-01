import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { migrateLegacyWebsiteCookies, portableCookie, profileSessionPartition } from './profile-website-sessions.mjs';

test('profile session partitions are stable and isolated', () => {
  assert.equal(profileSessionPartition('profile-1'), 'persist:atlas-profile-profile-1');
  assert.notEqual(profileSessionPartition('profile-1'), profileSessionPartition('profile-2'));
  assert.throws(() => profileSessionPartition('../profile'), /Invalid/);
});

test('portable cookies retain authentication attributes without exposing another domain', () => {
  assert.deepEqual(portableCookie({
    name: 'session', value: 'secret', domain: '.google.com', path: '/', secure: true,
    httpOnly: true, hostOnly: false, sameSite: 'no_restriction', expirationDate: 2000000000
  }), {
    url: 'https://google.com/', name: 'session', value: 'secret', domain: '.google.com', path: '/',
    secure: true, httpOnly: true, sameSite: 'no_restriction', expirationDate: 2000000000
  });
});

test('legacy cookies migrate once to only the first active profile', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-profile-session-test-'));
  const markerPath = path.join(directory, 'migration.json');
  const sourceSession = { cookies: { get: async () => [{ name: 'google', value: 'token', domain: '.google.com', path: '/', secure: true, hostOnly: false }] } };
  const copied = [];
  const targetSession = { cookies: { set: async (cookie) => copied.push(cookie) } };
  const first = await migrateLegacyWebsiteCookies({ sourceSession, targetSession, profileId: 'profile-1', markerPath });
  const second = await migrateLegacyWebsiteCookies({ sourceSession, targetSession, profileId: 'profile-2', markerPath });
  assert.equal(first.copied, 1);
  assert.equal(second.skipped, true);
  assert.equal(second.profileId, 'profile-1');
  assert.equal(copied.length, 1);
  fs.rmSync(directory, { recursive: true });
});
