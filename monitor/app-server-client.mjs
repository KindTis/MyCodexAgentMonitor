import { execFile, spawn } from "node:child_process";
import { createInterface } from "node:readline";

const APP_SERVER_COMMAND = "codex.cmd app-server --listen stdio://";
const ALLOWED_METHODS = new Set(["thread/list", "thread/read", "thread/goal/get"]);

export const APP_SERVER_REQUEST_TIMEOUT_MS = 5000;

export class AppServerExitedError extends Error {
  constructor() {
    super("Codex app server exited");
    this.name = "AppServerExitedError";
  }
}

export class AppServerProtocolError extends Error {
  constructor(code = null) {
    super("Codex app server returned an error");
    this.name = "AppServerProtocolError";
    this.code = code;
  }
}

export class AppServerTimeoutError extends Error {
  constructor(method) {
    super(`Codex app server request timed out: ${method}`);
    this.name = "AppServerTimeoutError";
  }
}

function defaultSpawnProcess(command, args, options) {
  return spawn(command, args, options);
}

function defaultTerminateProcessTree(pid) {
  return new Promise((resolve) => {
    execFile(
      "taskkill.exe",
      ["/pid", String(pid), "/t", "/f"],
      { windowsHide: true },
      () => resolve(),
    );
  });
}

export class AppServerClient {
  #spawnProcess;
  #terminateProcessTree;
  #requestTimeoutMs;
  #child = null;
  #reader = null;
  #pending = new Map();
  #nextRequestId = 1;

  constructor({
    spawnProcess = defaultSpawnProcess,
    terminateProcessTree = defaultTerminateProcessTree,
    requestTimeoutMs = APP_SERVER_REQUEST_TIMEOUT_MS,
  } = {}) {
    this.#spawnProcess = spawnProcess;
    this.#terminateProcessTree = terminateProcessTree;
    this.#requestTimeoutMs = requestTimeoutMs;
  }

  async start() {
    if (this.#child) return;

    const child = this.#spawnProcess(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", APP_SERVER_COMMAND],
      {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    this.#child = child;
    this.#reader = createInterface({ input: child.stdout });
    this.#reader.on("line", (line) => this.#handleLine(child, line));
    child.once("exit", () => this.#handleExit(child));
    child.once("error", () => this.#handleExit(child));

    try {
      await this.#send("initialize", {
        clientInfo: {
          name: "my_codex_agent_monitor",
          title: "My Codex Agent Monitor",
          version: "0.0.0",
        },
        capabilities: { experimentalApi: true },
      });
      if (this.#child === child) {
        child.stdin.write(`${JSON.stringify({ method: "initialized" })}\n`);
      }
    } catch (error) {
      await this.#stopChild(child);
      throw error;
    }
  }

  listThreads(params) {
    return this.#request("thread/list", params);
  }

  readThread(threadId) {
    return this.#request("thread/read", { threadId, includeTurns: true });
  }

  getGoal(threadId) {
    return this.#request("thread/goal/get", { threadId });
  }

  async stop() {
    if (this.#child) await this.#stopChild(this.#child);
  }

  #request(method, params) {
    if (!ALLOWED_METHODS.has(method)) {
      return Promise.reject(new AppServerProtocolError("METHOD_NOT_ALLOWED"));
    }
    return this.#send(method, params);
  }

  #send(method, params) {
    const child = this.#child;
    if (!child) return Promise.reject(new AppServerExitedError());

    const id = this.#nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.#pending.delete(id)) return;
        reject(new AppServerTimeoutError(method));
      }, this.#requestTimeoutMs);

      this.#pending.set(id, { resolve, reject, timer });
      try {
        child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
      } catch {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(new AppServerExitedError());
      }
    });
  }

  #handleLine(child, line) {
    if (this.#child !== child) return;

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    const pending = this.#pending.get(message.id);
    if (!pending) return;
    this.#pending.delete(message.id);
    clearTimeout(pending.timer);

    if (message.error) {
      pending.reject(new AppServerProtocolError(message.error.code ?? null));
    } else {
      pending.resolve(message.result);
    }
  }

  #handleExit(child) {
    if (this.#child !== child) return;
    this.#child = null;
    this.#reader?.close();
    this.#reader = null;
    this.#rejectPending(new AppServerExitedError());
  }

  async #stopChild(child) {
    if (this.#child === child) {
      this.#child = null;
      this.#reader?.close();
      this.#reader = null;
      this.#rejectPending(new AppServerExitedError());
    }
    if (child.pid != null) await this.#terminateProcessTree(child.pid);
  }

  #rejectPending(error) {
    for (const { reject, timer } of this.#pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.#pending.clear();
  }
}
