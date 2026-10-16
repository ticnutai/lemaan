import type { StudyState, UiPrefs, WidgetLayout } from "./types";
import { timeOp } from "@/lib/debug/perf";

type StudyStateCacheRecord = {
  userId: string;
  savedAt: number;
  state: StudyState;
};

export type SyncJob = {
  id: string;
  userId: string;
  kind: "full-sync";
  createdAt: number;
  attempts: number;
  lastError?: string;
};

/**
 * A pending delete to be soft-deleted in the cloud (UPDATE deleted_at = now()).
 * Survives reloads and offline windows so the deletion eventually propagates,
 * even if the original delete request failed (offline, 5xx, etc.).
 */
export type PendingDelete = {
  id: string;            // queue row id
  userId: string;
  table: "categories" | "decks" | "cards";
  rowId: string;         // the row being deleted
  deletedAt: number;     // when the user pressed delete (epoch ms)
  attempts: number;
  lastError?: string;
};

export type DeleteAuditStatus = "queued" | "success" | "failed" | "noop";

export type DeleteAuditEvent = {
  id: string;
  userId: string;
  table: PendingDelete["table"];
  rowId: string | null;
  status: DeleteAuditStatus;
  message?: string;
  at: number;
  deviceId?: string;
};

export type CloudToIdbDeleteAuditEvent = {
  id: string;
  userId: string;
  table: string;
  rowId: string;
  at: number;
  deviceId?: string;
};

export type IndexedMonitorSnapshot = {
  userId: string;
  cacheSavedAt: number | null;
  counts: {
    decks: number;
    cards: number;
    categories: number;
    goals: number;
    dayNotes: number;
    cardDecks: number;
    shasReviews: number;
    learningSessions: number;
  };
  syncJobsCount: number;
  pendingDeletesCount: number;
  deleteAuditCounts: {
    queued: number;
    success: number;
    failed: number;
    noop: number;
  };
  latestDeleteAuditAt: number | null;
  latestCloudToIdbDeleteAt: number | null;
};

const DB_NAME = "pashash-study-state-v1";
const STORE_NAME = "states";
const SYNC_JOBS_STORE = "sync_jobs";
const PENDING_DELETES_STORE = "pending_deletes";
const DELETE_AUDIT_STORE = "delete_audit";
const CLOUD_TO_IDB_DELETE_AUDIT_STORE = "cloud_to_idb_delete_audit";
const WIDGET_LAYOUT_STORE = "widget_layout_cache";
const UI_PREFS_STORE = "ui_prefs_cache";
const DB_VERSION = 7;

type WidgetLayoutCacheRecord = {
  userId: string;
  layout: WidgetLayout;
  updatedAt: number;
};

let openDbInFlight: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (openDbInFlight) return openDbInFlight;

  openDbInFlight = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    let settled = false;
    const timer = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("indexedDB.open timeout"));
    }, 2000);

    const finishSuccess = (db: IDBDatabase) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      resolve(db);
    };

    const finishError = (error: unknown) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error ?? "indexedDB.open failed")));
    };

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "userId" });
      }
      if (!db.objectStoreNames.contains(SYNC_JOBS_STORE)) {
        db.createObjectStore(SYNC_JOBS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PENDING_DELETES_STORE)) {
        db.createObjectStore(PENDING_DELETES_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(DELETE_AUDIT_STORE)) {
        db.createObjectStore(DELETE_AUDIT_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CLOUD_TO_IDB_DELETE_AUDIT_STORE)) {
        db.createObjectStore(CLOUD_TO_IDB_DELETE_AUDIT_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(WIDGET_LAYOUT_STORE)) {
        db.createObjectStore(WIDGET_LAYOUT_STORE, { keyPath: "userId" });
      }
      if (!db.objectStoreNames.contains(UI_PREFS_STORE)) {
        db.createObjectStore(UI_PREFS_STORE, { keyPath: "userId" });
      }
    };

    req.onsuccess = () => finishSuccess(req.result);
    req.onerror = () => finishError(req.error ?? new Error("indexedDB.open error"));
    req.onblocked = () => finishError(new Error("indexedDB.open blocked"));
  }).finally(() => {
    openDbInFlight = null;
  });

  return openDbInFlight;
}

