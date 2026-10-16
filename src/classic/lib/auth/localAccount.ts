/**
 * localAccount — offline-first registration.
 *
 * Lets a user REGISTER while offline: the account (username, display name,
 * optional email, password verifier) is stored locally and the app enters local mode
 * immediately. When connectivity returns, `attemptDeferredRegistration()`
 * signs the account up on the server automatically (synthetic
 * `<username>@users.local` email when none was given), subject to the server's
 * confirmation policy, and migrates data only after authenticated sign-in.
 *
 * The password is held only in memory for reconnect. After restarting the app,
 * the user must enter it again; durable storage contains only a salted verifier.
 */
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { registerUsernameAccount } from './usernameRegistration';
import {
  enqueueFullSyncJob,
  loadStudyStateCache,
  saveStudyStateCache,
  clearStudyStateCache,
  flushGuestWorkspace,
} from "@/lib/study/indexedStateCache";
import type { StudyState } from "@/lib/study/types";

// Multiple local accounts can live on one machine, each with its own isolated
// offline study workspace. Only the ACTIVE account's data occupies the shared
// GUEST_ID slot (so the store's guest logic is untouched); every other
// account's data is parked in its own IndexedDB slot ("acct:<username>") and
// swapped into GUEST_ID on switch.
const ACCOUNTS_KEY = "local-accounts:v1";
const ACTIVE_KEY = "local-account-active:v1";
const OLD_SINGLE_KEY = "local-account:v1"; // pre-multi-account format (migrated)
const GUEST_STATE_LS_KEY = "guest-study-state";
// Must match store.ts — the small display-settings mirror for the guest slot.
const GUEST_SETTINGS_LS_KEY = "guest-display-settings";
const GUEST_ID = "guest";
// Must match store.ts — pre-marking skips the one-time legacy cache wipe so
// the migrated snapshot seeded below survives the first hydration.
const BROWSER_CACHE_RESET_KEY = "study-browser-reset-v3";

const dataKeyFor = (username: string) => `acct:${username}`;

export interface LocalAccount {
  username: string;
  displayName: string;
  email: string; // "" when not provided — synthetic address is used server-side
  passwordObf: string; // present only while status === "pending"
  passwordHash: string; // PBKDF2 verifier (legacy rows may still contain SHA-256)
  passwordSalt?: string;
  passwordIterations?: number;
  status: "pending" | "registered";
  createdAt: number;
  registeredAt?: number;
  userId?: string;
  recoveryHash?: string;
}

const PASSWORD_ITERATIONS = 210_000;

type ReconnectCredential = { username: string; password: string };
let reconnectCredential: ReconnectCredential | null = null;

/* ---------- storage ---------- */

function readAccounts(): LocalAccount[] {
  // One-time migration from the single-account format.
  try {
    const old = localStorage.getItem(OLD_SINGLE_KEY);
    if (old && !localStorage.getItem(ACCOUNTS_KEY)) {
      const parsed = JSON.parse(old) as LocalAccount;
      if (parsed && typeof parsed.username === "string") {
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([parsed]));
        localStorage.setItem(ACTIVE_KEY, parsed.username);
      }
      localStorage.removeItem(OLD_SINGLE_KEY);
    }
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as LocalAccount[];
    const valid = Array.isArray(list) ? list.filter((a) => a && typeof a.username === "string") : [];
    if (valid.some((a) => a.passwordObf)) {
      valid.forEach((a) => { a.passwordObf = ""; });
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(valid));
    }
    return valid;
  } catch {
    return [];
  }
}

function writeAccounts(list: LocalAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
}

export function listLocalAccounts(): LocalAccount[] {
  return readAccounts();
}

// Hide unusable legacy shortcuts, but retain their records and study data.
export function listLoginLocalAccounts(): LocalAccount[] {
  return readAccounts().filter((account) => Boolean(account.passwordHash?.trim()));
}

export function getActiveUsername(): string | null {
  const active = localStorage.getItem(ACTIVE_KEY);
  const list = readAccounts();
  if (active && list.some((a) => a.username === active)) return active;
  return list[0]?.username ?? null;
}

/** The account whose data currently occupies the shared workspace. */
export function getActiveLocalAccount(): LocalAccount | null {
  const active = getActiveUsername();
  if (!active) return null;
  return readAccounts().find((a) => a.username === active) ?? null;
}

