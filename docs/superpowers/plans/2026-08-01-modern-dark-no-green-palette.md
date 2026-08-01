# Modern Dark No-Green Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the current Orbital Dispatch layout and behavior while replacing every green, mint, and green-tinted surface with a semantic Modern Dark palette based on indigo, violet, cyan, amber, coral, and slate.

**Architecture:** Keep the existing React component tree and CSS organization. Add one static palette contract test, replace the root color tokens and their status-class consumers in `src/styles.css`, document the durable palette decision in `AGENTS.md`, then capture the two existing product states and refresh the Figma audit board.

**Tech Stack:** React 19, Vite 6, CSS custom properties, Node.js test runner, Playwright-compatible in-app browser, Figma web editor.

## Global Constraints

- Use `#090c13`, `#101521`, `#161c29`, and `#1d2635` for the neutral dark surfaces.
- Running uses `#718bff`; Complete and Planning use `#a78bfa`; Connected and Live use `#38bdf8`.
- Waiting and Syncing use `#f2b95d`; Attention and Error use `#ff7a90`; inactive states use `#7c8799`.
- Do not change layout, copy, data flow, animation behavior, or responsive behavior.
- Preserve text and Phosphor icons so state is never conveyed by color alone.
- Do not modify the user's existing changes in `docs/superpowers/specs/2026-07-29-global-activity-state-board-design.md`.

---

### Task 1: Lock the no-green palette contract

**Files:**
- Create: `tests/theme-palette-ui.test.mjs`
- Test: `tests/theme-palette-ui.test.mjs`

**Interfaces:**
- Consumes: UTF-8 contents of `src/styles.css`.
- Produces: a regression contract for token values, state-role mapping, and removal of the old mint token/RGB triplet.

- [ ] **Step 1: Write the failing palette test**

```js
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
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tests/theme-palette-ui.test.mjs`

Expected: FAIL because `--cyan` is missing and the old `--mint`/`73 213 173` values remain.

- [ ] **Step 3: Keep the failing test for Task 2**

No production code changes belong in this task.

### Task 2: Replace the CSS palette and record the product decision

**Files:**
- Modify: `src/styles.css:1-22`
- Modify: `src/styles.css:176-208`
- Modify: `src/styles.css:353-447`
- Modify: `src/styles.css:574-648`
- Modify: `src/styles.css:751-901`
- Modify: `src/styles.css:1302-1306`
- Modify: `src/styles.css:1680-1752`
- Modify: `AGENTS.md`
- Test: `tests/theme-palette-ui.test.mjs`

**Interfaces:**
- Consumes: existing CSS class names emitted by `src/App.jsx`.
- Produces: `--cyan`, `--amber`, `--violet`, `--blue`, `--red`, and `--slate` semantic tokens used by the unchanged React markup.

- [ ] **Step 1: Replace the root token block**

```css
:root {
  --bg: #090c13;
  --panel: #101521;
  --panel-raised: #161c29;
  --panel-hover: #1d2635;
  --line: #283144;
  --line-strong: #39465a;
  --text: #f2f5fa;
  --secondary: #a8b2c3;
  --muted: #7c8799;
  --faint: #667184;
  --cyan: #38bdf8;
  --amber: #f2b95d;
  --violet: #a78bfa;
  --blue: #718bff;
  --red: #ff7a90;
  --slate: #7c8799;
}
```

- [ ] **Step 2: Apply semantic state colors**

Use `var(--blue)` and `rgb(113 139 255 / …)` for Running and execution motion, `var(--violet)` and `rgb(167 139 250 / …)` for Complete and Planning, `var(--cyan)` and `rgb(56 189 248 / …)` for Connected and Live, and `var(--slate)` for inactive states. Replace green-tinted neutral surfaces such as `#081116`, `#0b151a`, and `#102027` with the neutral dark surface tokens.

- [ ] **Step 3: Record the durable decision**

Append this Product Direction bullet to `AGENTS.md`:

```markdown
- Modern Dark 상태 팔레트에 녹색·민트 계열을 사용하지 않는다. Running은 인디고, Complete/Planning은 바이올렛, Connected/Live는 시안 블루, Waiting/Syncing은 앰버, Attention/Error는 코랄, inactive 상태는 슬레이트를 사용한다.
```

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/theme-palette-ui.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the implementation unit**

```bash
git add AGENTS.md src/styles.css tests/theme-palette-ui.test.mjs
git commit -m "style: replace green accents with modern dark palette"
```

### Task 3: Verify the application and refresh visual evidence

**Files:**
- Modify: `artifacts/quiet-data-studio-implementation.png`
- Create: `artifacts/modern-dark-selected-session.png`
- Modify: Figma file `My Codex Agent Monitor — Modern Dark Color Audit`

**Interfaces:**
- Consumes: the built Vite application and deterministic demo snapshots.
- Produces: verified desktop screenshots for the global activity board and selected-session detail, plus an updated Figma board containing the corrected no-green UI.

- [ ] **Step 1: Run all automated checks**

Run: `npm test`

Expected: all tests pass.

Run: `npm run build`

Expected: exit 0 and `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json` exist.

Run: `npm run test:sites`

Expected: all Sites worker tests pass.

- [ ] **Step 2: Refresh the graph**

Run: `graphify update .`

Expected: AST-only graph update succeeds without changing application behavior.

- [ ] **Step 3: Capture desktop states quietly**

Start the local app without opening a visible terminal window, capture the 1571×819 global board, select a root session, and capture the selected-session detail. Confirm no green or mint accent remains in either image.

- [ ] **Step 4: Refresh the Figma audit board**

Replace the two old screenshots with the verified no-green captures, preserve the 200px horizontal gap and section title, and update the notes to state that the no-green palette has been applied.

- [ ] **Step 5: Final regression check**

Run: `git diff --check`

Expected: no whitespace errors. Confirm `git status --short` contains only intentional implementation artifacts plus the user's pre-existing modified design spec.
