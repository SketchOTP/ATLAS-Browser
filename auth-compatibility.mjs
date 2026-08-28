const microsoftLoginHosts = new Set(['login.microsoft.com', 'login.microsoftonline.com']);

export function isUnsupportedMicrosoftFidoUrl(value, platform = process.platform) {
  if (platform === 'win32') return false;
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:'
      && microsoftLoginHosts.has(url.hostname.toLowerCase())
      && (/\/bridge\/fido\/?$/i.test(url.pathname) || /\/fido\//i.test(url.pathname));
  } catch {
    return false;
  }
}