// Backward-compatible alias used across the app for "the current local account".
export function getLocalAccount(): LocalAccount | null {
  return getActiveLocalAccount();
}

function upsertAccount(account: LocalAccount) {
  const list = readAccounts();
  const idx = list.findIndex((a) => a.username === account.username);
  if (idx >= 0) list[idx] = account;
  else list.push(account);
  writeAccounts(list);
}

/* ---------- per-account data slot swapping ---------- */

async function readGuestSlot(): Promise<StudyState | null> {
  // localStorage is written on every store notify → freshest snapshot.
  try {
    const raw = localStorage.getItem(GUEST_STATE_LS_KEY);
    if (raw) return JSON.parse(raw) as StudyState;
  } catch { /* fall through */ }
  try { return await loadStudyStateCache(GUEST_ID); } catch { return null; }
}

async function parkActiveData() {
  const active = getActiveUsername();
  if (!active) return;
  // Force the live store to persist its newest (throttled) edit first, so the
  // parked snapshot can never be a frame behind the workspace on screen.
  await flushGuestWorkspace();
  const state = await readGuestSlot();
  if (state) await saveStudyStateCache(dataKeyFor(active), state);
}

async function loadDataIntoGuestSlot(username: string) {
  const account = readAccounts().find((item) => item.username === username);
  const parked = await loadStudyStateCache(dataKeyFor(username)).catch(() => null);
  // A cloud account remembered on this device initially owns its cache under
  // the real Supabase user id. Reuse that snapshot for the first offline login
  // instead of opening an empty workspace.
  const cloudSnapshot = !parked && account?.status === "registered" && account.userId
    ? await loadStudyStateCache(account.userId).catch(() => null)
    : null;
  const localSnapshot = parked ?? cloudSnapshot;
  try { localStorage.setItem(BROWSER_CACHE_RESET_KEY, "1"); } catch { /* ignore */ }
  // Display settings are mirrored in their own record keyed to the shared guest
  // slot; drop it so the incoming account uses its OWN settings (carried inside
  // its parked state) instead of inheriting the previous account's.
  try { localStorage.removeItem(GUEST_SETTINGS_LS_KEY); } catch { /* ignore */ }
  if (localSnapshot) {
    await saveStudyStateCache(GUEST_ID, localSnapshot);
    try { localStorage.setItem(GUEST_STATE_LS_KEY, JSON.stringify(localSnapshot)); } catch { /* ignore */ }
  } else {
    // Fresh account → empty workspace (the store re-seeds the offline library).
    await clearStudyStateCache(GUEST_ID).catch(() => {});
    try { localStorage.removeItem(GUEST_STATE_LS_KEY); } catch { /* ignore */ }
  }
}

/**
 * Switches the active account: parks the current workspace, loads the target's
 * workspace into the shared slot, and marks it active. The caller should reload
 * the app afterwards so the store re-hydrates from the swapped data.
 */
export async function switchLocalAccount(username: string): Promise<boolean> {
  const list = readAccounts();
  if (!list.some((a) => a.username === username)) return false;
  const explicitlyActive = localStorage.getItem(ACTIVE_KEY);
  if (explicitlyActive === username) return true;
  // getActiveUsername() falls back to the first row for display purposes, but
  // until ACTIVE_KEY exists that account's workspace has not actually been
  // loaded. Do not mistake the fallback for a completed switch.
  if (explicitlyActive) await parkActiveData();
  await loadDataIntoGuestSlot(username);
  localStorage.setItem(ACTIVE_KEY, username);
  return true;
}

/**
 * Deletes a local account (defaults to the active one) and its parked data.
 * If the deleted account was active, switches to another account (or clears
 * the workspace when none remain).
 */
export async function deleteLocalAccount(username?: string): Promise<void> {
  const target = username ?? getActiveUsername();
  if (!target) return;
  const wasActive = getActiveUsername() === target;
  const remaining = readAccounts().filter((a) => a.username !== target);
  writeAccounts(remaining);
  await clearStudyStateCache(dataKeyFor(target)).catch(() => {});
  if (wasActive) {
    const next = remaining[0]?.username ?? null;
    if (next) {
      await loadDataIntoGuestSlot(next);
      localStorage.setItem(ACTIVE_KEY, next);
    } else {
      localStorage.removeItem(ACTIVE_KEY);
      await clearStudyStateCache(GUEST_ID).catch(() => {});
      try { localStorage.removeItem(GUEST_STATE_LS_KEY); } catch { /* ignore */ }
    }
  }
}

