import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "vite";
import appInfoPlugin from "../scripts/app-info-plugin.js";

const metadata = { version: "9.8.7-beta.1", repository: { url: "https://github.com/example/another-repo" } };

test("a build embeds the supplied package metadata in client code and version.json", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "pixban-app-info-")));
  try {
    const module = fileURLToPath(new URL("../src/app-info.js", import.meta.url));
    await writeFile(join(root, "index.html"), '<script type="module" src="/main.js"></script>');
    await writeFile(join(root, "main.js"), `import { APP_VERSION, REPOSITORY_URL } from ${JSON.stringify(module)};\nglobalThis.appInfo = { APP_VERSION, REPOSITORY_URL };`);
    const result = await build({
      configFile: false, root, logLevel: "silent", plugins: [appInfoPlugin(metadata)],
      build: { write: false, minify: false, modulePreload: false },
    });
    const version = JSON.parse(result.output.find(file => file.fileName === "version.json").source);
    const context = {};
    runInNewContext(result.output.find(file => file.type === "chunk" && file.isEntry).code, context);
    assert.equal(version.version, metadata.version);
    assert.equal(context.appInfo.APP_VERSION, version.version);
    assert.equal(context.appInfo.REPOSITORY_URL, metadata.repository.url);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("development serves version.json as JSON and leaves unrelated routes alone", () => {
  let handler;
  appInfoPlugin(metadata).configureServer({ middlewares: { use: value => { handler = value; } } });
  const headers = {};
  let body;
  const response = { setHeader: (key, value) => { headers[key] = value; }, end: value => { body = value; } };
  handler({ url: "/version.json?check=1" }, response, () => assert.fail("version route was not handled"));
  assert.equal(headers["Content-Type"], "application/json; charset=utf-8");
  assert.equal(headers["Cache-Control"], "no-cache");
  assert.deepEqual(JSON.parse(body), { version: metadata.version });
  let continued = false;
  handler({ url: "/es/" }, response, () => { continued = true; });
  assert.equal(continued, true);
});
