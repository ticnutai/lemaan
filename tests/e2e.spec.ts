/**
 * חבילת בדיקות ממוספרת — למען
 * ---------------------------------
 * T01–T12 רצות בסדר קבוע על עותק production (vite preview) עם מסד נקי.
 * לכל בדיקת מהירות יש תקציב (budget): חריגה = רגרסיה = הבדיקה נכשלת.
 * המדידות נשמרות ב-test-results/perf.json להשוואה בין ריצות.
 */
import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";

test.describe.configure({ mode: "serial" });

let page: Page;
const perf: Record<string, number> = {};

/** Measure an action's duration in ms, record it under `key`, assert budget. */
async function timed(key: string, budgetMs: number, action: () => Promise<void>) {
  const start = Date.now();
  await action();
  const ms = Date.now() - start;
  perf[key] = ms;
  console.log(`⏱ ${key}: ${ms}ms (תקציב ${budgetMs}ms)`);
  expect(ms, `${key} חרג מהתקציב — רגרסיית מהירות`).toBeLessThan(budgetMs);
}

/**
 * כניסה למרכז התרגול, בראש הבחירה (רשימת הסדרים). הסשן והמקום בבחירה נשמרים
 * במעבר בין מסכים (כדי שאפשר יהיה לפתוח את הגמרא ולחזור), ולכן אם נשאר סשן
 * פעיל או מקום בבחירה מבדיקה קודמת — יוצאים מהם קודם.
 */
async function openStudyCenter() {
  await page.goto("/#/study");
  await page.getByRole("button", { name: /תרגול כללי|^חזרה$|^חזרה לתרגול$/ }).first().waitFor();
  const exit = page.getByRole("button", { name: /^חזרה$|^חזרה לתרגול$/ });
  if (await exit.count()) await exit.first().click();
  await page.getByRole("button", { name: /תרגול כללי/ }).click();
  const top = page.getByRole("navigation", { name: "מיקום" }).getByRole("button", { name: 'ש"ס', exact: true });
  if (await top.count()) await top.click();
  await expect(page.getByRole("button", { name: /^מועד/ })).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});

test.afterAll(async () => {
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync(
    "test-results/perf.json",
    JSON.stringify({ at: new Date().toISOString(), ...perf }, null, 2)
  );
  console.log("📊 perf:", JSON.stringify(perf));
  await page.close();
});

test("T01 — האפליקציה נטענת (מהירות טעינה ראשונה)", async () => {
  await timed("T01_first_load_ms", 5_000, async () => {
    await page.goto("/");
    await expect(page.getByText("מערכת לימוד וחזרות").first()).toBeVisible();
  });
});

test("T02 — ייבוא אוטומטי של המאגר (מהירות עליית הנתונים)", async () => {
  // הייבוא מתחיל לבד בכניסה הראשונה — מודדים עד שכל המאגר נטען.
  await timed("T02_import_22699_ms", 120_000, async () => {
    await expect(page.getByText("22699").first()).toBeVisible({ timeout: 110_000 });
  });
});

test("T03 — נתוני הבית נכונים אחרי ייבוא", async () => {
  await expect(page.getByText("שאלות במאגר")).toBeVisible();
  await expect(page.getByText("22699").first()).toBeVisible();
  await expect(page.getByText("טוען את מאגר השאלות")).toHaveCount(0);
});

test("T04 — עמוד בניית שאלות: טעינה וחיפוש (מהירות שאילתות)", async () => {
  await timed("T04_questions_page_ms", 8_000, async () => {
    await page.goto("/#/questions");
    await expect(page.locator(".card-panel").first()).toBeVisible();
  });
  await timed("T04_search_ms", 5_000, async () => {
    await page.getByPlaceholder(/חיפוש/).fill("חיגר");
    await expect(page.getByText("חיגר").first()).toBeVisible();
  });
});

test("T05 — תרגול כללי: סדר ← מסכת ← דף ← עמוד ← סשן (כמו במקור)", async () => {
  await openStudyCenter();
  // דרילדאון: מועד ← חגיגה ← דף ראשון ← כל הדף
  await page.getByRole("button", { name: /^מועד/ }).click();
  await page.getByRole("button", { name: /^חגיגה/ }).click();
  await page.locator(".grid button.card-panel").first().click();
  await page.getByRole("button", { name: /כל הדף/ }).click();
  await expect(page.getByText(/1 \/ \d+ · תרגול חופשי/)).toBeVisible({ timeout: 15_000 });
  await timed("T05_answer_roundtrip_ms", 3_000, async () => {
    // מצב "מיידי" פעיל כברירת מחדל: בחירת אפשרות עוברת ישר לשאלה הבאה
    const option = page.locator("button.w-full.text-right").first();
    if ((await option.count()) > 0 && (await option.isVisible())) {
      await option.click();
    } else {
      await page.getByRole("button", { name: "הצג תשובה" }).click();
      await page.locator(".grid.grid-cols-4 button").last().click();
    }
    await expect(page.getByText(/2 \/ \d+/)).toBeVisible();
  });
});

