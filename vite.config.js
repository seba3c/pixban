import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import seoPlugin, { siteOrigin } from "./scripts/seo-plugin.js";
import appInfoPlugin from "./scripts/app-info-plugin.js";
import packageInfo from "./package.json" with { type: "json" };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "SITE_");
  return {
    plugins: [react(), appInfoPlugin(packageInfo), seoPlugin(siteOrigin(env.SITE_URL))],
    build: { license: { fileName: "third-party-licenses.md" } },
  };
});
