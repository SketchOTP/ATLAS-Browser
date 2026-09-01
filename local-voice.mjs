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
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('exit', (code) => code === 0
      ? resolve({ stdout, stderr })
      : reject(new Error([stderr, stdout].join('\n').trim().split('\n').slice(-8).join(' ') || `Whisper exited with code ${code}`)));
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
    const execution = await run(python.command, [...python.args, '-m', 'whisper', inputPath, '--model', selectedModel, '--output_format', 'json', '--output_dir', tempDir, '--fp16', 'False']);
    const outputPath = path.join(tempDir, 'recording.json');
    try { await fs.access(outputPath); }
    catch {
      const diagnostic = [execution.stderr, execution.stdout].join('\n').trim().split('\n').slice(-8).join(' ');
      const missingDecoder = diagnostic.includes("No such file or directory: 'ffmpeg'");
      throw new Error(missingDecoder
        ? 'FFmpeg is required for local Whisper transcription. Install ffmpeg and restart ATLAS.'
        : `Whisper did not produce a transcript${diagnostic ? `: ${diagnostic}` : '.'}`);
    }
    const result = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    return { text: String(result.text || '').trim(), model: selectedModel };
  } finally {
    const resolved = path.resolve(tempDir);
    if (resolved.startsWith(`${tempRoot}${path.sep}`)) await fs.rm(resolved, { recursive: true, force: true });
  }
}
