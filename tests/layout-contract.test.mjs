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

test("데스크톱 목록은 전체 너비의 25%를 사용한다", () => {
  assert.match(
    declarations(".page-content"),
    /grid-template-columns: minmax\(360px, 25%\) minmax\(0, 1fr\)/,
  );
});

test("데스크톱 콘텐츠 상하 여백은 패널 사이 간격과 같은 10px이다", () => {
  const pageContent = declarations(".page-content");
  assert.match(pageContent, /gap: 10px/);
  assert.match(pageContent, /padding: 10px 0/);
});

test("데스크톱 셸은 페이지 스크롤 없이 상단·콘텐츠·상태바를 뷰포트에 배치한다", () => {
  const shell = declarations(".app-shell");
  assert.match(shell, /display: grid/);
  assert.match(shell, /height: 100dvh/);
  assert.match(shell, /grid-template-rows: auto minmax\(0, 1fr\) auto/);
  assert.match(shell, /overflow: hidden/);

  const pageContent = declarations(".page-content");
  assert.match(pageContent, /height: auto/);
  assert.match(pageContent, /min-height: 0/);
  assert.doesNotMatch(pageContent, /100dvh/);

  const detail = declarations(".session-detail");
  assert.match(detail, /min-height: 0/);
  assert.match(detail, /overflow: hidden/);
});

test("1180px 이하의 세로 적층 레이아웃은 데스크톱 높이 제한을 해제한다", () => {
  const responsive = css.slice(
    css.indexOf("@media (max-width: 1180px)"),
    css.indexOf("@media (max-width: 1120px)"),
  );
  const shell = declarations(".app-shell", responsive);
  assert.match(shell, /height: auto/);
  assert.match(shell, /min-height: 100dvh/);
  assert.match(shell, /overflow: visible/);
  assert.match(declarations(".page-content", responsive), /height: auto/);
});

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
    "Plan Tasks",
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
    declarations(".detail-column--context"),
    /grid-template-rows: minmax\(0, 3fr\) minmax\(0, 7fr\)/,
  );
  assert.match(
    declarations(".detail-column--planning"),
    /grid-template-rows: minmax\(0, 3fr\) minmax\(0, 1fr\) minmax\(0, 1fr\)/,
  );
});

test("Modern Dark 핵심 토큰과 읽기 가능한 기본 글자 크기를 사용한다", () => {
  const root = declarations(":root");
  assert.match(root, /--bg: #090c13/);
  assert.match(root, /--panel: #101521/);
  assert.match(root, /--panel-raised: #161c29/);
  assert.match(root, /--text: #f2f5fa/);
  assert.match(root, /--muted: #7c8799/);
  assert.match(root, /--blue: #718bff/);
  assert.match(root, /--cyan: #38bdf8/);
  assert.match(declarations("body"), /font-size: 14px/);
});

test("Child Agent 상세는 60/40 두 행과 50/50·3등분 열을 사용한다", () => {
  const dialog = app.slice(
    app.indexOf("function ChildAgentDialog"),
    app.indexOf("export function ChildAgents"),
  );
  const labels = [
    "Current work",
    "Recent activity",
    "Goal",
    "Tasks",
    "Applied skills",
  ];
  let previous = -1;
  for (const label of labels) {
    const next = dialog.indexOf(` /> ${label}</span>`);
    assert.ok(next > previous, `${label} is out of order`);
    previous = next;
  }

  assert.match(
    declarations(".child-dialog-grid"),
    /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    declarations(".child-dialog-grid"),
    /grid-template-rows: minmax\(0, 3fr\) minmax\(0, 2fr\)/,
  );
  assert.match(
    declarations(".child-dialog-grid > .detail-card"),
    /grid-column: span 2/,
  );
  assert.match(
    css,
    /\.child-dialog-grid > \.child-dialog-current,\s*\.child-dialog-grid > \.activity-card\s*\{[^}]*grid-column: span 3/s,
  );
});

test("Child Agent 상세 카드는 남은 높이를 사용하고 넘치는 내용만 내부 스크롤한다", () => {
  assert.doesNotMatch(
    css,
    /\.child-dialog-grid\s+\.(?:task-list|activity-list)\s*\{[^}]*max-height:/s,
  );
  assert.match(
    declarations(".child-dialog-grid > .detail-card"),
    /overflow-y: auto/,
  );
  const header = declarations(".child-dialog-grid > .detail-card > .card-header");
  assert.match(header, /position: sticky/);
  assert.match(header, /top: 0/);
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

test("글로벌 보드는 데스크톱에서 4열과 레인별 내부 스크롤을 사용한다", () => {
  assert.match(declarations(".global-board"), /overflow: hidden/);
  assert.match(
    declarations(".global-lanes"),
    /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/,
  );
  const cards = declarations(".activity-lane-cards");
  assert.match(cards, /min-height: 0/);
  assert.match(cards, /overflow-y: auto/);
});

test("자식 글로벌 카드는 Child 태그와 에이전트 정보를 양 끝에 배치한다", () => {
  const sharedMatch = css.match(
    /\.global-card-heading,\s*\.global-card-footer\s*\{([^}]+)\}/,
  );
  assert.ok(sharedMatch, "missing shared child card alignment rule");
  const shared = sharedMatch[1].replace(/\s+/g, " ");
  assert.match(shared, /display: flex/);
  assert.match(shared, /justify-content: space-between/);

  const tag = declarations(".global-card-child-tag");
  assert.match(tag, /color: var\(--violet\)/);
  assert.match(tag, /background: rgb\(167 139 250 \/ 10%\)/);

  const identity = declarations(".global-card-child-agent");
  assert.match(identity, /margin-left: auto/);
  assert.match(identity, /text-align: right/);
});

test("글로벌 보드는 적층·작은 화면에서 2열, 모바일에서 1열로 줄어든다", () => {
  const stacked = css.slice(
    css.indexOf("@media (max-width: 1180px)"),
    css.indexOf("@media (max-width: 1120px)"),
  );
  const small = css.slice(
    css.indexOf("@media (max-width: 760px)"),
    css.indexOf("@media (max-width: 470px)"),
  );
  const mobile = css.slice(css.indexOf("@media (max-width: 470px)"));

  assert.match(
    declarations(".global-lanes", stacked),
    /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    declarations(".activity-lane-cards", stacked),
    /overflow-y: visible/,
  );
  assert.match(
    declarations(".global-lanes", small),
    /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    declarations(".global-lanes", mobile),
    /grid-template-columns: minmax\(0, 1fr\)/,
  );
});

test("작은 화면의 세션 목록은 가로 스크롤 없는 4단 카드로 돌아간다", () => {
  const small = css.slice(
    css.indexOf("@media (max-width: 760px)"),
    css.indexOf("@media (max-width: 470px)"),
  );
  assert.match(declarations(".ledger-scroll", small), /overflow-x: hidden/);
  assert.match(declarations(".session-ledger", small), /min-width: 0/);
  assert.match(declarations(".ledger-header", small), /display: none/);
  assert.match(
    declarations(".session-row", small),
    /grid-template-areas: "agent agent state state" "assignment assignment time time" "activity activity activity activity" "skills tasks goal subagents"/,
  );
});
