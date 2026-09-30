import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages serves the site under /lemaan/; local dev and the
  // desktop/android builds (which load from the app bundle root) use "/".
  base: process.env.DEPLOY_TARGET === "pages" ? "/lemaan/" : "/",
  plugins: [react()],
  server: { port: 5010 },
});
