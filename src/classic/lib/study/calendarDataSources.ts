import type { GeneralStudyPlan, LearningSession } from "./types";

export const CALENDAR_PLAN_ONLY_SOURCE_LABEL = "מקור נתונים: תוכניות לימוד בלבד";

export function collectPlanSubjectLabelsByDay(
  learningSessions: LearningSession[] | undefined,
  generalPlans: GeneralStudyPlan[] | undefined,
): Map<string, string[]> {
  const subjectsByDay = new Map<string, string[]>();
  const planTitlePrefixes = new Set((generalPlans ?? []).map((p) => `${p.title} — `));

  const isFromPlan = (subject: string) => {
    for (const prefix of planTitlePrefixes) {
      if (subject.startsWith(prefix)) return true;
    }
    return false;
  };

  for (const s of learningSessions ?? []) {
    if (!s.subject) continue;
    if (!isFromPlan(s.subject)) continue;
    const arr = subjectsByDay.get(s.date) ?? [];
    arr.push(s.subject);
    subjectsByDay.set(s.date, arr);
  }

  return subjectsByDay;
}
