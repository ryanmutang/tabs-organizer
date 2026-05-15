import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const extensionPath = resolve(".");
const profileDir = await mkdtemp(join(tmpdir(), "tabs-organizer-"));
const remoteDebuggingPort = 49_233;
let chromeProcess;
let stderr = "";

try {
  chromeProcess = spawn(CHROME_PATH, [
    "--headless=new",
    "--disable-gpu",
    `--user-data-dir=${profileDir}`,
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    `--remote-debugging-port=${remoteDebuggingPort}`,
    "about:blank",
  ]);

  chromeProcess.stderr.setEncoding("utf8");
  chromeProcess.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const targets = await waitForTargets(remoteDebuggingPort, () => stderr);
  const extensionTargets = targets.filter((target) =>
    String(target.url || "").startsWith("chrome-extension://")
  );

  if (extensionTargets.length === 0) {
    throw new Error("Chrome did not expose any extension targets.");
  }

  console.log(`Chrome loaded extension targets: ${extensionTargets.length}`);
} finally {
  if (chromeProcess) {
    chromeProcess.kill("SIGTERM");
    await waitForExit(chromeProcess);
  }

  await rm(profileDir, { recursive: true, force: true });
}

async function waitForTargets(port, getStderr) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10_000) {
    try {
      return await fetchJson(`http://127.0.0.1:${port}/json/list`);
    } catch (_error) {
      await sleep(100);
    }
  }

  throw new Error(
    `Timed out waiting for Chrome DevTools endpoint.\n${getStderr().trim()}`
  );
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function waitForExit(childProcess) {
  if (childProcess.exitCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolveExit) => {
    const timeoutId = setTimeout(resolveExit, 2_000);
    childProcess.once("exit", () => {
      clearTimeout(timeoutId);
      resolveExit();
    });
  });
}
