import fs from 'node:fs';
import path from 'node:path';

const profileIdentifierPattern = /^[a-z0-9][a-z0-9_-]{0,159}$/i;

export function normalizeProfileId(value) {
  const profileId = String(value || '');
  if (!profileIdentifierPattern.test(profileId)) throw new Error('Invalid ATLAS profile identifier.');
  return profileId;
}

export function profileSessionPartition(profileId) {
  return `persist:atlas-profile-${normalizeProfileId(profileId)}`;
}

function cookieUrl(cookie) {
  const hostname = String(cookie?.domain || '').replace(/^\./, '');
  if (!hostname) throw new Error('Cookie has no valid domain.');
  const cookiePath = String(cookie?.path || '/').startsWith('/') ? String(cookie?.path || '/') : '/';
  return `${cookie?.secure ? 'https' : 'http'}://${hostname}${cookiePath}`;
}

export function portableCookie(cookie) {
  const result = {
    url: cookieUrl(cookie),
    name: String(cookie.name || ''),
    value: String(cookie.value || ''),
    path: String(cookie.path || '/'),
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly)
  };
  if (cookie.domain && !cookie.hostOnly) result.domain = cookie.domain;
  if (Number.isFinite(cookie.expirationDate)) result.expirationDate = cookie.expirationDate;
  if (cookie.sameSite && cookie.sameSite !== 'unspecified') result.sameSite = cookie.sameSite;
  if (cookie.partitionKey) result.partitionKey = cookie.partitionKey;
  return result;
}

function readMigration(markerPath) {
  try { return JSON.parse(fs.readFileSync(markerPath, 'utf8')); }
  catch { return null; }
}

export async function migrateLegacyWebsiteCookies({ sourceSession, targetSession, profileId, markerPath }) {
  const normalizedProfileId = normalizeProfileId(profileId);
  const existing = readMigration(markerPath);
  if (existing?.completed && existing.profileId) return { ...existing, skipped: true };

  const cookies = await sourceSession.cookies.get({});
  let copied = 0;
  let failed = 0;
  for (const cookie of cookies) {
    try {
      await targetSession.cookies.set(portableCookie(cookie));
      copied += 1;
    } catch {
      failed += 1;
    }
  }
  const result = {
    completed: true,
    profileId: normalizedProfileId,
    copied,
    failed,
    completedAt: new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify(result, null, 2), { mode: 0o600 });
  try { fs.chmodSync(markerPath, 0o600); } catch {}
  return result;
}

export const profileSessionInternals = { cookieUrl };
