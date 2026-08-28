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

test('network layer redirects restored Microsoft FIDO bridge tabs', async () => {
  const listeners = {};
  const browserSession = {
    webRequest: {
      onBeforeRequest: (_filter, listener) => { listeners.beforeRequest = listener; },
      onBeforeSendHeaders: () => {},
      onHeadersReceived: () => {}
    },
    setPermissionCheckHandler: () => {},
    setPermissionRequestHandler: () => {}
  };
  const webContents = {
    getUserAgent: () => 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/152.0.8123.45 Safari/537.36',
    setUserAgent: () => {}
  };
  new PrivacyShield().attach(browserSession, webContents);
  const fallback = 'https://login.microsoftonline.com/common/reprocess?ctx=signed-flow-state';
  const bridge = `https://login.microsoft.com/common/bridge/fido?cancelUrl=${encodeURIComponent(fallback)}`;
  const result = await new Promise((resolve) => listeners.beforeRequest({ resourceType: 'mainFrame', url: bridge }, resolve));
  assert.deepEqual(result, { redirectURL: fallback });
});
