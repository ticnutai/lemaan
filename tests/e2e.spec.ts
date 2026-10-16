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

test("T21 — חלון ניווט הש\"ס הצף: סדר ← מסכת ← דף ← תרגול עמוד", async () => {
  await page.goto("/#/");
  await page.getByRole("button", { name: 'פתיחת ניווט הש"ס' }).click();
  const nav = page.getByRole("dialog", { name: 'ניווט בש"ס' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("button", { name: /סדר מועד/ })).toBeVisible();
  await nav.getByRole("button", { name: /סדר מועד/ }).click();
  await nav.getByRole("button", { name: /^חגיגה/ }).click();
  await nav.locator(".grid > button").first().click();
  // פירורי הלחם בחלון מראים את המסלול
  await expect(nav.getByRole("navigation", { name: "מיקום בניווט" })).toContainText("חגיגה");
  // תרגול עמוד א' — מעבר למסך התרגול, והחלון מתמזער
  await nav.getByRole("button", { name: /תרגול/ }).first().click();
  await expect(page.getByText(/1 \/ \d+ · תרגול חופשי/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("navigation", { name: "מיקום" }).first()).toContainText("עמוד א'");
});

test("T22 — נידה בדפוס מדויק: שורת ציון לזכויות ההוצאה, ורק בנידה", async () => {
  await page.goto("/#/shas?m=Niddah&a=2a&v=daf");
  await expect(page.locator(".lemaan-print .daf-pline").first()).toBeAttached({ timeout: 20_000 });
  await expect(page.getByTestId("print-credit")).toContainText("הוצאת ח. וגשל");
  // במסכת אחרת — אין שורת ציון
  await page.goto("/#/shas?m=Berakhot&a=2a&v=daf");
  await expect(page.locator(".lemaan-print .daf-pline").first()).toBeAttached({ timeout: 20_000 });
  await expect(page.getByTestId("print-credit")).toHaveCount(0);
});

test("T23 — עין משפט: ההפניות להלכה מוצגות בעברית מתחת לדף", async () => {
  await page.goto("/#/shas?m=Kiddushin&a=2a");
  const panel = page.getByTestId("ein-mishpat");
  await expect(panel).toBeVisible({ timeout: 15_000 });
  const toggle = panel.getByRole("button").first();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(panel).toContainText('רמב"ם');
  await expect(panel).toContainText("הלכות יבום וחליצה");
  await expect(panel).toContainText("אבן העזר סימן");
  // אין אנגלית בהפניות
  expect(/[A-Za-z]/.test(await panel.innerText())).toBe(false);
});

test("T24 — הדף היומי של היום: כרטיס במסך הש\"ס שפותח את הדף", async () => {
  await page.goto("/#/shas");
  const card = page.locator(".card-panel").filter({ hasText: "הדף היומי של היום" });
  await expect(card).toBeVisible({ timeout: 15_000 });
  const btn = card.getByRole("button", { name: "פתיחת הדף" });
  if (await btn.count()) {
    await btn.click();
    await expect(page).toHaveURL(/#\/shas\?m=[A-Za-z_]+&a=\d+a/);
  }
});

test("T25 — חיפוש בכל הש\"ס: מחיקת החיפוש בזמן טעינה לא משאירה תוצאות ישנות, ו'מחפש…' לא נתקע", async () => {
  // טעינה ראשונה של הדף — כדי שהמאגר עוד לא נטען כשמקלידים
  await page.goto("/#/");
  await page.reload();
  await page.goto("/#/shas");
  const box = page.getByLabel("חיפוש בדפוס המדויק");
  await box.fill("אמר רבא");
  await page.waitForTimeout(300); // החיפוש מתחיל (אחרי השהיית ההקלדה) ומתחיל לטעון את המאגר
  await box.fill("");
  await page.waitForTimeout(5_000); // זמן מספיק לסיום הטעינה
  await expect(page.locator("ul.divide-y li button")).toHaveCount(0);
  await expect(page.getByText("מחפש…")).toHaveCount(0);
  // וחיפוש חדש אחרי זה עובד כרגיל
  await box.fill("בשוליא דנגרי");
  await expect(page.locator("ul.divide-y li button").first()).toBeVisible({ timeout: 15_000 });
});

test("T26 — הדגשה בדפוס המדויק תואמת לחיפוש: ניקוד, גרש וביטוי שחוצה שורה", async () => {
  // 'קוֹרִין' עם ניקוד בברכות ב. — קודם 0 הדגשות, עכשיו 7 (כמו החיפוש בכל הש"ס)
  await page.goto(`/#/shas?m=Berakhot&a=2a&v=daf&q=${encodeURIComponent("קוֹרִין")}`);
  await expect(page.locator(".lemaan-print .daf-pline").first()).toBeAttached({ timeout: 20_000 });
  await expect(page.locator(".lemaan-print mark.daf-hit")).toHaveCount(7);
  await expect(page.getByText("7 מופעים")).toBeVisible();
  // מילה אחרת באותו עמוד (דרך מסך אחר, כדי שהעמוד ייטען מחדש עם החיפוש החדש)
  await page.goto("/#/");
  await page.goto(`/#/shas?m=Berakhot&a=2a&v=daf&q=${encodeURIComponent("מאימתי")}`);
  await expect(page.locator(".lemaan-print .daf-pline").first()).toBeAttached({ timeout: 20_000 });
  // 5 הדגשות, כולל המילה הפותחת בתיבה המעוטרת — והמונה שווה למספר ההדגשות
  await expect(page.locator(".lemaan-print mark.daf-hit")).toHaveCount(5);
  await expect(page.getByText("5 מופעים")).toBeVisible();
});

test("T27 — חלון עיצוב טיפוגרפיה בתרגול: שאלות ותשובות, כל האפשרויות, נשמר", async () => {
  await openStudyCenter();
  await page.getByRole("button", { name: /^מועד/ }).click();
  await page.getByRole("button", { name: /^חגיגה/ }).click();
  await page.locator(".grid button.card-panel").first().click();
  await page.getByRole("button", { name: /כל הדף/ }).click();
  await expect(page.getByText(/1 \/ \d+ · תרגול חופשי/)).toBeVisible({ timeout: 15_000 });

  const questionText = page.locator(".gold-frame p.font-medium").first();
  await expect(questionText).toHaveCSS("font-size", "18px");

  await page.getByRole("button", { name: "עיצוב טיפוגרפיה" }).click();
  const dialog = page.getByRole("dialog", { name: "עיצוב טיפוגרפיה" });
  await expect(dialog).toBeVisible();
  for (const label of ["גופן", "גודל גופן", "עובי גופן", "גובה שורה", "רווח בין אותיות", "יישור", "צבע טקסט", "רקע", "עיגול פינות"]) {
    await expect(dialog.getByText(label, { exact: true }).first()).toBeVisible();
  }

  // שאלות: גודל +2, מודגש, יישור למרכז — משתנה מיד בכרטיס
  await dialog.getByRole("button", { name: "הגדלה" }).click();
  await dialog.getByRole("button", { name: "הגדלה" }).click();
  await dialog.getByRole("button", { name: "מודגש", exact: true }).click();
  await dialog.getByRole("button", { name: "מרכז" }).click();
  await expect(questionText).toHaveCSS("font-size", "20px");
  await expect(questionText).toHaveCSS("font-weight", "700");
  await expect(questionText).toHaveCSS("text-align", "center");
  await dialog.screenshot({ path: "test-results/typography-question.png" });

  // מקש "1" כשהחלון פתוח לא בוחר תשובה
  await page.keyboard.press("1");
  await expect(page.locator("[data-result]")).toHaveCount(0);

  // תשובות: לשונית נפרדת, ההגדלה חלה רק על האפשרויות
  await dialog.getByRole("tab", { name: "תשובות" }).click();
  await expect(dialog.getByText("עיצוב טקסט תשובות")).toBeVisible();
  await dialog.getByRole("button", { name: "הגדלה" }).click();
  const optionText = page.locator("button[class*='rounded-lg'] span.flex-1").first();
  if (await optionText.count()) await expect(optionText).toHaveCSS("font-size", "15px");
  await dialog.screenshot({ path: "test-results/typography-answer.png" });

  // נשמר אחרי טעינה מחדש
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.reload();
  await openStudyCenter();
  await page.getByRole("button", { name: /^מועד/ }).click();
  await page.getByRole("button", { name: /^חגיגה/ }).click();
  await page.locator(".grid button.card-panel").first().click();
  await page.getByRole("button", { name: /כל הדף/ }).click();
  await expect(page.locator(".gold-frame p.font-medium").first()).toHaveCSS("font-size", "20px", { timeout: 15_000 });

  // איפוס בשתי הלשוניות — חוזר לברירת המחדל
  await page.getByRole("button", { name: "עיצוב טיפוגרפיה" }).click();
  await dialog.getByRole("button", { name: /איפוס/ }).click();
  await dialog.getByRole("tab", { name: "תשובות" }).click();
  await dialog.getByRole("button", { name: /איפוס/ }).click();
  await dialog.getByRole("button", { name: "סגירה" }).click();
  await expect(page.locator(".gold-frame p.font-medium").first()).toHaveCSS("font-size", "18px");
  await page.waitForTimeout(500);
});

test("T28 — פריסה מקורית: כפתור בהגדרות מחליף את עמוד הבית ואת לשונית התרגול, והתשובות נשמרות באותו מסד", async () => {
  await page.goto("/#/settings");
  await page.getByRole("radio", { name: /הפריסה המקורית/ }).click();
  await expect(page.getByRole("radio", { name: /הפריסה המקורית/ })).toHaveAttribute("aria-checked", "true");

  // עמוד הבית המקורי: הכותרת ורשת הרכיבים
  await page.goto("/#/");
  await expect(page.getByText("עקוב אחר ההתקדמות שלך וקבל תובנות מתקדמות")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("תוכניות לימוד").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("ערוך פריסה")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/classic-home.png", fullPage: true });

  // לשונית התרגול המקורית: סדר ← מסכת ← דף ← עמוד ← תרגול
  await page.goto("/#/study");
  await page.locator(".classic-layout").getByRole("button", { name: /^תרגול כללי/ }).click();
  await page.locator(".classic-layout").getByRole("button", { name: /^מועד/ }).first().click();
  await page.locator(".classic-layout").getByRole("button", { name: /^חגיגה/ }).first().click();
  await page.locator(".classic-layout").getByRole("button", { name: /^ב\s*\d/ }).first().click();
  await page.locator(".classic-layout").getByRole("button", { name: /^עמוד א/ }).first().click();
  await expect(page.getByText("שאלות זמינות לעמוד זה")).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: "test-results/classic-amud.png", fullPage: true });

  const logsBefore = await page.evaluate(() => new Promise<number>((res) => {
    const r = indexedDB.open("lemaan");
    r.onsuccess = () => { const q = r.result.transaction("reviewLogs").objectStore("reviewLogs").count(); q.onsuccess = () => { res(q.result); r.result.close(); }; };
  }));
  await page.locator(".classic-layout").getByRole("button", { name: "תרגול", exact: true }).click();
  await expect(page.getByText(/1 \/ \d+ · תרגול חופשי/)).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: "test-results/classic-session.png", fullPage: true });
  await page.locator(".classic-layout").getByRole("button", { name: /^א\s/ }).first().click();
  await expect(page.getByText(/2 \/ \d+ · תרגול חופשי/)).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => new Promise<number>((res) => {
    const r = indexedDB.open("lemaan");
    r.onsuccess = () => { const q = r.result.transaction("reviewLogs").objectStore("reviewLogs").count(); q.onsuccess = () => { res(q.result); r.result.close(); }; };
  }))).toBe(logsBefore + 1);

  // חזרה לפריסה הנוכחית
  await page.goto("/#/settings");
  await page.getByRole("radio", { name: /הפריסה הנוכחית/ }).click();
  await page.goto("/#/");
  await expect(page.getByText("שאלות במאגר").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("ערוך פריסה")).toHaveCount(0);
});

