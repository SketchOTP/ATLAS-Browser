const microsoftLoginHosts = new Set(['login.microsoft.com', 'login.microsoftonline.com']);

export function microsoftFidoFallbackUrl(value, platform = process.platform) {
  if (platform === 'win32') return '';
  try {
    const bridgeUrl = new URL(String(value));
    if (bridgeUrl.protocol !== 'https:' || !microsoftLoginHosts.has(bridgeUrl.hostname.toLowerCase()) || !/\/bridge\/fido\/?$/i.test(bridgeUrl.pathname)) return '';
    const cancelValue = bridgeUrl.searchParams.get('cancelUrl');
    if (!cancelValue) return '';
    const fallbackUrl = new URL(cancelValue);
    if (fallbackUrl.protocol !== 'https:' || !microsoftLoginHosts.has(fallbackUrl.hostname.toLowerCase())) return '';
    return fallbackUrl.href;
  } catch {
    return '';
  }
}
