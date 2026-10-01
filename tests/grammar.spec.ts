import { test } from "@playwright/test";
import fs from "node:fs";

/** מעבדת דקדוק: הדף מצויר לפי המספרים — האם גבולות הגושים נופלים על אותן מילים כמו בדפוס? */
const norm = (t: string) => t.replace(/[֑-ׇ]/g, "").replace(/[^א-ת]/g, "");

test("grammar renderer — Berakhot 10a & 13b block boundaries vs print", async ({ page }) => {
  test.skip(!process.env.CALIB, "כלי כיול — הרץ עם CALIB=1");
  const truth = JSON.parse(fs.readFileSync("public/tzurat/print/berakhot.json", "utf-8"));
  for (const key of ["10a", "13b"]) for (const mode of (process.env.MODES ?? "anchors,none").split(",")) {
    await page.evaluate(() => { (window as unknown as { __dafLab?: unknown }).__dafLab = undefined; }).catch(() => {});
    await page.goto(`/#/daf-lab?m=Berakhot&a=${key}&anchors=${mode.startsWith("anchors") ? "1" : "0"}${mode.endsWith("-sefaria") ? "&src=sefaria" : ""}`);
    await page.waitForFunction(() => Array.isArray((window as unknown as { __dafLab?: unknown }).__dafLab), null, { timeout: 30000 });
    await page.waitForTimeout(500);
    const report = (await page.evaluate(() => (window as unknown as { __dafLab: unknown }).__dafLab)) as
      { s: string; w: number; n: number; first: string; last: string; words: number; lines: number; ws: number }[];
    const slabs = (truth[key].slabs as { s: string; t: number; lines?: { t: string }[]; text?: string }[])
      .filter((s) => s.s === "gemara").sort((a, b) => a.t - b.t);
    console.log(`== ${key} (${mode})`);
    const ours = report.filter((r) => r.s === "gemara");
    ours.forEach((r, i) => {
      const tl = slabs[i]?.lines ?? [];
      const tFirst = tl[0]?.t.split(/\s+/)[0] ?? "", tLast = tl[tl.length - 1]?.t.split(/\s+/).slice(-1)[0] ?? "";
      const tWords = tl.reduce((n, l) => n + l.t.split(/\s+/).length, 0);
      const abbr = (print: string, ours: string) => /["׳״']/.test(print) ? norm(ours).startsWith(norm(print).slice(-1)) || norm(ours)[0] === norm(print)[0] : norm(ours) === norm(print);
      const okF = abbr(tFirst, r.first), okL = abbr(tLast, r.last);
      console.log(`   gemara ${r.w}×${r.n}: ours ${r.words} words, ${r.lines} lines (ws ${r.ws}) [${r.first} … ${r.last}] | print ${tWords} words [${tFirst} … ${tLast}] | first ${okF ? "✓" : "✗"} last ${okL ? "✓" : "✗"} lines ${r.lines === r.n ? "✓" : "✗"}`);
    });
    for (const r of report.filter((r) => r.s !== "gemara")) {
      console.log(`   ${r.s} ${r.w}×${r.n}: ${r.words} words, ${r.lines} lines (ws ${r.ws}) [${r.first} … ${r.last}] lines ${r.lines === r.n ? "✓" : "✗"}`);
    }
  }
});
