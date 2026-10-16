import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ACCESS_POLICY_EVENT, cachedAccessPolicy } from "@/lib/auth/accessRolePolicy";
import bundledAccess from "@/lib/auth/bundledAccessDefaults.json";
import { getSiteSettingValue, updateSiteSettingCache } from "@/lib/siteSettingsCache";
import { ALL_SIDEBAR_ITEMS, normalizeSplitWorkspaceSections } from "@/lib/study/sidebarItems";

export type BlocklistScope = "desktop" | "mobile";

export interface FeatureBlocklist {
  sections: string[]; // sidebar section ids globally blocked
  widgets: Record<string, string[]>; // tabId -> blocked widget ids
}

export interface FeatureBlocklistProfile {
  id: string;
  name: string;
  blocklist: FeatureBlocklist;
  updatedAt: number;
}

export interface RoleBlocklistAssignment {
  id: string;
  roleId: string;
  profileId: string;
}

const EMPTY: FeatureBlocklist = { sections: [], widgets: {} };

/**
 * Safe bundled view for a brand-new local/offline installation that has never
 * connected to the server. Once internet is available, the administrator's
 * assigned profile replaces this fallback and remains cached for later offline
 * use. This prevents a first offline launch from exposing every navigation
 * entry merely because the cloud profile has not been downloaded yet.
 */
export const LOCAL_OFFLINE_DEFAULT_BLOCKLIST: FeatureBlocklist = {
  sections: [
    "morning",
    "today",
    "tasks",
    "system-rubric",
    "habits",
    "journal",
    "timer",
    "goals",
    "studio",
    "ai",
    "ai-generator",
    "question-lab",
    "archive",
    "backup",
    "backup-restore",
    "db-inspector",
    "perf",
    "admin",
    "settings",
  ],
  widgets: {},
};

/** Legacy identifier accepted only while reading old cached layouts. Not an access role. */
export const LOCAL_OFFLINE_ROLE_ID = "local-offline";
export const LOCAL_OFFLINE_BLOCKLIST_PROFILE_ID = "blocklist-local-offline";
const KEY: Record<BlocklistScope, string> = {
  desktop: "feature_blocklist",
  mobile: "feature_blocklist_mobile_v1",
};
const PROFILES_KEY: Record<BlocklistScope, string> = {
  desktop: "feature_blocklist_profiles_v1",
  mobile: "feature_blocklist_profiles_mobile_v1",
};
const ROLE_ASSIGNMENTS_KEY: Record<BlocklistScope, string> = {
  desktop: "feature_blocklist_role_assignments_v1",
  mobile: "feature_blocklist_role_assignments_mobile_v1",
};
const CACHE_KEY: Record<BlocklistScope, string> = {
  desktop: "cache:feature-blocklist",
  mobile: "cache:feature-blocklist:mobile",
};
const REFRESH_TTL_MS = 2 * 60 * 1000;

const cachedByScope = new Map<BlocklistScope, FeatureBlocklist>();
const loadedAtByScope = new Map<BlocklistScope, number>();
const inFlightByScope = new Map<BlocklistScope, Promise<FeatureBlocklist>>();
const profilesCache = new Map<BlocklistScope, FeatureBlocklistProfile[]>();
const roleAssignmentsCache = new Map<BlocklistScope, RoleBlocklistAssignment[]>();
const listenersByScope = new Map<BlocklistScope, Set<(b: FeatureBlocklist) => void>>();

function runWhenBrowserIdle(fn: () => void, timeout = 1500): void {
  const ric = (window as typeof window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
  }).requestIdleCallback;
  if (typeof ric === "function") {
    ric(() => fn(), { timeout });
    return;
  }
  window.setTimeout(fn, 0);
}

function listenersForScope(scope: BlocklistScope): Set<(b: FeatureBlocklist) => void> {
  const existing = listenersByScope.get(scope);
  if (existing) return existing;
  const created = new Set<(b: FeatureBlocklist) => void>();
  listenersByScope.set(scope, created);
  return created;
}

function isFreshCache(scope: BlocklistScope): boolean {
  const cached = cachedByScope.get(scope);
  const loadedAt = loadedAtByScope.get(scope) ?? 0;
  return !!cached && Date.now() - loadedAt < REFRESH_TTL_MS;
}

function emit(scope: BlocklistScope, b: FeatureBlocklist) {
  const normalized = normalizeBlocklist(b);
  cachedByScope.set(scope, normalized);
  loadedAtByScope.set(scope, Date.now());
  try { localStorage.setItem(CACHE_KEY[scope], JSON.stringify(normalized)); } catch { /* ignore */ }
  listenersForScope(scope).forEach((fn) => fn(normalized));
}

