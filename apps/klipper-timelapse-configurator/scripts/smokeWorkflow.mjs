import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  buildChromeDebugArgs,
  buildFakeSerialInjection,
  copyLogSmokeSteps,
  copyReportSmokeSteps,
  recoverySmokeSteps,
  s3WorkflowSmokeSteps,
  workflowSmokeSteps
} from "../src/runtime/chromeWorkflowSmoke.js";
import {
  defaultBrowserCandidates,
  selectBrowserPath,
  withCacheBust
} from "../src/runtime/headlessChrome.js";
import { startStaticSmokeServer } from "../src/runtime/staticSmokeServer.js";

const root = resolve(import.meta.dirname, "..");
const staticServer = process.argv[2] ? null : await startStaticSmokeServer({ root });
const url = process.argv[2] || staticServer.url;
const browserPath = selectBrowserPath(defaultBrowserCandidates(process.env), existsSync);

if (!browserPath) {
  console.error("No Chrome or Edge executable found.");
  process.exit(1);
}

if (typeof WebSocket === "undefined") {
  console.error("This smoke test requires a Node runtime with WebSocket support.");
  process.exit(1);
}

const userDataDir = mkdtempSync(resolve(tmpdir(), "esp32-timelapse-workflow-smoke-"));
const remoteDebuggingPort = await getFreePort();
const browser = spawn(browserPath, buildChromeDebugArgs({
  remoteDebuggingPort,
  userDataDir
}), {
  stdio: ["ignore", "ignore", "pipe"]
});

let stderr = "";
browser.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

