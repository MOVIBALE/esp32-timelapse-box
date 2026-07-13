import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChromeDebugArgs,
  buildFakeSerialInjection,
  copyLogSmokeSteps,
  copyReportSmokeSteps,
  recoverySmokeSteps,
  s3WorkflowSmokeSteps,
  workflowSmokeSteps
} from "./chromeWorkflowSmoke.js";

test("buildChromeDebugArgs launches isolated headless Chrome with remote debugging", () => {
  const args = buildChromeDebugArgs({
    remoteDebuggingPort: 49152,
    userDataDir: "C:/tmp/esp32-timelapse-smoke"
  });

  assert.ok(args.includes("--headless=new"));
  assert.ok(args.includes("--disable-gpu"));
  assert.ok(args.includes("--no-first-run"));
  assert.ok(args.includes("--remote-debugging-port=49152"));
  assert.ok(args.includes("--user-data-dir=C:/tmp/esp32-timelapse-smoke"));
  assert.equal(args.at(-1), "about:blank");
});

test("buildFakeSerialInjection stubs Web Serial and records writes without real hardware", () => {
  const source = buildFakeSerialInjection({
    usbVendorId: 0x303a,
    usbProductId: 0x1001
  });

  assert.match(source, /navigator,\s*"serial"/);
  assert.match(source, /requestPort:\s*async/);
  assert.match(source, /__esp32TimelapseSerialWrites/);
  assert.match(source, /__esp32TimelapseClipboardText/);
  assert.match(source, /writeText:\s*async/);
  assert.match(source, /usbVendorId:\s*12346/);
  assert.match(source, /usbProductId:\s*4097/);
  assert.doesNotMatch(source, /COM6/);
});

test("workflowSmokeSteps keeps the browser smoke on the safe dry-run path", () => {
  const steps = workflowSmokeSteps({
    wifiSsid: "Studio",
    wifiPassword: "secret",
    moonrakerHost: "printer.local"
  });

  assert.ok(steps.some((step) => step.label === "select compatible C3 route"));
  assert.ok(steps.some((step) => step.label === "connect fake serial"));
  assert.ok(steps.some((step) => step.label === "upload disabled dry-run"));
  assert.ok(steps.some((step) => step.label === "enable dry-run"));
  assert.ok(steps.some((step) => step.label === "emit dry-run layer event"));
  assert.equal(steps.some((step) => /arm|armed/i.test(step.label)), false);
  assert.equal(steps.some((step) => step.expression.includes("armButton")), false);
  assert.equal(steps.some((step) => step.expression.includes("ARM DRY-RUN VERIFIED")), false);
});

test("s3WorkflowSmokeSteps provisions and observes without arming", () => {
  const steps = s3WorkflowSmokeSteps({
    wifiSsid: "Studio",
    wifiPassword: "secret",
    moonrakerHost: "printer.local"
  });

  assert.ok(steps.some((step) => step.label === "provision S3 network"));
  assert.ok(steps.some((step) => step.label === "pair Sony without shooting"));
  assert.ok(steps.some((step) => step.label === "connect paired Sony"));
  assert.ok(steps.some((step) => step.label === "emit S3 ready statuses"));
  assert.ok(steps.some((step) => step.label === "emit S3 dry-run macro event"));
  assert.equal(steps.some((step) => /arm|armed/i.test(step.label)), false);
  assert.equal(steps.some((step) => step.expression.includes("armButton")), false);
  assert.equal(steps.some((step) => step.expression.includes("buildArmCommand")), false);
  const pairingStep = steps.find((step) => step.label === "pair Sony without shooting");
  assert.match(pairingStep.waitFor, /includes\("q\\n"\)/);
  assert.match(pairingStep.waitFor, /!.*includes\("t\\n"\)/s);
  assert.match(pairingStep.waitFor, /!.*includes\("a\\n"\)/s);
});

test("copyLogSmokeSteps verifies friendly and raw logs are copied without secrets", () => {
  const steps = copyLogSmokeSteps({
    forbiddenSecret: "SmokePassword"
  });

  assert.ok(steps.some((step) => step.label === "copy logs"));
  assert.ok(steps.some((step) => step.waitFor?.includes("__esp32TimelapseClipboardText")));
  assert.ok(steps.some((step) => step.waitFor?.includes("__BOARD_LISTENER_EVENT__")));
  assert.ok(steps.some((step) => step.waitFor?.includes("workflow-smoke.gcode")));
  assert.ok(steps.some((step) => step.waitFor?.includes("SmokePassword")));
  assert.equal(steps.some((step) => /arm|armed/i.test(step.label)), false);
  assert.equal(steps.some((step) => step.expression.includes("armButton")), false);
});

test("copyReportSmokeSteps verifies a redacted diagnostic report is copied", () => {
  const steps = copyReportSmokeSteps({
    forbiddenSecret: "SmokePassword"
  });

  assert.ok(steps.some((step) => step.label === "copy diagnostic report"));
  assert.ok(steps.some((step) => step.waitFor?.includes("ESP32 延时摄影盒子 / Klipper 诊断报告")));
  assert.ok(steps.some((step) => step.waitFor?.includes("安全状态: dry-run")));
  assert.ok(steps.some((step) => step.waitFor?.includes("Wi-Fi 密码: ******")));
  assert.ok(steps.some((step) => step.waitFor?.includes("workflow-smoke.gcode")));
  assert.ok(steps.some((step) => step.waitFor?.includes("SmokePassword")));
  assert.equal(steps.some((step) => /arm|armed/i.test(step.label)), false);
  assert.equal(steps.some((step) => step.expression.includes("armButton")), false);
});

test("recoverySmokeSteps deletes main.py and verifies recovered UI state", () => {
  const steps = recoverySmokeSteps();

  assert.ok(steps.some((step) => step.label === "recover stock behavior"));
  assert.ok(steps.some((step) => step.waitFor?.includes("main.py 已删除")));
  assert.ok(steps.some((step) => step.waitFor?.includes("已恢复")));
  assert.equal(steps.some((step) => /arm|armed/i.test(step.label)), false);
  assert.equal(steps.some((step) => step.expression.includes("armButton")), false);
  assert.equal(steps.some((step) => step.expression.includes("ARM DRY-RUN VERIFIED")), false);
});
