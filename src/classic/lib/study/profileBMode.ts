import { loadFeatureBlocklistProfiles, loadRoleBlocklistAssignments, type BlocklistScope } from "./featureBlocklist";

const PROFILE_B_MODE_KEY = "pashash:profile-b-mode";
const PROFILE_B_DECK_IDS_KEY = (userId: string) => `pashash:profile-b:decks:${userId}`;
const PROFILE_B_CARD_IDS_KEY = (userId: string) => `pashash:profile-b:cards:${userId}`;
export const PROFILE_B_PROFILE_NAME = "פרופיל B";

const PROFILE_B_NAME_ALIASES = new Set([
  "פרופיל b",
  "profile b",
  "profile_b",
  "profile-b",
  "mode b",
]);

const normalizeProfileName = (value: string): string => value.trim().toLowerCase();

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string" && v.length > 0));
  } catch {
    return new Set();
  }
}

function writeSet(key: string, values: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(values)));
  } catch {
    // Ignore quota/private mode failures.
  }
}

export function isProfileBMode(): boolean {
  try {
    return localStorage.getItem(PROFILE_B_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setProfileBMode(active: boolean): void {
  try {
    localStorage.setItem(PROFILE_B_MODE_KEY, active ? "1" : "0");
  } catch {
    // Ignore quota/private mode failures.
  }
}

export function canPushToCloud(): boolean {
  return !isProfileBMode();
}

export async function isRoleAssignedToProfileB(
  roleIds: string[],
  opts?: { scope?: BlocklistScope },
): Promise<boolean> {
  const uniqueRoleIds = Array.from(new Set(roleIds.filter(Boolean)));
  if (uniqueRoleIds.length === 0) return false;

  const scope = opts?.scope ?? "desktop";
  const [profiles, assignments] = await Promise.all([
    loadFeatureBlocklistProfiles({ scope }),
    loadRoleBlocklistAssignments({ scope }),
  ]);

  for (const roleId of uniqueRoleIds) {
    const assigned = assignments.find((row) => row.roleId === roleId);
    if (!assigned) continue;
    const profile = profiles.find((row) => row.id === assigned.profileId);
    if (!profile) continue;
    if (PROFILE_B_NAME_ALIASES.has(normalizeProfileName(profile.name))) return true;
  }

  return false;
}

export function markProfileBDeckCreated(userId: string, deckId: string): void {
  if (!userId || !deckId) return;
  const key = PROFILE_B_DECK_IDS_KEY(userId);
  const ids = readSet(key);
  ids.add(deckId);
  writeSet(key, ids);
}

export function markProfileBCardCreated(userId: string, cardId: string): void {
  if (!userId || !cardId) return;
  const key = PROFILE_B_CARD_IDS_KEY(userId);
  const ids = readSet(key);
  ids.add(cardId);
  writeSet(key, ids);
}

export function canProfileBDeleteDeck(userId: string, deckId: string): boolean {
  if (!userId || !deckId) return false;
  return readSet(PROFILE_B_DECK_IDS_KEY(userId)).has(deckId);
}

export function canProfileBDeleteCard(userId: string, cardId: string): boolean {
  if (!userId || !cardId) return false;
  return readSet(PROFILE_B_CARD_IDS_KEY(userId)).has(cardId);
}
