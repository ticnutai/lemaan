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

test("T02 — ייבוא מלא של המאגר (מהירות עליית הנתונים)", async () => {
  await expect(page.getByRole("button", { name: "ייבוא המאגר" })).toBeVisible();
  await timed("T02_import_22699_ms", 120_000, async () => {
    await page.getByRole("button", { name: "ייבוא המאגר" }).click();
    await expect(page.getByText("22699").first()).toBeVisible({ timeout: 110_000 });
  });
});

test("T03 — נתוני הבית נכונים אחרי ייבוא", async () => {
  await expect(page.getByText("שאלות במאגר")).toBeVisible();
  await expect(page.getByText("22699").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "ייבוא המאגר" })).toHaveCount(0);
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

test("T05 — סשן תרגול: שאלה, תשובה, מעבר (מהירות אינטראקציה)", async () => {
  await page.goto("/#/study");
  await page.getByRole("button", { name: /תרגול כללי/ }).click();
  await expect(page.getByText(/שאלה 1 מתוך/)).toBeVisible({ timeout: 15_000 });
  await timed("T05_answer_roundtrip_ms", 3_000, async () => {
    // אמריקאית: בחירת אפשרות → הבא; כרטיסייה: הצג תשובה → דירוג
    const option = page.locator("button.w-full.text-right").first();
    if ((await option.count()) > 0 && (await option.isVisible())) {
      await option.click();
      await page.getByRole("button", { name: "הבא" }).click();
    } else {
      await page.getByRole("button", { name: "הצג תשובה" }).click();
      await page.locator(".grid.grid-cols-4 button").last().click();
    }
    await expect(page.getByText(/שאלה 2 מתוך/)).toBeVisible();
  });
});

test("T06 — סייר הקטגוריות מציג ספירות", async () => {
  await page.goto("/#/categories");
  await expect(page.getByText(/22,?699|שאלות/).first()).toBeVisible({ timeout: 10_000 });
});

test("T07 — חפיסות: יצירה ותרגול ממנה", async () => {
  await page.goto("/#/decks");
  await page.getByPlaceholder(/שם החפיסה/).fill("בדיקה אוטומטית");
  await page.locator("main .card-panel button.rounded-full").first().click();
  await page.getByRole("button", { name: "יצירת חפיסה" }).click();
  await expect(page.getByText("בדיקה אוטומטית")).toBeVisible();
  await page.getByRole("button", { name: "תרגול" }).first().click();
  await expect(page.getByText(/שאלה 1 מתוך/)).toBeVisible({ timeout: 15_000 });
});

test("T08 — יעדים: הוספה ומד התקדמות", async () => {
  await page.goto("/#/goals");
  await page.getByRole("button", { name: "הוסף יעד" }).click();
  await expect(page.getByText(/חזרות ביום: 50/)).toBeVisible();
  await expect(page.getByText(/\/ 50/)).toBeVisible();
});

test("T09 — עמוד מבחן נטען ומתחיל", async () => {
  await page.goto("/#/quiz");
  await page.getByRole("button", { name: /התחל/ }).first().click();
  await expect(page.getByText(/שאלה|נותרו|מתוך/).first()).toBeVisible({ timeout: 15_000 });
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
