import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
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

test("상단 요약은 세션·비용·사용량·시간 역할을 개별 색으로 구분한다", () => {
  for (const className of [
    "summary-item--running",
    "summary-item--waiting",
    "summary-item--sessions",
    "summary-stat--tokens",
    "summary-stat--cost",
    "summary-stat--five-hour",
    "summary-stat--one-week",
    "summary-clock",
  ]) {
    assert.match(app, new RegExp(className));
  }

  assert.match(css, /\.summary-item--running[\s\S]*?color: var\(--blue\);/);
  assert.match(css, /\.summary-item--waiting[\s\S]*?color: var\(--amber\);/);
  assert.match(css, /\.summary-item--sessions[\s\S]*?color: var\(--violet\);/);
  assert.match(css, /\.summary-stat--tokens[\s\S]*?color: var\(--cyan\);/);
  assert.match(css, /\.summary-stat--cost[\s\S]*?color: var\(--amber\);/);
  assert.match(css, /\.system-summary time\.summary-clock[\s\S]*?color: var\(--cyan\);/);
});

test("세션 목록과 상세 카드는 정보 역할별 Modern Dark 강조색을 사용한다", () => {
  assert.match(
    css,
    /\.session-agent strong[\s\S]*?color: color-mix\(in srgb, var\(--blue\) 80%, var\(--text\)\);/,
  );
  assert.match(css, /\.session-skills \.metric-value strong[\s\S]*?color: var\(--violet\);/);
  assert.match(css, /\.session-tasks \.metric-value strong[\s\S]*?color: var\(--amber\);/);
  assert.match(css, /\.session-goal \.metric-value strong[\s\S]*?color: var\(--violet\);/);
  assert.match(css, /\.session-subagents \.metric-value strong[\s\S]*?color: var\(--blue\);/);
  assert.match(css, /\.current-work-card[\s\S]*?--detail-accent: var\(--blue\);/);
  assert.match(css, /\.activity-card[\s\S]*?--detail-accent: var\(--cyan\);/);
  assert.match(css, /\.goal-card[\s\S]*?--detail-accent: var\(--violet\);/);
  assert.match(css, /\.task-card[\s\S]*?--detail-accent: var\(--amber\);/);
  assert.match(app, /className="detail-card skills-card"/);
  assert.match(app, /className="detail-card token-card"/);
});
