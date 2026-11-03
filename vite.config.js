import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import seoPlugin, { siteOrigin } from "./scripts/seo-plugin.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "SITE_");
  return { plugins: [react(), seoPlugin(siteOrigin(env.SITE_URL))] };
});