type UiPrefsCacheRecord = {
  userId: string;
  prefs: UiPrefs;
  updatedAt: number;
};

/** Read ui_prefs from its dedicated IDB store (written immediately, no debounce). */
export async function readUiPrefsIdb(userId: string): Promise<{ prefs: UiPrefs; updatedAt: number } | null> {
  try {
    const db = await openDb();
    return await new Promise<{ prefs: UiPrefs; updatedAt: number } | null>((resolve) => {
      const tx = db.transaction(UI_PREFS_STORE, "readonly");
      const req = tx.objectStore(UI_PREFS_STORE).get(userId);
      req.onsuccess = () => {
        db.close();
        const record = req.result as UiPrefsCacheRecord | undefined;
        resolve(record ? { prefs: record.prefs, updatedAt: record.updatedAt } : null);
      };
      req.onerror = () => { db.close(); resolve(null); };
    });
  } catch {
    return null;
  }
}

/** Write ui_prefs to its dedicated IDB store immediately (no debounce). */
export async function writeUiPrefsIdb(userId: string, prefs: UiPrefs, updatedAt: number): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(UI_PREFS_STORE, "readwrite");
      const record: UiPrefsCacheRecord = { userId, prefs, updatedAt };
      const req = tx.objectStore(UI_PREFS_STORE).put(record);
      req.onsuccess = () => { db.close(); resolve(); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    // ignore IDB write errors
  }
}

/** Clear ui_prefs from its dedicated IDB store (used on cache reset). */
export async function clearUiPrefsIdb(userId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(UI_PREFS_STORE, "readwrite");
      const req = tx.objectStore(UI_PREFS_STORE).delete(userId);
      req.onsuccess = () => { db.close(); resolve(); };
      req.onerror = () => { db.close(); resolve(); };
    });
  } catch {
    // ignore
  }
}

/** Read widget layout from its dedicated IDB store (written immediately, no debounce). */
export async function readWidgetLayoutIdb(userId: string): Promise<{ layout: WidgetLayout; updatedAt: number } | null> {
  try {
    const db = await openDb();
    return await new Promise<{ layout: WidgetLayout; updatedAt: number } | null>((resolve) => {
      const tx = db.transaction(WIDGET_LAYOUT_STORE, "readonly");
      const req = tx.objectStore(WIDGET_LAYOUT_STORE).get(userId);
      req.onsuccess = () => {
        db.close();
        const record = req.result as WidgetLayoutCacheRecord | undefined;
        resolve(record ? { layout: record.layout, updatedAt: record.updatedAt } : null);
      };
      req.onerror = () => { db.close(); resolve(null); };
    });
  } catch {
    return null;
  }
}

/** Write widget layout to its dedicated IDB store immediately (no debounce). */
export async function writeWidgetLayoutIdb(userId: string, layout: WidgetLayout, updatedAt: number): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(WIDGET_LAYOUT_STORE, "readwrite");
      const record: WidgetLayoutCacheRecord = { userId, layout, updatedAt };
      const req = tx.objectStore(WIDGET_LAYOUT_STORE).put(record);
      req.onsuccess = () => { db.close(); resolve(); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    // ignore IDB write errors
  }
}

/** Clear widget layout from its dedicated IDB store (used on cache reset). */
export async function clearWidgetLayoutIdb(userId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(WIDGET_LAYOUT_STORE, "readwrite");
      const req = tx.objectStore(WIDGET_LAYOUT_STORE).delete(userId);
      req.onsuccess = () => { db.close(); resolve(); };
      req.onerror = () => { db.close(); resolve(); };
    });
  } catch {
    // ignore
  }
}

const timeIdb = <T>(
  label: string,
  fn: () => Promise<T>,
  getDetail?: (result: T) => string | undefined,
) => timeOp(`idb:${label}`, "store", fn, getDetail);

