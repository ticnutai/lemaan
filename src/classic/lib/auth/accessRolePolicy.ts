import { supabase } from '@/integrations/supabase/client';
import bundled from './bundledAccessDefaults.json';

export const ACCESS_KINDS = ['registered', 'anonymous_online', 'registered_offline', 'anonymous_offline'] as const;
export type AccessKind = typeof ACCESS_KINDS[number];
export const ACCESS_LABELS: Record<AccessKind | 'admin', string> = {
  admin: 'מנהל', registered: 'משתמש רשום', anonymous_online: 'משתמש אנונימי אונליין',
  registered_offline: 'משתמש רשום אופליין', anonymous_offline: 'משתמש אנונימי אופליין',
};
export type AccessRole = { id: string; name: string; matrix: Record<string, boolean> };
export type AccessRolePolicy = Partial<Record<AccessKind, AccessRole>>;
export const ACCESS_POLICY_EVENT = 'access-role-policy-changed';
const CACHE_KEY = 'access-role-policy:v1';

export function normalizeAccessPolicy(raw: unknown): AccessRolePolicy {
  const policy: AccessRolePolicy = {};
  if (!raw || typeof raw !== 'object') return policy;
  for (const kind of ACCESS_KINDS) {
    const role = (raw as AccessRolePolicy)[kind];
    if (!role || typeof role.id !== 'string' || typeof role.name !== 'string' || role.name === 'admin') continue;
    const matrix = Object.fromEntries(Object.entries(role.matrix ?? {}).filter(([key, value]) =>
      /^(cards|decks|goals|shas|analytics|settings):(view|create|edit|delete|manage)$/.test(key) && typeof value === 'boolean'));
    policy[kind] = { id: role.id, name: role.name, matrix };
  }
  return policy;
}

export function cachedAccessPolicy(): AccessRolePolicy {
  const defaults = normalizeAccessPolicy(Object.fromEntries(Object.entries(bundled.roles)
    .map(([kind, role]) => [kind, { ...role, matrix: bundled.matrix }])));
  try { return { ...defaults, ...normalizeAccessPolicy(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')) }; }
  catch { return defaults; }
}

export async function loadAccessPolicy(signal?: AbortSignal): Promise<AccessRolePolicy> {
  const query = supabase.rpc('get_access_role_policy');
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (signal?.aborted) throw signal.reason ?? new DOMException('Request aborted', 'AbortError');
  if (error) throw error;
  const policy = normalizeAccessPolicy(data);
  if (ACCESS_KINDS.some((kind) => !policy[kind])) throw new Error('Access role setup is incomplete');
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(policy)); } catch { /* cache may be unavailable */ }
  return policy;
}

export function accessKindForIdentity(authenticated: boolean, localAccount: boolean, online: boolean): AccessKind {
  if (authenticated) return online ? 'registered' : 'registered_offline';
  // A local username is not proof of cloud authentication, even when the network returns.
  if (localAccount) return 'registered_offline';
  return online ? 'anonymous_online' : 'anonymous_offline';
}