/* ---------- password helpers ---------- */

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function derivePasswordVerifier(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as unknown as BufferSource, iterations },
    key,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

async function createPasswordVerifier(password: string): Promise<Pick<LocalAccount, "passwordHash" | "passwordSalt" | "passwordIterations">> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    passwordHash: await derivePasswordVerifier(password, salt, PASSWORD_ITERATIONS),
    passwordSalt: bytesToBase64(salt),
    passwordIterations: PASSWORD_ITERATIONS,
  };
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

async function passwordMatches(account: LocalAccount, password: string): Promise<boolean> {
  if (account.passwordSalt && account.passwordIterations) {
    const candidate = await derivePasswordVerifier(password, base64ToBytes(account.passwordSalt), account.passwordIterations);
    return constantTimeEqual(candidate, account.passwordHash);
  }
  // Backward compatibility for accounts created before the salted verifier.
  return constantTimeEqual(await sha256(password), account.passwordHash);
}

/* ---------- public API ---------- */

// Usernames may contain any Unicode letter (Hebrew included), digits, dot and
// underscore — no spaces. Min 2 chars. The server strips non-ASCII from the
// username column, so a Hebrew username is kept locally and as display data,
// while server auth uses the ASCII synthetic email below.
export const USERNAME_RE = /^[\p{L}\p{N}_.]{2,}$/u;

/**
 * A valid ASCII email used for server auth when the user gave no email.
 * ASCII usernames keep the historical `<username>@users.local` form (so
 * previously-created accounts resolve unchanged); non-ASCII usernames (e.g.
 * Hebrew) map deterministically to an ASCII local-part derived from a stable
 * hash, because `hebrew@users.local` is not a legal email address.
 */
export function syntheticEmailForUsername(username: string): string {
  const u = username.trim().toLowerCase();
  if (/^[a-z0-9_.]{3,}$/.test(u)) return `${u}@users.local`;
  const ascii = u.replace(/[^a-z0-9_.]/g, "");
  let h = 2166136261;
  for (let i = 0; i < u.length; i++) { h ^= u.charCodeAt(i); h = Math.imul(h, 16777619); }
  const hash = (h >>> 0).toString(36);
  const base = ascii.length >= 2 ? ascii.slice(0, 20) : "user";
  return `${base}.${hash}@users.local`;
}

export interface CreateLocalAccountResult {
  ok: boolean;
  error?: string;
}

export async function createLocalAccount(input: {
  username: string;
  displayName?: string;
  email?: string;
  password: string;
  recoveryHash?: string;
}): Promise<CreateLocalAccountResult> {
  const username = input.username.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    return { ok: false, error: "שם המשתמש חייב להכיל לפחות 2 תווים (עברית/אנגלית, מספרים, נקודה או קו תחתון) וללא רווחים." };
  }
  // Offline mode: no password quality/length limits — any non-empty password.
  if (!(input.password ?? "").length) {
    return { ok: false, error: "יש להזין סיסמה." };
  }
  if (readAccounts().some((a) => a.username === username)) {
    return { ok: false, error: `כבר קיים חשבון בשם "${username}" במחשב זה. בחר שם אחר או התחבר אליו.` };
  }
  // Park the currently-active account's workspace, then give the new account a
  // fresh, isolated workspace.
  await parkActiveData();
  await loadDataIntoGuestSlot(username); // no parked data yet → clears the slot
  const verifier = await createPasswordVerifier(input.password);
  upsertAccount({
    username,
    displayName: (input.displayName ?? "").trim() || username,
    email: (input.email ?? "").trim(),
    passwordObf: "",
    recoveryHash: input.recoveryHash,
    ...verifier,
    status: "pending",
    createdAt: Date.now(),
  });
  localStorage.setItem(ACTIVE_KEY, username);
  reconnectCredential = { username, password: input.password };
  return { ok: true };
}

/**
 * Verifies credentials against ANY local account on this machine. Returns the
 * matching account (so the caller can switch to it) or null.
 */
