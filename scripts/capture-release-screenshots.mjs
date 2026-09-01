import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { origin, startServer } from '../server.mjs';

const root = path.resolve(import.meta.dirname, '..');
const outputDirectory = path.join(root, 'docs', 'images');
const chromium = process.env.ATLAS_CHROMIUM || ['/snap/bin/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((candidate) => fs.existsSync(candidate));
const profileParent = chromium?.startsWith('/snap/') ? path.join(os.homedir(), 'snap', 'chromium', 'common') : os.tmpdir();
fs.mkdirSync(profileParent, { recursive: true });
const temporaryProfile = fs.mkdtempSync(path.join(profileParent, 'atlas-screenshot-'));
const debuggingPort = Number(process.env.ATLAS_CHROMIUM_DEBUG_PORT || 49283);

const now = new Date('2026-09-01T16:00:00Z').toISOString();
const workspace = {
  projects: [
    {
      id: 'project-orbit', name: 'Orbit Research', status: 'Active P1', color: '#B026FF', textColor: '#FFFFFF', iconMode: 'emoji', emoji: '🛰️', image: '',
      tabs: [
        { id: 'tab-mcp', title: 'Model Context Protocol', url: 'https://modelcontextprotocol.io/', icon: '🔌', iconMode: 'emoji', favicon: '' },
        { id: 'tab-electron', title: 'Electron Documentation', url: 'https://www.electronjs.org/docs/latest/', icon: '⚛️', iconMode: 'emoji', favicon: '' }
      ],
      bookmarks: [{ id: 'bookmark-docs', title: 'Research brief', url: 'https://example.com/research', color: '#7A5CFF', textColor: '#FFFFFF' }],
      resources: [
        { id: 'resource-1', type: 'url', title: 'Agent interoperability notes', url: 'https://example.com/interoperability', createdAt: now },
        { id: 'resource-2', type: 'text', title: 'Evaluation criteria', text: 'Synthetic release screenshot content.', createdAt: now },
        { id: 'resource-3', type: 'url', title: 'Security model', url: 'https://example.com/security', createdAt: now }
      ],
      downloads: [],
      notes: [
        { id: 'note-1', title: 'Research direction', html: 'Map provider capabilities to explicit project boundaries.', createdAt: now, updatedAt: now },
        { id: 'note-2', title: 'Open questions', html: 'Validate tool behavior across supported adapters.', createdAt: now, updatedAt: now }
      ],
      tasks: [
        { id: 'task-1', title: 'Compare agent tool protocols', priority: 'high', dueAt: '2026-09-04T17:00:00Z', reminderAt: '', note: 'Document the shared capability surface.', done: false, completedAt: '' },
        { id: 'task-2', title: 'Verify project isolation boundaries', priority: 'medium', dueAt: '2026-09-06T17:00:00Z', reminderAt: '', note: 'Run the clean-profile matrix.', done: false, completedAt: '' },
        { id: 'task-3', title: 'Draft release evidence', priority: 'low', dueAt: '', reminderAt: '', note: '', done: true, completedAt: now }
      ]
    },
    { id: 'project-launch', name: 'Launch Plan', status: 'Planning', color: '#00E5FF', textColor: '#050508', iconMode: 'emoji', emoji: '🚀', image: '', tabs: [], bookmarks: [], resources: [], downloads: [], notes: [], tasks: [] },
    { id: 'project-signal', name: 'Signal Watch', status: 'Researching', color: '#39FF88', textColor: '#050508', iconMode: 'emoji', emoji: '📡', image: '', tabs: [], bookmarks: [], resources: [], downloads: [], notes: [], tasks: [] }
  ],
  globalBookmarks: [],
  notifications: [],
  calendarEvents: [],
  agentSessions: [{
    id: 'agent-session-preview', title: 'Map the provider landscape', titleEdited: false, scopeProjectId: 'project-orbit', providerId: 'codex', updatedAt: now,
    messages: [
      { id: 'message-1', role: 'user', text: 'Compare the provider adapters and identify the next verification gap.', createdAt: now },
      { id: 'message-2', role: 'assistant', text: 'I mapped the shared tool surface and isolated the next gap: verify equivalent scoped tab control across every configured provider.', createdAt: now }
    ],
    tokenUsage: { total: { totalTokens: 18420 }, modelContextWindow: 200000 }, busy: false, compacting: false, toolCatalogVersion: 4
  }],
  session: { activeProjectId: 'project-orbit', activeTabId: 'tab-mcp', activeAgentSessionId: 'agent-session-preview', activeView: 'tasks' }
};

const profileStore = {
  activeProfileId: 'profile-preview',
  profiles: [{
    id: 'profile-preview', name: 'ATLAS Preview', email: 'preview@atlas.invalid', image: '',
    settings: {
      walkthroughCompleted: true, sidebarWidth: 290, agentTrayHeight: 92, defaultPageUrl: '', privacyMode: 'balanced',
      websiteMicrophoneEnabled: true, websiteCameraEnabled: true, compactionThreshold: 0.78, reasoningEffort: 'medium',
      ttsVoice: 'af_heart', ttsSpeed: 1, sttModel: 'base.en', autoSpeak: false,
      agentProvider: { id: 'codex', executable: 'codex', model: '', effort: 'medium', usageMode: 'native', secretId: 'profile-preview:codex' }
    },
    workspace
  }]
};

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class DevToolsClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result || {});
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function waitForReady(client) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await client.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
    if (result.result?.value === 'complete') { await delay(600); return; }
    await delay(100);
  }
  throw new Error('ATLAS preview did not finish rendering.');
}

async function installProfileAndReload(client) {
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('atlas-browser-profiles-v1', ${JSON.stringify(JSON.stringify(profileStore))})` });
  await client.send('Page.reload', { ignoreCache: true });
  await delay(250);
  await waitForReady(client);
}

async function capture(client, name) {
  const image = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, name), Buffer.from(image.data, 'base64'));
}

async function main() {
  if (!chromium) throw new Error('Chromium was not found. Set ATLAS_CHROMIUM to a Chromium executable.');
  const localServer = await startServer();
  const browser = spawn(chromium, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--remote-debugging-port=${debuggingPort}`, '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${temporaryProfile}`, '--window-size=1600,1000', 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let browserError = '';
  browser.stderr.on('data', (chunk) => { browserError += chunk.toString(); });
  let socket;
  try {
    let targets;
    for (let attempt = 0; attempt < 100 && !targets; attempt += 1) {
      try { targets = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`).then((response) => response.json()); }
      catch { await delay(100); }
    }
    if (!targets) throw new Error(`Chromium debugging endpoint did not start. ${browserError.slice(-1000)}`);
    const page = targets.find((target) => target.type === 'page');
    if (!page?.webSocketDebuggerUrl) throw new Error('Chromium did not expose a page target.');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    const client = new DevToolsClient(socket);
    await client.send('Page.enable');
    await client.send('Page.navigate', { url: `${origin}/` });
    await waitForReady(client);
    await installProfileAndReload(client);
    await capture(client, 'atlas-project-workspace.png');

    profileStore.profiles[0].workspace.session.activeView = 'agent';
    await installProfileAndReload(client);
    await capture(client, 'atlas-agent-workspace.png');
    await client.send('Browser.close').catch(() => {});
  } finally {
    socket?.close();
    if (browser.exitCode === null) { try { browser.kill('SIGTERM'); } catch {} }
    await new Promise((resolve) => localServer.close(resolve));
    fs.rmSync(temporaryProfile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
