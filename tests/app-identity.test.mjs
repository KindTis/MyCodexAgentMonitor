import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("uses the formal application identity", () => {
  assert.equal(packageJson.name, "my-codex-agent-monitor");
  assert.match(appSource, /My Codex Agent Monitor/);
  assert.match(appSource, /Demo mode/);
  assert.doesNotMatch(appSource, /Concept prototype|Sample feed|prototype-pill|showPrototype/);
  assert.match(indexSource, /<title>Orbital Dispatch — My Codex Agent Monitor<\/title>/);
  assert.doesNotMatch(indexSource, /concept|prototype|컨셉/i);
});
