import { supabase } from '@/integrations/supabase/client';
import { getActiveUsername } from '@/lib/auth/localAccount';
export const visibilityOwner = (id?: string | null) => id && id !== 'guest' ? id : `guest:${getActiveUsername() || 'anonymous'}`;
type Rule = { card_id: string; target_user_id: string | null; scope: 'personal' | 'admin' };
type Cache = { rules: Rule[]; pending: Record<string, boolean> };
const entries = new Map<string, Cache>();
const flights = new Map<string, Promise<void>>();
const fetchedAt = new Map<string, number>();
export const VISIBILITY_EVENT = 'study-content-visibility';
const key = (user: string) => `content-visibility:v1:${user}`;
function read(user: string): Cache {
  if (!entries.has(user)) {
    try { entries.set(user, JSON.parse(localStorage.getItem(key(user)) || 'null') || { rules: [], pending: {} }); }
    catch { entries.set(user, { rules: [], pending: {} }); }
  }
  return entries.get(user)!;
}
function save(user: string, value: Cache) {
  localStorage.setItem(key(user), JSON.stringify(value));
  entries.set(user, value);
  window.dispatchEvent(new Event(VISIBILITY_EVENT));
}
export function migratePersonalVisibility(username: string, userId: string) {
  const source = read(`guest:${username}`);
  if (!Object.keys(source.pending).length) return;
  const target = read(userId);
  save(userId, { rules: target.rules, pending: { ...source.pending, ...target.pending } });
}
export function hiddenCardIds(user: string, admin = false) {
  const cache = read(user);
  const result = new Set(cache.rules.filter((r) => r.scope === 'personal' ? r.target_user_id === user : !admin && (!r.target_user_id || r.target_user_id === user)).map((r) => r.card_id));
  for (const [id, hidden] of Object.entries(cache.pending)) hidden ? result.add(id) : result.delete(id);
  if (!admin) for (const rule of cache.rules) {
    if (rule.scope === 'admin' && (!rule.target_user_id || rule.target_user_id === user)) result.add(rule.card_id);
  }
  return result;
}
export function syncContentVisibility(user: string): Promise<void> {
  if (flights.has(user)) return flights.get(user)!;
  if (Date.now() - (fetchedAt.get(user) ?? 0) < 30_000 && !Object.keys(read(user).pending).length) return Promise.resolve();
  const task = (async () => {
    if (!navigator.onLine) return;
    if (!/^[a-f0-9-]{36}$/i.test(user)) {
      const { data, error } = await supabase.from('card_visibility' as never).select('card_id,target_user_id,scope').is('target_user_id', null);
      if (error) throw error;
      save(user, { rules: data as unknown as Rule[], pending: { ...read(user).pending } });
      fetchedAt.set(user, Date.now());
      return;
    }
    const { data: session } = await supabase.auth.getSession();
    if (session.session?.user.id !== user) return;
    for (const [id, hidden] of Object.entries(read(user).pending)) {
      const { error } = await supabase.rpc('set_card_visibility' as never, { p_card: id, p_hidden: hidden, p_scope: 'personal' } as never);
      if (error) throw error;
      const cache = read(user);
      // A new local choice made during the request must not be cleared.
      if (cache.pending[id] === hidden) { delete cache.pending[id]; }
    }
    const { data, error } = await supabase.from('card_visibility' as never).select('card_id,target_user_id,scope');
    if (error) throw error;
    save(user, { rules: data as unknown as Rule[], pending: { ...read(user).pending } });
    fetchedAt.set(user, Date.now());
  })().finally(() => flights.delete(user));
  flights.set(user, task);
  return task;
}
export async function setPersonalCardHidden(user: string, id: string, hidden: boolean) {
  const cache = read(user);
  save(user, { ...cache, pending: { ...cache.pending, [id]: hidden } });
  await syncContentVisibility(user);
}
export async function setAdminCardHidden(id: string, hidden: boolean, target: string | null) {
  if (!navigator.onLine) throw new Error('פעולת מנהל דורשת חיבור לענן');
  const { error } = await supabase.rpc('set_card_visibility' as never, { p_card: id, p_hidden: hidden, p_scope: 'admin', p_target: target } as never);
  if (error) throw error;
  fetchedAt.clear();
  window.dispatchEvent(new Event(VISIBILITY_EVENT));
}
