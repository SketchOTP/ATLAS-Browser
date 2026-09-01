import { app, BrowserWindow, WebContentsView, Menu, ipcMain, shell, nativeTheme, safeStorage, session as electronSession } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { origin as localShellOrigin, startServer } from './server.mjs';
import { AgentProviderManager, providerTemplates } from './agent-providers.mjs';
import { transcribeLocalAudio } from './local-voice.mjs';
import { extractPdfText } from './library-reader.mjs';
import { LocalTtsService, kokoroVoices } from './local-tts.mjs';
import { PrivacyShield } from './privacy-shield.mjs';
import { BrowserController } from './browser-control.mjs';
import { DownloadManager } from './download-manager.mjs';
import { browserContextKey, hideWebsiteView, normalizeBrowserContext, ProjectBrowserRegistry, showWebsiteView } from './project-browser-isolation.mjs';
import { migrateLegacyWebsiteCookies, normalizeProfileId, profileSessionPartition } from './profile-website-sessions.mjs';
import { isAllowedWebsiteUrl, websiteWindowRoute } from './website-window-routing.mjs';
import { normalizeWebsiteMediaPermissions, websiteMediaPermissionAllowed } from './website-media-permissions.mjs';

let localServer;
let browserWindow;
let siteView;
let applicationMenu;
let agentServer;
let agentStatus = { state: 'starting', message: 'Connecting to agent provider…' };
let activeProviderConfig = { id: 'codex', secretId: 'default:codex' };
let browserController;
let downloadManager;
let activeWebsiteProfileId = '';
let rendererReady = false;
const pendingExternalUrls = [];
const pendingAgentTools = new Map();
const projectBrowsers = new ProjectBrowserRegistry();
const websitePopups = new Map();
const websiteContentsContexts = new WeakMap();
const profileWebsiteRuntimes = new Map();
const profileWebsiteMediaPermissions = new Map();
let siteBounds = { x: 0, y: 0, width: 0, height: 0, visible: false };
const localTts = new LocalTtsService();
const appIconPath = fileURLToPath(new URL('./public/assets/atlas-mark.png', import.meta.url));
const secretsPath = () => path.join(app.getPath('userData'), 'agent-secrets.json');
const websiteSessionMigrationPath = () => path.join(app.getPath('userData'), 'profile-website-session-migration.json');

nativeTheme.themeSource = 'dark';
const useLinuxSoftwareGraphics = process.platform === 'linux' && process.env.ATLAS_HARDWARE_ACCELERATION !== '1';
if (useLinuxSoftwareGraphics) app.disableHardwareAcceleration();
app.setPath('userData', process.env.ATLAS_USER_DATA_DIR || path.join(app.getPath('appData'), 'atlas-browser'));
app.setName('ATLAS');
app.setDesktopName('atlas.desktop');
app.setAppUserModelId('com.atlas.browser');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const runtimeLogPath = () => path.join(app.getPath('userData'), 'runtime-events.log');

function logRuntimeEvent(event, details = '') {
  const line = `${new Date().toISOString()} ${event}${details ? ` ${String(details).replaceAll('\n', ' ')}` : ''}`;
  console.log(line);
  try {
    fs.mkdirSync(path.dirname(runtimeLogPath()), { recursive: true });
    fs.appendFileSync(runtimeLogPath(), `${line}\n`, { mode: 0o600 });
  } catch (error) {
    console.error(`RUNTIME_LOG_FAILED ${error.message}`);
  }
}

if (useLinuxSoftwareGraphics) logRuntimeEvent('GRAPHICS_MODE', 'software linux-stability');

process.on('uncaughtExceptionMonitor', (error) => logRuntimeEvent('MAIN_UNCAUGHT_EXCEPTION', error?.stack || error));
process.on('exit', (code) => logRuntimeEvent('MAIN_PROCESS_EXIT', `code=${code}`));
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.once(signal, () => {
    logRuntimeEvent('MAIN_PROCESS_SIGNAL', signal);
    app.quit();
  });
}

function webUrlsFromArguments(argv = []) {
  return argv.flatMap((argument) => {
    try {
      const url = new URL(String(argument));
      if (url.hostname.toLowerCase() === 'amlocalhost.com') return [];
      return ['http:', 'https:'].includes(url.protocol) ? [url.href] : [];
    } catch {
      return [];
    }
  });
}

