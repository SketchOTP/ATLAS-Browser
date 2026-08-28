const privacyModes = new Set(['off', 'balanced', 'strict']);

const balancedTrackers = new Set([
  '2mdn.net', 'adnxs.com', 'adsrvr.org', 'amplitude.com', 'app-measurement.com',
  'bat.bing.com', 'clarity.ms', 'criteo.com', 'criteo.net', 'doubleclick.net',
  'facebook.net', 'google-analytics.com', 'googleadservices.com', 'googlesyndication.com',
  'googletagmanager.com', 'hotjar.com', 'hotjar.io', 'mixpanel.com', 'newrelic.com',
  'nr-data.net', 'scorecardresearch.com', 'segment.com', 'segment.io'
]);

const strictTrackers = new Set([
  ...balancedTrackers,
  'aria.microsoft.com', 'browser.events.data.microsoft.com', 'datadoghq.com',
  'events.data.microsoft.com', 'googleoptimize.com', 'sentry.io', 'telemetry.microsoft.com'
]);

const trackingParameters = new Set([
  'dclid', 'fbclid', 'gclid', 'gbraid', 'igshid', 'mc_cid', 'mc_eid', 'msclkid',
  'oly_anon_id', 'oly_enc_id', 'rb_clickid', 's_cid', 'vero_conv', 'vero_id', 'wbraid'
]);

const highEntropyHeaders = new Set([
  'device-memory', 'downlink', 'dpr', 'ect', 'rtt', 'save-data',
  'sec-ch-device-memory', 'sec-ch-dpr', 'sec-ch-prefers-color-scheme',
  'sec-ch-ua-arch', 'sec-ch-ua-bitness', 'sec-ch-ua-full-version',
  'sec-ch-ua-full-version-list', 'sec-ch-ua-model', 'sec-ch-ua-platform-version',
  'sec-ch-ua-wow64', 'sec-ch-viewport-width', 'viewport-width', 'width'
]);

function removeHeader(headers, name) {
  const found = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  if (found) delete headers[found];
}

function setHeader(headers, name, value) {
  removeHeader(headers, name);
  headers[name] = value;
}

function matchesHost(hostname, rules) {
  const host = String(hostname || '').toLowerCase();
  return [...rules].some((rule) => host === rule || host.endsWith(`.${rule}`));
}

function sanitizedNavigationUrl(value) {
  try {
    const url = new URL(value);
    let changed = false;
    for (const key of [...url.searchParams.keys()]) {
      if (trackingParameters.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    return changed ? url.href : '';
  } catch { return ''; }
}

function genericUserAgent(baseUserAgent) {
  return String(baseUserAgent)
    .replace(/Chrome\/(\d+)\.\S+/, 'Chrome/$1.0.0.0');
}

export class PrivacyShield {
  constructor({ onStatus = () => {} } = {}) {
    this.mode = 'balanced';
    this.blockedRequests = 0;
    this.cleanedLinks = 0;
    this.onStatus = onStatus;
    this.statusTimer = null;
  }

  attach(browserSession, webContents) {
    this.session = browserSession;
    this.webContents = webContents;
    this.baseUserAgent = String(webContents.getUserAgent()).replace(/\sElectron\/\S+/i, '').replace(/\sATLAS\/\S+/i, '');
    this.#applyUserAgent();

    const filter = { urls: ['http://*/*', 'https://*/*'] };
    browserSession.webRequest.onBeforeRequest(filter, (details, callback) => {
      if (this.mode === 'off') return callback({});
      let hostname = '';
      try { hostname = new URL(details.url).hostname; } catch {}
      const rules = this.mode === 'strict' ? strictTrackers : balancedTrackers;
      if (details.resourceType !== 'mainFrame' && matchesHost(hostname, rules)) {
        this.blockedRequests += 1;
        this.#emitStatus();
        return callback({ cancel: true });
      }
      if (details.resourceType === 'mainFrame') {
        const redirectURL = sanitizedNavigationUrl(details.url);
        if (redirectURL && redirectURL !== details.url) {
          this.cleanedLinks += 1;
          this.#emitStatus();
          return callback({ redirectURL });
        }
      }
      callback({});
    });

    browserSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
      const requestHeaders = { ...details.requestHeaders };
      if (this.mode !== 'off') {
        setHeader(requestHeaders, 'DNT', '1');
        setHeader(requestHeaders, 'Sec-GPC', '1');
        for (const header of highEntropyHeaders) removeHeader(requestHeaders, header);
        if (this.mode === 'strict') {
          setHeader(requestHeaders, 'User-Agent', genericUserAgent(this.baseUserAgent));
          setHeader(requestHeaders, 'Accept-Language', 'en-US,en;q=0.9');
          removeHeader(requestHeaders, 'Sec-CH-UA');
          removeHeader(requestHeaders, 'Sec-CH-UA-Mobile');
          removeHeader(requestHeaders, 'Sec-CH-UA-Platform');
        }
      }
      callback({ requestHeaders });
    });

    browserSession.webRequest.onHeadersReceived(filter, (details, callback) => {
      const responseHeaders = { ...(details.responseHeaders || {}) };
      if (this.mode !== 'off') {
        removeHeader(responseHeaders, 'Accept-CH');
        removeHeader(responseHeaders, 'Critical-CH');
      }
      callback({ responseHeaders });
    });

    browserSession.setPermissionCheckHandler((_contents, permission) => permission === 'fullscreen');
    browserSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'fullscreen'));
    this.#emitStatus(true);
  }

  setMode(value) {
    const previous = this.mode;
    this.mode = privacyModes.has(value) ? value : 'balanced';
    this.#applyUserAgent();
    this.#emitStatus(true);
    return { ...this.status(), changed: previous !== this.mode };
  }

  status() {
    return { mode: this.mode, blockedRequests: this.blockedRequests, cleanedLinks: this.cleanedLinks };
  }

  async clearWebsiteData() {
    if (!this.session) throw new Error('Website session is not ready.');
    await Promise.all([this.session.clearCache(), this.session.clearStorageData()]);
    this.blockedRequests = 0;
    this.cleanedLinks = 0;
    this.#emitStatus(true);
    return this.status();
  }

  #applyUserAgent() {
    if (!this.webContents || !this.baseUserAgent) return;
    this.webContents.setUserAgent(this.mode === 'strict' ? genericUserAgent(this.baseUserAgent) : this.baseUserAgent);
  }

  #emitStatus(immediate = false) {
    if (this.statusTimer) clearTimeout(this.statusTimer);
    const emit = () => { this.statusTimer = null; this.onStatus(this.status()); };
    if (immediate) emit(); else this.statusTimer = setTimeout(emit, 200);
  }
}

export const privacyInternals = { genericUserAgent, matchesHost, sanitizedNavigationUrl };
