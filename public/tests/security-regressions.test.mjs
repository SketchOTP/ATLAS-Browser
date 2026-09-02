import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const appSource = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
const serverSource = await fs.readFile(new URL('../../server.mjs', import.meta.url), 'utf8');

test('persistent identifiers use the browser cryptography API', () => {
  assert.match(appSource, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(appSource, /Math\.random\(/);
});

test('the local shell server does not proxy user-supplied URLs', () => {
  assert.doesNotMatch(serverSource, /embed-check/);
  assert.doesNotMatch(serverSource, /\bfetch\s*\(/);
});