function openExternalUrl(url) {
  if (!url) return;
  if (!rendererReady || !browserWindow || browserWindow.isDestroyed()) {
    pendingExternalUrls.push(url);
    return;
  }
  if (browserWindow.isMinimized()) browserWindow.restore();
  browserWindow.show();
  browserWindow.focus();
  sendToRenderer('atlas:app-command', { type: 'open-url', url });
}

function flushExternalUrls() {
  while (pendingExternalUrls.length) openExternalUrl(pendingExternalUrls.shift());
}

function sendToRenderer(channel, ...args) {
  try {
    if (!browserWindow || browserWindow.isDestroyed() || browserWindow.webContents.isDestroyed()) return false;
    browserWindow.webContents.send(channel, ...args);
    return true;
  } catch (error) {
    if (error?.message !== 'Object has been destroyed') console.error(`RENDERER_SEND_FAILED ${channel} ${error.message}`);
    return false;
  }
}

function profileWebsiteRuntime(value) {
  const profileId = normalizeProfileId(value);
  if (profileWebsiteRuntimes.has(profileId)) return profileWebsiteRuntimes.get(profileId);
  const browserSession = electronSession.fromPartition(profileSessionPartition(profileId));
  const shield = new PrivacyShield({
    onStatus: (status) => {
      if (activeWebsiteProfileId === profileId) sendToRenderer('atlas:privacy-status', { profileId, ...status });
    },
    allowPermission: (permission, _requestingOrigin, details) => websiteMediaPermissionAllowed(profileWebsiteMediaPermissions.get(profileId), permission, details)
  });
  shield.attach(browserSession);
  downloadManager?.attach(browserSession);
  const legacySession = electronSession.fromPartition('persist:atlas-browser');
  const ready = migrateLegacyWebsiteCookies({
    sourceSession: legacySession,
    targetSession: browserSession,
    profileId,
    markerPath: websiteSessionMigrationPath()
  }).then((result) => {
    if (!result.skipped || result.profileId === profileId) console.log(`PROFILE_WEBSITE_SESSION profile=${profileId} copied=${result.copied || 0} failed=${result.failed || 0}`);
    return result;
  }).catch((error) => {
    console.error(`PROFILE_WEBSITE_SESSION_MIGRATION profile=${profileId} ${error.message}`);
    return { completed: false, profileId, error: error.message };
  });
  const runtime = { profileId, session: browserSession, privacyShield: shield, ready };
  profileWebsiteRuntimes.set(profileId, runtime);
  return runtime;
}

function activeProfileWebsiteRuntime(profileId = activeWebsiteProfileId) {
  if (!profileId) return null;
  return profileWebsiteRuntime(profileId);
}

function websitePopupOptions(context) {
  const runtime = profileWebsiteRuntime(context.profileId);
  return {
    parent: browserWindow,
    width: 560,
    height: 760,
    minWidth: 420,
    minHeight: 540,
    show: true,
    autoHideMenuBar: true,
    backgroundColor: '#15131c',
    title: 'ATLAS Secure Sign-In',
    icon: appIconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: runtime.session,
      backgroundThrottling: false
    }
  };
}

function websiteWindowOpenHandler(context) {
  return ({ url }) => {
    const route = websiteWindowRoute(url);
    if (route === 'tab') {
      sendToRenderer('atlas:app-command', { type: 'open-url', url, context, source: 'website' });
      return { action: 'deny' };
    }
    if (route === 'deny') return { action: 'deny' };
    return { action: 'allow', overrideBrowserWindowOptions: websitePopupOptions(context) };
  };
}

