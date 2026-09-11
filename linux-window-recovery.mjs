import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const helperPath = '/usr/libexec/mutter-x11-frames';
const commandOptions = { timeout: 2000, maxBuffer: 64 * 1024, windowsHide: true };
const normalizeDisplay = (value) => String(value || '').replace(/\.0$/, '');

export function supportsWindowRecovery(platform = process.platform, env = process.env) {
  return platform === 'linux' && env.XDG_SESSION_TYPE === 'x11'
    && Boolean(env.DISPLAY) && env.ATLAS_LINUX_WINDOW_RECOVERY !== '0';
}

// Fail closed when the desktop or a process cannot be inspected. Only the
// distribution's root-owned helper on the current GNOME X display is eligible.
export async function inspectWindowHelper(env = process.env) {
  const { stdout: root } = await run('xprop', ['-root', '_NET_SUPPORTING_WM_CHECK'], { ...commandOptions, env });
  const manager = root.match(/window id # (0x[0-9a-f]+)/i)?.[1];
  if (!manager) return { eligible: false };
  const { stdout: name } = await run('xprop', ['-id', manager, '_NET_WM_NAME'], { ...commandOptions, env });
  if (!name.includes('"GNOME Shell"')) return { eligible: false };
  const stat = await fs.stat(helperPath);
  if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o022)) return { eligible: false };
  await fs.access(helperPath, fs.constants.X_OK);
  let pids = [];
  try {
    const { stdout } = await run('pgrep', ['-u', String(process.getuid()), '-f', '^/usr/libexec/mutter-x11-frames([[:space:]]|$)'], commandOptions);
    pids = stdout.trim().split(/\s+/).filter((pid) => /^\d+$/.test(pid));
  } catch (error) {
    if (error.code !== 1) throw error;
  }
  for (const pid of pids) {
    try {
      const executable = await fs.readlink(`/proc/${pid}/exe`);
      if (executable !== helperPath) continue;
      const entries = (await fs.readFile(`/proc/${pid}/environ`, 'utf8')).split('\0');
      const display = entries.find((entry) => entry.startsWith('DISPLAY='))?.slice(8);
      if (!display) return { eligible: false };
      if (normalizeDisplay(display) === normalizeDisplay(env.DISPLAY)) return { eligible: true, running: true };
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error;
    }
  }
  return { eligible: true, running: false };
}

export class LinuxWindowRecovery {
  constructor({ platform = process.platform, env = process.env, inspect = () => inspectWindowHelper(env),
    spawnHelper = spawn, now = Date.now, log = () => {} } = {}) {
    Object.assign(this, { platform, env, inspect, spawnHelper, now, log });
    this.attempts = [];
    this.busy = false;
    this.stopped = true;
    this.lastNotice = '';
  }

  start() {
    if (!this.stopped || !supportsWindowRecovery(this.platform, this.env)) return;
    this.stopped = false;
    void this.check();
    this.timer = setInterval(() => void this.check(), 15_000);
    this.timer.unref();
  }

  notice(event) {
    if (this.lastNotice === event) return;
    this.lastNotice = event;
    this.log(event);
  }

  async check() {
    if (this.busy || this.stopped) return;
    this.busy = true;
    try {
      const status = await this.inspect();
      if (this.stopped || !status.eligible) return;
      if (status.running) { this.lastNotice = ''; return; }
      this.attempts = this.attempts.filter((time) => this.now() - time < 300_000);
      if (this.attempts.length >= 3) { this.notice('WINDOW_HELPER_RECOVERY_LIMIT'); return; }
      this.attempts.push(this.now());
      const child = this.spawnHelper(helperPath, [], { env: this.env, detached: true, stdio: 'ignore' });
      child.once('error', () => this.notice('WINDOW_HELPER_RECOVERY_FAILED'));
      child.once('spawn', () => this.notice('WINDOW_HELPER_RECOVERY_STARTED'));
      child.unref();
    } catch {
      this.notice('WINDOW_HELPER_CHECK_UNAVAILABLE');
    } finally {
      this.busy = false;
    }
  }

  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    // A restored helper also serves other desktop apps; never terminate it.
  }
}