test("T29 — פריסה מקורית: גרירה עם טקסט צף — סיווג לעמוד ב׳, סידור בין השאלות, וחזרה ל'כל הדף'", async () => {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 1280, height: 1500 }); // מסך גבוה: הכפתורים והשאלות נראים יחד
  await page.goto("/#/settings");
  await page.getByRole("radio", { name: /הפריסה המקורית/ }).click();
  await page.goto("/#/study");
  const root = page.locator(".classic-layout");
  await root.getByRole("button", { name: /^תרגול כללי/ }).click();
  await root.getByRole("button", { name: /^מועד/ }).first().click();
  await root.getByRole("button", { name: /^חגיגה/ }).first().click();
  await root.getByRole("button", { name: /^ב\s*\d/ }).first().click();
  await root.getByTestId("inline-amud-all").click();
  await expect(root.getByTestId("inline-amud-all")).toHaveAttribute("aria-pressed", "true");

  const rows = root.locator("[data-card-row]");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  const total = await rows.count();
  const countB0 = Number(await root.getByTestId("inline-amud-2-count").innerText());
  const countA0 = Number(await root.getByTestId("inline-amud-1-count").innerText());

  const drag = async (from: import("@playwright/test").Locator, to: import("@playwright/test").Locator, below = false) => {
    await to.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const a = (await from.boundingBox())!;
    const b = (await to.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
    await expect(page.locator("[data-question-drag-ghost]")).toBeVisible();
    await page.mouse.move(b.x + b.width / 2, b.y + (below ? b.height * 0.8 : b.height * 0.2), { steps: 12 });
    await page.mouse.up();
    await expect(page.locator("[data-question-drag-ghost]")).toHaveCount(0);
  };
  const grip = (row: import("@playwright/test").Locator) => row.locator("[role=button][aria-label^='גרירה']");

  // 1. סיווג לעמוד ב׳: השאלה עוברת לקבוצת עמוד ב׳ ויוצאת מעמוד א׳
  const first = rows.first();
  const firstId = await first.getAttribute("data-card-row");
  await drag(grip(first), root.getByTestId("inline-amud-2"));
  await expect(root.locator(`[data-card-row="${firstId}"]`)).toHaveAttribute("data-card-amud", "2");
  await expect(root.getByTestId("inline-amud-1-count")).toHaveText(String(countA0 - 1));
  await expect(root.getByTestId("inline-amud-2-count")).toHaveText(String(countB0));
  await expect(rows).toHaveCount(total);

  // 2. סידור: השאלה האחרונה ברמת הדף עוברת לראש הקבוצה שלה
  const dafRows = root.locator("[data-card-row][data-card-amud='0']");
  const lastId = await dafRows.last().getAttribute("data-card-row");
  await drag(grip(dafRows.last()), dafRows.first());
  await expect(dafRows.first()).toHaveAttribute("data-card-row", lastId!);

  // 3. חזרה ל"כל הדף": השאלה לא משויכת יותר לעמוד
  await drag(grip(root.locator(`[data-card-row="${firstId}"]`)), root.getByTestId("inline-amud-all"));
  await expect(root.locator(`[data-card-row="${firstId}"]`)).toHaveAttribute("data-card-amud", "0");
  await expect(root.getByTestId("inline-amud-1-count")).toHaveText(String(countA0));
  await page.screenshot({ path: "test-results/classic-drag.png", fullPage: true });

  await page.goto("/#/settings");
  await page.getByRole("radio", { name: /הפריסה הנוכחית/ }).click();
  if (size) await page.setViewportSize(size);
});