function configureWebsitePopup(popupWindow, context) {
  popupWindow.setAutoHideMenuBar(true);
  popupWindow.setMenuBarVisibility(false);
  profileWebsiteRuntime(context.profileId).privacyShield.attachWebContents(popupWindow.webContents);
  popupWindow.webContents.setWindowOpenHandler(websiteWindowOpenHandler(context));
  popupWindow.webContents.on('did-create-window', (childWindow) => configureWebsitePopup(childWindow, context));
  popupWindow.webContents.on('will-navigate', (event, url) => {
    const route = websiteWindowRoute(url);
    if (route === 'popup') return;
    event.preventDefault();
    if (route === 'tab') {
      sendToRenderer('atlas:app-command', { type: 'open-url', url, context, source: 'website-popup' });
      setImmediate(() => { try { if (!popupWindow.isDestroyed()) popupWindow.close(); } catch {} });
    }
  });
  websitePopups.set(popupWindow, browserContextKey(context));
  websiteContentsContexts.set(popupWindow.webContents, context);
  popupWindow.once('closed', () => websitePopups.delete(popupWindow));
  popupWindow.show();
  popupWindow.focus();
}

function closePopupsOutsideContext(context) {
  const activeKey = context ? browserContextKey(context) : '';
  for (const [popupWindow, popupKey] of websitePopups) {
    if (popupKey === activeKey) continue;
    websitePopups.delete(popupWindow);
    try { if (!popupWindow.isDestroyed()) popupWindow.close(); } catch {}
  }
}

function isActiveWebsiteView(view, context) {
  return projectBrowsers.active(context)?.value === view && siteView === view;
}

function sendWebsiteEvent(view, context, channel, payload = {}) {
  if (!isActiveWebsiteView(view, context)) return false;
  return sendToRenderer(channel, { context, ...payload });
}

function createProjectWebsiteView(context) {
  const runtime = profileWebsiteRuntime(context.profileId);
  const view = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, session: runtime.session, backgroundThrottling: false } });
  websiteContentsContexts.set(view.webContents, context);
  runtime.privacyShield.attachWebContents(view.webContents);
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  view.setVisible(false);
  view.webContents.setWindowOpenHandler(websiteWindowOpenHandler(context));
  view.webContents.on('did-create-window', (popupWindow) => configureWebsitePopup(popupWindow, context));
  view.webContents.on('did-navigate', (_event, url) => {
    sendWebsiteEvent(view, context, 'atlas:navigated', { url });
  });
  view.webContents.on('did-navigate-in-page', (_event, url) => sendWebsiteEvent(view, context, 'atlas:navigated', { url }));
  view.webContents.on('page-title-updated', (_event, title) => sendWebsiteEvent(view, context, 'atlas:title', { title }));
  view.webContents.on('page-favicon-updated', (_event, favicons) => sendWebsiteEvent(view, context, 'atlas:favicon', { favicon: favicons[0] || '' }));
  view.webContents.on('context-menu', (_event, params) => {
    if (!isActiveWebsiteView(view, context)) return;
    const selectedText = String(params.selectionText || '').trim();
    const editFlags = params.editFlags || {};
    const template = [];
    if (selectedText) {
      template.push({
        label: 'Send to Library',
        click: () => sendWebsiteEvent(view, context, 'atlas:send-selection-to-library', {
          text: selectedText,
          url: params.pageURL || view.webContents.getURL(),
          title: view.webContents.getTitle() || 'Web excerpt'
        })
      });
      template.push({ type: 'separator' });
    }
    if (params.isEditable) {
      template.push(
        { role: 'undo', label: 'Undo', enabled: Boolean(editFlags.canUndo) },
        { role: 'redo', label: 'Redo', enabled: Boolean(editFlags.canRedo) },
        { type: 'separator' },
        { role: 'cut', label: 'Cut', enabled: Boolean(editFlags.canCut) },
        { role: 'copy', label: 'Copy', enabled: Boolean(editFlags.canCopy) },
        { role: 'paste', label: 'Paste', enabled: Boolean(editFlags.canPaste) },
        { role: 'pasteAndMatchStyle', label: 'Paste as plain text', enabled: Boolean(editFlags.canPaste) },
        { role: 'delete', label: 'Delete', enabled: Boolean(editFlags.canDelete) },
        { type: 'separator' },
        { role: 'selectAll', label: 'Select All', enabled: editFlags.canSelectAll !== false }
      );
    } else {
      template.push(
        { role: 'copy', label: 'Copy', enabled: Boolean(selectedText && editFlags.canCopy !== false) },
        { role: 'selectAll', label: 'Select All', enabled: editFlags.canSelectAll !== false }
      );
    }
    Menu.buildFromTemplate(template).popup({ window: browserWindow });
  });
  view.webContents.on('did-finish-load', async () => {
    try {
      const favicon = await view.webContents.executeJavaScript(`(() => {
        const links = Array.from(document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]'));
        const preferred = links.find((link) => link.rel.includes('icon'));
        return preferred?.href || new URL('/favicon.ico', location.href).href;
      })()`);
      if (favicon) sendWebsiteEvent(view, context, 'atlas:favicon', { favicon });
    } catch {}
  });
  view.webContents.on('did-fail-load', (_event, code, description) => console.error(`SITE_LOAD_FAILED ${code} ${description} context=${browserContextKey(context)}`));
  view.webContents.on('render-process-gone', (_event, details) => {
    const url = view.webContents.isDestroyed() ? '' : view.webContents.getURL();
    console.error(`SITE_RENDERER_GONE ${details.reason} exit=${details.exitCode} context=${browserContextKey(context)}`);
    sendWebsiteEvent(view, context, 'atlas:site-health', { state: 'crashed', reason: details.reason, url });
    if (url && !view.webContents.isDestroyed()) setTimeout(() => { if (!view.webContents.isDestroyed()) view.webContents.reload(); }, 500);
  });
  view.webContents.on('unresponsive', () => sendWebsiteEvent(view, context, 'atlas:site-health', { state: 'unresponsive', url: view.webContents.getURL() }));
  view.webContents.on('responsive', () => sendWebsiteEvent(view, context, 'atlas:site-health', { state: 'ready', url: view.webContents.getURL() }));
  view.webContents.on('console-message', (_event, details) => {
    if (details.level === 'error' || details.level === 'warning') console.error(`SITE_CONSOLE_${details.level.toUpperCase()} context=${browserContextKey(context)} ${details.message}`);
  });
  return view;
}