/**
 * Guest-workspace flush hook.
 *
 * The live study store persists guest changes to localStorage/IndexedDB only on
 * a throttled rAF tick (see `notify`) and a debounced timer. That leaves a
 * short window where the newest edit lives only in the in-memory `memState`.
 * Account switching parks the guest slot, so a park landing inside that window
 * would lose the last edit. To make switching deterministic, the store
 * registers a synchronous flush here; callers about to park MUST await
 * `flushGuestWorkspace()` first so the parked snapshot is always current.
 */
let guestWorkspaceFlush: (() => Promise<void>) | null = null;

export function registerGuestWorkspaceFlush(fn: () => Promise<void>): void {
  guestWorkspaceFlush = fn;
}

export async function flushGuestWorkspace(): Promise<void> {
  if (!guestWorkspaceFlush) return;
  try {
    await guestWorkspaceFlush();
  } catch {
    /* best-effort — never block a switch on a flush failure */
  }
}

export async function loadStudyStateCache(userId: string): Promise<StudyState | null> {
  return timeIdb("loadState", async () => {
    try {
      const db = await openDb();
      return await new Promise<StudyState | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(userId);
        req.onsuccess = () => {
          db.close();
          const row = req.result as StudyStateCacheRecord | undefined;
          resolve(row?.state ?? null);
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
      });
    } catch {
      return null;
    }
  }, (state) => (state ? "hit" : "miss"));
}

/**
 * When the cached snapshot for `userId` was written, or null when absent.
 * Used to decide whether the (async, debounced) IndexedDB snapshot is actually
 * newer than the (synchronous, per-frame) localStorage bootstrap before letting
 * it overwrite live state on hydration.
 */
export async function readStudyStateCacheSavedAt(userId: string): Promise<number | null> {
  try {
    const db = await openDb();
    return await new Promise<number | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(userId);
      req.onsuccess = () => {
        const row = req.result as StudyStateCacheRecord | undefined;
        resolve(row?.savedAt ?? null);
      };
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  } catch {
    return null;
  }
}

export async function saveStudyStateCache(userId: string, state: StudyState, strict = false): Promise<void> {
  await timeIdb("saveState", async () => {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const record: StudyStateCacheRecord = { userId, savedAt: Date.now(), state };
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
    } catch (error) {
      if (strict) throw error;
    }
  });
}

export async function clearStudyStateCache(userId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(userId);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // ignore cache clear errors
  }
}

const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2) + Date.now().toString(36));

export function getOrCreateDeviceId(): string {
  const KEY = "pashash-device-id";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = uid();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

export async function clearAllIndexedStudyStorage(): Promise<void> {
  try {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      const guard = window.setTimeout(finish, 300);
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => {
        window.clearTimeout(guard);
        finish();
      };
      req.onerror = () => {
        window.clearTimeout(guard);
        finish();
      };
      req.onblocked = () => {
        window.clearTimeout(guard);
        finish();
      };
    });
  } catch {
    // ignore clear errors
  }
}

export async function listSyncJobs(userId: string): Promise<SyncJob[]> {
  return timeIdb("listSyncJobs", async () => {
    try {
      const db = await openDb();
      return await new Promise<SyncJob[]>((resolve, reject) => {
        const tx = db.transaction(SYNC_JOBS_STORE, "readonly");
        const req = tx.objectStore(SYNC_JOBS_STORE).getAll();
        req.onsuccess = () => {
          db.close();
          const jobs = (req.result as SyncJob[] | undefined) ?? [];
          resolve(jobs
            .filter((j) => j.userId === userId)
            .sort((a, b) => a.createdAt - b.createdAt));
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
      });
    } catch {
      return [];
    }
  }, (jobs) => `${jobs.length} jobs`);
}

export async function enqueueFullSyncJob(userId: string, lastError?: string): Promise<void> {
  try {
    const existing = await listSyncJobs(userId);
    const alreadyQueued = existing.some((j) => j.kind === "full-sync");
    if (alreadyQueued) return;

    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SYNC_JOBS_STORE, "readwrite");
      const job: SyncJob = {
        id: uid(),
        userId,
        kind: "full-sync",
        createdAt: Date.now(),
        attempts: 0,
        lastError,
      };
      tx.objectStore(SYNC_JOBS_STORE).put(job);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (error) {
    throw error; // Caller must not report success when durable queuing failed.
  }
}

export async function removeSyncJob(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SYNC_JOBS_STORE, "readwrite");
      tx.objectStore(SYNC_JOBS_STORE).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // ignore queue delete errors
  }
}

