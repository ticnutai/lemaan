/**
 * איזה פירוש מוצג בעמודה הפנימית של צורת הדף (כשאין פריסת דפוס והעמוד נבנה מהטקסט).
 *
 * בדפוס וילנא העמודה הפנימית היא רש"י. בעמודים שאין בהם רש"י — בבא בתרא מפרק "חזקת הבתים" ואילך,
 * שבהם הרשב"ם — הרשב"ם במקומו. קודם העמודה נשארה ריקה בעמודים האלה.
 * עמוד שיש בו רש"י (גם כשיש בו רשב"ם, כמו פסחים צט:–קכא:) לא משתנה: המנוע החי תומך בשני זרמים בלבד.
 */
export interface Commentary { key: string; segments: string[] }

export function innerSegments(commentaries: Commentary[] | undefined): string[] {
  const of = (k: string) => commentaries?.find((c) => c.key === k)?.segments ?? [];
  const rashi = of("rashi");
  return rashi.length ? rashi : of("rashbam");
}

export function outerSegments(commentaries: Commentary[] | undefined): string[] {
  return commentaries?.find((c) => c.key === "tosafot")?.segments ?? [];
}
