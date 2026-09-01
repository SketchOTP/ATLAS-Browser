const identifierPattern = /^[a-z0-9][a-z0-9_-]{0,159}$/i;

export function normalizeBrowserContext(value) {
  const context = {
    profileId: String(value?.profileId || ''),
    projectId: String(value?.projectId || ''),
    tabId: String(value?.tabId || '')
  };
  if (!identifierPattern.test(context.profileId) || !identifierPattern.test(context.projectId) || !identifierPattern.test(context.tabId)) {
    throw new Error('Invalid project browser context.');
  }
  return Object.freeze(context);
}

export function browserContextKey(value) {
  const context = normalizeBrowserContext(value);
  return `${context.profileId}\u001f${context.projectId}\u001f${context.tabId}`;
}

export function sameBrowserContext(left, right) {
  try { return browserContextKey(left) === browserContextKey(right); }
  catch { return false; }
}

const hiddenBounds = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });

export function showWebsiteView(parent, nextView, previousView, bounds, visible) {
  if (previousView && previousView !== nextView) {
    previousView.setVisible(false);
    previousView.setBounds(hiddenBounds);
  }
  parent.addChildView(nextView);
  nextView.setBounds(visible ? bounds : hiddenBounds);
  nextView.setVisible(Boolean(visible));
}

export function hideWebsiteView(view) {
  if (!view) return;
  view.setVisible(false);
  view.setBounds(hiddenBounds);
}

export class ProjectBrowserRegistry {
  constructor() {
    this.records = new Map();
    this.activeKey = '';
  }

  ensure(value, create) {
    const context = normalizeBrowserContext(value);
    const key = browserContextKey(context);
    if (!this.records.has(key)) this.records.set(key, { key, context, value: create(context) });
    return this.records.get(key);
  }

  activate(value, create) {
    const record = this.ensure(value, create);
    const previous = this.records.get(this.activeKey) || null;
    this.activeKey = record.key;
    return { record, previous: previous?.key === record.key ? null : previous };
  }

  active(value) {
    if (!value) return this.records.get(this.activeKey) || null;
    const key = browserContextKey(value);
    return key === this.activeKey ? this.records.get(key) || null : null;
  }

  deactivate() {
    const previous = this.records.get(this.activeKey) || null;
    this.activeKey = '';
    return previous;
  }

  prune(validContexts, remove) {
    const validKeys = new Set(validContexts.map(browserContextKey));
    const removed = [];
    for (const [key, record] of this.records) {
      if (validKeys.has(key)) continue;
      this.records.delete(key);
      if (this.activeKey === key) this.activeKey = '';
      remove(record.value, record.context);
      removed.push(record.context);
    }
    return removed;
  }

  clear(remove) {
    return this.prune([], remove);
  }
}