test("T06 — סייר הקטגוריות מציג ספירות", async () => {
  await page.goto("/#/categories");
  await expect(page.getByText(/22,?699|שאלות/).first()).toBeVisible({ timeout: 10_000 });
});

test("T07 — בניית מבחנים: בחירת תוכן, יצירה ותרגול חופשי", async () => {
  await page.goto("/#/quiz");
  await page.getByRole("button", { name: /^מועד/ }).click();
  // לחיצה על שם מסכת מוסיפה את כולה למבחן
  await page.getByRole("button", { name: /^חגיגה/ }).first().click();
  await expect(page.getByText(/\d+ שאלות ייכללו במבחן/)).toBeVisible();
  await page.getByPlaceholder(/שם המבחן/).fill("בדיקה אוטומטית");
  await page.getByRole("button", { name: "הוסף מבחן" }).click();
  await expect(page.getByText("בדיקה אוטומטית")).toBeVisible();
  await page.getByRole("link", { name: /תרגול חופשי/ }).first().click();
  await expect(page.getByText(/1 \/ \d+ · תרגול חופשי/)).toBeVisible({ timeout: 15_000 });
});

test("T08 — יעדים: הוספה ומד התקדמות", async () => {
  await page.goto("/#/goals");
  await page.getByRole("button", { name: "הוסף יעד" }).click();
  await expect(page.getByText(/חזרות ביום: 50/)).toBeVisible();
  await expect(page.getByText(/\/ 50/)).toBeVisible();
});

test("T09 — תרגול מבחנים בעמוד התרגול: המבחן מ-T07 מופיע ומתחיל", async () => {
  // הסשן שהתחיל ב-T07 נשמר גם אחרי מעבר למסך אחר (T08) — חוזרים בדיוק אליו
  await expect(page.getByRole("link", { name: /חזרה לתרגול/ })).toBeVisible();
  await page.goto("/#/study");
  await expect(page.getByText(/1 \/ \d+ · תרגול חופשי/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "חזרה", exact: true }).click();
  await page.getByRole("button", { name: /תרגול מבחנים/ }).click();
  await expect(page.getByText("בדיקה אוטומטית")).toBeVisible();
  await page.getByRole("button", { name: /התחל תרגול/ }).first().click();
  await expect(page.getByText(/1 \/ \d+/)).toBeVisible({ timeout: 15_000 });
});

test("T10 — הלוח העברי נטען", async () => {
  await page.goto("/#/calendar");
  await expect(page.getByText("לוח חזרות").first()).toBeVisible();
  // שנה עברית בגימטריה (למשל ה'תשפ"ז) מוכיחה שהלוח העברי חושב בפועל
  await expect(page.locator("main")).toContainText(/תש|תת/);
});

test("T11 — כפתורי ייצוא זמינים", async () => {
  await page.goto("/#/questions");
  await expect(page.getByRole("button", { name: "Excel" })).toBeEnabled({ timeout: 10_000 });
});

test("T13 — הש\"ס המקומי: טעינת דף גמרא עם מפרשים", async () => {
  await page.goto("/#/shas?m=Chagigah&a=3a");
  await timed("T13_gemara_load_ms", 15_000, async () => {
    await expect(page.getByText(/חגיגה · דף/)).toBeVisible({ timeout: 14_000 });
    await expect(page.getByText("רש\"י").first()).toBeVisible();
  });
});

test("T12 — סנכרון ענן: העלאה אמיתית (מהירות עליית נתונים לענן)", async () => {
  await page.goto("/#/settings");
  await timed("T12_cloud_push_ms", 60_000, async () => {
    await page.getByRole("button", { name: "העלאה לענן" }).click();
    await expect(page.getByText(/הנתונים הועלו לענן/)).toBeVisible({ timeout: 55_000 });
  });
});

