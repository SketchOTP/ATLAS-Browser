const allowedProtocols = new Set(['http:', 'https:', 'about:']);
const authenticationHosts = new Set([
  'accounts.google.com',
  'account.live.com',
  'login.live.com',
  'login.microsoftonline.com',
  'appleid.apple.com',
  'auth.openai.com',
  'login.openai.com'
]);

export function isAllowedWebsiteUrl(value) {
  try { return allowedProtocols.has(new URL(String(value)).protocol); }
  catch { return false; }
}

export function isAuthenticationWindowUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol === 'about:') return true;
    const host = url.hostname.toLowerCase();
    if (authenticationHosts.has(host) || host.endsWith('.okta.com') || host.endsWith('.auth0.com') || host.endsWith('.auth0app.com')) return true;
    if (host === 'github.com' && url.pathname.startsWith('/login/oauth/')) return true;
    const authPath = /\/(?:oauth|authorize|authorization|saml|signin|sign-in|login)(?:\/|$)/i.test(url.pathname);
    const authParameters = ['client_id', 'redirect_uri', 'response_type', 'code_challenge', 'SAMLRequest'].some((name) => url.searchParams.has(name));
    return authPath && authParameters;
  } catch {
    return false;
  }
}

export function websiteWindowRoute(value) {
  if (!isAllowedWebsiteUrl(value)) return 'deny';
  return isAuthenticationWindowUrl(value) ? 'popup' : 'tab';
}
