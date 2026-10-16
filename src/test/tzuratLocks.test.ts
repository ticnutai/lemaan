// @vitest-environment node
/**
 * נעילות ("עוגנים") של צורת הדף: זרם שנבדק ונסגר בעמוד — למשל טקסט הגמרא — נשמר כאן כטביעת אצבע, וכל
 * שינוי בו מכשיל את הבדיקה (וכך גם את ההעלאה לאתר). הקובץ src/test/golden/tzurat-locks.json מתעדכן רק דרך
 * daf-work/lock.py: close (נעילה של עמודים שעומדים בכל התנאים) ו-open (פתיחה עם נימוק, נרשמת ביומן).
 * בניגוד לתמונת המצב (tzurat-manifest.json), עדכון של תמונת המצב לא פותח נעילה.
 *
 * סוגים:  gemara — המילים וסדרן;  gemara-layout — התיבות והשורות של הגמרא;  rashi / tosafot — טקסט המפרש.
 * טביעת האצבע זהה לזו של lock.py (fingerprint).
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { describe, it, expect } from "vitest";
import { layouts, lineText } from "./tzurat/data";
import type { PrintLayout } from "../features/daf/PrintDaf";

interface Locks { locks: Record<string, Record<string, Record<string, string>>>; log: unknown[] }

const FILE = path.resolve(__dirname, "golden/tzurat-locks.json");
const locks: Locks = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : { locks: {}, log: [] };

/** JSON קנוני: מפתחות ממוינים, בלי רווחים — כמו json.dumps(sort_keys=True, separators=(",", ":")) */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v as object).sort().map((k) => JSON.stringify(k) + ":" + canonical((v as Record<string, unknown>)[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

export function fingerprint(lay: PrintLayout, kind: string): string {
  let data: string;
  if (kind === "gemara-layout") {
    data = canonical(lay.slabs.filter((sl) => sl.s === "gemara"));
  } else {
    data = lay.slabs.filter((sl) => sl.s === kind).flatMap((sl) => (sl.lines ?? []).map((l) => lineText(l.t))).filter(Boolean).join(" ");
  }
  return crypto.createHash("sha1").update(data, "utf8").digest("hex").slice(0, 16);
}

describe("נעילות צורת הדף", () => {
  it("כל עמוד נעול — הזרם הנעול לא השתנה", () => {
    const changed: string[] = [];
    let n = 0;
    for (const [kind, perSlug] of Object.entries(locks.locks)) {
      for (const [slug, pages] of Object.entries(perSlug)) {
        const lays = layouts(slug);
        for (const [amud, h] of Object.entries(pages)) {
          n++;
          if (!lays[amud]) changed.push(`${kind} ${slug}:${amud} — העמוד נעלם`);
          else if (fingerprint(lays[amud], kind) !== h) changed.push(`${kind} ${slug}:${amud}`);
        }
      }
    }
    // לפתוח נעילה (אחרי בדיקה ועם נימוק): python daf-work/lock.py open <סוג> <מסכת> <עמוד> --why "..."
    expect(changed, `נעילות שנשברו (מתוך ${n})`).toEqual([]);
  }, 120_000);

  it("כל פתיחה ביומן כוללת נימוק", () => {
    const opens = (locks.log as { action: string; why?: string }[]).filter((e) => e.action === "open");
    expect(opens.filter((e) => !e.why || e.why.length < 5)).toEqual([]);
  });
});
