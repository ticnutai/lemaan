// הדפים של הפריסה המקורית (src/classic/pages) — נבדקים בנפרד (tsconfig.classic.json), ולכן כאן רק הצהרה.
// "classic-pages/..." מוגדר ב-vite.config.ts.
declare module "classic-pages/*" {
  const Page: import("react").ComponentType;
  export default Page;
}
