export function normalizeWebsiteMediaPermissions(value = {}) {
  return {
    microphone: value.microphone !== false,
    camera: value.camera !== false
  };
}

export function websiteMediaPermissionAllowed(value, permission, details = {}) {
  const settings = normalizeWebsiteMediaPermissions(value);
  if (permission === 'speaker-selection') return settings.microphone;
  if (permission !== 'media') return false;
  const requested = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
  if (details.mediaType === 'audio') return settings.microphone;
  if (details.mediaType === 'video') return settings.camera;
  if (!requested.length) return settings.microphone || settings.camera;
  if (requested.includes('audio') && !settings.microphone) return false;
  if (requested.includes('video') && !settings.camera) return false;
  return requested.some((type) => type === 'audio' || type === 'video');
}
