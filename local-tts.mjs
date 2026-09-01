import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

function pythonInvocation() {
  if (process.env.ATLAS_PYTHON) return { command: process.env.ATLAS_PYTHON, args: [] };
  if (process.platform === 'win32') return { command: 'py.exe', args: ['-3.11'] };
  const projectPython = fileURLToPath(new URL('./.venv/bin/python3', import.meta.url));
  return { command: fs.existsSync(projectPython) ? projectPython : 'python3', args: [] };
}

function workerPath() {
  const packagedWorker = process.resourcesPath ? path.join(process.resourcesPath, 'voice', 'kokoro_worker.py') : '';
  return packagedWorker && fs.existsSync(packagedWorker)
    ? packagedWorker
    : fileURLToPath(new URL('./voice/kokoro_worker.py', import.meta.url));
}

export const kokoroVoices = [
  { id: 'af_heart', name: 'Heart', detail: 'American · warm and natural' },
  { id: 'af_bella', name: 'Bella', detail: 'American · clear and expressive' },
  { id: 'af_nicole', name: 'Nicole', detail: 'American · confident and polished' },
  { id: 'af_sarah', name: 'Sarah', detail: 'American · calm and conversational' },
  { id: 'af_sky', name: 'Sky', detail: 'American · bright and quick' },
  { id: 'af_kore', name: 'Kore', detail: 'American · precise and composed' },
  { id: 'af_nova', name: 'Nova', detail: 'American · modern and energetic' },
  { id: 'af_aoede', name: 'Aoede', detail: 'American · smooth and expressive' },
  { id: 'af_river', name: 'River', detail: 'American · balanced and neutral' },
  { id: 'am_michael', name: 'Michael', detail: 'American · natural male voice' },
  { id: 'am_adam', name: 'Adam', detail: 'American · deep male voice' },
  { id: 'am_echo', name: 'Echo', detail: 'American · crisp male voice' },
  { id: 'am_fenrir', name: 'Fenrir', detail: 'American · strong male voice' },
  { id: 'am_liam', name: 'Liam', detail: 'American · friendly male voice' },
  { id: 'am_onyx', name: 'Onyx', detail: 'American · low and measured' },
  { id: 'am_puck', name: 'Puck', detail: 'American · lively male voice' },
  { id: 'bf_emma', name: 'Emma', detail: 'British · refined and conversational' },
  { id: 'bf_alice', name: 'Alice', detail: 'British · clear and warm' },
  { id: 'bf_isabella', name: 'Isabella', detail: 'British · polished and expressive' },
  { id: 'bf_lily', name: 'Lily', detail: 'British · soft and natural' },
  { id: 'bm_daniel', name: 'Daniel', detail: 'British · natural male voice' },
  { id: 'bm_george', name: 'George', detail: 'British · composed male voice' },
  { id: 'bm_lewis', name: 'Lewis', detail: 'British · clear male voice' },
  { id: 'bm_fable', name: 'Fable', detail: 'British · expressive male voice' }
];

const allowedVoices = new Set(kokoroVoices.map((voice) => voice.id));

export class LocalTtsService {
  constructor() {
    this.pending = new Map();
    this.nextId = 1;
  }

  start() {
    if (this.child && !this.child.killed) return;
    const python = pythonInvocation();
    const child = spawn(python.command, [...python.args, workerPath()], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.child = child;
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error)); else pending.resolve(message.result);
    });
    child.stderr.on('data', (chunk) => console.error(`KOKORO_TTS ${chunk.toString().trim()}`));
    child.on('exit', () => {
      if (this.child !== child) return;
      for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(new Error('Local voice engine stopped')); }
      this.pending.clear();
      this.child = null;
    });
  }

  synthesize({ text, voice, speed }) {
    this.start();
    const id = this.nextId++;
    const safeVoice = allowedVoices.has(voice) ? voice : 'af_heart';
    const safeSpeed = Math.min(1.3, Math.max(0.75, Number(speed) || 1));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error('Local voice generation timed out')); }, 300000);
      this.pending.set(id, { resolve, reject, timeout });
      this.child.stdin.write(`${JSON.stringify({ id, text, voice: safeVoice, speed: safeSpeed })}\n`);
    });
  }

  stop() {
    const child = this.child;
    this.child = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Local voice generation cancelled'));
    }
    this.pending.clear();
    child?.kill();
  }
}