function removeProjectWebsiteView(view) {
  try { browserWindow?.contentView.removeChildView(view); } catch {}
  if (siteView === view) siteView = null;
  try { if (!view.webContents.isDestroyed()) view.webContents.close(); } catch {}
}

function activateProjectWebsiteView(value) {
  const context = normalizeBrowserContext(value);
  activeWebsiteProfileId = context.profileId;
  const { record, previous } = projectBrowsers.activate(context, createProjectWebsiteView);
  siteView = record.value;
  const safe = { x: siteBounds.x, y: siteBounds.y, width: siteBounds.width, height: siteBounds.height };
  showWebsiteView(browserWindow.contentView, siteView, previous?.value, safe, siteBounds.visible);
  closePopupsOutsideContext(context);
  return record;
}

function deactivateProjectWebsiteView() {
  const previous = projectBrowsers.deactivate();
  hideWebsiteView(previous?.value);
  siteView = null;
  closePopupsOutsideContext(null);
}

function buildApplicationMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => sendToRenderer('atlas:app-command', 'new-tab') },
        { label: 'Close Current Tab', accelerator: 'CmdOrCtrl+W', click: () => sendToRenderer('atlas:app-command', 'close-tab') },
        { type: 'separator' },
        { label: 'Close Window', click: () => browserWindow?.close() },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    { label: 'Help', submenu: [{ label: `ATLAS Browser ${app.getVersion()}`, enabled: false }] }
  ]);
}

function readEncryptedSecrets() {
  try { return JSON.parse(fs.readFileSync(secretsPath(), 'utf8')); } catch { return {}; }
}

function writeEncryptedSecret(secretId, value) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable on this system.');
  const secrets = readEncryptedSecrets();
  if (value) secrets[secretId] = safeStorage.encryptString(value).toString('base64');
  else delete secrets[secretId];
  fs.mkdirSync(path.dirname(secretsPath()), { recursive: true });
  fs.writeFileSync(secretsPath(), JSON.stringify(secrets), { mode: 0o600 });
  try { fs.chmodSync(secretsPath(), 0o600); } catch {}
}

function readEncryptedSecret(secretId) {
  if (!secretId || !safeStorage.isEncryptionAvailable()) return '';
  try {
    const encrypted = readEncryptedSecrets()[secretId];
    return encrypted ? safeStorage.decryptString(Buffer.from(encrypted, 'base64')) : '';
  } catch { return ''; }
}

