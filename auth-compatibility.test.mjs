import test from 'node:test';
import assert from 'node:assert/strict';
import { microsoftFidoFallbackUrl } from './auth-compatibility.mjs';

const fallback = 'https://login.microsoftonline.com/common/reprocess?ctx=signed-flow-state';
const bridge = `https://login.microsoft.com/common/bridge/fido?cancelUrl=${encodeURIComponent(fallback)}`;

test('uses Microsoft fallback for the unsupported FIDO bridge on Linux', () => {
  assert.equal(microsoftFidoFallbackUrl(bridge, 'linux'), fallback);
});

test('leaves the native Windows FIDO bridge available on Windows', () => {
  assert.equal(microsoftFidoFallbackUrl(bridge, 'win32'), '');
});

test('rejects fallback URLs outside Microsoft login hosts', () => {
  const untrusted = `https://login.microsoft.com/common/bridge/fido?cancelUrl=${encodeURIComponent('https://example.com/steal')}`;
  assert.equal(microsoftFidoFallbackUrl(untrusted, 'linux'), '');
});
