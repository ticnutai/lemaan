import { test } from "@playwright/test";

/** כיול: סופרים שורות גמרא לפי מחלקת רוחב (170/300/430) בפריסה החיה ומשווים לתשובון. */
const TRUTH: Record<string, [number, number, number]> = { "10a": [9, 10, 35], "13b": [28, 12, 17] };

test("calibration — Berakhot 10a & 13b vs print block counts", async ({ page }) => {
  test.skip(!process.env.CALIB, "כלי כיול — הרץ עם CALIB=1");
  await page.goto("/#/");
  await page.waitForTimeout(9000); // ייבוא
  // מצב פריסה חיה (לא דפוס מדויק) דרך ההגדרות
  await page.evaluate(async () => {
    await new Promise<void>((res, rej) => {
      const r = indexedDB.open("lemaan");
      r.onsuccess = () => {
        const db = r.result;
        const tx = db.transaction("settings", "readwrite");
        tx.objectStore("settings").put({ key: "daf-style", value: JSON.stringify({ mode: "live", mainFont: "Vilna", sideFont: "Rashi", scale: 1, nikud: false,
          colors: { main: "#111", inner: "#111", outer: "#111", headers: "#000", highlight: "#ff0" } }) });
        tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
      };
    });
  });
  for (const key of Object.keys(TRUTH)) {
    await page.goto(`/#/shas?m=Berakhot&a=${key}&v=daf`);
    await page.waitForSelector(".lemaan-daf .daf-seg[data-stream='main']", { timeout: 20000 });
    await page.waitForTimeout(1500);
    const counts = await page.evaluate(() => {
      const host = document.querySelector(".lemaan-daf") as HTMLElement;
      const W = host.getBoundingClientRect().width;
      const k = W / 435;
      const main = host.querySelector(".daf-seg[data-stream='main']")!.parentElement!;
      const range = document.createRange();
      range.selectNodeContents(main);
      const rects = Array.from(range.getClientRects());
      // קיבוץ לפי שורה (top)
      const lines = new Map<number, { l: number; r: number }>();
      for (const rc of rects) {
        if (rc.width < 2) continue;
        const key = Math.round(rc.top / (6 * k)) * 6;
        const cur = lines.get(key) ?? { l: Infinity, r: -Infinity };
        cur.l = Math.min(cur.l, rc.left); cur.r = Math.max(cur.r, rc.right);
        lines.set(key, cur);
      }
      const cls = [0, 0, 0]; const widths: number[] = [];
      for (const { l, r } of lines.values()) {
        const w = (r - l) / k; widths.push(Math.round(w));
        const i = [170, 300, 430].map((c, idx) => [Math.abs(c - w), idx]).sort((a, b) => a[0] - b[0])[0][1];
        cls[i]++;
      }
      return { cls, total: lines.size, widths: widths.slice(0, 60) };
    });
    console.log(`${key}: engine narrow/middle/full = ${counts.cls.join("/")} (total ${counts.total}) | truth = ${TRUTH[key].join("/")}`);
    console.log(`   line widths (page px): ${counts.widths.join(" ")}`);
  }
});
