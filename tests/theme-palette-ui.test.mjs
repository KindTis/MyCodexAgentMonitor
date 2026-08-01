import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("Modern Dark 팔레트는 녹색 없이 상태 역할을 분리한다", () => {
  assert.match(css, /--cyan: #38bdf8;/);
  assert.match(css, /--blue: #718bff;/);
  assert.match(css, /--violet: #a78bfa;/);
  assert.match(css, /\.status-badge--running[\s\S]*?color: var\(--blue\);/);
  assert.match(css, /\.status-badge--complete[\s\S]*?color: var\(--violet\);/);
  assert.match(css, /\.connection-state\.connection-state--connected[\s\S]*?color: var\(--cyan\);/);
  assert.doesNotMatch(css, /--mint|73 213 173|#49d5ad/i);
});
