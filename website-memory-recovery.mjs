export const ACTIVE_WEBSITE_PRIVATE_MEMORY_LIMIT_BYTES = 768 * 1024 * 1024;
export const ACTIVE_WEBSITE_RECOVERY_COOLDOWN_MS = 5 * 60 * 1000;

export function shouldRecoverActiveWebsite({ record, activeKey, privateBytes, previousRecoveryAt, now = Date.now() } = {}) {
  if (!record || record.key !== activeKey) return false;
  if (!Number.isFinite(privateBytes) || privateBytes <= ACTIVE_WEBSITE_PRIVATE_MEMORY_LIMIT_BYTES) return false;
  return !Number.isFinite(previousRecoveryAt) || now - previousRecoveryAt >= ACTIVE_WEBSITE_RECOVERY_COOLDOWN_MS;
}
