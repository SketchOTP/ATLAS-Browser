import { app, BrowserWindow, WebContentsView, Menu, ipcMain, shell, nativeTheme, safeStorage } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { startServer } from './server.mjs';
import { AgentProviderManager, providerTemplates } from './agent-providers.mjs';
import { transcribeLocalAudio } from './local-voice.mjs';
import { extractPdfText } from './library-reader.mjs';
import { LocalTtsService, kokoroVoices } from './local-tts.mjs';
import { PrivacyShield } from './privacy-shield.mjs';
import { BrowserController } from './browser-control.mjs';
import { DownloadManager } from './download-manager.mjs';

let localServer;
let browserWindow;
let siteView;
let applicationMenu;
let agentServer;
let agentStatus = { state: 'starting', message: 'Connecting to agent provider…' };
let activeProviderConfig = { id: 'codex', secretId: 'default:codex' };
let privacyShield;
let browserController;
let downloadManager;
let rendererReady = false;
const pendingExternalUrls = [];
const pendingAgentTools = new Map();
const localTts = new LocalTtsService();
const appIconPath = fileURLToPath(new URL('./public/assets/atlas-mark.png', import.meta.url));
const secretsPath = () => path.join(app.getPath('userData'), 'agent-secrets.json');

nativeTheme.themeSource = 'dark';
app.setPath('userData', process.env.ATLAS_USER_DATA_DIR || path.join(app.getPath('appData'), 'atlas-browser'));
app.setName('ATLAS');
app.setDesktopName('atlas-browser.desktop');
app.setAppUserModelId('com.atlas.browser');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function webUrlsFromArguments(argv = []) {
  return argv.flatMap((argument) => {
    try {
      const url = new URL(String(argument));
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
  browserWindow.webContents.send('atlas:app-command', { type: 'open-url', url });
}

function flushExternalUrls() {
  while (pendingExternalUrls.length) openExternalUrl(pendingExternalUrls.shift());
}

function buildApplicationMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => browserWindow?.webContents.send('atlas:app-command', 'new-tab') },
        { label: 'Close Current Tab', accelerator: 'CmdOrCtrl+W', click: () => browserWindow?.webContents.send('atlas:app-command', 'close-tab') },
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
    const response = await fetch('http://localhost:48173/');
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
  browserWindow.webContents.session.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => permission === 'media' && requestingOrigin.startsWith('http://localhost:48173'));
  browserWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const localShell = details.requestingUrl?.startsWith('http://localhost:48173');
    const audioOnly = !details.mediaTypes?.length || (details.mediaTypes.includes('audio') && !details.mediaTypes.includes('video'));
    callback(permission === 'media' && localShell && audioOnly);
  });

  siteView = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'persist:atlas-browser', backgroundThrottling: false } });
  browserWindow.contentView.addChildView(siteView);
  siteView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  privacyShield = new PrivacyShield({ onStatus: (status) => browserWindow?.webContents.send('atlas:privacy-status', status) });
  privacyShield.attach(siteView.webContents.session, siteView.webContents);
  browserController = new BrowserController(() => siteView?.webContents, () => browserWindow);
  downloadManager = new DownloadManager({
    downloadsPath: process.env.ATLAS_DOWNLOADS_DIR || app.getPath('downloads'),
    onEvent: (download) => browserWindow?.webContents.send('atlas:download-event', download),
    openPath: (downloadPath) => shell.openPath(downloadPath)
  });
  downloadManager.attach(siteView.webContents.session);
  siteView.webContents.setWindowOpenHandler(({ url }) => {
    siteView.webContents.loadURL(url);
    return { action: 'deny' };
  });
  siteView.webContents.on('did-navigate', (_event, url) => browserWindow.webContents.send('atlas:navigated', url));
  siteView.webContents.on('did-navigate-in-page', (_event, url) => browserWindow.webContents.send('atlas:navigated', url));
  siteView.webContents.on('page-title-updated', (_event, title) => browserWindow.webContents.send('atlas:title', title));
  siteView.webContents.on('page-favicon-updated', (_event, favicons) => browserWindow.webContents.send('atlas:favicon', favicons[0] || ''));
  siteView.webContents.on('context-menu', (_event, params) => {
    const selectedText = String(params.selectionText || '').trim();
    const template = [];
    if (selectedText) {
      template.push({
        label: 'Send to Library',
        click: () => browserWindow?.webContents.send('atlas:send-selection-to-library', {
          text: selectedText,
          url: params.pageURL || siteView.webContents.getURL(),
          title: siteView.webContents.getTitle() || 'Web excerpt'
        })
      });
      template.push({ type: 'separator' });
      template.push({ role: 'copy', label: 'Copy' });
    } else {
      template.push({ role: 'copy', label: 'Copy', enabled: false });
    }
    template.push({ role: 'selectAll', label: 'Select All' });
    Menu.buildFromTemplate(template).popup({ window: browserWindow });
  });
  siteView.webContents.on('did-finish-load', async () => {
    try {
      const favicon = await siteView.webContents.executeJavaScript(`(() => {
        const links = Array.from(document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]'));
        const preferred = links.find((link) => link.rel.includes('icon'));
        return preferred?.href || new URL('/favicon.ico', location.href).href;
      })()`);
      if (favicon) browserWindow.webContents.send('atlas:favicon', favicon);
    } catch {}
  });
  siteView.webContents.on('did-fail-load', (_event, code, description, url) => console.error(`SITE_LOAD_FAILED ${code} ${description} ${url}`));
  siteView.webContents.on('render-process-gone', (_event, details) => {
    const url = siteView?.webContents.getURL() || '';
    console.error(`SITE_RENDERER_GONE ${details.reason} exit=${details.exitCode} ${url}`);
    browserWindow?.webContents.send('atlas:site-health', { state: 'crashed', reason: details.reason, url });
    if (url && !siteView.webContents.isDestroyed()) setTimeout(() => siteView?.webContents.reload(), 500);
  });
  siteView.webContents.on('unresponsive', () => {
    const url = siteView?.webContents.getURL() || '';
    console.error(`SITE_UNRESPONSIVE ${url}`);
    browserWindow?.webContents.send('atlas:site-health', { state: 'unresponsive', url });
  });
  siteView.webContents.on('responsive', () => browserWindow?.webContents.send('atlas:site-health', { state: 'ready', url: siteView?.webContents.getURL() || '' }));
  siteView.webContents.on('console-message', (_event, details) => {
    if (details.level === 'error' || details.level === 'warning') console.error(`SITE_CONSOLE_${details.level.toUpperCase()} ${details.sourceId}:${details.lineNumber} ${details.message}`);
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
    browserWindow?.webContents.send('atlas:agent-event', { method: 'atlas/status', params: status });
  });
  agentServer.on('event', (event) => browserWindow?.webContents.send('atlas:agent-event', event));
  agentServer.on('log', (message) => console.error(`CODEX_APP_SERVER ${message.trim()}`));
  agentServer.start().catch((error) => {
    agentStatus = { state: 'error', message: error.message };
    browserWindow?.webContents.send('atlas:agent-event', { method: 'atlas/status', params: agentStatus });
  });
  await browserWindow.loadURL('http://localhost:48173/');
  rendererReady = true;
  flushExternalUrls();
  browserWindow.on('closed', () => { rendererReady = false; });
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
    browserWindow.webContents.send('atlas:agent-tool-request', { requestId, ...params });
  });
}

