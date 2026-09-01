import test from 'node:test';
import assert from 'node:assert/strict';
import { browserContextKey, hideWebsiteView, normalizeBrowserContext, ProjectBrowserRegistry, sameBrowserContext, showWebsiteView } from './project-browser-isolation.mjs';

const context = (projectId, tabId = 'tab-1', profileId = 'profile-1') => ({ profileId, projectId, tabId });

test('browser context keys include profile, project, and tab identities', () => {
  assert.notEqual(browserContextKey(context('project-a')), browserContextKey(context('project-b')));
  assert.notEqual(browserContextKey(context('project-a', 'tab-1')), browserContextKey(context('project-a', 'tab-2')));
  assert.notEqual(browserContextKey(context('project-a', 'tab-1', 'profile-1')), browserContextKey(context('project-a', 'tab-1', 'profile-2')));
  assert.equal(sameBrowserContext(context('project-a'), { ...context('project-a') }), true);
});

test('rejects incomplete or injectable browser identities', () => {
  assert.throws(() => normalizeBrowserContext({ profileId: 'profile-1', projectId: 'project-1' }), /Invalid/);
  assert.throws(() => normalizeBrowserContext({ profileId: 'profile-1', projectId: '../project', tabId: 'tab-1' }), /Invalid/);
});

test('registry never returns another project or tab as active', () => {
  const registry = new ProjectBrowserRegistry();
  const a = registry.activate(context('project-a'), (scope) => ({ scope, history: ['a.example'] })).record;
  const b = registry.activate(context('project-b'), (scope) => ({ scope, history: ['b.example'] })).record;
  assert.notEqual(a.value, b.value);
  assert.equal(registry.active(context('project-a')), null);
  assert.equal(registry.active(context('project-b')), b);
  assert.deepEqual(b.value.history, ['b.example']);
});

test('pruning a project destroys only its tab views', () => {
  const registry = new ProjectBrowserRegistry();
  registry.ensure(context('project-a', 'tab-1'), () => ({ id: 'a1' }));
  registry.ensure(context('project-a', 'tab-2'), () => ({ id: 'a2' }));
  registry.ensure(context('project-b', 'tab-1'), () => ({ id: 'b1' }));
  const destroyed = [];
  registry.prune([context('project-b', 'tab-1')], (value) => destroyed.push(value.id));
  assert.deepEqual(destroyed.sort(), ['a1', 'a2']);
  assert.equal(registry.ensure(context('project-b', 'tab-1'), () => ({ id: 'replacement' })).value.id, 'b1');
});

test('switching projects keeps website views attached and only hides the inactive view', () => {
  const events = [];
  const view = (id) => ({
    setVisible: (visible) => events.push(`${id}:visible:${visible}`),
    setBounds: (bounds) => events.push(`${id}:bounds:${bounds.width}x${bounds.height}`)
  });
  const previous = view('previous');
  const next = view('next');
  const parent = {
    addChildView: (value) => events.push(value === next ? 'parent:raise:next' : 'parent:raise:unknown'),
    removeChildView: () => events.push('parent:remove')
  };
  showWebsiteView(parent, next, previous, { x: 20, y: 30, width: 900, height: 600 }, true);
  assert.deepEqual(events, [
    'previous:visible:false', 'previous:bounds:0x0', 'parent:raise:next',
    'next:bounds:900x600', 'next:visible:true'
  ]);
  assert.equal(events.includes('parent:remove'), false);
  hideWebsiteView(next);
  assert.deepEqual(events.slice(-2), ['next:visible:false', 'next:bounds:0x0']);
});