export async function findLocalAccountByCredentials(usernameOrEmail: string, password: string): Promise<LocalAccount | null> {
  const { setVerifiedOfflineAccount } = await import('./offlineAdmin');
  setVerifiedOfflineAccount(null);
  const id = usernameOrEmail.trim().toLowerCase();
  for (const account of readAccounts()) {
    const matchesId = id === account.username
      || (!!account.email && id === account.email.toLowerCase())
      || id === syntheticEmailForUsername(account.username);
    if (matchesId && await passwordMatches(account, password)) {
      setVerifiedOfflineAccount(account.status === 'registered' ? account.userId ?? null : null);
      reconnectCredential = { username: account.username, password };
      return account;
    }
  }
  return null;
}

/**
 * Enables offline login for a cloud account only after that password has been
 * accepted by Supabase on this device. No plaintext password or cloud token is
 * persisted; the local record contains a salted PBKDF2 verifier only.
 */
export async function rememberOnlineAccountForOfflineLogin(input: {
  userId: string;
  email: string;
  username?: string;
  displayName?: string;
  password: string;
}): Promise<LocalAccount> {
  const email = input.email.trim().toLowerCase();
  const requested = (input.username ?? "").trim().toLowerCase();
  const emailBase = email.split("@")[0] || `user.${input.userId.slice(0, 8)}`;
  let username = USERNAME_RE.test(requested) ? requested : emailBase.replace(/[^a-z0-9_.]/gi, "").toLowerCase();
  if (!USERNAME_RE.test(username)) username = `user.${input.userId.slice(0, 8)}`;

  const accounts = readAccounts();
  const sameUser = accounts.find((account) => account.userId === input.userId);
  const offlineSnapshot = sameUser && localStorage.getItem(ACTIVE_KEY) === sameUser.username
    ? await readGuestState()
    : null;
  const collision = accounts.find((account) => account.username === username && account.userId !== input.userId);
  if (collision) username = `${username.slice(0, 40)}.${input.userId.slice(0, 8)}`;

  const verifier = await createPasswordVerifier(input.password);
  const account: LocalAccount = {
    ...(sameUser ?? {}),
    username: sameUser?.username ?? username,
    displayName: input.displayName?.trim() || sameUser?.displayName || requested || email,
    email,
    passwordObf: "",
    ...verifier,
    status: "registered",
    createdAt: sameUser?.createdAt ?? Date.now(),
    registeredAt: Date.now(),
    userId: input.userId,
  };
  upsertAccount(account);

  if (offlineSnapshot) {
    // Covers an app restart that happened while offline: the password is now
    // verified by the server, so attach the preserved local workspace to the
    // same user before cloud hydration starts.
    await saveStudyStateCache(input.userId, offlineSnapshot);
    await saveStudyStateCache(dataKeyFor(account.username), offlineSnapshot);
    await enqueueFullSyncJob(input.userId, "registered-account-online-login-resume");
  } else {
    // Keep the most recent cloud cache available in the account's offline slot.
    const cached = await loadStudyStateCache(input.userId).catch(() => null);
    if (cached) await saveStudyStateCache(dataKeyFor(account.username), cached).catch(() => {});
  }
  return account;
}

/** Keep the just-entered password in memory only, long enough to reconnect. */
export function prepareRegisteredAccountReconnect(account: LocalAccount, password: string): void {
  reconnectCredential = { username: account.username, password };
}

export type RegisteredReconnectResult = {
  status: "reconnected" | "no-credential" | "offline" | "failed" | "in-flight";
  message?: string;
};

let registeredReconnectInFlight = false;

/**
 * Re-authenticates a previously verified cloud account when connectivity
 * returns, migrates its offline workspace to the same cloud user id, and
 * queues a complete upload. Safe to retry on online events and timers.
 */
