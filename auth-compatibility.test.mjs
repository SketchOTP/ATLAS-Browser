import test from 'node:test';
import assert from 'node:assert/strict';
import { isUnsupportedMicrosoftFidoUrl } from './auth-compatibility.mjs';

const bridge = 'https://login.microsoft.com/common/bridge/fido?cancelUrl=https%3A%2F%2Flogin.microsoftonline.com%2Fcommon%2Freprocess';
const fidoPostTarget = 'https://login.microsoft.com/common/fido/get?uiflavor=Web';

test('detects Microsoft FIDO pages that cannot open platform UI on Linux', () => {
  assert.equal(isUnsupportedMicrosoftFidoUrl(bridge, 'linux'), true);
  assert.equal(isUnsupportedMicrosoftFidoUrl(fidoPostTarget, 'linux'), true);
});

test('leaves the native Windows FIDO bridge available on Windows', () => {
  assert.equal(isUnsupportedMicrosoftFidoUrl(bridge, 'win32'), false);
});

test('does not classify lookalike hosts as Microsoft authentication', () => {
  assert.equal(isUnsupportedMicrosoftFidoUrl('https://example.com/common/bridge/fido', 'linux'), false);
});
