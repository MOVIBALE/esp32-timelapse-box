import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { t, uiStrings } from "./strings.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const html = readFileSync(resolve(root, "index.html"), "utf-8");

test("Chinese and English UI dictionaries expose identical keys", () => {
  assert.deepEqual(Object.keys(uiStrings.en).sort(), Object.keys(uiStrings["zh-CN"]).sort());
});

test("every data-i18n key in index.html has a translation", () => {
  const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(keys.length > 20, "expected the formal page to use data-i18n attributes");

  for (const key of keys) {
    assert.equal(typeof uiStrings["zh-CN"][key], "string", `${key} missing zh-CN`);
    assert.equal(typeof uiStrings.en[key], "string", `${key} missing en`);
  }
});

test("language switch exists in the formal page", () => {
  assert.match(html, /id="languageSelect"/);
  assert.match(html, /value="zh-CN"/);
  assert.match(html, /value="en"/);
});

test("t replaces named template variables", () => {
  assert.equal(t("zh-CN", "writeFileProgress", { path: "/main.py", chars: 10, chunks: 1 }), "写入 /main.py：10 字符，1 个分块。");
  assert.equal(t("en", "writeFileProgress", { path: "/main.py", chars: 10, chunks: 1 }), "Writing /main.py: 10 chars, 1 chunk.");
});

test("critical runtime messages are bilingual", () => {
  for (const key of [
    "browserSerialAvailable",
    "safeUploadDone",
    "dryRunEnabledDone",
    "armedWritten",
    "recoverDone",
    "dryRunObserved"
  ]) {
    assert.equal(typeof uiStrings["zh-CN"][key], "string");
    assert.equal(typeof uiStrings.en[key], "string");
  }
});

test("advanced diagnostics warning is bilingual and beginner-readable", () => {
  assert.match(uiStrings["zh-CN"].advancedDebugCopy, /教程|不用|raw REPL/);
  assert.match(uiStrings.en.advancedDebugCopy, /tutorial|raw REPL/i);
});

test("operation busy labels are bilingual", () => {
  for (const key of [
    "operationConnect",
    "operationDisconnect",
    "operationUploadSafe",
    "operationEnableDryRun",
    "operationSoftReset",
    "operationRecover",
    "operationArm",
    "operationRawEnter",
    "operationRawExit",
    "operationProbeWrite",
    "operationProbeRemove",
    "operationAlreadyRunning"
  ]) {
    assert.equal(typeof uiStrings["zh-CN"][key], "string", `${key} missing zh-CN`);
    assert.equal(typeof uiStrings.en[key], "string", `${key} missing en`);
    assert.notEqual(uiStrings.en[key], uiStrings["zh-CN"][key], `${key} should be localized`);
  }

  assert.equal(t("en", "operationAlreadyRunning", { label: "Connecting" }), "Connecting is already running. Wait for it to finish.");
  assert.equal(t("zh-CN", "operationAlreadyRunning", { label: "正在连接" }), "正在连接正在进行，请等待完成。");
});

test("safety mode and backend labels are translated", () => {
  const requiredKeys = [
    "modeDisabled",
    "modeDryRun",
    "modeArmed",
    "backendHttpPolling",
    "backendWebsocketAgent",
    "backendAuto",
    "safetyModeDisabled",
    "safetyModeDryRun",
    "safetyModeArmed",
    "safetyModeRecovering",
    "safetyModeRecovered"
  ];

  for (const key of requiredKeys) {
    assert.equal(typeof uiStrings["zh-CN"][key], "string", `${key} missing zh-CN`);
    assert.equal(typeof uiStrings.en[key], "string", `${key} missing en`);
  }

  for (const [value, key] of [
    ["disabled", "modeDisabled"],
    ["dry-run", "modeDryRun"],
    ["armed", "modeArmed"]
  ]) {
    const tag = html.match(new RegExp(`<span[^>]*data-mode="${value}"[^>]*>`))?.[0] ?? "";
    assert.match(tag, new RegExp(`data-i18n="${key}"`), `${value} mode tab should be localized`);
  }

  for (const [value, key] of [
    ["http_poll", "backendHttpPolling"],
    ["websocket_agent", "backendWebsocketAgent"],
    ["auto", "backendAuto"]
  ]) {
    const tag = html.match(new RegExp(`<option[^>]*value="${value}"[^>]*>`))?.[0] ?? "";
    assert.match(tag, new RegExp(`data-i18n="${key}"`), `${value} backend option should be localized`);
  }
});
