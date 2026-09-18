import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_WEBSITE_PRIVATE_MEMORY_LIMIT_BYTES,
  ACTIVE_WEBSITE_RECOVERY_COOLDOWN_MS,
  shouldRecoverActiveWebsite
} from './website-memory-recovery.mjs';

const activeRecord = { key: 'profile-a:project-a:tab-a' };

test('recovers only the active website renderer above the private-memory limit', () => {
  assert.equal(shouldRecoverActiveWebsite({ record: activeRecord, activeKey: activeRecord.key, privateBytes: ACTIVE_WEBSITE_PRIVATE_MEMORY_LIMIT_BYTES + 1, now: 10_000 }), true);
  assert.equal(shouldRecoverActiveWebsite({ record: activeRecord, activeKey: 'profile-a:project-a:tab-b', privateBytes: ACTIVE_WEBSITE_PRIVATE_MEMORY_LIMIT_BYTES + 1, now: 10_000 }), false);
  assert.equal(shouldRecoverActiveWebsite({ record: activeRecord, activeKey: activeRecord.key, privateBytes: ACTIVE_WEBSITE_PRIVATE_MEMORY_LIMIT_BYTES, now: 10_000 }), false);
});

test('applies a cooldown after a recovery', () => {
  assert.equal(shouldRecoverActiveWebsite({ record: activeRecord, activeKey: activeRecord.key, privateBytes: ACTIVE_WEBSITE_PRIVATE_MEMORY_LIMIT_BYTES + 1, previousRecoveryAt: 10_000, now: 10_000 + ACTIVE_WEBSITE_RECOVERY_COOLDOWN_MS - 1 }), false);
  assert.equal(shouldRecoverActiveWebsite({ record: activeRecord, activeKey: activeRecord.key, privateBytes: ACTIVE_WEBSITE_PRIVATE_MEMORY_LIMIT_BYTES + 1, previousRecoveryAt: 10_000, now: 10_000 + ACTIVE_WEBSITE_RECOVERY_COOLDOWN_MS }), true);
});