test("T14 — לוח הש\"ס: סימון עמוד, חזרה, ומצב בחירה", async () => {
  await page.goto("/#/shas-board");
  await expect(page.getByText(/5,410/).first()).toBeVisible();
  // כניסה למסכת ברכות וסימון עמוד ב.
  await page.getByRole("button", { name: /^ברכות/ }).click();
  await expect(page.getByText("מסכת ברכות")).toBeVisible();
  await page.getByRole("button", { name: "ב.", exact: true }).click();
  await expect(page.getByText(/1\/126 עמודים/)).toBeVisible();
  // לחיצה שנייה = חזרה נוספת
  await page.getByRole("button", { name: /^ב\./ }).click();
  await expect(page.getByText("סך חזרות: 2")).toBeVisible();
  // מצב בחירה: בחר הכל ואיפוס מחזיר ל-0
  await page.getByRole("button", { name: "מצב בחירה" }).click();
  await page.getByRole("button", { name: "בחר הכל במסכת" }).click();
  await page.getByRole("button", { name: "איפוס" }).click();
  await expect(page.getByText(/0\/126 עמודים/)).toBeVisible();
});

test("T15 — ניהול: מוסתר בלי חשבון, כפתור הערה בתרגול מבקש כניסה", async () => {
  // עמוד הניהול דורש חשבון
  await page.goto("/#/admin");
  await expect(page.getByText("נדרשת כניסה לחשבון מנהל.")).toBeVisible();
  // ואין "ניהול" בסיידבר כשלא מחוברים
  await expect(page.locator("aside").getByText("ניהול", { exact: true })).toHaveCount(0);
  // כפתור הערה בסשן תרגול מציג דרישת כניסה
  await openStudyCenter();
  await page.getByRole("button", { name: /^מועד/ }).click();
  await page.getByRole("button", { name: /^חגיגה/ }).click();
  await page.locator(".grid button.card-panel").first().click();
  await page.getByRole("button", { name: /כל הדף/ }).click();
  await page.getByRole("button", { name: /הערה על השאלה/ }).click();
  await expect(page.getByText(/שליחת הערות דורשת חשבון/)).toBeVisible();
});

