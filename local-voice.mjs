import { spawn } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const allowedModels = new Set(['tiny.en', 'base.en', 'small.en']);

function pythonInvocation() {
  if (process.env.ATLAS_PYTHON) return { command: process.env.ATLAS_PYTHON, args: [] };
  if (process.platform === 'win32') return { command: 'py.exe', args: ['-3.11'] };
  const projectPython = fileURLToPath(new URL('./.venv/bin/python3', import.meta.url));
  return { command: fsSync.existsSync(projectPython) ? projectPython : 'python3', args: [] };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(stderr.trim().split('\n').slice(-4).join(' ') || `Whisper exited with code ${code}`)));
  });
}

export async function transcribeLocalAudio({ bytes, mimeType, model }) {
  const selectedModel = allowedModels.has(model) ? model : 'base.en';
  const extension = String(mimeType).includes('ogg') ? '.ogg' : String(mimeType).includes('wav') ? '.wav' : '.webm';
  const tempRoot = path.resolve(os.tmpdir());
  const tempDir = await fs.mkdtemp(path.join(tempRoot, 'atlas-whisper-'));
  const inputPath = path.join(tempDir, `recording${extension}`);
  try {
    await fs.writeFile(inputPath, Buffer.from(bytes));
    const python = pythonInvocation();
    await run(python.command, [...python.args, '-m', 'whisper', inputPath, '--model', selectedModel, '--output_format', 'json', '--output_dir', tempDir, '--fp16', 'False']);
    const result = JSON.parse(await fs.readFile(path.join(tempDir, 'recording.json'), 'utf8'));
    return { text: String(result.text || '').trim(), model: selectedModel };
  } finally {
    const resolved = path.resolve(tempDir);
    if (resolved.startsWith(`${tempRoot}${path.sep}`)) await fs.rm(resolved, { recursive: true, force: true });
  }
}
