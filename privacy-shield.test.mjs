import test from 'node:test';
import assert from 'node:assert/strict';
import { PrivacyShield, privacyInternals } from './privacy-shield.mjs';

test('reduced user agent preserves the host platform family', () => {
  const linuxUserAgent = privacyInternals.genericUserAgent(
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.8123.45 Safari/537.36'
  );
  assert.match(linuxUserAgent, /\(X11; Linux x86_64\)/);
  assert.doesNotMatch(linuxUserAgent, /Windows NT/);
  assert.match(linuxUserAgent, /Chrome\/152\.0\.0\.0/);
});

test('reduced user agent removes the exact Chromium build', () => {
  const windowsUserAgent = privacyInternals.genericUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.8123.45 Safari/537.36'
  );
  assert.match(windowsUserAgent, /\(Windows NT 10.0; Win64; x64\)/);
  assert.doesNotMatch(windowsUserAgent, /8123\.45/);
  assert.match(windowsUserAgent, /Chrome\/152\.0\.0\.0/);
});

test('secure websites can write sanitized clipboard text without gaining clipboard read access', () => {
  assert.equal(privacyInternals.allowsWebsitePermission('clipboard-sanitized-write', 'https://chatgpt.com/'), true);
  assert.equal(privacyInternals.allowsWebsitePermission('clipboard-read', 'https://chatgpt.com/'), false);
  assert.equal(privacyInternals.allowsWebsitePermission('clipboard-sanitized-write', 'http://example.com/'), false);
  assert.equal(privacyInternals.allowsWebsitePermission('clipboard-sanitized-write', 'http://localhost:48173/'), true);
});
