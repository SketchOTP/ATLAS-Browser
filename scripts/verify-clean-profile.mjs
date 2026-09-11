import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// This endpoint exists only in the isolated packaged smoke test. Production
// launches never enable remote debugging.
const [profileDirectory, shellOrigin] = process.argv.slice(2);
const port = Number(fs.readFileSync(path.join(profileDirectory, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
const targets = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) }).then((response) => response.json());
const target = targets.find((entry) => entry.type === 'page' && new URL(entry.url).origin === shellOrigin);
assert.ok(target, 'isolated ATLAS page must exist');
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 0;
const deadline = setTimeout(() => { console.error('Clean-profile verification timed out'); process.exit(1); }, 10_000);
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
try {
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression: `({ title: document.title, store: JSON.parse(localStorage.getItem('atlas-browser-profiles-v1')) })`, returnByValue: true
  });
  assert.equal(exceptionDetails, undefined);
  assert.equal(result.value.title, 'ATLAS');
  const { profiles, activeProfileId } = result.value.store;
  assert.equal(profiles.length, 1);
  const profile = profiles[0];
  assert.equal(profile.id, activeProfileId);
  assert.equal(profile.name, 'Local Profile');
  assert.equal(profile.email, 'local@atlas.invalid');
  assert.equal(profile.image, '');
  assert.equal(profile.settings.walkthroughCompleted, false);
  for (const key of ['projects', 'globalBookmarks', 'notifications', 'calendarEvents']) {
    assert.deepEqual(profile.workspace[key], [], `fresh ${key} must be empty`);
  }
  // The empty Agent view creates its first blank conversation automatically.
  assert.ok(profile.workspace.agentSessions.length <= 1);
  for (const session of profile.workspace.agentSessions) {
    assert.equal(session.title, 'New conversation');
    assert.equal(session.threadId, '');
    assert.equal(session.scopeProjectId, null);
    assert.deepEqual(session.messages, []);
    assert.equal(session.tokenUsage, null);
  }
  const { cookies } = await send('Network.getAllCookies');
  assert.deepEqual(cookies, [], 'fresh package must not contain signed-in website cookies');
  console.log('Clean-profile verification passed: generic onboarding profile, empty workspace, no website cookies.');
} finally {
  clearTimeout(deadline);
  socket.close();
}
