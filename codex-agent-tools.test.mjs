import assert from 'node:assert/strict';
import test from 'node:test';
import { CodexAgentServer, atlasAgentInstructions, atlasDynamicTools, atlasToolCatalogVersion } from './codex-agent.mjs';

test('tab management tools expose scoped single and bulk closure', () => {
  const tools = new Map(atlasDynamicTools.map((tool) => [tool.name, tool]));
  assert.ok(tools.has('atlas_close_tab'));
  assert.ok(tools.has('atlas_close_tabs'));
  assert.deepEqual(tools.get('atlas_close_tab').inputSchema.required, ['projectId', 'tabId']);
  assert.deepEqual(tools.get('atlas_close_tabs').inputSchema.required, ['projectId', 'tabIds']);
  assert.equal(tools.get('atlas_close_tabs').inputSchema.properties.tabIds.minItems, 1);
  assert.equal(tools.get('atlas_close_tabs').inputSchema.properties.tabIds.uniqueItems, true);
  assert.match(atlasAgentInstructions, /Destructive tools may be used only after an explicit user request/);
});

test('agent tool names remain unique across every provider adapter', () => {
  const names = atlasDynamicTools.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
});

test('new Codex threads receive the versioned tool catalog and migrated history', async () => {
  const requests = [];
  const server = new CodexAgentServer({ cwd: '/tmp', executeTool: async () => ({ success: true }) });
  server.start = async () => ({ state: 'ready' });
  server.request = async (method, params) => {
    requests.push({ method, params });
    if (method === 'thread/start') return { thread: { id: 'atlas-test-thread' } };
    return { turn: { id: 'atlas-test-turn' } };
  };
  const thread = await server.createThread();
  await server.sendTurn({
    threadId: thread.id,
    text: 'Continue the saved conversation.',
    effort: 'medium',
    context: { projects: [] },
    history: [{ role: 'user', text: 'Earlier request' }, { role: 'assistant', text: 'Earlier response' }]
  });
  const start = requests.find((request) => request.method === 'thread/start');
  const turn = requests.find((request) => request.method === 'turn/start');
  assert.ok(atlasToolCatalogVersion > 0);
  assert.equal(start.params.dynamicTools, atlasDynamicTools);
  assert.equal('model' in start.params, false);
  assert.equal('model' in turn.params, false);
  assert.match(turn.params.additionalContext['atlas-conversation-history'].value, /Earlier request/);
});

test('an explicitly configured Codex model is forwarded without becoming a release default', async () => {
  const requests = [];
  const server = new CodexAgentServer({ cwd: '/tmp', executeTool: async () => ({}), model: 'configured-model' });
  server.start = async () => ({ state: 'ready' });
  server.request = async (method, params) => {
    requests.push({ method, params });
    if (method === 'thread/start') return { thread: { id: 'configured-thread' } };
    return { turn: { id: 'configured-turn' } };
  };
  const thread = await server.createThread();
  await server.sendTurn({ threadId: thread.id, text: 'Test', context: {}, history: [] });
  assert.equal(requests.find((request) => request.method === 'thread/start').params.model, 'configured-model');
  assert.equal(requests.find((request) => request.method === 'turn/start').params.model, 'configured-model');
});