function launchInTerminal(command = []) {
  if (!Array.isArray(command) || !command.length) throw new Error('No login command is configured for this provider.');
  let child;
  if (process.platform === 'win32') child = spawn('cmd.exe', ['/d', '/s', '/c', 'start', 'ATLAS Agent Login', 'cmd.exe', '/k', ...command], { detached: true, windowsHide: false });
  else if (process.platform === 'darwin') child = spawn('open', ['-a', 'Terminal', ...command], { detached: true });
  else child = spawn('x-terminal-emulator', ['-e', ...command], { detached: true });
  child.unref();
  return { launched: true, command: command[0] };
}

async function ensureLocalServer() {
  try {
    const response = await fetch(`${localShellOrigin}/`);
    if (response.ok) return;
  } catch {}
  localServer = await startServer();
}

async function createWindow() {
  await ensureLocalServer();
  browserWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#15131c',
    title: 'ATLAS',
    icon: appIconPath,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url))
    }
  });
  browserWindow.setAutoHideMenuBar(true);
  browserWindow.setMenuBarVisibility(false);
  browserWindow.webContents.session.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => permission === 'media' && requestingOrigin.startsWith(localShellOrigin));
  browserWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const localShell = details.requestingUrl?.startsWith(localShellOrigin);
    const audioOnly = !details.mediaTypes?.length || (details.mediaTypes.includes('audio') && !details.mediaTypes.includes('video'));
    callback(permission === 'media' && localShell && audioOnly);
  });

  browserController = new BrowserController(() => siteView?.webContents, () => browserWindow);
  downloadManager = new DownloadManager({
    downloadsPath: process.env.ATLAS_DOWNLOADS_DIR || app.getPath('downloads'),
    onEvent: (download) => sendToRenderer('atlas:download-event', download),
    openPath: (downloadPath) => shell.openPath(downloadPath),
    getContextForWebContents: (contents) => websiteContentsContexts.get(contents) || null
  });

  browserWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  browserWindow.webContents.on('did-fail-load', (_event, code, description, url) => console.error(`SHELL_LOAD_FAILED ${code} ${description} ${url}`));
  agentServer = new AgentProviderManager({ cwd: fileURLToPath(new URL('.', import.meta.url)), executeTool: executeAgentTool, getSecret: async () => readEncryptedSecret(activeProviderConfig.secretId) });
  agentServer.configure(activeProviderConfig);
  agentServer.on('status', (status) => {
    agentStatus = status;
    sendToRenderer('atlas:agent-event', { method: 'atlas/status', params: status });
  });
  agentServer.on('event', (event) => sendToRenderer('atlas:agent-event', event));
  agentServer.on('log', (message) => console.error(`CODEX_APP_SERVER ${message.trim()}`));
  agentServer.start().catch((error) => {
    agentStatus = { state: 'error', message: error.message };
    sendToRenderer('atlas:agent-event', { method: 'atlas/status', params: agentStatus });
  });
  await browserWindow.loadURL(`${localShellOrigin}/`);
  rendererReady = true;
  flushExternalUrls();
  logRuntimeEvent('MAIN_WINDOW_READY');
  browserWindow.on('close', () => logRuntimeEvent('MAIN_WINDOW_CLOSE_REQUESTED'));
  browserWindow.on('closed', () => {
    logRuntimeEvent('MAIN_WINDOW_CLOSED');
    rendererReady = false;
    projectBrowsers.clear(removeProjectWebsiteView);
    closePopupsOutsideContext(null);
    profileWebsiteRuntimes.clear();
    activeWebsiteProfileId = '';
    browserWindow = null;
    siteView = null;
  });
  localTts.synthesize({ text: 'Ready.', voice: 'af_heart', speed: 1 }).then(() => console.log('KOKORO_WARMUP_READY')).catch((error) => console.error(`KOKORO_WARMUP ${error.message}`));
}