async function readCurrentPage(maxChars = 30000) {
  if (!siteView) throw new Error('No website view is available.');
  const limit = Math.min(50000, Math.max(1000, Number(maxChars) || 30000));
  return siteView.webContents.executeJavaScript(`(() => ({ title: document.title, url: location.href, text: (document.body?.innerText || '').slice(0, ${limit}) }))()`);
}

ipcMain.on('atlas:navigate', (_event, url) => siteView?.webContents.loadURL(url));
ipcMain.on('atlas:back', () => { if (siteView?.webContents.canGoBack()) siteView.webContents.goBack(); });
ipcMain.on('atlas:forward', () => { if (siteView?.webContents.canGoForward()) siteView.webContents.goForward(); });
ipcMain.on('atlas:reload', () => siteView?.webContents.reload());
ipcMain.on('atlas:show-app-menu', (event) => {
  if (!browserWindow || BrowserWindow.fromWebContents(event.sender) !== browserWindow) return;
  applicationMenu?.popup({ window: browserWindow });
});
ipcMain.on('atlas:bounds', (_event, bounds) => {
  if (!siteView) return;
  const safe = { x: Math.max(0, Math.round(bounds.x)), y: Math.max(0, Math.round(bounds.y)), width: Math.max(0, Math.round(bounds.width)), height: Math.max(0, Math.round(bounds.height)) };
  siteView.setBounds(bounds.visible ? safe : { x: 0, y: 0, width: 0, height: 0 });
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
  browserWindow?.webContents.send('atlas:agent-event', { method: 'atlas/status', params: agentStatus });
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
ipcMain.handle('atlas:read-current-page', (_event, maxChars) => readCurrentPage(maxChars));
ipcMain.handle('atlas:browser-inspect', (_event, options) => browserController.inspect(options));
ipcMain.handle('atlas:browser-click', (_event, options) => browserController.click(options));
ipcMain.handle('atlas:browser-type', (_event, options) => browserController.type(options));
ipcMain.handle('atlas:browser-press-key', (_event, options) => browserController.pressKey(options));
ipcMain.handle('atlas:browser-scroll', (_event, options) => browserController.scroll(options));
ipcMain.on('atlas:download-context', (_event, context) => downloadManager?.setContext(context));
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
ipcMain.handle('atlas:privacy-status', () => privacyShield?.status() || { mode: 'balanced', blockedRequests: 0, cleanedLinks: 0 });
ipcMain.handle('atlas:privacy-mode', (_event, mode) => {
  const result = privacyShield?.setMode(mode) || { mode: 'balanced', blockedRequests: 0, cleanedLinks: 0, changed: false };
  if (result.changed && siteView?.webContents.getURL()) siteView.webContents.reload();
  return result;
});
ipcMain.handle('atlas:clear-website-data', async () => {
  if (!privacyShield) throw new Error('Privacy shield is not ready.');
  const result = await privacyShield.clearWebsiteData();
  if (siteView?.webContents.getURL()) siteView.webContents.reload();
  return result;
});
ipcMain.handle('atlas:transcribe-audio', (_event, payload) => transcribeLocalAudio(payload));
ipcMain.handle('atlas:extract-pdf-text', (_event, bytes) => extractPdfText(bytes));
ipcMain.handle('atlas:tts-voices', () => kokoroVoices);
ipcMain.handle('atlas:synthesize-speech', (_event, payload) => localTts.synthesize(payload));
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
  applicationMenu = buildApplicationMenu();
  Menu.setApplicationMenu(applicationMenu);
  return createWindow();
});
app.on('window-all-closed', () => {
  agentServer?.stop();
  localTts.stop();
  localServer?.close();
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
