/**
 * Debug log system — records perf timings, DB query results (row counts),
 * console errors/warnings, manual log messages, long JS tasks, FPS, and heap memory.
 *
 * The `debugLog` singleton is also exported as `perf` for backward compatibility.
 * Use `generateReport()` to copy a full diagnostic dump to send to Copilot.
 */

export type PerfCategory = "db" | "store" | "longtask" | "other";
export type LogLevel = "perf" | "log" | "warn" | "error" | "longtask";

/** Hydration stages slower than this (ms) trigger an automatic ⚠ Stall warn entry. */
const STALL_THRESHOLD_MS = 800;

export interface DebugEntry {
  id: number;
  ts: number;            // Date.now()
  level: LogLevel;
  category: PerfCategory;
  label: string;
  detail?: string;       // row count, error message, extra context
  durationMs?: number;   // present for "perf" and "longtask" entries
  traceId?: string;      // optional flow correlation id
}

interface DebugSignal {
  ts: number;
  label: string;
  kind: "ui" | "nav" | "perf" | "app";
  traceId?: string;
}

/** @deprecated use DebugEntry */
export type PerfEntry = DebugEntry;

/* ── Internal types for newer Performance APIs ───────────────────────────── */
interface PScriptTiming {
  invoker: string;
  invokerType: string;
  sourceURL: string;
  sourceFunctionName: string;
  duration: number;
  pauseDuration: number;
  executionStart: number;
  startTime: number;
}
interface PLoafEntry extends PerformanceEntry {
  renderStart: number;
  styleAndLayoutStart: number;
  firstUIEventTimestamp: number;
  blockingDuration: number;
  scripts: PScriptTiming[];
}
interface PEventTiming extends PerformanceEntry {
  processingStart: number;
  processingEnd: number;
  cancelable: boolean;
  target: EventTarget | null;
}
interface PTaskAttributionTiming extends PerformanceEntry {
  containerType: string;
  containerSrc: string;
  containerId: string;
  containerName: string;
}

class DebugLog {
  private _seq = 0;
  entries: DebugEntry[] = [];
  fps = 60;
  memoryMB: number | null = null;
  /** FPS samples — 1 per second, max 60 points (last 60 seconds). */
  fpsHistory: number[] = [];
  /** Memory (MB) samples — 1 per second, max 60 points. */
  memHistory: number[] = [];

  private _listeners    = new Set<() => void>();
  private _rafId: number | null = null;
  private _lastFrameTime = 0;
  private _frameTimes: number[] = [];
  private _observer: PerformanceObserver | null = null;
  private _notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private _historyInterval: ReturnType<typeof setInterval> | null = null;
  private _consolePatched = false;
  private _currentTraceId: string | null = null;
  private _signals: DebugSignal[] = [];
  private _hasLoaf = false;
  private _allObservers: PerformanceObserver[] = [];
  private _signalAbortController: AbortController | null = null;
  active = false;
  private _debugDb: IDBDatabase | null = null;
  private _dbReady: Promise<void> | null = null;

  // ── Web Vitals snapshots (public for report) ──
  inp = 0;          // worst interaction duration seen (ms)
  cls = 0;          // cumulative layout shift score
  ttfb: number | null = null;  // time to first byte (ms)
  domReady: number | null = null; // DOMContentLoaded (ms from fetchStart)
  pageLoad: number | null = null; // load event (ms from fetchStart)