export async function loadFeatureBlocklist(opts?: { force?: boolean; scope?: BlocklistScope }): Promise<FeatureBlocklist> {
  const force = !!opts?.force;
  const scope = opts?.scope ?? "desktop";
  if (!force && isFreshCache(scope)) return cachedByScope.get(scope) as FeatureBlocklist;
  const inFlight = inFlightByScope.get(scope);
  if (inFlight) return inFlight;

  const nextFlight = (async () => {
    const value = await getSiteSettingValue(KEY[scope], { force });
    const v = (value ?? EMPTY) as Partial<FeatureBlocklist>;
    const norm: FeatureBlocklist = {
      sections: normalizeSplitWorkspaceSections(Array.isArray(v.sections) ? v.sections : []),
      widgets: (v.widgets && typeof v.widgets === "object" && !Array.isArray(v.widgets)) ? v.widgets as Record<string, string[]> : {},
    };
    updateSiteSettingCache(KEY[scope], norm);
    emit(scope, norm);
    return norm;
  })().finally(() => {
    inFlightByScope.delete(scope);
  });
  inFlightByScope.set(scope, nextFlight);

  return nextFlight;
}

export async function saveFeatureBlocklist(value: FeatureBlocklist, opts?: { scope?: BlocklistScope }): Promise<void> {
  const scope = opts?.scope ?? "desktop";
  const normalized = normalizeBlocklist(value);
  const { error } = await supabase.from("site_settings").upsert(
    [{ key: KEY[scope], value: normalized as unknown as import("@/integrations/supabase/types").Json }],
    { onConflict: "key" },
  );
  if (error) throw error;
  updateSiteSettingCache(KEY[scope], normalized);
  emit(scope, normalized);
}

const normalizeBlocklist = (value: unknown): FeatureBlocklist => {
  const v = (value ?? EMPTY) as Partial<FeatureBlocklist>;
  return {
    sections: normalizeSplitWorkspaceSections(Array.isArray(v.sections) ? v.sections : []),
    widgets: (v.widgets && typeof v.widgets === "object" && !Array.isArray(v.widgets)) ? v.widgets as Record<string, string[]> : {},
  };
};

const normalizeProfiles = (value: unknown): FeatureBlocklistProfile[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const raw = item as Partial<FeatureBlocklistProfile> & { blocklist?: unknown };
      return {
        id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
        name: typeof raw.name === "string" ? raw.name : "ללא שם",
        blocklist: normalizeBlocklist(raw.blocklist),
        updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
      };
    });
};

const normalizeRoleAssignments = (value: unknown): RoleBlocklistAssignment[] => {
  if (!Array.isArray(value)) return [];
  const rows = value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const raw = item as Partial<RoleBlocklistAssignment>;
      return {
        id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
        roleId: typeof raw.roleId === "string" ? raw.roleId : "",
        profileId: typeof raw.profileId === "string" ? raw.profileId : "",
      };
    })
    .filter((row) => row.roleId && row.profileId);

  // A role may hold at most ONE assignment. Duplicates accumulated in stored
  // data (the same role→profile pair written twice), and since resolution picks
  // the first match, the extras were invisible clutter that made the admin list
  // confusing. Keep the last write for each role — that is the newest intent.
  const byRole = new Map<string, RoleBlocklistAssignment>();
  for (const row of rows) byRole.set(row.roleId, row);
  return Array.from(byRole.values());
};

export async function loadFeatureBlocklistProfiles(opts?: { force?: boolean; scope?: BlocklistScope }): Promise<FeatureBlocklistProfile[]> {
  const force = !!opts?.force;
  const scope = opts?.scope ?? "desktop";
  if (!force && profilesCache.has(scope)) return profilesCache.get(scope) ?? [];
  const value = await getSiteSettingValue(PROFILES_KEY[scope], { force });
  const rows = normalizeProfiles(value);
  profilesCache.set(scope, rows);
  updateSiteSettingCache(PROFILES_KEY[scope], rows);
  return rows;
}


export async function loadRoleBlocklistAssignments(opts?: { force?: boolean; scope?: BlocklistScope }): Promise<RoleBlocklistAssignment[]> {
  const force = !!opts?.force;
  const scope = opts?.scope ?? "desktop";
  if (!force && roleAssignmentsCache.has(scope)) return roleAssignmentsCache.get(scope) ?? [];
  const value = await getSiteSettingValue(ROLE_ASSIGNMENTS_KEY[scope], { force });
  const rows = normalizeRoleAssignments(value);
  roleAssignmentsCache.set(scope, rows);
  updateSiteSettingCache(ROLE_ASSIGNMENTS_KEY[scope], rows);
  return rows;
}


// mergeBlocklists intentionally removed: role-assigned profiles fully
// override the global blocklist (see resolveRoleFeatureBlocklist).




