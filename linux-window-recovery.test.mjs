import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { LinuxWindowRecovery, supportsWindowRecovery } from './linux-window-recovery.mjs';

const env = { XDG_SESSION_TYPE: 'x11', DISPLAY: ':99' };
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('window recovery is restricted to Linux X11 and supports an opt-out', () => {
  assert.equal(supportsWindowRecovery('linux', env), true);
  for (const platform of ['win32', 'darwin']) assert.equal(supportsWindowRecovery(platform, env), false);
  assert.equal(supportsWindowRecovery('linux', { ...env, XDG_SESSION_TYPE: 'wayland' }), false);
  assert.equal(supportsWindowRecovery('linux', { ...env, ATLAS_LINUX_WINDOW_RECOVERY: '0' }), false);
});

test('healthy helpers and non-GNOME desktops never launch replacements', async () => {
  for (const status of [{ eligible: false }, { eligible: true, running: true }]) {
    const recovery = new LinuxWindowRecovery({ platform: 'linux', env, inspect: async () => status,
      spawnHelper: () => assert.fail('unexpected process creation') });
    recovery.start();
    await settle();
    recovery.stop();
  }
});

test('missing helper recovery is bounded, detached, and does not kill desktop helpers on exit', async () => {
  const calls = [];
  const events = [];
  let now = 1000;
  const recovery = new LinuxWindowRecovery({ platform: 'linux', env, now: () => now,
    inspect: async () => ({ eligible: true, running: false }), log: (event) => events.push(event),
    spawnHelper: (...args) => {
      calls.push(args);
      const child = new EventEmitter();
      child.unref = () => {};
      child.kill = () => assert.fail('must leave shared desktop helper alive');
      queueMicrotask(() => child.emit('error', new Error('test spawn failure')));
      return child;
    } });
  recovery.start();
  await settle();
  for (let i = 0; i < 6; i++) await recovery.check();
  assert.equal(calls.length, 3);
  assert.equal(calls[0][0], '/usr/libexec/mutter-x11-frames');
  assert.deepEqual(calls[0][1], []);
  assert.equal(calls[0][2].detached, true);
  assert.ok(events.includes('WINDOW_HELPER_RECOVERY_FAILED'));
  assert.ok(events.includes('WINDOW_HELPER_RECOVERY_LIMIT'));
  now += 300_001;
  await recovery.check();
  assert.equal(calls.length, 4);
  recovery.stop();
  await recovery.check();
  assert.equal(calls.length, 4);
});

test('stopping during an inspection prevents a late helper launch', async () => {
  let finish;
  const recovery = new LinuxWindowRecovery({ platform: 'linux', env,
    inspect: () => new Promise((resolve) => { finish = resolve; }),
    spawnHelper: () => assert.fail('launch after stop') });
  recovery.start();
  recovery.stop();
  finish({ eligible: true, running: false });
  await settle();
});

test('inspection failures remain contained and repeated checks do not flood logs', async () => {
  const events = [];
  const recovery = new LinuxWindowRecovery({ platform: 'linux', env,
    inspect: async () => { throw new Error('permission denied'); }, log: (event) => events.push(event) });
  recovery.start();
  await settle();
  await recovery.check();
  recovery.stop();
  assert.deepEqual(events, ['WINDOW_HELPER_CHECK_UNAVAILABLE']);
});