test("T16 — תוכניות לימוד: יצירה מתבנית, סימון היום, מחיקה", async () => {
  await page.goto("/#/");
  await page.getByRole("button", { name: "הוסף תוכנית" }).click();
  await page.getByRole("button", { name: /חומש, תנ"ך, משנה ועוד/ }).click();
  await page.getByRole("button", { name: /חומש — פרק ליום/ }).click();
  await page.getByRole("button", { name: "צור תוכנית" }).click();
  await expect(page.getByText(/היום: פרק 1/)).toBeVisible();
  await page.getByRole("button", { name: "סיימתי" }).click();
  await expect(page.getByText(/היום: פרק 2/)).toBeVisible();
  await expect(page.getByText(/1\/187/)).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByTitle("מחיקת התוכנית").click();
  await expect(page.getByText(/אין תוכניות לימוד פעילות/)).toBeVisible();
  // ווידג'טים: סיכום 7 ימים ומפת חום מוצגים
  await expect(page.getByText("סיכום 7 ימים")).toBeVisible();
  await expect(page.getByText("מפת חום")).toBeVisible();
});

test("T17 — צורת הדף: מנוע הפריסה מצייר גמרא/רש\"י/תוספות וחיפוש מדגיש", async () => {
  await page.goto("/#/shas?m=Chagigah&a=12a");
  await page.getByRole("button", { name: /^צורת הדף/ }).click();
  const daf = page.locator(".lemaan-daf");
  await expect(daf.locator('.daf-seg[data-stream="main"]').first()).toBeVisible({ timeout: 15_000 });
  await expect(daf.locator('.daf-seg[data-stream="inner"]').first()).toBeAttached();
  await expect(daf.locator('.daf-seg[data-stream="outer"]').first()).toBeAttached();
  await page.getByPlaceholder(/חיפוש בדף/).fill("אדם הראשון");
  await expect(page.getByText(/\d+ מופעים/)).toBeVisible();
  await expect(daf.locator("mark.daf-hit").first()).toBeAttached({ timeout: 10_000 });
});

test("T18 — דפוס מדויק (ברכות): שורות הדפוס, בלי תגיות/לטינית, חיפוש וצבע", async () => {
  await page.goto("/#/shas?m=Berakhot&a=10a");
  await page.getByRole("button", { name: /^צורת הדף/ }).click();
  const daf = page.locator(".lemaan-print");
  await expect(daf.locator(".daf-pline").first()).toBeVisible({ timeout: 15_000 });
  // כותרת הדפוס וגושי רש"י/תוספות במקומם
  await expect(daf.getByText("מאימתי פרק ראשון ברכות")).toBeVisible();
  await expect(daf.locator(".daf-print-rashi").first()).toBeVisible();
  await expect(daf.locator(".daf-print-tosafot").first()).toBeVisible();
  // אף שורת גמרא לא גולשת מגוש הדפוס שלה
  const overflowing = await daf.locator(".daf-pline").evaluateAll((els) =>
    els.filter((el) => el.scrollWidth > el.clientWidth + 2 && !(el as HTMLElement).style.transform).length);
  expect(overflowing).toBe(0);
  // אין שום תגית/ישות/אות לטינית בטקסט המוצג
  const text = await daf.innerText();
  expect(text).not.toMatch(/[A-Za-z]|&#|&quot;|<b>|<big>/);
  // חיפוש מדגיש גם בשורות הדפוס
  await page.getByPlaceholder(/חיפוש בדף/).fill("אשרי");
  await expect(daf.locator("mark.daf-hit").first()).toBeAttached({ timeout: 10_000 });
});

test("T19 — חיפוש בכל הדפוס המדויק: סינון לפי זרם, ביטוי חוצה שורה, מעבר לעמוד עם הדגשה", async () => {
  await page.goto("/#/shas");
  const box = page.getByLabel("חיפוש בדפוס המדויק");
  await expect(box).toBeVisible({ timeout: 15_000 });
  // חיפוש ראשון כולל טעינת קובצי החיפוש של כל המסכתות (~10MB דחוס ב-20 מסכתות, יגדל עם הש"ס) —
  // התקציב גדל עם הקורפוס; החיפוש עצמו נמדד בנפרד (T19_print_search_warm_ms) בתקציב קשיח
  await timed("T19_print_search_ms", 6000, async () => {
    await box.fill("אמר רבא");
    await expect(page.getByTestId("print-search-count")).toContainText("תוצאות", { timeout: 15_000 });
  });
  const count = page.getByTestId("print-search-count");
  const firstText = (await count.textContent()) ?? "";
  const all = parseInt(firstText, 10);
  await timed("T19_print_search_warm_ms", 1000, async () => {
    await box.fill("רב פפא");
    await expect(count).not.toHaveText(firstText, { timeout: 5_000 });
    await expect(count).toContainText("תוצאות", { timeout: 5_000 });
  });
  await box.fill("אמר רבא");
  await expect(count).toContainText(`${all} תוצאות`, { timeout: 5_000 });
  expect(all).toBeGreaterThan(10);
  // סינון לתוספות בלבד: פחות תוצאות, וכולן מתוספות
  await page.getByRole("group", { name: "סינון לפי זרם" }).getByRole("button", { name: "תוספות" }).click();
  await expect(page.getByTestId("print-search-count")).not.toContainText(`${all} תוצאות`);
  const labels = await page.locator("ul.divide-y li .text-xs").allTextContents();
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.every((l) => l.includes("תוספות"))).toBe(true);
  // לחיצה על תוצאה פותחת את העמוד בדפוס המדויק עם המילים מודגשות
  await page.locator("ul.divide-y li button").first().click();
  await expect(page.locator(".lemaan-print mark.daf-hit").first()).toBeAttached({ timeout: 15_000 });
});

test("T20 — בית: תוכנית ש\"ס (הבאה לסימון, סיימתי, תרגול העמוד) וכרטיס היום", async () => {
  await page.goto("/#/");
  await expect(page.getByTestId("today-card")).toContainText("ללמוד היום", { timeout: 15_000 });
  await page.getByRole("button", { name: /הוסף תוכנית/ }).click();
  await page.getByLabel("מסכת").selectOption("ברכות");
  await page.getByRole("button", { name: "צור תוכנית" }).click();
  const card = page.getByTestId("plan-card").filter({ hasText: "ברכות" }).first();
  await expect(card).toContainText('הבאה לסימון: ברכות ב\' ע"א');
  await card.getByRole("button", { name: "סיימתי" }).click();
  await expect(card).toContainText('הבאה לסימון: ברכות ב\' ע"ב');
  await expect(page.getByTestId("today-card")).toContainText('ברכות ב\' ע"ב');
  // תרגול העמוד הבא — סשן של השאלות של אותו עמוד
  await card.getByRole("link", { name: /תרגול/ }).click();
  // פירורי הלחם של הסשן: ש"ס › סדר זרעים › ברכות › דף ב › עמוד ב'
  const crumbs = page.getByRole("navigation", { name: "מיקום" });
  await expect(crumbs).toContainText("ברכות", { timeout: 10_000 });
  await expect(crumbs).toContainText("דף ב");
  await expect(crumbs).toContainText("עמוד ב'");
});
