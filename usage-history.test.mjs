import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { UsageHistory, remainingUsagePercent } from './usage-history.mjs';

test('derives remaining usage from native rate limits', () => {
  assert.equal(remainingUsagePercent({ payload: { rateLimits: { primary: { usedPercent: 36.5 } } } }), 63.5);
  assert.equal(remainingUsagePercent({ remainingPercent: 42 }), 42);
});

test('keeps hourly observations, tags rapid resets, and retains twelve months', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-usage-history-'));
  const filePath = path.join(directory, 'history.br');
  const start = new Date('2026-01-15T10:00:00Z').getTime();
  const history = new UsageHistory({ filePath, now: () => start });
  history.record(70, start); history.record(55, start + 60_000); history.record(90, start + 120_000); history.record(48, start + 60 * 60 * 1000);
  const snapshot = history.snapshot(start + 60 * 60 * 1000);
  assert.equal(snapshot.observations.length, 2); assert.equal(snapshot.observations[0].lowRemaining, 55); assert.equal(snapshot.observations[0].resets.length, 1); assert.ok(fs.statSync(filePath).size < 1024);
  history.record(20, start + 370 * 24 * 60 * 60 * 1000);
  assert.equal(history.snapshot(start + 370 * 24 * 60 * 60 * 1000).observations.length, 1);
  fs.rmSync(directory, { recursive: true, force: true });
});
