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

test("연결 상태와 스냅샷 경과 시간은 하단에 한 번만 표시한다", () => {
  const markup = renderToStaticMarkup(createElement(App));
  const footer = markup.slice(markup.indexOf("<footer"), markup.indexOf("</footer>"));

  assert.equal(markup.match(/class="status-badge connection-state /g)?.length, 1);
  assert.match(footer, /Syncing · waiting for first snapshot/);
});