export async function attemptRegisteredAccountReconnect(isCurrent: () => boolean = () => true): Promise<RegisteredReconnectResult> {
  if (registeredReconnectInFlight) return { status: "in-flight" };
  const account = getActiveLocalAccount();
  const credential = reconnectCredential;
  if (!account || account.status !== "registered" || !account.userId || !credential || credential.username !== account.username) {
    return { status: "no-credential" };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) return { status: "offline" };
  const stillCurrent = () => isCurrent() && getActiveUsername() === account.username
    && getActiveLocalAccount()?.createdAt === account.createdAt
    && reconnectCredential === credential;
  const cancelled = { status: "failed" as const, message: "החשבון הפעיל השתנה. החיבור הקודם בוטל." };

  registeredReconnectInFlight = true;
  try {
    // Capture first: signing in emits an auth event immediately.
    const offlineState = await readGuestState();
    if (!stillCurrent()) return cancelled;
    const loginEmail = account.email || syntheticEmailForUsername(account.username);
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: credential.password });
    if (!stillCurrent()) return cancelled;
    if (error) return { status: "failed", message: error.message };
    const userId = data.user?.id ?? data.session?.user.id ?? null;
    if (!userId || userId !== account.userId) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      reconnectCredential = null;
      return { status: "failed", message: "זהות החשבון שחזרה מהשרת אינה תואמת לחשבון המקומי." };
    }
    if (offlineState) {
      await saveStudyStateCache(userId, offlineState, true);
      if (!stillCurrent()) return cancelled;
      await saveStudyStateCache(dataKeyFor(account.username), offlineState, true);
      if (!stillCurrent()) return cancelled;
      await enqueueFullSyncJob(userId, "registered-account-offline-reconnect");
    }
    if (!stillCurrent()) return cancelled;
    reconnectCredential = null;
    return { status: "reconnected" };
  } catch (error) {
    return { status: "failed", message: error instanceof Error ? error.message : String(error) };
  } finally {
    registeredReconnectInFlight = false;
  }
}

export async function verifyLocalCredentials(usernameOrEmail: string, password: string): Promise<boolean> {
  return (await findLocalAccountByCredentials(usernameOrEmail, password)) !== null;
}

export function getPendingRegistration(): LocalAccount | null {
  const account = getActiveLocalAccount();
  return account?.status === "pending" ? account : null;
}

function markRegistered(username: string, userId: string, email?: string) {
  const account = readAccounts().find((item) => item.username === username);
  if (!account) return;
  upsertAccount({
    ...account,
    email: email || account.email,
    passwordObf: "", // never keep the password after server registration
    status: "registered",
    registeredAt: Date.now(),
    userId,
  });
}

/* ---------- deferred server registration ---------- */

async function readGuestState(): Promise<StudyState | null> {
  // The store mirrors every edit to localStorage before its debounced IDB
  // write, so this is the freshest source during a reconnect.
  try {
    const raw = localStorage.getItem(GUEST_STATE_LS_KEY);
    if (raw) return JSON.parse(raw) as StudyState;
  } catch { /* ignore */ }
  try {
    const idb = await loadStudyStateCache(GUEST_ID);
    if (idb) return idb;
  } catch { /* ignore */ }
  return null;
}

async function migrateGuestDataToUser(userId: string) {
  const guestState = await readGuestState();
  if (!guestState) return;
  // Skip the store's one-time legacy cache wipe so this snapshot survives.
  try { localStorage.setItem(BROWSER_CACHE_RESET_KEY, "1"); } catch { /* ignore */ }
  await saveStudyStateCache(userId, guestState);
  await enqueueFullSyncJob(userId, "offline-registration-migration");
}

let attemptInFlight = false;

export interface DeferredRegistrationResult {
  status: "registered" | "no-pending" | "offline" | "failed" | "in-flight";
  message?: string;
}

/**
 * Registers the pending local account on the server, migrates the offline
 * data into it, and signs the main client in. Safe to call repeatedly (boot,
 * `online` events) — it no-ops unless there is pending work.
 */
const DBG = "[offline-reg]";