test("T30 — שולחן ערוך: 652 שאלות נוספו לכולם, ותיבות מתחלפות עד הסעיף בשתי הפריסות", async () => {
  // החבילה נטענת לבד אחרי המאגר הראשי
  await expect.poll(() => page.evaluate(() => new Promise<string | undefined>((res) => {
    const r = indexedDB.open("lemaan");
    r.onsuccess = () => { const q = r.result.transaction("settings").objectStore("settings").get("pack:sa-oc-shabbat"); q.onsuccess = () => { res(q.result?.value); r.result.close(); }; };
  })), { timeout: 30_000 }).toBe("1");

  const drill = async (root: import("@playwright/test").Locator) => {
    const box = root.getByTestId("category-drilldown");
    await expect(box).toBeVisible({ timeout: 15_000 });
    // הרכיב זוכר את המקום האחרון — מתחילים מהשורש
    const rootCrumb = box.getByRole("navigation", { name: "מיקום" }).getByRole("button", { name: "שולחן ערוך" });
    if (await rootCrumb.count()) await rootCrumb.click();
    for (const name of ["אורח חיים", "הלכות שבת", "סימן רמ״ב", "סעיף א׳"]) {
      if (name === "סימן רמ״ב") await box.screenshot({ path: "test-results/sa-simanim.png" });
      await box.getByTestId("drilldown-tile").filter({ hasText: name }).first().click();
    }
    await expect(box.getByText("האם מצוות עונג שבת מדאורייתא או מדרבנן")).toBeVisible();
    await expect(box.getByRole("navigation", { name: "מיקום" })).toContainText("סעיף א׳");
    return box;
  };

  // הפריסה הנוכחית
  await openStudyCenter();
  await page.getByRole("button", { name: "שולחן ערוך" }).click();
  await expect(page.getByTestId("category-drilldown").getByRole("button", { name: /תרגול כל השאלות כאן \(652\)/ })).toBeVisible({ timeout: 15_000 });
  const box = await drill(page.locator("body"));
  await box.getByRole("button", { name: /תרגול כל השאלות כאן/ }).click();
  await expect(page.getByText(/1 \/ 1 · תרגול חופשי/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("האם מצוות עונג שבת מדאורייתא או מדרבנן")).toBeVisible();
  await page.getByRole("button", { name: /^חזרה$/ }).click();

  // הפריסה המקורית — אותו מידע, אותו רכיב
  await page.goto("/#/settings");
  await page.getByRole("radio", { name: /הפריסה המקורית/ }).click();
  await page.goto("/#/study");
  const classic = page.locator(".classic-layout");
  await classic.getByRole("radio", { name: /שולחן ערוך/ }).click();
  await classic.getByRole("button", { name: /^תרגול כללי/ }).click();
  const cbox = await drill(classic);
  await cbox.getByRole("button", { name: /תרגול כל השאלות כאן/ }).click();
  await expect(classic.getByText("האם מצוות עונג שבת מדאורייתא או מדרבנן").first()).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: "test-results/sa-classic-session.png", fullPage: true });

  await page.goto("/#/settings");
  await page.getByRole("radio", { name: /הפריסה הנוכחית/ }).click();
});

