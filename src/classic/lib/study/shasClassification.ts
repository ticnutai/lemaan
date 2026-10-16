import { SHAS_BAVLI } from "./shasData";
import { AMUD_LABELS, PATH_SEP, dafLabel } from "./shasGen";

export type ShasLocation = { masechta: string; daf: number; amud: 1 | 2 };

export function isCompleteShasLocation(
  location: { masechta?: string | null; daf?: number | null; amud?: number | null },
): location is ShasLocation {
  const masechta = SHAS_BAVLI.find((item) => item.name === location.masechta);
  return !!masechta
    && Number.isInteger(location.daf)
    && (location.daf as number) >= 2
    && (location.daf as number) <= masechta.pages + 1
    && (location.amud === 1 || location.amud === 2);
}

export function formatShasLocation(
  location: { masechta?: string | null; daf?: number | null; amud?: number | null },
): string | null {
  if (!isCompleteShasLocation(location)) return null;
  return `${location.masechta} · דף ${dafLabel(location.daf).replace(".", "")} · עמוד ${location.amud === 1 ? "א׳" : "ב׳"}`;
}

/** Canonical category chain used by the existing category tree and publisher. */
export function shasCategoryPath(location: ShasLocation): string[] {
  const masechta = SHAS_BAVLI.find((item) => item.name === location.masechta);
  if (!masechta) return [];
  const dafPath = `${location.masechta}${PATH_SEP}${dafLabel(location.daf)}`;
  const amudPath = `${dafPath}${PATH_SEP}${AMUD_LABELS[location.amud - 1]}`;
  return ['ש"ס', masechta.seder, location.masechta, dafPath, amudPath];
}

export function replaceCategoryTagsWithShasLocation(tags: string[], location: ShasLocation): string[] {
  return [
    ...tags.filter((tag) => !tag.startsWith("cat:")),
    ...shasCategoryPath(location).map((name) => `cat:${name}`),
  ];
}