try {
  const wsUrl = await waitForPageWebSocketUrl(remoteDebuggingPort);
  const cdp = await connectCdp(wsUrl);

  try {
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: buildFakeSerialInjection()
    });

    const loaded = cdp.waitForEvent("Page.loadEventFired", 10_000);
    await cdp.send("Page.navigate", {
      url: withCacheBust(url, `workflow-${Date.now()}`)
    });
    await loaded;
    await waitForExpression(cdp, "document.querySelector('#connectButton') !== null", "app shell");

    for (const step of workflowSmokeSteps({
      wifiSsid: "SmokeSSID",
      wifiPassword: "SmokePassword",
      moonrakerHost: "printer.local"
    })) {
      await evaluate(cdp, step.expression, step.label);
      if (step.waitFor) {
        await waitForExpression(cdp, step.waitFor, step.label, 30_000);
      }
    }
    for (const step of copyLogSmokeSteps({ forbiddenSecret: "SmokePassword" })) {
      await evaluate(cdp, step.expression, step.label);
      if (step.waitFor) {
        await waitForExpression(cdp, step.waitFor, step.label, 30_000);
      }
    }
    const copiedLogText = await evaluate(cdp, "window.__esp32TimelapseClipboardText || ''", "capture copied logs");
    for (const step of copyReportSmokeSteps({ forbiddenSecret: "SmokePassword" })) {
      await evaluate(cdp, step.expression, step.label);
      if (step.waitFor) {
        await waitForExpression(cdp, step.waitFor, step.label, 30_000);
      }
    }
    const copiedReportText = await evaluate(cdp, "window.__esp32TimelapseClipboardText || ''", "capture copied report");
    for (const step of recoverySmokeSteps()) {
      await evaluate(cdp, step.expression, step.label);
      if (step.waitFor) {
        await waitForExpression(cdp, step.waitFor, step.label, 30_000);
      }
    }

    const summary = JSON.parse(await evaluate(cdp, `JSON.stringify({
      browserStatus: document.querySelector("#browserStatus")?.textContent || "",
      boardStatus: document.querySelector("#boardStatus")?.textContent || "",
      safetyStatus: document.querySelector("#safetyStatus")?.textContent || "",
      recoveryStatus: document.querySelector("#recoveryStatus")?.textContent || "",
      dryRunEvents: document.querySelector("#dryRunEvents")?.textContent || "",
      lastLayer: document.querySelector("#lastLayer")?.textContent || "",
      currentFile: document.querySelector("#currentFile")?.textContent || "",
      friendlyLog: document.querySelector("#friendlyLogs")?.textContent || "",
      clipboardText: ${JSON.stringify(copiedLogText)},
      reportText: ${JSON.stringify(copiedReportText)},
      serialOpened: Boolean(window.__esp32TimelapseSerialOpened),
      writes: (window.__esp32TimelapseSerialWrites || []).join("\\n")
    })`, "collect workflow summary"));

    assertSummary(summary);

    const s3Loaded = cdp.waitForEvent("Page.loadEventFired", 10_000);
    await cdp.send("Page.navigate", {
      url: withCacheBust(url, `s3-workflow-${Date.now()}`)
    });
    await s3Loaded;
    await waitForExpression(cdp, "document.querySelector('#connectButton') !== null", "S3 app shell");

    for (const step of s3WorkflowSmokeSteps({
      wifiSsid: "SmokeSSID",
      wifiPassword: "SmokePassword",
      moonrakerHost: "printer.local"
    })) {
      await evaluate(cdp, step.expression, step.label);
      if (step.waitFor) {
        await waitForExpression(cdp, step.waitFor, step.label, 30_000);
      }
    }

    const s3Summary = JSON.parse(await evaluate(cdp, `JSON.stringify({
      boardStatus: document.querySelector("#boardStatus")?.textContent || "",
      safetyStatus: document.querySelector("#safetyStatus")?.textContent || "",
      sonyStatus: document.querySelector("#sonyStatus")?.textContent || "",
      macroSource: document.querySelector("#macroSource")?.textContent || "",
      dryRunEvents: document.querySelector("#dryRunEvents")?.textContent || "",
      lastLayer: document.querySelector("#lastLayer")?.textContent || "",
      currentFile: document.querySelector("#currentFile")?.textContent || "",
      friendlyLog: document.querySelector("#friendlyLogs")?.textContent || "",
      armDisabled: Boolean(document.querySelector("#armButton")?.disabled),
      c3ControlsHidden: Boolean(document.querySelector("#uploadSafeButton")?.hidden),
      s3ControlsVisible: document.querySelector("#provisionS3Button")?.hidden === false,
      writes: window.__esp32TimelapseSerialWrites || []
    })`, "collect S3 workflow summary"));

    assertS3Summary(s3Summary);
    console.log(JSON.stringify({
      ok: true,
      boardStatus: summary.boardStatus,
      safetyStatus: summary.safetyStatus,
      recoveryStatus: summary.recoveryStatus,
      dryRunEvents: summary.dryRunEvents,
      lastLayer: summary.lastLayer,
      currentFile: summary.currentFile,
      clipboardText: summary.clipboardText.length,
      reportText: summary.reportText.length,
      writes: summary.writes.length,
      s3: {
        safetyStatus: s3Summary.safetyStatus,
        sonyStatus: s3Summary.sonyStatus,
        macroSource: s3Summary.macroSource,
        dryRunEvents: s3Summary.dryRunEvents,
        lastLayer: s3Summary.lastLayer,
        writes: s3Summary.writes.length
      }
    }, null, 2));
  } finally {
    await cdp.close();
  }
} catch (error) {
  console.error(error.message);
  if (stderr.trim()) console.error(stderr.trim());
  process.exitCode = 1;
} finally {
  browser.kill();
  await waitForExit(browser, 3000);
  if (staticServer) await staticServer.close();
  rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

function assertSummary(summary) {
  const checks = [
    [summary.serialOpened, "fake serial did not open"],
    [summary.boardStatus.includes("板子已连接"), `unexpected board status: ${summary.boardStatus}`],
    [summary.safetyStatus.includes("已恢复") || summary.safetyStatus.toLowerCase().includes("recovered"), `unexpected safety status: ${summary.safetyStatus}`],
    [summary.recoveryStatus.includes("main.py 已删除") || summary.recoveryStatus.toLowerCase().includes("main.py removed"), `unexpected recovery status: ${summary.recoveryStatus}`],
    [summary.dryRunEvents === "1", `expected one dry-run event, got ${summary.dryRunEvents}`],
    [summary.lastLayer === "236", `expected layer 236, got ${summary.lastLayer}`],
    [summary.currentFile === "workflow-smoke.gcode", `unexpected file: ${summary.currentFile}`],
    [summary.friendlyLog.includes("disabled/dry-run 监听器已上传"), "safe upload log missing"],
    [summary.friendlyLog.includes("dry-run 已启用"), "dry-run enable log missing"],
    [summary.friendlyLog.includes("检测到真实层变化") || summary.friendlyLog.includes("real layer change"), "dry-run event log missing"],
    [summary.clipboardText.includes("__BOARD_LISTENER_EVENT__"), "copied raw log missing board event marker"],
    [summary.clipboardText.includes("workflow-smoke.gcode"), "copied log missing current file"],
    [summary.clipboardText.includes("检测到真实层变化") || summary.clipboardText.includes("real layer change"), "copied friendly log missing dry-run explanation"],
    [!summary.clipboardText.includes("SmokePassword"), "copied log leaked Wi-Fi password"],
    [summary.reportText.includes("ESP32 延时摄影盒子 / Klipper 诊断报告"), "copied diagnostic report missing title"],
    [summary.reportText.includes("安全状态: dry-run"), "copied diagnostic report missing safety state"],
    [summary.reportText.includes("Wi-Fi 密码: ******"), "copied diagnostic report missing redacted password"],
    [summary.reportText.includes("workflow-smoke.gcode"), "copied diagnostic report missing current file"],
    [summary.reportText.includes("__BOARD_LISTENER_EVENT__"), "copied diagnostic report missing raw event marker"],
    [!summary.reportText.includes("SmokePassword"), "copied diagnostic report leaked Wi-Fi password"],
    [summary.writes.includes("/board_listener_config.json"), "config write missing"],
    [summary.writes.includes("os.remove") && summary.writes.includes("/main.py"), "main.py recovery remove command missing"],
    [containsJsonBoolean(summary.writes, "enabled", true), "enabled dry-run config write missing"],
    [containsJsonBoolean(summary.writes, "dry_run", true), "dry-run config write missing"],
    [!containsJsonBoolean(summary.writes, "dry_run", false), "unsafe non-dry-run write detected"]
  ];

  for (const [ok, message] of checks) {
    if (!ok) throw new Error(message);
  }
}

function assertS3Summary(summary) {
  const checks = [
    [summary.boardStatus.includes("板子已连接"), `unexpected S3 board status: ${summary.boardStatus}`],
    [summary.safetyStatus.includes("dry-run"), `unexpected S3 safety status: ${summary.safetyStatus}`],
    [summary.sonyStatus.includes("已连接，可拍摄"), `unexpected Sony status: ${summary.sonyStatus}`],
    [summary.macroSource.includes("ESP32_TIMELAPSE_SHOT"), `unexpected macro source: ${summary.macroSource}`],
    [summary.dryRunEvents === "1", `expected one S3 dry-run event, got ${summary.dryRunEvents}`],
    [summary.lastLayer === "42", `expected S3 layer 42, got ${summary.lastLayer}`],
    [summary.currentFile === "s3-workflow-smoke.gcode", `unexpected S3 file: ${summary.currentFile}`],
    [summary.friendlyLog.includes("第 42 层") && summary.friendlyLog.includes("不会触发快门"), "S3 friendly dry-run explanation missing"],
    [summary.armDisabled, "armed gate should remain disabled without the confirmation phrase"],
    [summary.c3ControlsHidden, "C3 controls should be hidden on the S3 route"],
    [summary.s3ControlsVisible, "S3 controls should be visible on the S3 route"],
    [summary.writes.includes("w SmokeSSID|SmokePassword|printer.local\n"), "S3 provisioning command missing"],
    [summary.writes.includes("q\n"), "first-time Sony pairing command missing"],
    [summary.writes.includes("b\n"), "Sony connect command missing"],
    [summary.writes.includes("d\n"), "S3 dry-run lock command missing"],
    [summary.writes.includes("s\n") && summary.writes.includes("p\n"), "S3 status commands missing"],
    [!summary.writes.includes("a\n"), "unsafe S3 armed command detected"],
    [!summary.writes.includes("t\n"), "unsafe manual Sony shutter command detected"],
    [!summary.writes.some((write) => write.includes("\u0001")), "S3 route unexpectedly entered raw REPL"]
  ];

  for (const [ok, message] of checks) {
    if (!ok) throw new Error(message);
  }
}

function containsJsonBoolean(text, key, value) {
  const escapedPattern = new RegExp(`\\\\?"${key}\\\\?"\\s*:\\s*${value}`);
  return escapedPattern.test(text);
}

async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const waiters = new Map();
  let nextId = 0;

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result || {});
      return;
    }
    const eventWaiters = waiters.get(message.method);
    if (eventWaiters?.length) {
      const waiter = eventWaiters.shift();
      waiter.resolve(message.params || {});
    }
  });

  return {
    send(method, params = {}) {
      const id = ++nextId;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    waitForEvent(method, timeoutMs) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
        const list = waiters.get(method) || [];
        list.push({
          resolve(value) {
            clearTimeout(timer);
            resolve(value);
          }
        });
        waiters.set(method, list);
      });
    },
    close() {
      ws.close();
      return Promise.resolve();
    }
  };
}

async function evaluate(cdp, expression, label) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(`Evaluation failed during ${label}: ${result.exceptionDetails.text}`);
  }
  return result.result?.value;
}

async function waitForExpression(cdp, expression, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, `Boolean(${expression})`, label)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function waitForPageWebSocketUrl(port) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const pages = await httpJson(`http://127.0.0.1:${port}/json/list`);
      const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome is still starting.
    }
    await sleep(100);
  }
  throw new Error("Timed out waiting for Chrome remote debugging endpoint.");
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = "";
      response.setEncoding("utf-8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
