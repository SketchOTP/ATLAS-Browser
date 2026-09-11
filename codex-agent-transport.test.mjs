import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';
import { CodexAgentServer } from './codex-agent.mjs';

function fakeChild({ broken = false } = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => { child.killed = true; return true; };
  child.stdin = new Writable({ write(chunk, _encoding, callback) {
    const request = JSON.parse(chunk.toString());
    if (broken && request.method === 'initialized') {
      callback(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
      return;
    }
    callback();
    if (request.id === undefined || request.method === 'hang') return;
    const result = request.method === 'account/read' ? { account: { type: 'chatgpt' } }
      : request.method === 'model/list' ? { data: [] } : {};
    queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: request.id, result })}\n`));
  } });
  return child;
}

test('EPIPE during startup rejects pending work without an uncaught stream error', async () => {
  const child = fakeChild({ broken: true });
  const server = new CodexAgentServer({ cwd: '.', executeTool: async () => ({}), spawnProcess: () => child });
  await assert.rejects(server.start(), /EPIPE|unavailable|pipe closed/);
  assert.equal(server.pending.size, 0);
  assert.equal(child.killed, true);
  assert.doesNotThrow(() => server.notify('initialized'));
  assert.doesNotThrow(() => server.respond(1, {}));
});

test('a failed transport can reconnect and stale child events cannot disconnect its replacement', async () => {
  const children = [fakeChild(), fakeChild()];
  let index = 0;
  const server = new CodexAgentServer({ cwd: '.', executeTool: async () => ({}), spawnProcess: () => children[index++] });
  await server.start();
  const pending = server.request('hang');
  const rejected = assert.rejects(pending, /pipe failed/);
  children[0].stdin.emit('error', new Error('pipe failed'));
  await rejected;
  assert.equal((await server.start()).state, 'ready');
  children[0].emit('exit', 1);
  children[0].stderr.emit('error', new Error('late failure'));
  assert.equal(server.child, children[1]);
  assert.deepEqual(await server.request('ping'), {});
  server.stop();
});

test('spawn errors reject startup immediately and allow retry', async () => {
  const child = fakeChild();
  child.stdin = new PassThrough();
  const server = new CodexAgentServer({ cwd: '.', executeTool: async () => ({}), spawnProcess: () => {
    queueMicrotask(() => child.emit('error', new Error('ENOENT')));
    return child;
  } });
  await assert.rejects(server.start(), /ENOENT/);
  assert.equal(server.readyPromise, null);
  assert.equal(server.pending.size, 0);
});
