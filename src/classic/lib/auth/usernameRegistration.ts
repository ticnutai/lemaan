import type { SupabaseClient } from '@supabase/supabase-js';

// The cloud auth server enforces a hard minimum of 6 characters; keeping the
// client rule identical avoids a rejected signup after a passing local check.
export const validAccountPassword = (value: string) => value.length >= 6 && new TextEncoder().encode(value).length <= 72;
export function createRecoveryCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) => n.toString(16).padStart(2, '0')).join('').match(/.{1,8}/g)!.join('-');
}
export async function recoveryHash(code: string) {
  const normalized = code.toLowerCase().replace(/[^a-f0-9]/g, '');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
}
export async function registerUsernameAccount(client: SupabaseClient, username: string, password: string, displayName: string, hash: string) {
  const { data: email, error } = await client.rpc('register_username_account', {
    p_username: username, p_password: password, p_display_name: displayName, p_recovery_hash: hash,
  });
  if (error) return { data: { user: null, session: null }, error };
  return client.auth.signInWithPassword({ email, password });
}
