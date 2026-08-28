import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const indexPath = fileURLToPath(new URL('../index.html', import.meta.url));
const html = readFileSync(indexPath, 'utf8');
const policy = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] || '';

assert.match(policy, /media-src[^;]*\bblob:/, 'ATLAS must allow locally generated Blob audio for Kokoro voice playback');
console.log('voice preview CSP permits local Blob audio');