export async function attemptDeferredRegistration(isCurrent: () => boolean = () => true): Promise<DeferredRegistrationResult> {
  if (attemptInFlight) { console.log(DBG, "skip: already in-flight"); return { status: "in-flight" }; }
  const pending = getPendingRegistration();
  if (!pending) { console.log(DBG, "skip: no pending account"); return { status: "no-pending" }; }
  if (typeof navigator !== "undefined" && !navigator.onLine) { console.log(DBG, "skip: navigator offline"); return { status: "offline" }; }
  const credential = reconnectCredential;
  if (!credential || credential.username !== pending.username) return { status: "failed", message: "להשלמת ההרשמה בענן יש להתחבר שוב עם הסיסמה. הנתונים המקומיים נשמרו." };
  const stillCurrent = () => isCurrent() && getActiveUsername() === pending.username
    && getActiveLocalAccount()?.createdAt === pending.createdAt;

  attemptInFlight = true;
  try {
    let email = pending.email || syntheticEmailForUsername(pending.username);
    const password = credential.password;
    const offlineSnapshot = await readGuestState();
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    console.log(DBG, "start", {
      username: pending.username,
      email,
      hasUrl: !!url,
      urlHost: (() => { try { return new URL(url).host; } catch { return "INVALID:" + String(url); } })(),
      hasKey: !!key,
      keyLen: key ? String(key).length : 0,
      onLine: navigator.onLine,
    });

    // Isolated client: registering must not clobber the main client's session
    // state until data migration is staged.
    const isolated = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

    let userId: string | null = null;
    console.log(DBG, "calling isolated.auth.signUp …");
    const { data, error } = !pending.email && pending.recoveryHash
      ? await registerUsernameAccount(isolated, pending.username, password, pending.displayName, pending.recoveryHash)
      : await isolated.auth.signUp({
      email,
      password,
      options: { data: { display_name: pending.displayName, username: pending.username } },
    });
    console.log(DBG, "signUp returned", { hasSession: !!data?.session, userId: data?.user?.id ?? null, error: error ? { name: error.name, status: (error as { status?: number }).status, message: error.message } : null });
    if (error) {
      // A previous attempt may have succeeded without being recorded locally.
      if (/already registered|already exists/i.test(error.message)) {
        if (!pending.email && pending.recoveryHash) {
          const resolved = await isolated.rpc('email_for_username', { p_username: pending.username });
          if (resolved.error || !resolved.data) return { status: 'failed', message: 'לא ניתן לאתר את החשבון.' };
          email = resolved.data;
        }
        console.log(DBG, "already registered → trying sign-in");
        const { data: signInData, error: signInError } =
          await isolated.auth.signInWithPassword({ email, password });
        if (signInError) { console.error(DBG, "sign-in after already-registered failed", signInError); return { status: "failed", message: error.message }; }
        userId = signInData.user?.id ?? null;
        await isolated.auth.signOut();
      } else {
        console.error(DBG, "signUp failed", error);
        return { status: "failed", message: error.message };
      }
    } else {
      userId = data.user?.id ?? null;
      email = data.user?.email || email;
    }

    if (!stillCurrent()) return { status: "failed", message: "החשבון הפעיל השתנה. ההרשמה המקומית נשמרה לניסיון הבא." };
    // A signUp response may contain an unconfirmed or masked identity. Verify
    // credentials on the isolated client before writing any user-owned data.
    const verified = await isolated.auth.signInWithPassword({ email, password });
    if (verified.error || !verified.data?.user?.id) return { status: "failed", message: verified.error?.message ?? "יש לאמת את החשבון לפני הסנכרון." };
    userId = verified.data.user.id;
    if (!stillCurrent()) return { status: "failed", message: "החשבון הפעיל השתנה." };
    if (offlineSnapshot) {
      // The normal first-login cache reset must not erase this migrated snapshot.
      try { localStorage.setItem(BROWSER_CACHE_RESET_KEY, "1"); } catch { /* storage unavailable */ }
      await saveStudyStateCache(userId, offlineSnapshot, true);
      await enqueueFullSyncJob(userId, "offline-registration-migration");
    }
    if (!stillCurrent()) return { status: "failed", message: "החשבון הפעיל השתנה." };

    // Hand the session to the main client — hydration will pick up the seeded
    // snapshot and the queued full-sync job pushes it to the cloud.
    console.log(DBG, "signing main client in …");
    const { data: mainSignInData, error: mainSignInError } = await supabase.auth.signInWithPassword({ email, password });
    if (mainSignInError) {
      console.error(DBG, "main client sign-in failed", mainSignInError);
      // Keep the retry secret and pending state. Previously this path was
      // incorrectly marked registered and the queued data became stranded.
      return { status: "failed", message: mainSignInError.message };
    }
    if (!stillCurrent()) return { status: "failed", message: "החשבון הפעיל השתנה." };
    const finalUserId = mainSignInData?.user?.id ?? mainSignInData?.session?.user?.id;
    if (finalUserId !== userId) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      return { status: "failed", message: "זהות ההתחברות אינה תואמת לחשבון שאומת. הנתונים המקומיים נשמרו." };
    }
    markRegistered(pending.username, userId, email);
    const { migratePersonalVisibility } = await import('../study/contentVisibility');
    migratePersonalVisibility(pending.username, userId);
    reconnectCredential = null;
    console.log(DBG, "registered ✓");
    return { status: "registered" };
  } catch (err) {
    console.error(DBG, "threw", err);
    return { status: "failed", message: err instanceof Error ? err.message : String(err) };
  } finally {
    attemptInFlight = false;
  }
}
