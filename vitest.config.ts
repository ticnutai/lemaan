import { defineConfig } from "vitest/config";

// בדיקות מהירות בלי דפדפן: נתוני צורת הדף, החיפוש, עין משפט ופונקציות טהורות.
// (בדיקות הממשק בדפדפן — בתיקייה tests, בכלי הבדיקות של הדפדפן.)
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