export async function markSyncJobFailure(id: string, message: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SYNC_JOBS_STORE, "readwrite");
      const store = tx.objectStore(SYNC_JOBS_STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        const row = req.result as SyncJob | undefined;
        if (row) {
          store.put({
            ...row,
            attempts: (row.attempts ?? 0) + 1,
            lastError: message,
          } satisfies SyncJob);
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // ignore queue update errors
  }
}

// ============================================================================
// Pending Deletes — durable per-row delete queue (tombstone propagation)
// ============================================================================

export async function enqueuePendingDelete(
  userId: string,
  table: PendingDelete["table"],
  rowId: string,
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PENDING_DELETES_STORE, "readwrite");
      const job: PendingDelete = {
        id: uid(),
        userId,
        table,
        rowId,
        deletedAt: Date.now(),
        attempts: 0,
      };
      tx.objectStore(PENDING_DELETES_STORE).put(job);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // ignore — best-effort durability
  }
}

export async function listPendingDeletes(userId: string): Promise<PendingDelete[]> {
  return timeIdb("listPendingDeletes", async () => {
    try {
      const db = await openDb();
      return await new Promise<PendingDelete[]>((resolve, reject) => {
        const tx = db.transaction(PENDING_DELETES_STORE, "readonly");
        const req = tx.objectStore(PENDING_DELETES_STORE).getAll();
        req.onsuccess = () => {
          db.close();
          const all = (req.result as PendingDelete[] | undefined) ?? [];
          resolve(all.filter((d) => d.userId === userId).sort((a, b) => a.deletedAt - b.deletedAt));
        };
        req.onerror = () => { db.close(); reject(req.error); };
      });
    } catch {
      return [];
    }
  }, (rows) => `${rows.length} pending deletes`);
}

export async function removePendingDelete(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PENDING_DELETES_STORE, "readwrite");
      tx.objectStore(PENDING_DELETES_STORE).delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // ignore
  }
}

export async function bumpPendingDeleteAttempt(id: string, message: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PENDING_DELETES_STORE, "readwrite");
      const store = tx.objectStore(PENDING_DELETES_STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        const row = req.result as PendingDelete | undefined;
        if (row) {
          store.put({ ...row, attempts: (row.attempts ?? 0) + 1, lastError: message } satisfies PendingDelete);
        }
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // ignore
  }
}

export async function appendDeleteAuditEvent(
  userId: string,
  table: PendingDelete["table"],
  rowId: string | null,
  status: DeleteAuditStatus,
  message?: string,
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DELETE_AUDIT_STORE, "readwrite");
      const row: DeleteAuditEvent = {
        id: uid(),
        userId,
        table,
        rowId,
        status,
        message,
        at: Date.now(),
        deviceId: getOrCreateDeviceId(),
      };
      tx.objectStore(DELETE_AUDIT_STORE).put(row);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // ignore
  }
}

export async function listDeleteAuditEvents(userId: string, limit = 100): Promise<DeleteAuditEvent[]> {
  return timeIdb("listDeleteAuditEvents", async () => {
    try {
      const db = await openDb();
      return await new Promise<DeleteAuditEvent[]>((resolve, reject) => {
        const tx = db.transaction(DELETE_AUDIT_STORE, "readonly");
        const req = tx.objectStore(DELETE_AUDIT_STORE).getAll();
        req.onsuccess = () => {
          db.close();
          const all = (req.result as DeleteAuditEvent[] | undefined) ?? [];
          const rows = all
            .filter((x) => x.userId === userId)
            .sort((a, b) => b.at - a.at)
            .slice(0, Math.max(1, limit));
          resolve(rows);
        };
        req.onerror = () => { db.close(); reject(req.error); };
      });
    } catch {
      return [];
    }
  }, (rows) => `${rows.length} audit rows`);
}