  constructor() {
    if (typeof window !== "undefined") {
      const wasActive = (() => {
        try { return localStorage.getItem("pashash:pm:active") === "1"; } catch { return false; }
      })();
      if (wasActive) this.enable();
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Record a completed timed operation (perf level). */
  record(label: string, category: PerfCategory, durationMs: number, detail?: string, traceId?: string) {
    this._add({ level: "perf", category, label, durationMs, detail, traceId });
    this._addSignal(`perf:${label}`, "perf", traceId);

    // Auto stall-alert for slow hydration / sync pipeline stages
    if (
      durationMs >= STALL_THRESHOLD_MS &&
      (label.startsWith("store:hydrate") || label.startsWith("store:runPending"))
    ) {
      this._add({
        level: "warn",
        category: "store",
        label: "⚠ Stall detected",
        detail: `stage:${label} ${durationMs}ms`,
        traceId: traceId ?? this._currentTraceId ?? undefined,
      });
    }
  }

  /** Manual informational log. */
  log(label: string, detail?: string, category: PerfCategory = "other", traceId?: string) {
    this._add({ level: "log", category, label, detail, traceId });
    this._addSignal(`log:${label}`, "app", traceId);
  }

  /** Log a warning. */
  warn(label: string, detail?: string, traceId?: string) {
    this._add({ level: "warn", category: "other", label, detail, traceId });
    this._addSignal(`warn:${label.slice(0, 80)}`, "app", traceId);
  }

  /** Log an error. */
  error(label: string, detail?: string, traceId?: string) {
    this._add({ level: "error", category: "other", label, detail, traceId });
    this._addSignal(`error:${label.slice(0, 80)}`, "app", traceId);
  }

  /** Create a short correlation id for tracing a single flow end-to-end. */
  createTraceId(prefix = "tr"): string {
    const t = Date.now().toString(36).slice(-6);
    const r = Math.random().toString(36).slice(2, 7);
    return `${prefix}-${t}${r}`;
  }

  /** Set the active trace id and get a restore callback (supports nesting). */
  pushTrace(traceId: string): () => void {
    const prev = this._currentTraceId;
    this._currentTraceId = traceId;
    return () => {
      this._currentTraceId = prev;
    };
  }

  /**
   * Start a timer.
   * Returns a stop function — pass an optional detail string when calling it.
   */
  startTimer(label: string, category: PerfCategory, traceId?: string): (detail?: string) => void {
    const t0 = performance.now();
    this._addSignal(`start:${label}`, "perf", traceId);
    return (detail?: string) =>
      this.record(label, category, Math.round(performance.now() - t0), detail, traceId);
  }

  subscribe(fn: () => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /**
   * Compute a 0–100 health score based on recent log entries.
   * Lower = worse. Returns the score and human-readable reasons.
   */
  computeHealthScore(): { score: number; reasons: string[] } {
    let score = 100;
    const reasons: string[] = [];

    const errors = this.entries.filter((e) => e.level === "error");
    const longtasks = this.entries.filter((e) => e.level === "longtask");
    const slowPerf = this.entries.filter(
      (e) => e.level === "perf" && (e.durationMs ?? 0) >= 300,
    );
    const hydrateStages = this.entries.filter(
      (e) => e.level === "perf" && e.label.startsWith("store:hydrate") && (e.durationMs ?? 0) >= STALL_THRESHOLD_MS,
    );
    const pendingSync = this.entries.filter(
      (e) => e.label === "store:hydrate.list_sync_jobs" && e.detail && /^\d+/.test(e.detail) && parseInt(e.detail) > 0,
    );

    const errorPenalty = Math.min(60, errors.length * 20);
    if (errorPenalty > 0) {
      score -= errorPenalty;
      reasons.push(`${errors.length} error(s) (-${errorPenalty})`);
    }

    const ltPenalty = Math.min(30, longtasks.length * 10);
    if (ltPenalty > 0) {
      score -= ltPenalty;
      reasons.push(`${longtasks.length} JS block(s) (-${ltPenalty})`);
    }

    const slowPenalty = Math.min(20, slowPerf.length * 5);
    if (slowPenalty > 0) {
      score -= slowPenalty;
      reasons.push(`${slowPerf.length} slow op(s) ≥300ms (-${slowPenalty})`);
    }

    if (hydrateStages.length > 0) {
      score -= 15;
      reasons.push(`hydration stall ≥${STALL_THRESHOLD_MS}ms (-15)`);
    }

    if (pendingSync.length > 0) {
      score -= 10;
      reasons.push(`pending cloud sync job(s) (-10)`);
    }

    // INP penalty
    if (this.inp >= 500) {
      score -= 20;
      reasons.push(`INP ${this.inp}ms poor (-20)`);
    } else if (this.inp >= 200) {
      score -= 10;
      reasons.push(`INP ${this.inp}ms needs improvement (-10)`);
    }

    // CLS penalty
    if (this.cls >= 0.25) {
      score -= 15;
      reasons.push(`CLS ${this.cls.toFixed(3)} poor (-15)`);
    } else if (this.cls >= 0.1) {
      score -= 8;
      reasons.push(`CLS ${this.cls.toFixed(3)} needs improvement (-8)`);
    }

    // TTFB penalty
    if (this.ttfb !== null && this.ttfb >= 800) {
      score -= 10;
      reasons.push(`TTFB ${this.ttfb}ms poor (-10)`);
    }

    return { score: Math.max(0, score), reasons };
  }

  /**
   * Get recent block (longtask) entries with parsed attribution.
   */
  getRecentBlocks(): {
    label: string; durationMs: number; ts: number;
    invoker?: string; invokerType?: string; classification?: string;
    phase?: string; overlap?: string; src?: string; traceId?: string;
    scripts?: string[]; workMs?: number; renderMs?: number; uiEventMs?: number;
    lib?: string; reactMeasures?: string; cause?: string;
  }[] {
    return this.entries
      .filter((e) => e.level === "longtask")
      .slice(0, 10)
      .map((e) => {
        const parts = (e.detail ?? "").split(" | ");
        const get = (prefix: string) => {
          const p = parts.find((x) => x.startsWith(prefix));
          return p ? p.slice(prefix.length) : undefined;
        };
        const getMs = (prefix: string): number | undefined => {
          const raw = get(prefix);
          if (!raw) return undefined;
          const m = raw.match(/^(\d+)ms/);
          return m ? parseInt(m[1]) : undefined;
        };

        // Parse scripts: "fn:xxx|type:yyy|src:zzz|50ms" separated by ";"
        const scriptsRaw = get("scripts=");
        const scripts = scriptsRaw
          ? scriptsRaw.split(";").map((s) => s.replace(/\|/g, " ").trim())
          : undefined;

        return {
          label: e.label,
          durationMs: e.durationMs ?? 0,
          ts: e.ts,
          classification: get("class="),
          phase: get("phase="),
          invokerType: get("invoker-type="),
          invoker: get("invoker="),
          src: get("src="),
          overlap: get("overlap="),
          lib: get("lib="),
          reactMeasures: get("react-measures="),
          cause: get("cause="),
          scripts,
          workMs: getMs("work="),
          renderMs: getMs("render="),
          uiEventMs: getMs("uiEvent="),
          traceId: e.traceId,
        };
      });
  }
  /**
   * Returns stages from the latest hydrate-* trace, in chronological order.
   */
  getPipelineStages(): { label: string; durationMs: number; traceId: string; ts: number }[] {
    const hydrateEntries = this.entries
      .filter(
        (e) =>
          e.level === "perf" &&
          e.label.startsWith("store:hydrate") &&
          e.traceId?.startsWith("hydrate-") &&
          e.durationMs !== undefined,
      )
      .sort((a, b) => a.ts - b.ts);

    if (hydrateEntries.length === 0) return [];

    // Find the most recent hydrate traceId
    const latestTraceId = [...hydrateEntries].sort((a, b) => b.ts - a.ts)[0].traceId!;

    return hydrateEntries
      .filter((e) => e.traceId === latestTraceId)
      .map((e) => ({
        label: e.label.replace("store:hydrate.", "").replace("store:hydrate", "total"),
        durationMs: e.durationMs!,
        traceId: e.traceId!,
        ts: e.ts,
      }));
  }

  /**
   * Detect repeated identical DB queries within the last 5 seconds (N+1 anti-pattern).
   * Returns groups with ≥3 identical labels, sorted by frequency.
   */
  detectN1Patterns(): { label: string; count: number; totalMs: number; windowMs: number }[] {
    const now = Date.now();
    const windowMs = 5000;
    const dbEntries = this.entries.filter(
      (e) => e.category === "db" && e.level === "perf" && e.ts >= now - windowMs,
    );
    const groups = new Map<string, DebugEntry[]>();
    for (const e of dbEntries) {
      if (!groups.has(e.label)) groups.set(e.label, []);
      groups.get(e.label)!.push(e);
    }
    return [...groups.entries()]
      .filter(([, es]) => es.length >= 3)
      .map(([label, es]) => ({
        label,
        count: es.length,
        totalMs: es.reduce((s, e) => s + (e.durationMs ?? 0), 0),
        windowMs: es.length > 1
          ? Math.max(...es.map((e) => e.ts)) - Math.min(...es.map((e) => e.ts))
          : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Return actionable smart alerts based on current monitoring data.
   * Each alert has a stable key (for dismissal), level, and Hebrew message.
   */
  getSmartAlerts(): { key: string; level: "warn" | "error"; msg: string }[] {
    const alerts: { key: string; level: "warn" | "error"; msg: string }[] = [];

    // ── Memory leak detection: growing > 25 MB over last 15 samples ──
    if (this.memHistory.length >= 15) {
      const slice = this.memHistory.slice(-15);
      const growth = slice[slice.length - 1] - slice[0];
      if (growth > 25) {
        alerts.push({
          key: "mem-leak",
          level: "warn",
          msg: `זיכרון עלה ${Math.round(growth)}MB ב-15 שניות — חשד ל-memory leak`,
        });
      }
    }

    // ── INP ──
    if (this.inp >= 500) {
      alerts.push({ key: "inp-poor", level: "error", msg: `INP גרוע: ${this.inp}ms (>500ms) — UI נתפס כאיטי` });
    } else if (this.inp >= 200) {
      alerts.push({ key: "inp-warn", level: "warn", msg: `INP: ${this.inp}ms — צריך שיפור (סף: 200ms)` });
    }

    // ── N+1 queries ──
    const n1 = this.detectN1Patterns();
    for (const p of n1.slice(0, 3)) {
      const winSec = p.windowMs > 0 ? `${(p.windowMs / 1000).toFixed(1)}s` : "<1s";
      const avgMs = Math.round(p.totalMs / p.count);
      alerts.push({
        key: `n1:${p.label}`,
        level: "warn",
        msg: `N+1: "${p.label.replace(/^db:/, "")}" נשאל ${p.count}× ב-${winSec} • ממוצע ${avgMs}ms/קריאה`,
      });
    }

    // ── Error burst: ≥3 errors in last 30 seconds ──
    const recentErrors = this.entries.filter(
      (e) => e.level === "error" && e.ts >= Date.now() - 30_000,
    );
    if (recentErrors.length >= 3) {
      alerts.push({
        key: "errors-burst",
        level: "error",
        msg: `${recentErrors.length} שגיאות ב-30 השניות האחרונות`,
      });
    }

    // ── FPS critical ──
    if (this.active && this.fps < 20) {
      alerts.push({ key: "fps-critical", level: "error", msg: `FPS קריטי: ${this.fps} — ממשק כמעט קפוא` });
    } else if (this.active && this.fps < 30) {
      alerts.push({ key: "fps-low", level: "warn", msg: `FPS נמוך: ${this.fps} (מתחת ל-30)` });
    }

    // ── FPS trend drop: earliest 3 samples vs latest 3 ──
    if (this.fpsHistory.length >= 8) {
      const hist = this.fpsHistory;
      const early = (hist[0] + hist[1] + hist[2]) / 3;
      const late  = (hist[hist.length - 1] + hist[hist.length - 2] + hist[hist.length - 3]) / 3;
      if (early - late > 20) {
        alerts.push({
          key: "fps-drop",
          level: "warn",
          msg: `FPS צנח: ${Math.round(early)}→${Math.round(late)} בשניות האחרונות`,
        });
      }
    }

    return alerts;
  }

  enable() {
    if (this.active) return;
    this.active = true;
    try { localStorage.setItem("pashash:pm:active", "1"); } catch { /* ignore */ }
    this._lastFrameTime = performance.now();
    this._startFpsMeter();
    this._startLoafObserver();
    this._startLongTaskObserver();
    this._patchConsole();
    this._startSignalCapture();
    this._startEventObserver();
    this._startResourceObserver();
    this._startPaintObserver();
    this._startInpObserver();
    this._startClsObserver();
    this._captureNavigationTiming();
    this._startHistoryRecorder();
    this._scheduleNotify();
  }

  disable() {
    if (!this.active) return;
    this.active = false;
    this._hasLoaf = false;
    try { localStorage.setItem("pashash:pm:active", "0"); } catch { /* ignore */ }
    if (this._rafId !== null) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    for (const obs of this._allObservers) { try { obs.disconnect(); } catch { /* ignore */ } }
    this._allObservers = [];
    if (this._observer) { try { this._observer.disconnect(); } catch { /* ignore */ } this._observer = null; }
    this._signalAbortController?.abort();
    this._signalAbortController = null;
    if (this._historyInterval !== null) { clearInterval(this._historyInterval); this._historyInterval = null; }
    this.fpsHistory = [];
    this.memHistory = [];
    this._scheduleNotify();
  }

  clearEntries() {
    this.entries = [];
    this._scheduleNotify();
  }

  /**
   * Build a full plain-text diagnostic report suitable for pasting to Copilot.
   * Called by the "📋 העתק לוגים" button in PerfMonitor.
   */
  generateReport(entryLimit?: number): string {
    const now = new Date();
    const mem = this.memoryMB !== null ? `${this.memoryMB} MB` : "N/A";
    const ua  = typeof navigator !== "undefined" ? navigator.userAgent : "N/A";
    const url = typeof window   !== "undefined" ? window.location.href : "N/A";

    const errors    = this.entries.filter((e) => e.level === "error").length;
    const warns     = this.entries.filter((e) => e.level === "warn").length;
    const longtasks = this.entries.filter((e) => e.level === "longtask").length;
    const traces = new Set(this.entries.map((e) => e.traceId).filter(Boolean)).size;

    const timedEntries = this.entries.filter((e) => e.durationMs !== undefined);
    const longTaskEntries = this.entries.filter((e) => e.level === "longtask" && e.durationMs !== undefined);
    const slowPerfEntries = this.entries.filter((e) => e.level === "perf" && (e.durationMs ?? 0) >= 120);
    const slowDbEntries = slowPerfEntries.filter((e) => e.category === "db");
    const topLongTasks = [...longTaskEntries]
      .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
      .slice(0, 3);
    const slowest5 = [...timedEntries]
      .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
      .slice(0, 5);

    const fmt = (ms: number) =>
      ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;

    const fmtClock = (ts: number) => {
      const d = new Date(ts);
      return [d.getHours(), d.getMinutes(), d.getSeconds()]
        .map((n) => String(n).padStart(2, "0"))
        .join(":")
        + "." + String(d.getMilliseconds()).padStart(3, "0");
    };

    const fmtEntryShort = (e: DebugEntry) => {
      const dur = e.durationMs !== undefined ? ` ${fmt(e.durationMs)}` : "";
      const trace = e.traceId ? ` [trace:${e.traceId}]` : "";
      return `[${fmtClock(e.ts)}] ${e.level.toUpperCase()}/${e.category} ${e.label}${dur}${trace}`;
    };

    const isNoisyWarning = (e: DebugEntry) =>
      e.level === "warn" && (
        e.label.includes("React Router Future Flag Warning")
        || e.label.includes("[vite]")
        || e.label.includes("Download the React")
      );

    const isStrongSignal = (e: DebugEntry) =>
      e.level === "perf" || e.level === "error" || e.level === "longtask";

    const chronological = [...this.entries].sort((a, b) => a.ts - b.ts);
    const incidents = chronological.filter((e) => e.level === "error" || e.level === "longtask");

    const findPrevStep = (incident: DebugEntry): DebugEntry | null => {
      const idx = chronological.findIndex((e) => e.id === incident.id);
      if (idx <= 0) return null;

      const before = chronological.slice(0, idx);

      // 1) Best: same trace + strong signal
      if (incident.traceId) {
        for (let i = before.length - 1; i >= 0; i--) {
          const c = before[i];
          if (c.traceId === incident.traceId && isStrongSignal(c)) return c;
        }
      }

      // 2) Any strong signal (perf/error/longtask)
      for (let i = before.length - 1; i >= 0; i--) {
        const c = before[i];
        if (isStrongSignal(c)) return c;
      }

      // 3) Any non-noisy entry
      for (let i = before.length - 1; i >= 0; i--) {
        const c = before[i];
        if (!isNoisyWarning(c)) return c;
      }

      // 4) Fallback: raw previous entry
      return before[before.length - 1] ?? null;
    };

    const findAroundOneSecondBefore = (incident: DebugEntry): DebugEntry | null => {
      const targetTs = incident.ts - 1000;
      const candidates = chronological.filter((e) => e.id !== incident.id && e.ts <= targetTs);
      if (candidates.length === 0) return null;

      // Prefer same trace + strong signal around 1s before
      const sameTraceStrong = incident.traceId
        ? candidates.filter((e) => e.traceId === incident.traceId && isStrongSignal(e))
        : [];
      if (sameTraceStrong.length > 0) return sameTraceStrong[sameTraceStrong.length - 1];

      // Then any strong signal
      const strong = candidates.filter((e) => isStrongSignal(e));
      if (strong.length > 0) return strong[strong.length - 1];

      // Then non-noisy entries
      const nonNoisy = candidates.filter((e) => !isNoisyWarning(e));
      if (nonNoisy.length > 0) return nonNoisy[nonNoisy.length - 1];

      return candidates[candidates.length - 1];
    };

    const lines: string[] = [
      `=== PASHASH DEBUG REPORT ===`,
      `Time : ${now.toISOString()}`,
      `URL  : ${url}`,
      `FPS  : ${this.fps}`,
      `MEM  : ${mem}`,
      `UA   : ${ua}`,
      ``,
      `=== SUMMARY ===`,
      `Total entries : ${this.entries.length}`,
      `Errors        : ${errors}`,
      `Warnings      : ${warns}`,
      `Long JS tasks : ${longtasks}`,
      `Traces        : ${traces}`,
      ``,
      `=== WEB VITALS ===`,
      `INP  : ${this.inp > 0 ? `${this.inp}ms ${this.inp >= 500 ? "(poor ❌)" : this.inp >= 200 ? "(needs improvement ⚠)" : "(good ✓)"}` : "N/A (no interaction yet)"}`,
      `CLS  : ${this.cls > 0 ? `${this.cls.toFixed(4)} ${this.cls >= 0.25 ? "(poor ❌)" : this.cls >= 0.1 ? "(needs improvement ⚠)" : "(good ✓)"}` : "0 (good ✓)"}`,
      ...(this.ttfb !== null ? [
        `TTFB : ${this.ttfb}ms ${this.ttfb >= 800 ? "(poor ❌)" : this.ttfb >= 200 ? "(needs improvement ⚠)" : "(good ✓)"}`,
        `DOMr : ${this.domReady}ms`,
        `Load : ${this.pageLoad}ms`,
      ] : [`TTFB : N/A`]),
      ``,
      `=== TOP 5 SLOWEST ===`,
      ...slowest5.map(
        (e) =>
          `  ${fmt(e.durationMs!).padEnd(8)} ${e.label}${e.detail ? ` [${e.detail}]` : ""}`,
      ),
      ``,
      `=== BLOCKING ANALYSIS ===`,
      longtasks > 0
        ? `Main-thread blocking detected: ${longtasks} JS long task(s).`
        : `No JS main-thread blocking detected in this capture.`,
      longtasks > 0
        ? `Likely cause: heavy synchronous JS work on the main thread.`
        : (slowDbEntries.length >= 2
            ? `Likely slowdown cause: DB/API latency (multiple slow DB operations in the same window).`
            : (slowPerfEntries.length > 0
                ? `Likely slowdown cause: async operation latency (not a JS thread block).`
                : `No significant blocking or slowdown detected.`)),
      ...(topLongTasks.length > 0
        ? [
            `Top JS blockers:`,
            ...topLongTasks.map((e) => `  - ${fmt(e.durationMs!)} ${e.label}${e.detail ? ` [${e.detail}]` : ""}`),
          ]
        : []),
      ``,
      `=== DEEP BLOCK ATTRIBUTION ===`,
      ...(longTaskEntries.length === 0
        ? [`No blocks recorded.`]
        : longTaskEntries
            .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
            .slice(0, 5)
            .map((e) => {
              const detail = e.detail ?? "no attribution data";
              const hasLoaf = e.label === "LoAF block";
              const lines = [
                `Block: ${fmt(e.durationMs!)} @ ${fmtClock(e.ts)}${e.traceId ? ` [trace:${e.traceId}]` : ""}`,
                `  Type: ${hasLoaf ? "Long Animation Frame (rich data)" : "Long Task (basic)"}`,
              ];
              detail.split(" | ").forEach((part) => lines.push(`  ${part}`));
              return lines.join("\n");
            })),
      ``,
      `=== PRE-INCIDENT CONTEXT ===`,
      ...(incidents.length > 0
        ? incidents.slice(-3).map((incident) => {
            const prev = findPrevStep(incident);
            const oneSecBefore = findAroundOneSecondBefore(incident);
            const prevGap = prev ? incident.ts - prev.ts : null;
            const oneSecGap = oneSecBefore ? incident.ts - oneSecBefore.ts : null;
            const maxUsefulGapMs = 5000;
            const prevUseful = prevGap !== null && prevGap <= maxUsefulGapMs ? prev : null;
            const oneSecUseful = oneSecGap !== null && oneSecGap <= maxUsefulGapMs ? oneSecBefore : null;
            const likelyTrigger = prevUseful ?? oneSecUseful;

            return [
              `Incident: ${fmtEntryShort(incident)}`,
              `  Step right before: ${prevUseful ? `${fmtEntryShort(prevUseful)}${prevGap !== null ? ` (gap ${fmt(prevGap)})` : ""}` : "N/A"}`,
              `  ~1s before: ${oneSecUseful ? `${fmtEntryShort(oneSecUseful)}${oneSecGap !== null ? ` (gap ${fmt(oneSecGap)})` : ""}` : "N/A"}`,
              `  Likely trigger: ${likelyTrigger ? fmtEntryShort(likelyTrigger) : "N/A"}`,
            ].join("\n");
          })
        : [`No error/longtask incident found, so there is no crash/blocking precursor to report.`]),
      ``,
      `=== ALL ENTRIES (newest first${entryLimit !== undefined ? `, showing ${Math.min(entryLimit, this.entries.length)} of ${this.entries.length}` : `, ${this.entries.length} total`}) ===`,
    ];

    const reportEntries = entryLimit !== undefined ? this.entries.slice(0, entryLimit) : this.entries;
    for (const e of reportEntries) {
      const t = fmtClock(e.ts);

      const durStr = e.durationMs !== undefined
        ? ` → ${fmt(e.durationMs)}${e.durationMs >= 1000 ? " ⚠ SLOW" : e.durationMs >= 300 ? " ⚠" : ""}`
        : "";

      const detailStr = e.detail ? ` | ${e.detail}` : "";
      const traceStr = e.traceId ? ` [trace:${e.traceId}]` : "";
      const lv  = e.level.toUpperCase().padEnd(8);
      const cat = e.category.padEnd(8);

      lines.push(`[${t}] [${lv}] [${cat}] ${e.label}${durStr}${detailStr}${traceStr}`);
    }

    lines.push(``, `=== END REPORT ===`);
    return lines.join("\n");
  }

  /** Summary-only report: all diagnostic sections but NO raw entry list. */
  generateSummary(): string {
    const now = new Date();
    const mem = this.memoryMB !== null ? `${this.memoryMB} MB` : "N/A";

    const errors    = this.entries.filter((e) => e.level === "error").length;
    const warns     = this.entries.filter((e) => e.level === "warn").length;
    const longtasks = this.entries.filter((e) => e.level === "longtask").length;
    const traces    = new Set(this.entries.map((e) => e.traceId).filter(Boolean)).size;

    const timedEntries     = this.entries.filter((e) => e.durationMs !== undefined);
    const longTaskEntries  = this.entries.filter((e) => e.level === "longtask" && e.durationMs !== undefined);
    const slowPerfEntries  = this.entries.filter((e) => e.level === "perf" && (e.durationMs ?? 0) >= 120);
    const slowDbEntries    = slowPerfEntries.filter((e) => e.category === "db");
    const topLongTasks     = [...longTaskEntries]
      .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
      .slice(0, 3);
    const slowest5         = [...timedEntries]
      .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
      .slice(0, 5);

    const fmt = (ms: number) =>
      ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;

    const fmtClock = (ts: number) => {
      const d = new Date(ts);
      return [d.getHours(), d.getMinutes(), d.getSeconds()]
        .map((n) => String(n).padStart(2, "0")).join(":")
        + "." + String(d.getMilliseconds()).padStart(3, "0");
    };

    const fmtEntry = (e: DebugEntry) => {
      const dur = e.durationMs !== undefined ? ` ${fmt(e.durationMs)}` : "";
      return `[${fmtClock(e.ts)}] ${e.level.toUpperCase()}/${e.category} ${e.label}${dur}`;
    };

    // Smart alerts
    const alerts = this.getSmartAlerts();
    const n1     = this.detectN1Patterns();
    const blocks = this.getRecentBlocks();

    const lines: string[] = [
      `=== PASHASH SUMMARY REPORT ===`,
      `Time : ${now.toISOString()}`,
      `URL  : ${typeof window !== "undefined" ? window.location.href : "N/A"}`,
      `FPS  : ${this.fps}`,
      `MEM  : ${mem}`,
      ``,
      `=== SUMMARY ===`,
      `Total entries : ${this.entries.length}`,
      `Errors        : ${errors}`,
      `Warnings      : ${warns}`,
      `Long JS tasks : ${longtasks}`,
      `Traces        : ${traces}`,
      ``,
      `=== WEB VITALS ===`,
      `INP  : ${this.inp > 0 ? `${this.inp}ms ${this.inp >= 500 ? "(poor ❌)" : this.inp >= 200 ? "(needs improvement ⚠)" : "(good ✓)"}` : "N/A"}`,
      `CLS  : ${this.cls > 0 ? `${this.cls.toFixed(4)} ${this.cls >= 0.25 ? "(poor ❌)" : this.cls >= 0.1 ? "(needs improvement ⚠)" : "(good ✓)"}` : "0 (good ✓)"}`,
      ...(this.ttfb !== null
        ? [`TTFB : ${this.ttfb}ms`, `Load : ${this.pageLoad}ms`]
        : [`TTFB : N/A`]),
      ``,
      `=== TOP 5 SLOWEST ===`,
      ...slowest5.map((e) =>
        `  ${fmt(e.durationMs!).padEnd(8)} ${e.label}${e.detail ? ` [${e.detail}]` : ""}`),
      ``,
      `=== BLOCKING ANALYSIS ===`,
      longtasks > 0
        ? `Main-thread blocking: ${longtasks} task(s).`
        : `No JS main-thread blocking detected.`,
      longtasks > 0
        ? `Likely cause: heavy synchronous JS work.`
        : slowDbEntries.length >= 2
          ? `Likely slowdown: DB/API latency.`
          : slowPerfEntries.length > 0
            ? `Likely slowdown: async operation latency.`
            : `No significant blocking or slowdown.`,
      ...(topLongTasks.length > 0
        ? [`Top blockers:`, ...topLongTasks.map((e) => `  - ${fmt(e.durationMs!)} ${e.label}`)]
        : []),
      ``,
      `=== TOP BLOCKS (last 30s) ===`,
      ...(blocks.length === 0
        ? [`  None`]
        : blocks.slice(0, 5).map((b) =>
            `  ${fmt(b.durationMs)} ${b.label}${b.classification ? ` [${b.classification}]` : ""}`)),
      ``,
      `=== SMART ALERTS ===`,
      ...(alerts.length === 0
        ? [`  None`]
        : alerts.map((a) => `  [${a.level.toUpperCase()}] ${a.msg}`)),
      ``,
      `=== N+1 PATTERNS ===`,
      ...(n1.length === 0
        ? [`  None`]
        : n1.map((p) => `  ${p.count}× ${p.label} (total ${p.totalMs}ms)`)),
      ``,
      `=== ERROR ENTRIES ===`,
      ...(errors === 0
        ? [`  None`]
        : this.entries
            .filter((e) => e.level === "error")
            .slice(0, 10)
            .map((e) => `  ${fmtEntry(e)}${e.detail ? ` | ${e.detail}` : ""}`)),
      ``,
      `=== END SUMMARY ===`,
    ];

    return lines.join("\n");
  }


  // ── Private ──────────────────────────────────────────────────────────────────

  private _add(entry: Omit<DebugEntry, "id" | "ts">) {
    this.entries.unshift({
      id: this._seq++,
      ts: Date.now(),
      ...entry,
      traceId: entry.traceId ?? this._currentTraceId ?? undefined,
    });
    if (this.entries.length > 5000) this.entries.length = 5000;
    this._scheduleNotify();
  }

  private _addSignal(label: string, kind: DebugSignal["kind"], traceId?: string) {
    this._signals.push({ ts: Date.now(), label, kind, traceId: traceId ?? this._currentTraceId ?? undefined });
    if (this._signals.length > 300) this._signals.splice(0, this._signals.length - 300);
  }

  private _findNearestSignal(beforeTs: number, maxGapMs: number, preferTraceId?: string): DebugSignal | null {
    const candidates = this._signals.filter((s) => s.ts <= beforeTs && beforeTs - s.ts <= maxGapMs);
    if (candidates.length === 0) return null;

    if (preferTraceId) {
      const traceSignals = candidates.filter((s) => s.traceId === preferTraceId);
      if (traceSignals.length > 0) return traceSignals[traceSignals.length - 1];
    }

    const strongKinds: DebugSignal["kind"][] = ["ui", "perf", "nav"];
    for (const kind of strongKinds) {
      const byKind = candidates.filter((s) => s.kind === kind);
      if (byKind.length > 0) return byKind[byKind.length - 1];
    }

    return candidates[candidates.length - 1];
  }

  private _scheduleNotify() {
    if (this._notifyTimer) return;
    this._notifyTimer = setTimeout(() => {
      this._notifyTimer = null;
      const mem = (performance as { memory?: { usedJSHeapSize?: number } }).memory;
      if (mem?.usedJSHeapSize) {
        this.memoryMB = Math.round((mem.usedJSHeapSize / 1024 / 1024) * 10) / 10;
      }
      this._listeners.forEach((l) => l());
    }, 150);
  }

  private _patchConsole() {
    if (this._consolePatched || typeof console === "undefined") return;
    this._consolePatched = true;

    const serialize = (args: unknown[]) =>
      args
        .map((a) => {
          if (typeof a === "string") return a;
          try { return JSON.stringify(a); } catch { return String(a); }
        })
        .join(" ")
        .slice(0, 300);

    const origError = console.error.bind(console);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (console as any).error = (...args: unknown[]) => {
      origError(...args);
      this._add({ level: "error", category: "other", label: serialize(args) });
    };

    const origWarn = console.warn.bind(console);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (console as any).warn = (...args: unknown[]) => {
      origWarn(...args);
      const msg = serialize(args);
      // Skip noisy React devtools / Vite HMR messages
      if (msg.startsWith("Warning: ") || msg.includes("[vite]") || msg.includes("Download the React")) return;
      this._add({ level: "warn", category: "other", label: msg });
    };
  }

  private _startSignalCapture() {
    if (typeof window === "undefined") return;

    const ac = new AbortController();
    this._signalAbortController = ac;
    const sig = ac.signal;

    const describeTarget = (target: EventTarget | null): string => {
      const el = target as HTMLElement | null;
      if (!el) return "unknown";
      const tag = el.tagName?.toLowerCase() ?? "unknown";
      const id = el.id ? `#${el.id}` : "";
      const cls = typeof el.className === "string" && el.className.trim()
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}`
        : "";
      return `${tag}${id}${cls}`.slice(0, 80);
    };

    window.addEventListener("pointerdown", (e) => {
      this._addSignal(`ui:pointerdown:${describeTarget(e.target)}`, "ui");
    }, { capture: true, signal: sig });

    window.addEventListener("keydown", (e) => {
      this._addSignal(`ui:keydown:${e.key}`, "ui");
    }, { capture: true, signal: sig });

    window.addEventListener("popstate", () => {
      this._addSignal(`nav:popstate:${window.location.pathname}`, "nav");
    }, { signal: sig });

    window.addEventListener("hashchange", () => {
      this._addSignal(`nav:hashchange:${window.location.hash || "#"}`, "nav");
    }, { signal: sig });

    document.addEventListener("visibilitychange", () => {
      this._addSignal(`nav:visibility:${document.visibilityState}`, "nav");
    }, { signal: sig });

    // Throttled scroll capture (max 1 per 500ms)
    let _lastScrollTs = 0;
    window.addEventListener("scroll", (e) => {
      const now = Date.now();
      if (now - _lastScrollTs < 500) return;
      _lastScrollTs = now;
      this._addSignal(`ui:scroll:${describeTarget(e.target)}`, "ui");
    }, { passive: true, capture: true, signal: sig });

    // Viewport resize capture
    window.addEventListener("resize", () => {
      this._addSignal(`nav:resize:${window.innerWidth}x${window.innerHeight}`, "nav");
    }, { signal: sig });
  }

  // ── Block attribution helpers ─────────────────────────────────────────────

  /**
   * Find perf entries that were in-flight during [blockStartMs, blockEndMs].
   * A perf entry (ts=completion, durationMs) was running from ts-durationMs to ts.
   */
  private _findOverlappingEntries(blockStartMs: number, blockEndMs: number): string[] {
    return this.entries
      .filter((e) => {
        if (!e.durationMs || e.level !== "perf") return false;
        const opEnd = e.ts;
        const opStart = e.ts - e.durationMs;
        return opStart < blockEndMs && opEnd > blockStartMs;
      })
      .map((e) => `${e.label}(${e.durationMs}ms)`)
      .slice(0, 3);
  }

  /** Map invokerType/invoker string to a human-readable block-cause category. */
  private _classifyInvoker(invokerType: string, invoker: string): string {
    const ivt = (invokerType || "").toLowerCase();
    const iv = (invoker || "").toLowerCase();
    if (ivt === "user-callback" || iv.includes("click") || iv.includes("pointerdown") || iv.includes("touchstart")) return "user-click";
    if (iv.includes("change") || iv.includes("input") || iv.includes("submit")) return "user-event";
    if (ivt.includes("promise") || iv.includes(".then") || iv.includes("resolve")) return "async-callback";
    if (ivt === "settimeout" || ivt.includes("timeout") || iv.includes("settimeout")) return "timer";
    if (ivt.includes("interval") || iv.includes("setinterval")) return "interval";
    if (ivt.includes("animationframe") || iv.includes("requestanimationframe")) return "raf";
    if (ivt.includes("mutation")) return "mutation";
    if (ivt.includes("intersection")) return "intersection";
    if (ivt.includes("idle")) return "idle";
    if (ivt) return ivt;
    if (iv) return iv.slice(0, 20);
    return "unknown";
  }

  /** Classify a LoAF/longtask block into a high-level category for root-cause attribution. */
  private _classifyBlock(phase: string, invokerType: string, invoker: string, scripts: PScriptTiming[]): string {
    const srcs = scripts.map((s) => (s.sourceURL || "").toLowerCase());
    if (srcs.some((s) => s.includes("supabase"))) return "db-callback";
    if (srcs.some((s) => s.includes("dnd-kit") || s.includes("draggable"))) return "dnd-work";
    const ic = this._classifyInvoker(invokerType, invoker);
    if (ic === "user-click" || ic === "user-event") return "user-interaction";
    if (ic === "async-callback") return "async-callback";
    if (ic === "timer" || ic === "interval") return "timer-callback";
    if (ic === "raf") return "raf-work";
    if (ic === "mutation") return "mutation-observer";
    if (ic === "intersection") return "intersection-observer";
    if (phase === "initial-load" && scripts.length === 0) return "bundle-parse";
    const hasReact = srcs.some((s) => s.includes("react") || s.includes("vendor-react"));
    if (hasReact) return "react-render";
    if (phase === "initial-load") return "initial-load";
    return "unknown-block";
  }

  /** Shorten a source URL to just the relevant filename portion. */
  private _shortUrl(url: string): string {
    if (!url) return "";
    try {
      const path = new URL(url).pathname;
      return path.split("/").filter(Boolean).slice(-2).join("/");
    } catch {
      return url.split("/").slice(-2).join("/").slice(0, 60);
    }
  }

  // ── IndexedDB — persist block snapshots across page refresh / crashes ─────

  private _openDebugDb(): Promise<void> {
    if (this._dbReady) return this._dbReady;
    if (typeof indexedDB === "undefined") return Promise.resolve();
    this._dbReady = new Promise((resolve) => {
      const req = indexedDB.open("pashash-debug-v1", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("block_snapshots")) {
          db.createObjectStore("block_snapshots", { keyPath: "id", autoIncrement: true });
        }
      };
      req.onsuccess = () => { this._debugDb = req.result; resolve(); };
      req.onerror  = () => resolve(); // silently fail — never throws
    });
    return this._dbReady;
  }

  /**
   * Save a "pre-block" snapshot to IndexedDB.
   * Called immediately when a block ≥50 ms completes so the last 100 entries
   * (which include everything leading up to the block) survive a page refresh/crash.
   */
  private _saveBlockSnapshot(blockMs: number, label: string, detail: string): void {
    this._openDebugDb().then(() => {
      if (!this._debugDb) return;
      const snapshot = { ts: Date.now(), blockMs, label, detail, entries: this.entries.slice(0, 100) };
      const tx    = this._debugDb.transaction("block_snapshots", "readwrite");
      const store = tx.objectStore("block_snapshots");
      store.add(snapshot);
      // Keep only the last 50 snapshots — delete excess oldest keys
      const keyReq = store.getAllKeys();
      keyReq.onsuccess = () => {
        const keys = keyReq.result as IDBValidKey[];
        if (keys.length > 50) {
          for (const k of keys.slice(0, keys.length - 50)) store.delete(k);
        }
      };
    }).catch(() => { /* IDB unavailable */ });
  }

  /**
   * Retrieve all saved block snapshots from IndexedDB (newest first).
   * Survives page refresh/crash — useful for post-crash forensics.
   * Call from DevTools console: debugLog.getBlockSnapshots().then(console.log)
   */
  async getBlockSnapshots(): Promise<{ id: number; ts: number; blockMs: number; label: string; detail: string; entries: DebugEntry[] }[]> {
    try {
      await this._openDebugDb();
      if (!this._debugDb) return [];
      return new Promise((resolve, reject) => {
        const tx    = this._debugDb!.transaction("block_snapshots", "readonly");
        const store = tx.objectStore("block_snapshots");
        const req   = store.getAll();
        req.onsuccess = () => resolve((req.result as { id: number; ts: number; blockMs: number; label: string; detail: string; entries: DebugEntry[] }[]).reverse());
        req.onerror   = () => reject(req.error);
      });
    } catch { return []; }
  }

  // ── Long Animation Frame (LoAF) — richer attribution than longtask ────────
  private _startLoafObserver() {
    const navStart = performance.timeOrigin;
    try {
      const obs = new PerformanceObserver((list) => {
        this._hasLoaf = true;
        for (const rawEntry of list.getEntries()) {
          const entry = rawEntry as unknown as PLoafEntry;
          const blockMs = Math.round(entry.blockingDuration || entry.duration);
          if (blockMs < 16) continue;

          const scripts = (entry.scripts ?? []).slice().sort((a, b) => b.duration - a.duration);
          const top = scripts[0];
          const parts: string[] = [];

          // ── Phase ──
          const phase = entry.startTime < 5000 ? "initial-load" : "interaction";
          parts.push(`phase=${phase}`);

          if (top) {
            const topInvokerType = top.invokerType || "";
            const topInvoker = top.invoker || "";
            const blockClass = this._classifyBlock(phase, topInvokerType, topInvoker, scripts);
            const invokerClass = this._classifyInvoker(topInvokerType, topInvoker);
            parts.push(`class=${blockClass}`);
            parts.push(`invoker-type=${invokerClass}`);
            if (topInvoker) parts.push(`invoker=${topInvoker}`);
            if (top.sourceFunctionName) parts.push(`fn=${top.sourceFunctionName}`);
            const file = this._shortUrl(top.sourceURL);
            if (file) parts.push(`src=${file}`);
            parts.push(`script=${Math.round(top.duration)}ms`);
            if (top.pauseDuration > 1) parts.push(`pause=${Math.round(top.pauseDuration)}ms`);

            // Top 3 scripts encoded: fn:xxx|type:yyy|src:zzz|50ms[|p:Nms]
            const encoded = scripts.slice(0, 3).map((s) => {
              const sfn = s.sourceFunctionName || "?";
              const stype = this._classifyInvoker(s.invokerType, s.invoker);
              const ssrc = this._shortUrl(s.sourceURL);
              const sdur = Math.round(s.duration);
              const spause = s.pauseDuration > 1 ? `|p:${Math.round(s.pauseDuration)}ms` : "";
              return `fn:${sfn}|${stype}${ssrc ? `|${ssrc}` : ""}|${sdur}ms${spause}`;
            }).join(";");
            parts.push(`scripts=${encoded}`);
          } else {
            // No script attribution — timing breakdown
            const blockClass = this._classifyBlock(phase, "", "", []);
            parts.push(`class=${blockClass}`);
            const renderDelay = entry.renderStart > 0
              ? Math.round(entry.renderStart - entry.startTime) : null;
            const styleLayoutOffset = entry.styleAndLayoutStart > 0
              ? Math.round(entry.styleAndLayoutStart - entry.startTime) : null;
            const scriptTimeTotal = Math.round(
              (entry.renderStart > 0 ? entry.renderStart
                : entry.styleAndLayoutStart > 0 ? entry.styleAndLayoutStart
                : entry.startTime + entry.duration) - entry.startTime
            );
            if (scriptTimeTotal > 10) parts.push(`script≈${scriptTimeTotal}ms`);
            if (styleLayoutOffset !== null && styleLayoutOffset < (entry.duration - 5)) parts.push(`styleLayout@${styleLayoutOffset}ms`);
            if (renderDelay !== null) parts.push(`renderAt=${renderDelay}ms`);
            if (phase === "initial-load") parts.push(`cause≈bundle-parse/react-mount`);
          }

          // ── Work vs render timing breakdown ──
          const workMs = entry.renderStart > 0
            ? Math.round(entry.renderStart - entry.startTime)
            : Math.round(entry.duration);
          const renderMs = entry.renderStart > 0
            ? Math.round(entry.duration - (entry.renderStart - entry.startTime))
            : 0;
          parts.push(`work=${workMs}ms`);
          if (renderMs > 0) parts.push(`render=${renderMs}ms`);

          // ── First UI event offset into this frame ──
          if (entry.firstUIEventTimestamp > 0) {
            const uiEventMs = Math.round(entry.firstUIEventTimestamp - entry.startTime);
            if (uiEventMs >= 0) parts.push(`uiEvent=${uiEventMs}ms`);
          }

          // ── Overlap with concurrent perf entries ──
          const blockStartMs = Math.round(navStart + entry.startTime);
          const blockEndMs = blockStartMs + Math.round(entry.duration);
          const overlapping = this._findOverlappingEntries(blockStartMs, blockEndMs);
          if (overlapping.length > 0) parts.push(`overlap=${overlapping.join(",")}`);

          // ── pashash React render measures overlapping this block ──
          try {
            const measures = performance.getEntriesByType("measure");
            const pashashMeasures = measures.filter((m) => {
              if (!m.name.startsWith("pashash:")) return false;
              const mStart = Math.round(performance.timeOrigin + m.startTime);
              const mEnd = mStart + Math.round(m.duration);
              return mStart < blockEndMs && mEnd > blockStartMs;
            });
            if (pashashMeasures.length > 0) {
              parts.push(`react-measures=${pashashMeasures.map((m) => m.name.replace("pashash:", "")).join(",")}`);
            }
          } catch { /* measure API not supported */ }

          // ── Nearest UI signal fallback (when no invoker) ──
          const nearestSignal = this._findNearestSignal(blockStartMs, 2500, this._currentTraceId ?? undefined);
          const nearestTraceId = nearestSignal?.traceId;
          if (nearestSignal && !parts.some((p) => p.startsWith("invoker="))) {
            const gapMs = Math.max(0, blockStartMs - nearestSignal.ts);
            parts.push(`prev=${nearestSignal.label.slice(0, 60)} gap=${gapMs}ms`);
          }

          this._add({
            level: "longtask",
            category: "longtask",
            label: "LoAF block",
            durationMs: blockMs,
            detail: parts.join(" | "),
            traceId: nearestTraceId,
          });
          // Save pre-block snapshot to IndexedDB so it survives page refresh/crash
          if (blockMs >= 50) this._saveBlockSnapshot(blockMs, "LoAF block", parts.join(" | "));
        }
      });
      obs.observe({ type: "long-animation-frame", buffered: false } as PerformanceObserverInit);
      this._allObservers.push(obs);
    } catch {
      // long-animation-frame not supported — longtask fallback will be used
    }
  }

  // ── Event timing — slow DOM event handlers ───────────────────────────────
  private _startEventObserver() {
    try {
      const obs = new PerformanceObserver((list) => {
        for (const rawEntry of list.getEntries()) {
          const e = rawEntry as unknown as PEventTiming;
          if (e.duration < 50) continue;
          const processingMs = Math.round(e.processingEnd - e.processingStart);
          const inputDelayMs = Math.round(e.processingStart - e.startTime);
          const target = e.target as Element | null;
          const targetDesc = target
            ? `${(target.tagName?.toLowerCase() ?? "unknown")}${target.id ? "#" + target.id : ""}${target.className && typeof target.className === "string" ? "." + target.className.trim().split(/\s+/)[0] : ""}`.slice(0, 40)
            : "?";
          this._add({
            level: "warn",
            category: "other",
            label: `slow:event:${e.name}`,
            durationMs: Math.round(e.duration),
            detail: `processing=${processingMs}ms inputDelay=${inputDelayMs}ms target=${targetDesc}`,
          });
        }
      });
      obs.observe({ type: "event", durationThreshold: 50, buffered: false } as PerformanceObserverInit);
      this._allObservers.push(obs);
    } catch {
      // event observer not supported
    }
  }

  // ── Resource timing — slow network requests ───────────────────────────────
  private _startResourceObserver() {
    try {
      const obs = new PerformanceObserver((list) => {
        for (const rawEntry of list.getEntries()) {
          const res = rawEntry as PerformanceResourceTiming;
          if (res.duration < 400) continue;
          const ttfb = res.responseStart > 0 ? Math.round(res.responseStart - res.requestStart) : null;
          const urlPath = (() => {
            try { return new URL(res.name).pathname.split("/").slice(-3).join("/"); }
            catch { return res.name.slice(-60); }
          })();
          this._add({
            level: "perf",
            category: "db",
            label: `net:${res.initiatorType}:slow`,
            durationMs: Math.round(res.duration),
            detail: [
              ttfb !== null ? `ttfb=${ttfb}ms` : null,
              `url=…/${urlPath}`,
              res.transferSize > 0 ? `${Math.round(res.transferSize / 1024)}KB` : null,
            ].filter(Boolean).join(" "),
          });
        }
      });
      obs.observe({ type: "resource", buffered: true } as PerformanceObserverInit);
      this._allObservers.push(obs);
    } catch {
      // resource observer not supported
    }
  }

  // ── Paint timing — FCP / LCP ──────────────────────────────────────────────
  private _startPaintObserver() {
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // Only record FCP (first-contentful-paint) and FP (first-paint), not duplicates
          const shortName = entry.name.replace("first-contentful-paint", "FCP").replace("first-paint", "FP");
          this._add({
            level: "log",
            category: "other",
            label: `paint:${shortName}`,
            durationMs: Math.round(entry.startTime),
            detail: `${Math.round(entry.startTime)}ms from nav`,
          });
        }
      });
      obs.observe({ type: "paint", buffered: true } as PerformanceObserverInit);
      this._allObservers.push(obs);
    } catch { /* not supported */ }

    // LCP fires multiple times as larger content is found — replace previous entry, keep only final.
    let lcpEntryId: number | null = null;
    try {
      const obs2 = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length === 0) return;
        const lcp = entries[entries.length - 1];
        const newMs = Math.round(lcp.startTime);
        // Remove the previous LCP entry if it exists
        if (lcpEntryId !== null) {
          const idx = this.entries.findIndex((e) => e.id === lcpEntryId);
          if (idx !== -1) this.entries.splice(idx, 1);
        }
        const entry: Omit<DebugEntry, "id" | "ts"> = {
          level: "log",
          category: "other",
          label: "paint:LCP",
          durationMs: newMs,
          detail: `${newMs}ms from nav`,
        };
        // Use internal _add but track the id
        this._add(entry);
        lcpEntryId = this.entries[0]?.id ?? null; // entries is newest-first
      });
      obs2.observe({ type: "largest-contentful-paint", buffered: true } as PerformanceObserverInit);
      this._allObservers.push(obs2);
    } catch { /* not supported */ }
  }

  // ── INP (Interaction to Next Paint) ──────────────────────────────────────
  private _startInpObserver() {
    try {
      const obs = new PerformanceObserver((list) => {
        for (const rawEntry of list.getEntries()) {
          const e = rawEntry as unknown as PEventTiming;
          const dur = Math.round(e.duration);
          if (dur <= 40) continue;
          // Track worst INP seen
          if (dur > this.inp) {
            this.inp = dur;
          }
          // Log interactions that are "needs improvement" (>200ms) or "poor" (>500ms)
          if (dur >= 200) {
            const processingMs = Math.round(e.processingEnd - e.processingStart);
            const inputDelay = Math.round(e.processingStart - e.startTime);
            const presentationDelay = Math.round(e.duration - (e.processingEnd - e.startTime));
            const target = e.target as Element | null;
            const targetDesc = target
              ? `${(target.tagName?.toLowerCase() ?? "unknown")}${target.id ? "#" + target.id : ""}`.slice(0, 30)
              : "?";
            this._add({
              level: dur >= 500 ? "error" : "warn",
              category: "other",
              label: `INP:${e.name}${dur >= 500 ? " (poor)" : " (slow)"}`,
              durationMs: dur,
              detail: `input-delay=${inputDelay}ms processing=${processingMs}ms present=${presentationDelay}ms target=${targetDesc}`,
            });
          }
        }
      });
      obs.observe({ type: "event", durationThreshold: 40, buffered: false } as PerformanceObserverInit);
      this._allObservers.push(obs);
    } catch { /* not supported */ }
  }

  // ── CLS (Cumulative Layout Shift) ─────────────────────────────────────────
  private _startClsObserver() {
    try {
      const obs = new PerformanceObserver((list) => {
        for (const rawEntry of list.getEntries()) {
          const entry = rawEntry as unknown as { hadRecentInput: boolean; value: number };
          if (entry.hadRecentInput) continue; // skip user-triggered shifts
          this.cls = Math.round((this.cls + entry.value) * 10000) / 10000;
          // Alert for significant individual shifts (>0.1 = "needs improvement")
          if (entry.value >= 0.05) {
            this._add({
              level: entry.value >= 0.1 ? "warn" : "log",
              category: "other",
              label: `CLS:shift`,
              durationMs: Math.round(entry.value * 10000) / 100, // use durationMs field for score*100
              detail: `shift=${entry.value.toFixed(4)} cumulative=${this.cls.toFixed(4)}`,
            });
          }
        }
      });
      obs.observe({ type: "layout-shift", buffered: false } as PerformanceObserverInit);
      this._allObservers.push(obs);
    } catch { /* not supported */ }
  }

  // ── Navigation Timing — TTFB, DOM ready, full load ────────────────────────
  private _captureNavigationTiming() {
    const capture = () => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (!nav || nav.loadEventEnd <= 0) return false;

      this.ttfb = Math.round(nav.responseStart - nav.requestStart);
      this.domReady = Math.round(nav.domContentLoadedEventEnd - nav.fetchStart);
      this.pageLoad = Math.round(nav.loadEventEnd - nav.fetchStart);

      const dns = Math.round(nav.domainLookupEnd - nav.domainLookupStart);
      const tcp = Math.round(nav.connectEnd - nav.connectStart);
      const parts = [
        `ttfb=${this.ttfb}ms`,
        `domReady=${this.domReady}ms`,
        `load=${this.pageLoad}ms`,
        dns > 0 ? `dns=${dns}ms` : null,
        tcp > 0 ? `tcp=${tcp}ms` : null,
        nav.transferSize > 0 ? `doc=${Math.round(nav.transferSize / 1024)}KB` : null,
      ].filter(Boolean).join(" ");

      this._add({
        level: "log",
        category: "other",
        label: "nav:timing",
        detail: parts,
      });
      return true;
    };

    // Try immediately, then wait for load event if not ready yet
    if (!capture()) {
      window.addEventListener("load", () => {
        // Give browser a tick to flush timing entries
        setTimeout(capture, 0);
      }, { once: true });
    }
  }

  private _startFpsMeter() {
    const tick = (now: number) => {
      const delta = now - this._lastFrameTime;
      this._lastFrameTime = now;
      if (delta > 0 && delta < 2000) {
        this._frameTimes.push(delta);
        if (this._frameTimes.length > 60) this._frameTimes.shift();
        const avg = this._frameTimes.reduce((a, b) => a + b, 0) / this._frameTimes.length;
        const newFps = Math.min(120, Math.round(1000 / avg));
        if (Math.abs(newFps - this.fps) >= 2) {
          this.fps = newFps;
          this._scheduleNotify();
        }
      }
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  /** Sample FPS + memory into history buffers once per second. */
  private _startHistoryRecorder() {
    if (this._historyInterval !== null) return;
    this._historyInterval = setInterval(() => {
      this.fpsHistory.push(this.fps);
      if (this.fpsHistory.length > 60) this.fpsHistory.shift();
      const mem = (performance as { memory?: { usedJSHeapSize?: number } }).memory;
      if (mem?.usedJSHeapSize) {
        this.memHistory.push(Math.round((mem.usedJSHeapSize / 1024 / 1024) * 10) / 10);
        if (this.memHistory.length > 60) this.memHistory.shift();
      }
    }, 1000);
  }

  private _startLongTaskObserver() {
    try {
      this._observer = new PerformanceObserver((list) => {
        // If LoAF observer is active, it gives richer data — use longtask as lightweight supplement
        for (const entry of list.getEntries()) {
          const absoluteStartTs = Math.round(performance.timeOrigin + entry.startTime);
          const absoluteEndTs = absoluteStartTs + Math.round(entry.duration);

          const nearestSignal = this._findNearestSignal(absoluteStartTs, 2500, this._currentTraceId ?? undefined);
          const gapMs = nearestSignal ? Math.max(0, absoluteStartTs - nearestSignal.ts) : null;

          // Overlap detection: find perf entries running concurrently with this block
          const overlapping = this._findOverlappingEntries(absoluteStartTs, absoluteEndTs);

          // Attribution from TaskAttributionTiming (may be empty in some browsers)
          const attrEntries = (entry as unknown as { attributionEntries?: PTaskAttributionTiming[] })
            .attributionEntries ?? [];
          const attrDetail = attrEntries
            .filter((a) => a.containerType !== "window" || a.containerSrc)
            .map((a) => `${a.containerType}${a.containerSrc ? ":" + this._shortUrl(a.containerSrc) : ""}`)
            .join(",");

          // Library detection from containerSrc
          const libNames = attrEntries
            .map((a) => {
              const src = (a.containerSrc || "").toLowerCase();
              if (src.includes("supabase")) return "supabase";
              if (src.includes("dnd-kit")) return "dnd-kit";
              if (src.includes("react")) return "react";
              if (src.includes("radix")) return "radix";
              if (src.includes("tanstack") || src.includes("react-query")) return "react-query";
              return null;
            })
            .filter(Boolean);

          // Block classification from signal + attribution
          const phase = (performance.now() - entry.startTime) < 5000 ? "initial-load" : "interaction";
          const signalLabel = nearestSignal?.label || "";
          const blockClass = this._classifyBlock(phase, "", signalLabel, []);

          // pashash React render measures overlapping this block
          let pashashMeasuresStr: string | null = null;
          try {
            const measures = performance.getEntriesByType("measure");
            const overlappingMeasures = measures.filter((m) => {
              if (!m.name.startsWith("pashash:")) return false;
              const mStart = Math.round(performance.timeOrigin + m.startTime);
              const mEnd = mStart + Math.round(m.duration);
              return mStart < absoluteEndTs && mEnd > absoluteStartTs;
            });
            if (overlappingMeasures.length > 0) {
              pashashMeasuresStr = overlappingMeasures.map((m) => m.name.replace("pashash:", "")).join(",");
            }
          } catch { /* measure API not supported */ }

          const parts: string[] = [];
          parts.push(`class=${blockClass}`);
          if (nearestSignal) parts.push(`cause=${nearestSignal.label.slice(0, 60)}${gapMs !== null ? ` gap=${gapMs}ms` : ""}`);
          if (overlapping.length > 0) parts.push(`overlap=${overlapping.join(",")}`);
          if (libNames.length > 0) parts.push(`lib=${libNames.join(",")}`);
          if (attrDetail) parts.push(`attr=${attrDetail}`);
          if (pashashMeasuresStr) parts.push(`react-measures=${pashashMeasuresStr}`);

          this._add({
            level: "longtask",
            category: "longtask",
            label: this._hasLoaf ? "JS block (lt)" : "חסימת JS",
            durationMs: Math.round(entry.duration),
            detail: parts.join(" | ") || undefined,
            traceId: nearestSignal?.traceId,
          });
          // Save pre-block snapshot to IndexedDB so it survives page refresh/crash
          this._saveBlockSnapshot(Math.round(entry.duration), this._hasLoaf ? "JS block (lt)" : "חסימת JS", parts.join(" | "));
        }
      });
      this._observer.observe({ entryTypes: ["longtask"] });
    } catch {
      // longtask not supported in this environment
    }
  }
}

export const debugLog = new DebugLog();
/** Backward-compat alias */
export const perf = debugLog;

/**
 * Time an async operation and record it.
 * Pass an optional `getDetail` callback to extract row count / metadata from the result.
 */
export async function timeOp<T>(
  label: string,
  category: PerfCategory,
  fn: () => PromiseLike<T>,
  getDetail?: (result: T) => string | undefined,
): Promise<T> {
  const t0 = performance.now();
  try {
    const result = await fn();
    const dur = Math.round(performance.now() - t0);
    const detail = getDetail ? getDetail(result) : undefined;
    debugLog.record(label, category, dur, detail);
    return result;
  } catch (e) {
    const dur = Math.round(performance.now() - t0);
    const msg = e instanceof Error ? e.message : String(e);
    debugLog.record(label, category, dur, `ERROR: ${msg}`);
    throw e;
  }
}
