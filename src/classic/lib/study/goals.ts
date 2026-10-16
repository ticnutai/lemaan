import type { Goal, ReviewLog } from "./types";

const DAY = 24 * 60 * 60 * 1000;

export function dateKey(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey() {
  return dateKey(Date.now());
}

export interface GoalProgress {
  current: number;
  target: number;
  percent: number; // 0-100
  doneToday: boolean;
}

export function evaluateGoal(goal: Goal, logs: ReviewLog[]): GoalProgress {
  const now = Date.now();
  const today = todayKey();
  const filtered = goal.deckId ? logs.filter((l) => l.deckId === goal.deckId) : logs;

  switch (goal.type) {
    case "daily_reviews": {
      const todayLogs = filtered.filter((l) => dateKey(l.at) === today);
      const current = todayLogs.length;
      return {
        current, target: goal.target,
        percent: Math.min(100, Math.round((current / Math.max(1, goal.target)) * 100)),
        doneToday: current >= goal.target,
      };
    }
    case "daily_cards": {
      const todayLogs = filtered.filter((l) => dateKey(l.at) === today);
      const current = new Set(todayLogs.map((l) => l.cardId)).size;
      return {
        current, target: goal.target,
        percent: Math.min(100, Math.round((current / Math.max(1, goal.target)) * 100)),
        doneToday: current >= goal.target,
      };
    }
    case "success_rate": {
      const window = goal.windowDays ?? 7;
      const since = now - window * DAY;
      const windowLogs = filtered.filter((l) => l.at >= since);
      const correct = windowLogs.filter((l) => l.correct).length;
      const rate = windowLogs.length > 0 ? Math.round((correct / windowLogs.length) * 100) : 0;
      return {
        current: rate, target: goal.target,
        percent: Math.min(100, Math.round((rate / Math.max(1, goal.target)) * 100)),
        doneToday: rate >= goal.target,
      };
    }
    case "streak": {
      // count consecutive days with at least one log, ending today (or yesterday if today empty - still active)
      const days = new Set(filtered.map((l) => dateKey(l.at)));
      let streak = 0;
      let cursor = new Date();
      cursor.setHours(0, 0, 0, 0);
      // if today empty, allow starting from yesterday
      if (!days.has(dateKey(cursor.getTime()))) {
        cursor = new Date(cursor.getTime() - DAY);
      }
      while (days.has(dateKey(cursor.getTime()))) {
        streak++;
        cursor = new Date(cursor.getTime() - DAY);
      }
      return {
        current: streak, target: goal.target,
        percent: Math.min(100, Math.round((streak / Math.max(1, goal.target)) * 100)),
        doneToday: days.has(today),
      };
    }
    case "custom": {
      const dates = goal.manualDoneDates ?? [];
      // target = days completed (e.g. set 30, see how many you've done)
      const current = dates.length;
      return {
        current, target: goal.target,
        percent: Math.min(100, Math.round((current / Math.max(1, goal.target)) * 100)),
        doneToday: dates.includes(today),
      };
    }
    case "shas_daf": {
      // handled separately, but provide basic done check via manualDoneDates
      const dates = goal.manualDoneDates ?? [];
      return {
        current: dates.length, target: goal.target,
        percent: Math.min(100, Math.round((dates.length / Math.max(1, goal.target)) * 100)),
        doneToday: dates.includes(today),
      };
    }
  }
}

// Build a heatmap of last N days based on activity
export function buildHeatmap(logs: ReviewLog[], days = 35) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const counts = new Map<string, number>();
  logs.forEach((l) => {
    const k = dateKey(l.at);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  });
  const cells: { key: string; count: number; date: Date }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY);
    const k = dateKey(d.getTime());
    cells.push({ key: k, count: counts.get(k) ?? 0, date: d });
  }
  return cells;
}
