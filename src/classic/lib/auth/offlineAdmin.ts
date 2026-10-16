// Local UI authority only: server operations remain protected by Supabase RLS.
// Written only after an authenticated role lookup; never use guest profile roles.
const PREFIX = 'verified-offline-admin:v1:';
const SESSION = 'verified-offline-account:v1';
export function rememberAdminVerification(userId: string, isAdmin: boolean): void {
  try {
    if (isAdmin) localStorage.setItem(PREFIX + userId, JSON.stringify({ userId, verifiedAt: Date.now() }));
    else localStorage.removeItem(PREFIX + userId);
  } catch { /* Storage unavailable: fail closed. */ }
}
export function hasVerifiedOfflineAdmin(userId: string | null): boolean {
  if (!userId) return false;
  try {
    const value = JSON.parse(localStorage.getItem(PREFIX + userId) || 'null');
    return value?.userId === userId && typeof value.verifiedAt === 'number';
  } catch { return false; }
}
export function setVerifiedOfflineAccount(userId: string | null): void {
  try {
    if (userId) sessionStorage.setItem(SESSION, userId);
    else sessionStorage.removeItem(SESSION);
  } catch { /* fail closed */ }
}
export function getVerifiedOfflineAccount(): string | null {
  try { return sessionStorage.getItem(SESSION); } catch { return null; }
}
