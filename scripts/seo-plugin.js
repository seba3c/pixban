import { localePath, pathLocale, renderHead, renderLanding, seo } from "../src/seo.js";

export function siteOrigin(value = "") {
  if (!value.trim()) return "";
  const url = new URL(value);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password)
    throw new Error("SITE_URL must be an HTTPS origin, for example https://your-domain.com (no path, query or credentials).");
  return url.origin;
}

export function discoveryFiles(origin) {
  return {
    "robots.txt": `# All search and AI crawlers may access this public site.\nUser-agent: *\nAllow: /\n${origin ? `\nSitemap: ${origin}/sitemap.xml\n` : ""}`,
    ...(origin ? {
      "sitemap.xml": `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${["en", "es"].map(lang => `  <url><loc>${origin + localePath(lang)}</loc>${["en", "es", "x-default"].map(locale => `<xhtml:link rel="alternate" hreflang="${locale}" href="${origin + localePath(locale)}" />`).join("")}</url>`).join("\n")}\n</urlset>\n`,
    } : {}),
    "llms.txt": `# pixban\n\n> A free, browser-only image pixelation editor. Images stay on the user's device.\n\n## Pages\n\n- [English editor](${origin}/): ${seo.en.description}\n- [Editor en español](${origin}/es/): ${seo.es.description}\n\n## How it works\n\n${seo.en.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}\n\n## Privacy and limitations\n\n${seo.en.privacy}\n\n${seo.en.caution}\n\nThe editor requires JavaScript and a browser with Canvas support. It has no upload endpoint, remote image API, automatic face detection or batch processing.\n\n## Discovery\n\n- [Crawler policy](${origin}/robots.txt)\n${origin ? `- [Sitemap](${origin}/sitemap.xml)\n` : ""}`,
  };
}

export function renderPage(html, lang, origin) {
  return html.replace(/<html lang="[^"]*">/, `<html lang="${lang}">`)
    .replace(/<!-- seo:start -->[\s\S]*?<!-- seo:end -->/, `<!-- seo:start -->\n    ${renderHead(lang, origin)}\n    <!-- seo:end -->`)
    .replace(/<!-- landing:start -->[\s\S]*?<!-- landing:end -->/, `<!-- landing:start -->${renderLanding(lang)}<!-- landing:end -->`);
}

export default function seoPlugin(origin) {
  const files = discoveryFiles(origin);
  return {
    name: "pixban-seo",
    enforce: "post",
    configResolved(config) {
      if (config.command === "build" && !origin)
        config.logger.warn("SITE_URL is unset: canonical URLs, hreflang and sitemap.xml will be omitted. Set the public HTTPS origin before deploying.");
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split("?")[0].slice(1);
        if (!Object.hasOwn(files, name)) return next();
        res.setHeader("Content-Type", name.endsWith(".xml") ? "application/xml; charset=utf-8" : "text/plain; charset=utf-8");
        res.end(files[name]);
      });
    },
    transformIndexHtml: {
      order: "post",
      handler(html, context) { return renderPage(html, pathLocale(context.originalUrl || context.path), origin); },
    },
    generateBundle(_, bundle) {
      const index = bundle["index.html"];
      if (!index) throw new Error("Missing built index.html");
      this.emitFile({ type: "asset", fileName: "es/index.html", source: renderPage(String(index.source), "es", origin) });
      for (const [fileName, source] of Object.entries(files)) this.emitFile({ type: "asset", fileName, source });
    },
  };
}
