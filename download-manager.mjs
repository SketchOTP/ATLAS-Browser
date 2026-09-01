import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

function safeFilename(value) {
  const filename = path.basename(String(value || '').replace(/[\u0000-\u001f]/g, '').trim());
  return filename && filename !== '.' && filename !== '..' ? filename : `download-${Date.now()}`;
}

function availableDownloadPath(downloadsPath, requestedName) {
  const filename = safeFilename(requestedName);
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  let candidate = path.join(downloadsPath, filename);
  for (let copy = 1; fs.existsSync(candidate); copy += 1) candidate = path.join(downloadsPath, `${stem} (${copy})${extension}`);
  return candidate;
}

function isInsideDirectory(parentPath, candidatePath) {
  const parent = path.resolve(parentPath);
  const candidate = path.resolve(candidatePath);
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

export class DownloadManager {
  constructor({ downloadsPath, onEvent = () => {}, openPath = async () => '', getContextForWebContents = () => null }) {
    this.downloadsPath = path.resolve(downloadsPath);
    this.onEvent = onEvent;
    this.openPath = openPath;
    this.getContextForWebContents = getContextForWebContents;
    this.context = { profileId: '', projectId: '', tabId: '' };
    this.records = new Map();
    this.libraryLinks = new Map();
    this.attachedSessions = new WeakSet();
  }

  setContext(value = {}) {
    this.context = {
      profileId: String(value.profileId || ''),
      projectId: String(value.projectId || ''),
      tabId: String(value.tabId || '')
    };
    return this.context;
  }

  setLibraryLinks(links = []) {
    this.libraryLinks.clear();
    for (const link of Array.isArray(links) ? links : []) {
      const profileId = String(link?.profileId || '');
      const projectId = String(link?.projectId || '');
      const resourceId = String(link?.resourceId || '');
      const downloadPath = path.resolve(String(link?.downloadPath || ''));
      if (!profileId || !projectId || !resourceId || !isInsideDirectory(this.downloadsPath, downloadPath)) continue;
      this.libraryLinks.set(this.#libraryKey(profileId, projectId, resourceId), downloadPath);
    }
    return { linkedFiles: this.libraryLinks.size };
  }

  attach(browserSession) {
    if (!browserSession || this.attachedSessions.has(browserSession)) return;
    this.attachedSessions.add(browserSession);
    fs.mkdirSync(this.downloadsPath, { recursive: true });
    browserSession.on('will-download', (_event, item, webContents) => this.#track(item, this.getContextForWebContents(webContents) || this.context));
  }

  async readLibraryFile({ profileId, projectId, resourceId, maxBytes = 50 * 1024 * 1024 } = {}) {
    const downloadPath = this.#libraryPath(profileId, projectId, resourceId);
    const limit = Math.min(100 * 1024 * 1024, Math.max(1, Number(maxBytes) || 1));
    const stats = await fs.promises.stat(downloadPath);
    if (stats.size > limit) throw new Error(`Linked Library file is too large to read (${stats.size} bytes).`);
    return { fileName: path.basename(downloadPath), size: stats.size, bytes: await fs.promises.readFile(downloadPath) };
  }

  async libraryFileStatus({ profileId, projectId, resourceId } = {}) {
    const downloadPath = this.#libraryPath(profileId, projectId, resourceId);
    const stats = await fs.promises.stat(downloadPath);
    return { available: true, fileName: path.basename(downloadPath), size: stats.size };
  }

  async openLibraryFile({ profileId, projectId, resourceId } = {}) {
    return this.openSavedFile(this.#libraryPath(profileId, projectId, resourceId));
  }

  async openSavedFile(candidatePath) {
    if (!isInsideDirectory(this.downloadsPath, candidatePath)) throw new Error('Only files in the configured Downloads folder can be opened here.');
    if (!fs.existsSync(candidatePath)) throw new Error('The downloaded file no longer exists on disk.');
    const error = await this.openPath(path.resolve(candidatePath));
    if (error) throw new Error(error);
    return { opened: true };
  }

  #libraryKey(profileId, projectId, resourceId) {
    return `${String(profileId || '')}\u0000${String(projectId || '')}\u0000${String(resourceId || '')}`;
  }

  #libraryPath(profileId, projectId, resourceId) {
    const downloadPath = this.libraryLinks.get(this.#libraryKey(profileId, projectId, resourceId));
    if (!downloadPath) throw new Error('That file is not authorized for this project Library.');
    if (!fs.existsSync(downloadPath)) throw new Error('The linked Library file no longer exists in Downloads.');
    return downloadPath;
  }

  #track(item, context) {
    const id = randomUUID();
    const savePath = availableDownloadPath(this.downloadsPath, item.getFilename());
    item.setSavePath(savePath);
    const record = {
      id,
      ...context,
      fileName: path.basename(savePath),
      savePath,
      url: item.getURL(),
      mimeType: item.getMimeType() || 'application/octet-stream',
      totalBytes: Math.max(0, Number(item.getTotalBytes()) || 0),
      receivedBytes: 0,
      percent: 0,
      state: 'progressing',
      createdAt: new Date().toISOString(),
      completedAt: ''
    };
    this.records.set(id, record);
    this.onEvent({ ...record, event: 'started' });
    let lastProgressEvent = 0;
    item.on('updated', (_event, state) => {
      record.state = state;
      record.receivedBytes = Math.max(0, Number(item.getReceivedBytes()) || 0);
      record.totalBytes = Math.max(record.totalBytes, Number(item.getTotalBytes()) || 0);
      record.percent = record.totalBytes ? Math.min(100, Math.round((record.receivedBytes / record.totalBytes) * 100)) : Math.max(0, Number(item.getPercentComplete()) || 0);
      const now = Date.now();
      if (now - lastProgressEvent >= 250 || state === 'interrupted') {
        lastProgressEvent = now;
        this.onEvent({ ...record, event: 'updated' });
      }
    });
    item.once('done', (_event, state) => {
      record.state = state;
      record.receivedBytes = Math.max(0, Number(item.getReceivedBytes()) || 0);
      record.totalBytes = Math.max(record.totalBytes, Number(item.getTotalBytes()) || record.receivedBytes);
      record.percent = state === 'completed' ? 100 : record.totalBytes ? Math.min(100, Math.round((record.receivedBytes / record.totalBytes) * 100)) : record.percent;
      record.completedAt = new Date().toISOString();
      this.onEvent({ ...record, event: 'done' });
      if (state !== 'completed') this.records.delete(id);
    });
  }
}

export const downloadManagerInternals = { availableDownloadPath, isInsideDirectory, safeFilename };
