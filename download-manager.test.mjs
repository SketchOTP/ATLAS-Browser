import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DownloadManager, downloadManagerInternals } from './download-manager.mjs';

class MockDownload extends EventEmitter {
  constructor(filename = 'research.txt') {
    super();
    this.filename = filename;
    this.receivedBytes = 0;
    this.totalBytes = 12;
    this.savePath = '';
  }

  getFilename() { return this.filename; }
  getURL() { return 'https://example.test/research.txt'; }
  getMimeType() { return 'text/plain'; }
  getTotalBytes() { return this.totalBytes; }
  getReceivedBytes() { return this.receivedBytes; }
  getPercentComplete() { return this.totalBytes ? (this.receivedBytes / this.totalBytes) * 100 : 0; }
  setSavePath(value) { this.savePath = value; }
}

test('captures project context and links only an explicitly authorized Library file', async (t) => {
  const downloadsPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'atlas-download-manager-'));
  t.after(() => fs.promises.rm(downloadsPath, { recursive: true, force: true }));
  const events = [];
  const browserSession = new EventEmitter();
  const manager = new DownloadManager({ downloadsPath, onEvent: (event) => events.push(event) });
  manager.setContext({ profileId: 'profile-1', projectId: 'project-1', tabId: 'tab-1' });
  manager.attach(browserSession);

  const item = new MockDownload();
  browserSession.emit('will-download', {}, item);
  assert.equal(path.dirname(item.savePath), downloadsPath);
  assert.equal(events[0].event, 'started');
  assert.equal(events[0].projectId, 'project-1');

  await fs.promises.writeFile(item.savePath, 'hello atlas!');
  item.receivedBytes = 12;
  item.emit('updated', {}, 'progressing');
  item.emit('done', {}, 'completed');

  const done = events.at(-1);
  assert.equal(done.event, 'done');
  assert.equal(done.state, 'completed');
  assert.equal(done.percent, 100);
  manager.setLibraryLinks([{ profileId: 'profile-1', projectId: 'project-1', resourceId: 'resource-1', downloadPath: item.savePath }]);
  const linked = await manager.readLibraryFile({ profileId: 'profile-1', projectId: 'project-1', resourceId: 'resource-1', maxBytes: 1024 });
  assert.equal(linked.bytes.toString(), 'hello atlas!');
  assert.deepEqual(await manager.libraryFileStatus({ profileId: 'profile-1', projectId: 'project-1', resourceId: 'resource-1' }), { available: true, fileName: 'research.txt', size: 12 });
  await assert.rejects(() => manager.readLibraryFile({ profileId: 'profile-1', projectId: 'project-1', resourceId: 'resource-2' }), /not authorized/);
  await assert.rejects(() => manager.readLibraryFile({ profileId: 'profile-1', projectId: 'project-2', resourceId: 'resource-1' }), /not authorized/);
});

test('uses collision-safe names and only opens files inside the configured downloads folder', async (t) => {
  const downloadsPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'atlas-download-paths-'));
  t.after(() => fs.promises.rm(downloadsPath, { recursive: true, force: true }));
  await fs.promises.writeFile(path.join(downloadsPath, 'report.pdf'), 'existing');
  assert.equal(downloadManagerInternals.availableDownloadPath(downloadsPath, 'report.pdf'), path.join(downloadsPath, 'report (1).pdf'));
  assert.equal(downloadManagerInternals.safeFilename('../unsafe.txt'), 'unsafe.txt');

  const opened = [];
  const manager = new DownloadManager({ downloadsPath, openPath: async (value) => { opened.push(value); return ''; } });
  const localFile = path.join(downloadsPath, 'report.pdf');
  assert.deepEqual(await manager.openSavedFile(localFile), { opened: true });
  assert.deepEqual(opened, [localFile]);
  await assert.rejects(() => manager.openSavedFile(path.join(downloadsPath, '..', 'outside.pdf')), /configured Downloads folder/);
  manager.setLibraryLinks([{ profileId: 'p', projectId: 'a', resourceId: 'r', downloadPath: path.join(downloadsPath, '..', 'outside.pdf') }]);
  await assert.rejects(() => manager.openLibraryFile({ profileId: 'p', projectId: 'a', resourceId: 'r' }), /not authorized/);
});