test("T31 — שאלות פתוחות: בחירה בין רשימה נפתחת לכרטיסים מתהפכים, נשמרת ומשותפת לשתי הפריסות", async () => {
  const toSeif = async (root: import("@playwright/test").Locator) => {
    const box = root.getByTestId("category-drilldown");
    await expect(box).toBeVisible({ timeout: 15_000 });
    const rootCrumb = box.getByRole("navigation", { name: "מיקום" }).getByRole("button", { name: "שולחן ערוך" });
    if (await rootCrumb.count()) await rootCrumb.click();
    for (const name of ["אורח חיים", "הלכות שבת", "סימן רמ״ג", "סעיף א׳"]) {
      await box.getByTestId("drilldown-tile").filter({ hasText: name }).first().click();
    }
    return box.getByTestId("open-question-list");
  };

  await openStudyCenter();
  await page.getByRole("button", { name: "שולחן ערוך" }).click();
  const list = await toSeif(page.locator("body"));
  await expect(list).toHaveAttribute("data-view", "list");

  // כרטיסים מתהפכים
  await list.getByRole("radio", { name: "כרטיסים מתהפכים" }).click();
  await expect(list).toHaveAttribute("data-view", "flip");
  const card = list.getByTestId("flip-card").first();
  await expect(card).toHaveAttribute("aria-pressed", "false");
  await card.screenshot({ path: "test-results/flip-front.png" });
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(700);
  await card.screenshot({ path: "test-results/flip-back.png" });
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "false");

  // הבחירה נשמרת ומשותפת: גם בפריסה המקורית מופיעים כרטיסים
  await page.goto("/#/settings");
  await page.getByRole("radio", { name: /הפריסה המקורית/ }).click();
  await page.goto("/#/study");
  const classic = page.locator(".classic-layout");
  await classic.getByRole("radio", { name: /שולחן ערוך/ }).click();
  await classic.getByRole("button", { name: /^תרגול כללי/ }).click();
  const clist = await toSeif(classic);
  await expect(clist).toHaveAttribute("data-view", "flip");

  // חזרה לרשימה נפתחת
  await clist.getByRole("radio", { name: "רשימה נפתחת" }).click();
  await expect(clist).toHaveAttribute("data-view", "list");
  await page.goto("/#/settings");
  await page.getByRole("radio", { name: /הפריסה הנוכחית/ }).click();
});
