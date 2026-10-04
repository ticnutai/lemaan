// צילום עמודי "דפוס מדויק" מהאפליקציה (שרת הפיתוח) — לבדיקת איכות מול הסריקה.
// שימוש: node scripts/daf-pipeline/shot.mjs <Tractate> <outDir> <2a,2b,...> [baseUrl]
import { chromium } from "@playwright/test";
const [tractate, outDir, list, base = "http://localhost:5173"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2 });
async function shoot(amud) {
  await page.goto("about:blank");
  await page.goto(`${base}/#/shas?m=${tractate}&a=${amud}&v=daf`, { waitUntil: "networkidle" });
  const daf = page.locator(".lemaan-print");
  await daf.locator(".daf-pline").first().waitFor({ state: "attached", timeout: 20000 });
  // ממתינים שהדף יתייצב: הגופנים נטענו ומספר השורות לא משתנה
  await page.evaluate(() => document.fonts.ready);
  let prev = -1;
  for (let i = 0; i < 20; i++) {
    const n = await daf.locator(".daf-pline").count();
    if (n === prev) break;
    prev = n;
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await daf.screenshot({ path: `${outDir}/o-${amud}.png` });
}
// עמוד שנתקע: ניסיון נוסף אחד, ואם לא — ממשיכים (review.py מחזיר לו את הפריסה הקודמת)
for (const amud of list.split(",")) {
  try {
    await shoot(amud);
  } catch {
    try {
      await shoot(amud);
    } catch (e) {
      console.error(`${amud}: screenshot failed - ${e.message.split("\n")[0]}`);
    }
  }
}
await browser.close();