async function executeAgentTool(params) {
  if (!browserWindow) throw new Error('ATLAS Browser window is unavailable.');
  const requestId = randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingAgentTools.delete(requestId);
      reject(new Error('ATLAS tool timed out.'));
    }, 30000);
    pendingAgentTools.set(requestId, { resolve, reject, timeout });
    if (!sendToRenderer('atlas:agent-tool-request', { requestId, ...params })) {
      clearTimeout(timeout);
      pendingAgentTools.delete(requestId);
      reject(new Error('ATLAS Browser window is unavailable.'));
    }
  });
}

function requireActiveWebsiteContents(context) {
  const record = projectBrowsers.active(context);
  if (!record || record.value !== siteView || record.value.webContents.isDestroyed()) throw new Error('That project browser context is not active.');
  return record.value.webContents;
}

async function readCurrentPage({ context, maxChars = 30000 } = {}) {
  const contents = requireActiveWebsiteContents(context);
  const limit = Math.min(50000, Math.max(1000, Number(maxChars) || 30000));
  return contents.executeJavaScript(`(() => ({ title: document.title, url: location.href, text: (document.body?.innerText || '').slice(0, ${limit}) }))()`);
}

ipcMain.on('atlas:browser-activate', (_event, context) => {
  try { activateProjectWebsiteView(context); } catch (error) { console.error(`BROWSER_CONTEXT_REJECTED ${error.message}`); }
});
ipcMain.on('atlas:browser-sync', (_event, contexts) => {
  try {
    const normalized = (Array.isArray(contexts) ? contexts : []).map(normalizeBrowserContext);
    if (new Set(normalized.map((context) => context.profileId)).size > 1) throw new Error('Browser sync crossed profile boundaries.');
    projectBrowsers.prune(normalized, removeProjectWebsiteView);
  } catch (error) { console.error(`BROWSER_SYNC_REJECTED ${error.message}`); }
});
ipcMain.on('atlas:navigate', async (_event, request) => {
  try {
    const record = activateProjectWebsiteView(request?.context);
    await profileWebsiteRuntime(record.context.profileId).ready;
    if (projectBrowsers.active(record.context)?.value !== record.value) return;
    const url = String(request?.url || '');
    if (!isAllowedWebsiteUrl(url)) throw new Error('Unsupported website URL.');
    if (record.value.webContents.getURL() !== url) record.value.webContents.loadURL(url);
  } catch (error) { console.error(`BROWSER_NAVIGATION_REJECTED ${error.message}`); }
});
ipcMain.on('atlas:back', (_event, context) => {
  try {
    const record = projectBrowsers.active(context);
    if (record?.value.webContents.navigationHistory.canGoBack()) record.value.webContents.navigationHistory.goBack();
  } catch {}
});
ipcMain.on('atlas:forward', (_event, context) => {
  try {
    const record = projectBrowsers.active(context);
    if (record?.value.webContents.navigationHistory.canGoForward()) record.value.webContents.navigationHistory.goForward();
  } catch {}
});
ipcMain.on('atlas:reload', (_event, context) => {
  try { projectBrowsers.active(context)?.value.webContents.reload(); } catch {}
});
ipcMain.on('atlas:show-app-menu', (event) => {
  if (!browserWindow || BrowserWindow.fromWebContents(event.sender) !== browserWindow) return;
  applicationMenu?.popup({ window: browserWindow });
});
ipcMain.on('atlas:bounds', (_event, bounds) => {
  const safe = { x: Math.max(0, Math.round(bounds?.x || 0)), y: Math.max(0, Math.round(bounds?.y || 0)), width: Math.max(0, Math.round(bounds?.width || 0)), height: Math.max(0, Math.round(bounds?.height || 0)) };
  siteBounds = { ...safe, visible: Boolean(bounds?.visible) };
  if (!bounds?.context) {
    deactivateProjectWebsiteView();
    return;
  }
  let record;
  try { record = projectBrowsers.active(bounds.context); } catch { return; }
  if (!record || record.value !== siteView) return;
  siteView.setBounds(siteBounds.visible ? safe : { x: 0, y: 0, width: 0, height: 0 });
  siteView.setVisible(siteBounds.visible);
  if (!bounds.visible) browserWindow?.webContents.focus();
});
ipcMain.handle('atlas:agent-status', async () => {
  await agentServer?.start();
  return agentStatus;
});
ipcMain.handle('atlas:agent-usage', () => agentServer.getUsage());
ipcMain.handle('atlas:codex-rate-limits', () => agentServer.getUsage());
ipcMain.handle('atlas:agent-provider-templates', () => Object.values(providerTemplates));
ipcMain.handle('atlas:agent-provider-configure', async (_event, config) => {
  const providerId = providerTemplates[config?.id] ? config.id : 'codex';
  const secretId = String(config?.secretId || `default:${providerId}`).replace(/[^a-z0-9:_-]/gi, '').slice(0, 160) || `default:${providerId}`;
  activeProviderConfig = { ...config, id: providerId, secretId };
  agentStatus = { state: 'starting', message: `Connecting to ${providerTemplates[providerId].name}…`, providerId };
  agentServer.configure(activeProviderConfig);
  try { agentStatus = await agentServer.start(); }
  catch (error) { agentStatus = { state: 'error', providerId, providerName: providerTemplates[providerId].name, message: error.message }; }
  sendToRenderer('atlas:agent-event', { method: 'atlas/status', params: agentStatus });
  return agentStatus;
});
ipcMain.handle('atlas:agent-provider-test', () => agentServer.test());
ipcMain.handle('atlas:agent-provider-login', () => launchInTerminal(activeProviderConfig.authCommand || providerTemplates[activeProviderConfig.id]?.authCommand));
ipcMain.handle('atlas:agent-provider-secret', (_event, { secretId, value }) => {
  const normalizedId = String(secretId || '').replace(/[^a-z0-9:_-]/gi, '').slice(0, 160);
  if (!normalizedId) throw new Error('Invalid credential identifier.');
  writeEncryptedSecret(normalizedId, String(value || ''));
  return { saved: Boolean(value) };
});
ipcMain.handle('atlas:agent-create-thread', () => agentServer.createThread());
ipcMain.handle('atlas:agent-send', (_event, payload) => agentServer.sendTurn(payload));
ipcMain.handle('atlas:agent-read-thread', (_event, threadId) => agentServer.readThread(threadId));
ipcMain.handle('atlas:agent-compact-thread', (_event, threadId) => agentServer.compactThread(threadId));
ipcMain.handle('atlas:agent-delete-thread', (_event, threadId) => agentServer.deleteThread(threadId));
ipcMain.handle('atlas:read-current-page', (_event, options) => readCurrentPage(options));
ipcMain.handle('atlas:browser-inspect', (_event, options) => { requireActiveWebsiteContents(options?.context); return browserController.inspect(options); });
ipcMain.handle('atlas:browser-click', (_event, options) => { requireActiveWebsiteContents(options?.context); return browserController.click(options); });
ipcMain.handle('atlas:browser-type', (_event, options) => { requireActiveWebsiteContents(options?.context); return browserController.type(options); });
ipcMain.handle('atlas:browser-press-key', (_event, options) => { requireActiveWebsiteContents(options?.context); return browserController.pressKey(options); });
ipcMain.handle('atlas:browser-scroll', (_event, options) => { requireActiveWebsiteContents(options?.context); return browserController.scroll(options); });
ipcMain.on('atlas:download-context', (_event, context) => {
  try {
    const profileId = normalizeProfileId(context?.profileId);
    activeWebsiteProfileId = profileId;
    profileWebsiteRuntime(profileId);
    downloadManager?.setContext(context);
  } catch (error) { console.error(`DOWNLOAD_CONTEXT_REJECTED ${error.message}`); }
});
ipcMain.on('atlas:library-file-links', (_event, links) => downloadManager?.setLibraryLinks(links));
ipcMain.handle('atlas:library-file-read', (_event, request) => {
  if (!downloadManager) throw new Error('Download manager is not ready.');
  return downloadManager.readLibraryFile(request);
});
ipcMain.handle('atlas:library-file-status', (_event, request) => {
  if (!downloadManager) throw new Error('Download manager is not ready.');
  return downloadManager.libraryFileStatus(request);
});
ipcMain.handle('atlas:library-file-open', (_event, request) => {
  if (!downloadManager) throw new Error('Download manager is not ready.');
  return downloadManager.openLibraryFile(request);
});
ipcMain.handle('atlas:download-open', (_event, downloadPath) => {
  if (!downloadManager) throw new Error('Download manager is not ready.');
  return downloadManager.openSavedFile(downloadPath);
});
ipcMain.handle('atlas:privacy-status', (_event, profileId) => {
  const normalizedProfileId = normalizeProfileId(profileId);
  const runtime = activeProfileWebsiteRuntime(normalizedProfileId);
  return { profileId: normalizedProfileId, ...(runtime?.privacyShield.status() || { mode: 'balanced', blockedRequests: 0, cleanedLinks: 0 }) };
});
ipcMain.handle('atlas:privacy-mode', (_event, request) => {
  const profileId = normalizeProfileId(request?.profileId);
  activeWebsiteProfileId = profileId;
  const runtime = profileWebsiteRuntime(profileId);
  const result = runtime.privacyShield.setMode(request?.mode);
  if (result.changed && activeWebsiteProfileId === profileId && siteView?.webContents.getURL()) siteView.webContents.reload();
  return { profileId, ...result };
});
ipcMain.handle('atlas:website-media-permissions', (_event, request) => {
  const profileId = normalizeProfileId(request?.profileId);
  const permissions = normalizeWebsiteMediaPermissions(request);
  profileWebsiteMediaPermissions.set(profileId, permissions);
  profileWebsiteRuntime(profileId);
  return { profileId, ...permissions };
});
ipcMain.handle('atlas:clear-website-data', async (_event, profileId) => {
  const normalizedProfileId = normalizeProfileId(profileId);
  const runtime = profileWebsiteRuntime(normalizedProfileId);
  const result = await runtime.privacyShield.clearWebsiteData();
  if (activeWebsiteProfileId === normalizedProfileId && siteView?.webContents.getURL()) siteView.webContents.reload();
  return { profileId: normalizedProfileId, ...result };
});
ipcMain.handle('atlas:transcribe-audio', (_event, payload) => transcribeLocalAudio(payload));
ipcMain.handle('atlas:extract-pdf-text', (_event, bytes) => extractPdfText(bytes));
ipcMain.handle('atlas:tts-voices', () => kokoroVoices);
ipcMain.handle('atlas:synthesize-speech', (_event, payload) => localTts.synthesize(payload));
ipcMain.handle('atlas:cancel-speech', () => {
  localTts.stop();
  return { cancelled: true };
});
ipcMain.on('atlas:agent-tool-result', (_event, { requestId, result, error }) => {
  const pending = pendingAgentTools.get(requestId);
  if (!pending) return;
  clearTimeout(pending.timeout);
  pendingAgentTools.delete(requestId);
  if (error) pending.reject(new Error(error)); else pending.resolve(result);
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    webUrlsFromArguments(argv).forEach(openExternalUrl);
    if (browserWindow) {
      if (browserWindow.isMinimized()) browserWindow.restore();
      browserWindow.show();
      browserWindow.focus();
    }
  });
}

webUrlsFromArguments(process.argv).forEach((url) => pendingExternalUrls.push(url));

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  logRuntimeEvent('APP_READY', `version=${app.getVersion()}`);
  applicationMenu = buildApplicationMenu();
  Menu.setApplicationMenu(applicationMenu);
  return createWindow();
});
app.on('render-process-gone', (_event, webContents, details) => {
  logRuntimeEvent('RENDER_PROCESS_GONE', `id=${webContents?.id || 'unknown'} reason=${details.reason} exit=${details.exitCode}`);
});
app.on('child-process-gone', (_event, details) => {
  logRuntimeEvent('CHILD_PROCESS_GONE', `type=${details.type} reason=${details.reason} exit=${details.exitCode} name=${details.name || ''}`);
});
app.on('before-quit', () => logRuntimeEvent('APP_BEFORE_QUIT'));
app.on('will-quit', () => logRuntimeEvent('APP_WILL_QUIT'));
app.on('quit', (_event, exitCode) => logRuntimeEvent('APP_QUIT', `code=${exitCode}`));
app.on('window-all-closed', () => {
  agentServer?.stop();
  localTts.stop();
  localServer?.close();
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
