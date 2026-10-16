const CLOUD_UNAVAILABLE_UNTIL_KEY = 'lemaan:cloud-unavailable-until';
const DEFAULT_COOLDOWN_MS = 30_000;

export function markCloudTemporarilyUnavailable(cooldownMs = DEFAULT_COOLDOWN_MS): void {
  try {
    sessionStorage.setItem(CLOUD_UNAVAILABLE_UNTIL_KEY, String(Date.now() + cooldownMs));
  } catch { /* Storage is optional; request deadlines remain the fallback. */ }
}

export function markCloudAvailable(): void {
  try { sessionStorage.removeItem(CLOUD_UNAVAILABLE_UNTIL_KEY); } catch { /* ignore */ }
}

export function isCloudTemporarilyUnavailable(now = Date.now()): boolean {
  try {
    const until = Number(sessionStorage.getItem(CLOUD_UNAVAILABLE_UNTIL_KEY) ?? '0');
    if (!Number.isFinite(until) || until <= now) {
      sessionStorage.removeItem(CLOUD_UNAVAILABLE_UNTIL_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
