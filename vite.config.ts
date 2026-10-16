import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // GitHub Pages serves the site under /lemaan/; local dev and the
  // desktop/android builds (which load from the app bundle root) use "/".
  base: process.env.DEPLOY_TARGET === "pages" ? "/lemaan/" : "/",
  plugins: [react()],
  // הפריסה המקורית (src/classic), שהועתקה אחד לאחד מהאתר הבסיסי: "@/..." בתוך הקוד שלה,
  // ו-"classic-pages/..." — הדפים שלה, שהאתר טוען רק כשבוחרים בה בהגדרות
  resolve: {
    alias: [
      { find: /^classic-pages\/(.*)$/, replacement: fileURLToPath(new URL("./src/classic/pages/", import.meta.url)) + "$1" },
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/classic/", import.meta.url)) },
    ],
  },
  server: { port: 5010 },
});
