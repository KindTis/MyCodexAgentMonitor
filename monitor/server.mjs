import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AppServerClient } from "./app-server-client.mjs";
import { JsonlTailer, resolveCodexHome } from "./session-log.mjs";
import {
  COLLECTION_INTERVAL_MS,
  SnapshotStore,
} from "./snapshot-store.mjs";

export const HOST = "127.0.0.1";
export const PORT = 4310;

const RETRY_DELAYS_MS = [1000, 2000, 4000, 5000];
const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".woff2", "font/woff2"],
]);
const EMPTY_SNAPSHOT = {
  collectedAt: null,
  lastSuccessfulAt: null,
  connectionStatus: "syncing",
  errorCode: null,
  sessions: [],
};

export function createMonitorServer({ distDir, snapshotProvider }) {
  const root = path.resolve(distDir);
  return http.createServer(async (request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, `http://${HOST}`).pathname);
    } catch {
      return sendText(response, 400, "Bad request");
    }

    if (pathname === "/api/snapshot") {
      if (request.method !== "GET") {
        response.setHeader("allow", "GET");
        return sendText(response, 405, "Method not allowed");
      }
      const body = JSON.stringify(snapshotProvider());
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      });
      return response.end(body);
    }
    if (pathname.startsWith("/api/")) return sendText(response, 404, "Not found");
    if (request.method !== "GET") return sendText(response, 405, "Method not allowed");

    const requestedPath = path.resolve(root, `.${pathname}`);
    if (requestedPath !== root && !requestedPath.startsWith(`${root}${path.sep}`)) {
      return sendText(response, 403, "Forbidden");
    }

    const asset = await readFile(requestedPath);
    if (asset) return sendFile(response, requestedPath, asset);
    if (path.extname(pathname)) return sendText(response, 404, "Not found");

    const indexPath = path.join(root, "index.html");
    const index = await readFile(indexPath);
    return index
      ? sendFile(response, indexPath, index)
      : sendText(response, 404, "Not found");
  });
}

export async function startMonitor({
  distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/client"),
  host = HOST,
  port = PORT,
  open = false,
  appServer = null,
  store = null,
  openBrowserFn = openBrowser,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  let actualStore = store;
  const server = createMonitorServer({
    distDir,
    snapshotProvider: () => actualStore?.snapshot ?? EMPTY_SNAPSHOT,
  });
  await listen(server, { host, port });

  const actualAppServer = appServer ?? new AppServerClient();
  if (!actualStore) {
    const codexHome = resolveCodexHome();
    actualStore = new SnapshotStore({
      appServer: actualAppServer,
      tailer: new JsonlTailer({ codexHome }),
      codexHome,
    });
  }

  const address = server.address();
  const url = `http://${host}:${address.port}`;
  if (open) openBrowserFn(url);

  let stopped = false;
  let collectionTimer = null;
  let retryTimer = null;
  let retryAttempt = 0;

  const scheduleCollection = () => {
    if (stopped) return;
    collectionTimer = setTimeoutFn(async () => {
      collectionTimer = null;
      await collect();
    }, COLLECTION_INTERVAL_MS);
  };

  const scheduleRetry = () => {
    if (stopped) return;
    const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
    retryAttempt += 1;
    retryTimer = setTimeoutFn(async () => {
      retryTimer = null;
      await startAppServer();
    }, delay);
  };

  const handleAppServerFailure = async () => {
    await actualAppServer.stop();
    scheduleRetry();
  };

  const collect = async () => {
    if (stopped) return;
    try {
      const next = actualStore.snapshot.lastSuccessfulAt == null
        ? await actualStore.initialize()
        : await actualStore.collect();
      if (next.errorCode === "APP_SERVER_UNAVAILABLE") {
        await handleAppServerFailure();
        return;
      }
      retryAttempt = 0;
      scheduleCollection();
    } catch {
      actualStore.markError("APP_SERVER_UNAVAILABLE");
      await handleAppServerFailure();
    }
  };

  const startAppServer = async () => {
    if (stopped) return;
    try {
      await actualAppServer.start();
      await collect();
    } catch {
      actualStore.markError("APP_SERVER_UNAVAILABLE");
      await handleAppServerFailure();
    }
  };

  await startAppServer();

  return {
    server,
    store: actualStore,
    url,
    async close() {
      if (stopped) return;
      stopped = true;
      if (collectionTimer != null) clearTimeoutFn(collectionTimer);
      if (retryTimer != null) clearTimeoutFn(retryTimer);
      await closeServer(server);
      await actualAppServer.stop();
    },
  };
}

function openBrowser(url) {
  const child = spawn("cmd.exe", ["/d", "/s", "/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

function listen(server, options) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options, resolve);
  });
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function readFile(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() ? await fs.readFile(filePath) : null;
  } catch {
    return null;
  }
}

function sendFile(response, filePath, body) {
  response.writeHead(200, {
    "content-type": CONTENT_TYPES.get(path.extname(filePath)) ?? "application/octet-stream",
  });
  response.end(body);
}

function sendText(response, status, body) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(body);
}

async function runCli() {
  const runtime = await startMonitor({ open: process.argv.includes("--open") });
  console.log(`My Codex Agent Monitor ready at ${runtime.url}`);
  const shutdown = async () => {
    await runtime.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error.code ?? "MONITOR_START_FAILED");
    process.exitCode = 1;
  });
}
