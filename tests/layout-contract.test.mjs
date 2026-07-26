import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

function declarations(selector, source = css) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1].replace(/\s+/g, " ");
}

test("상세 DOM은 세 개 논리 열의 합의된 카드 순서를 유지한다", () => {
  const detail = app.slice(
    app.indexOf("function SessionDetail"),
    app.indexOf("export function App"),
  );
  const labels = [
    "Current work",
    "Recent activity",
    "Goal",
    "Child agents",
    "Tasks",
    "Applied skills",
    "Token usage",
  ];
  let previous = -1;
  for (const label of labels) {
    const next = detail.indexOf(` /> ${label}</span>`);
    assert.ok(next > previous, `${label} is out of order`);
    previous = next;
  }
});

test("데스크톱 상세 열과 각 열의 행 비율이 정확하다", () => {
  assert.match(
    declarations(".detail-grid"),
    /grid-template-columns: minmax\(0, 35fr\) minmax\(0, 35fr\) minmax\(0, 30fr\)/,
  );
  assert.match(
    declarations(".detail-column--work"),
    /grid-template-rows: minmax\(0, 2fr\) minmax\(0, 3fr\)/,
  );
  assert.match(
    declarations(".detail-column--agents"),
    /grid-template-rows: minmax\(0, 3fr\) minmax\(0, 7fr\)/,
  );
  assert.match(
    declarations(".detail-column--planning"),
    /grid-template-rows: minmax\(0, 3fr\) minmax\(0, 1fr\) minmax\(0, 1fr\)/,
  );
});

test("데스크톱 상세 카드는 행을 채우고 인접 카드 사이를 구분한다", () => {
  assert.match(declarations(".detail-column"), /gap: 0/);
  assert.match(declarations(".detail-card"), /display: flex/);
  assert.match(declarations(".detail-card"), /flex-direction: column/);

  const divider = declarations(".detail-card + .detail-card");
  assert.match(divider, /padding-top: 13px/);
  assert.match(divider, /border-top: 1px solid var\(--line\)/);

  const scrollerMatch = css.match(
    /\.task-list,\s*\.child-table,\s*\.activity-list\s*\{([^}]+)\}/,
  );
  assert.ok(scrollerMatch, "missing shared detail scroller rule");
  const scroller = scrollerMatch[1].replace(/\s+/g, " ");
  assert.match(scroller, /min-height: 0/);
  assert.match(scroller, /flex: 1/);
  assert.match(scroller, /max-height: none/);
  assert.match(scroller, /overflow-y: auto/);
});

test("1120px 이하에서 행 비율을 해제하고 긴 세 목록만 내부 스크롤한다", () => {
  const responsive = css.slice(
    css.indexOf("@media (max-width: 1120px)"),
    css.indexOf("@media (max-width: 760px)"),
  );
  assert.match(declarations(".detail-column", responsive), /grid-template-rows: none/);
  assert.match(declarations(".detail-column", responsive), /align-content: start/);
  assert.match(
    declarations(".detail-card + .detail-card", responsive),
    /margin-top: 0/,
  );
  for (const selector of [".task-list", ".child-table", ".activity-list"]) {
    assert.match(declarations(selector), /overflow-y: auto/);
  }
  assert.doesNotMatch(declarations(".session-detail"), /overflow-y: auto/);
});
