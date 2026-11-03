import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import seoPlugin, { discoveryFiles, renderPage, siteOrigin } from "../scripts/seo-plugin.js";

const origin = "https://pixel.example";

test("SEO origin accepts only an HTTPS origin without a path or credentials", () => {
  assert.equal(siteOrigin(""), "");
  assert.equal(siteOrigin(origin + "/"), origin);
  for (const value of ["http://pixel.example", origin + "/editor", origin + "?test=1", origin + "#test", "https://user:password@pixel.example"])
    assert.throws(() => siteOrigin(value));
});

test("built locale pages expose content without JavaScript and use their own canonical URLs", () => {
  const template = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const root = renderPage(template, "en", origin);
  const plugin = seoPlugin(origin);
  const emitted = [];
  plugin.generateBundle.call({ emitFile: file => emitted.push(file) }, {}, { "index.html": { source: root } });
  const spanish = emitted.find(file => file.fileName === "es/index.html").source;
  for (const [html, lang, path, heading] of [[root, "en", "/", "Pixelate images online"], [spanish, "es", "/es/", "Pixelar imágenes online"]]) {
    assert.match(html, new RegExp(`<html lang="${lang}">`));
    assert.ok(html.includes(`<h1>${heading}</h1>`));
    assert.ok(html.includes(`rel="canonical" href="${origin}${path}"`));
    assert.equal((html.match(/<title /g) || []).length, 1);
    for (const locale of ["en", "es", "x-default"]) assert.ok(html.includes(`hreflang="${locale}"`));
    const schema = JSON.parse(html.match(/type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.equal(schema.inLanguage, lang);
    assert.equal(schema.url, origin + path);
    assert.equal(schema["@type"], "WebApplication");
    assert.ok(!html.includes("noindex"));
    assert.ok(html.includes('<a href="/es/"'));
  }
  assert.ok(emitted.some(file => file.fileName === "sitemap.xml"));
});

test("crawler policy allows search and AI bots and points to an absolute bilingual sitemap", () => {
  const files = discoveryFiles(origin);
  assert.match(files["robots.txt"], /User-agent: \*\nAllow: \/\n/);
  assert.ok(files["robots.txt"].includes(`Sitemap: ${origin}/sitemap.xml`));
  assert.equal((files["sitemap.xml"].match(/<url>/g) || []).length, 2);
  assert.ok(files["sitemap.xml"].includes(`<loc>${origin}/es/</loc>`));
  assert.ok(files["llms.txt"].includes("never uploaded"));
  assert.ok(files["llms.txt"].includes("does not guarantee irreversible anonymization"));
});

test("missing production origin never publishes invented canonical or sitemap URLs", () => {
  const files = discoveryFiles("");
  assert.equal(files["sitemap.xml"], undefined);
  assert.ok(!files["robots.txt"].includes("Sitemap:"));
  const html = renderPage(readFileSync(new URL("../index.html", import.meta.url), "utf8"), "en", "");
  assert.ok(!html.includes('rel="canonical"'));
  assert.ok(html.includes('name="robots" content="index, follow'));
});
