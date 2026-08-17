import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  server: { middlewareMode: true },
});
const { App } = await server.ssrLoadModule("/src/App.jsx");

test.after(async () => {
  await server.close();
});

test("연결 상태는 경과 시간 없이 상단 요약의 첫 항목으로 표시한다", () => {
  const markup = renderToStaticMarkup(createElement(App));
  const topbar = markup.slice(
    markup.indexOf('<header class="topbar">'),
    markup.indexOf("</header>"),
  );
  const summary = topbar.slice(topbar.indexOf('class="system-summary"'));

  assert.equal(markup.match(/class="summary-item connection-state /g)?.length, 1);
  assert.doesNotMatch(markup, /status-badge connection-state/);
  assert.ok(summary.indexOf("Syncing") < summary.indexOf("0 running"));
  assert.match(
    summary,
    /Syncing<\/span><span class="summary-item summary-item--running summary-separated">/,
  );
  assert.equal(summary.match(/summary-separated/g)?.length, 4);
  assert.doesNotMatch(markup, /waiting for first snapshot|<footer/);
});