export async function resolveRoleFeatureBlocklist(roleIds: string[], opts?: { force?: boolean; scope?: BlocklistScope }): Promise<FeatureBlocklist> {
  const scope = opts?.scope ?? "desktop";
  const uniqueRoleIds = Array.from(new Set(roleIds.filter(Boolean)));
  const [globalBlocklist, profiles, assignments] = await Promise.all([
    loadFeatureBlocklist({ force: opts?.force, scope }),
    loadFeatureBlocklistProfiles({ force: opts?.force, scope }),
    loadRoleBlocklistAssignments({ force: opts?.force, scope }),
  ]);

  if (uniqueRoleIds.length === 0) return globalBlocklist;

  const assignment = uniqueRoleIds
    .map((roleId) => assignments.find((row) => row.roleId === roleId))
    .find((row): row is RoleBlocklistAssignment => !!row);
  if (!assignment) {
    const systemIds = Object.values(cachedAccessPolicy()).map((role) => role.id);
    if (uniqueRoleIds.some((id) => systemIds.includes(id))) return normalizeBlocklist(bundledAccess.blocklists[scope]);
    // A fresh offline machine cannot download its assigned profile yet. Keep
    // the bundled restricted view until the administrator's profile is cached.
    if (uniqueRoleIds.includes(LOCAL_OFFLINE_ROLE_ID)) return LOCAL_OFFLINE_DEFAULT_BLOCKLIST;
    return globalBlocklist;
  }

  const profile = profiles.find((row) => row.id === assignment.profileId) ?? null;
  // When a role has an assigned blocklist profile, that profile fully defines
  // what's blocked for the role — do NOT union with the global blocklist,
  // otherwise a broad global blocklist (e.g. all overview widgets) would
  // override the per-role profile and make tabs appear empty.
  if (profile) return profile.blocklist;
  // A stale/missing cached profile must also fail closed for local accounts.
  if (uniqueRoleIds.includes(LOCAL_OFFLINE_ROLE_ID)) return LOCAL_OFFLINE_DEFAULT_BLOCKLIST;
  return globalBlocklist;
}

export function useFeatureBlocklist(opts?: { scope?: BlocklistScope }): FeatureBlocklist {
  const scope = opts?.scope ?? "desktop";
  const [b, setB] = useState<FeatureBlocklist>(() => {
    const cached = cachedByScope.get(scope);
    if (cached) return cached;
    try {
      const raw = localStorage.getItem(CACHE_KEY[scope]);
      if (raw) {
        const parsed = normalizeBlocklist(JSON.parse(raw));
        cachedByScope.set(scope, parsed);
        loadedAtByScope.set(scope, Date.now());
        return parsed;
      }
    } catch { /* ignore */ }
    return EMPTY;
  });

  useEffect(() => {
    listenersForScope(scope).add(setB);
    // refresh from server in background (deduped + stale-while-revalidate)
    runWhenBrowserIdle(() => {
      loadFeatureBlocklist({ scope }).catch(() => { /* ignore */ });
    });
    return () => { listenersForScope(scope).delete(setB); };
  }, [scope]);

  return b;
}

export function useResolvedFeatureBlocklist(roleIds: string[], opts?: { scope?: BlocklistScope }): FeatureBlocklist & { loading: boolean } {
  // Visibility is a role policy, not a viewport preference. Keep the desktop
  // policy canonical on every device; mobile layout sizes remain independent.
  const scope: BlocklistScope = "desktop";
  const identity = JSON.stringify(Array.from(new Set(roleIds.filter(Boolean))).sort());
  const pending: FeatureBlocklist = { sections: ALL_SIDEBAR_ITEMS.map(item => item.id), widgets: {} };
  const [resolved, setResolved] = useState<{ identity: string; value: FeatureBlocklist } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let revision = 0;
    const refresh = () => { const currentRevision = ++revision; void resolveRoleFeatureBlocklist(roleIds, { scope, force: navigator.onLine }).then((next) => {
      if (!cancelled && currentRevision === revision) setResolved({ identity, value: next });
    }).catch(() => {
      // Never reveal everything on a failed fetch. Keep the last policy for
      // this identity, or the closed initial state if none has been resolved.
      // A failure is settled, not an endless loading state.
      if (!cancelled && currentRevision === revision) setResolved(previous => previous?.identity === identity ? previous : { identity, value: pending });
    }); };
    refresh();
    window.addEventListener(ACCESS_POLICY_EVENT, refresh);
    window.addEventListener('online', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(ACCESS_POLICY_EVENT, refresh);
      window.removeEventListener('online', refresh);
    };
  }, [scope, identity]);

  return resolved?.identity === identity ? { ...resolved.value, loading: false } : { ...pending, loading: true };
}