export async function appendCloudToIdbDeleteAuditEvent(
  userId: string,
  table: string,
  rowId: string,
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CLOUD_TO_IDB_DELETE_AUDIT_STORE, "readwrite");
      const row: CloudToIdbDeleteAuditEvent = {
        id: uid(),
        userId,
        table,
        rowId,
        at: Date.now(),
        deviceId: getOrCreateDeviceId(),
      };
      tx.objectStore(CLOUD_TO_IDB_DELETE_AUDIT_STORE).put(row);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // ignore
  }
}

export async function listCloudToIdbDeleteAuditEvents(userId: string, limit = 100): Promise<CloudToIdbDeleteAuditEvent[]> {
  return timeIdb("listCloudToIdbDeleteAuditEvents", async () => {
    try {
      const db = await openDb();
      return await new Promise<CloudToIdbDeleteAuditEvent[]>((resolve, reject) => {
        const tx = db.transaction(CLOUD_TO_IDB_DELETE_AUDIT_STORE, "readonly");
        const req = tx.objectStore(CLOUD_TO_IDB_DELETE_AUDIT_STORE).getAll();
        req.onsuccess = () => {
          db.close();
          const all = (req.result as CloudToIdbDeleteAuditEvent[] | undefined) ?? [];
          const rows = all
            .filter((x) => x.userId === userId)
            .sort((a, b) => b.at - a.at)
            .slice(0, Math.max(1, limit));
          resolve(rows);
        };
        req.onerror = () => { db.close(); reject(req.error); };
      });
    } catch {
      return [];
    }
  }, (rows) => `${rows.length} cloud-to-idb delete audit rows`);
}

export async function getIndexedMonitorSnapshot(userId: string): Promise<IndexedMonitorSnapshot> {
  const [cachedState, syncJobs, pendingDeletes, deleteAudit, cloudToIdbDeleteAudit] = await Promise.all([
    loadStudyStateCache(userId),
    listSyncJobs(userId),
    listPendingDeletes(userId),
    listDeleteAuditEvents(userId, 300),
    listCloudToIdbDeleteAuditEvents(userId, 300),
  ]);

  let cacheSavedAt: number | null = null;
  try {
    const db = await openDb();
    cacheSavedAt = await new Promise<number | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(userId);
      req.onsuccess = () => {
        const row = req.result as StudyStateCacheRecord | undefined;
        resolve(row?.savedAt ?? null);
      };
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  } catch {
    cacheSavedAt = null;
  }

  const counts = {
    decks: cachedState?.decks?.length ?? 0,
    cards: cachedState?.cards?.length ?? 0,
    categories: cachedState?.categories?.length ?? 0,
    goals: cachedState?.goals?.length ?? 0,
    dayNotes: cachedState?.dayNotes?.length ?? 0,
    cardDecks: cachedState?.cardDecks?.length ?? 0,
    shasReviews: cachedState?.shasReviews?.length ?? 0,
    learningSessions: cachedState?.learningSessions?.length ?? 0,
  };

  const deleteAuditCounts = {
    queued: deleteAudit.filter((e) => e.status === "queued").length,
    success: deleteAudit.filter((e) => e.status === "success").length,
    failed: deleteAudit.filter((e) => e.status === "failed").length,
    noop: deleteAudit.filter((e) => e.status === "noop").length,
  };

  return {
    userId,
    cacheSavedAt,
    counts,
    syncJobsCount: syncJobs.length,
    pendingDeletesCount: pendingDeletes.length,
    deleteAuditCounts,
    latestDeleteAuditAt: deleteAudit[0]?.at ?? null,
    latestCloudToIdbDeleteAt: cloudToIdbDeleteAudit[0]?.at ?? null,
  };
}
