import assert from "node:assert/strict";
import test from "node:test";

import { buildChecklistState, summarizeChecklistState } from "./checklist.js";
import { initialWorkflow, reduceWorkflow } from "./workflow.js";

function byId(items, id) {
  const item = items.find((entry) => entry.id === id);
  assert.ok(item, `expected checklist item ${id}`);
  return item;
}

test("buildChecklistState starts with connect as current and later steps locked", () => {
  const items = buildChecklistState(initialWorkflow);

  assert.equal(byId(items, "connect").state, "current");
  assert.equal(byId(items, "connect").title["zh-CN"], "连接板子");
  assert.equal(byId(items, "safe-upload").state, "locked");
  assert.equal(byId(items, "dry-run").state, "locked");
  assert.equal(byId(items, "layer-seen").state, "locked");
});

test("summarizeChecklistState names the current beginner step for mobile recordings", () => {
  const items = buildChecklistState(initialWorkflow);

  assert.equal(summarizeChecklistState(items, "zh-CN"), "当前：连接板子 · 已完成 0/5");
  assert.equal(summarizeChecklistState(items, "en"), "Current: Connect board · 0/5 done");
});

test("buildChecklistState marks dry-run observation progress for beginners", () => {
  const connected = reduceWorkflow(initialWorkflow, { type: "boardConnected", portLabel: "COM6" });
  const safeUploaded = reduceWorkflow(connected, { type: "safeUploaded" });
  const dryRun = reduceWorkflow(safeUploaded, { type: "dryRunEnabled" });
  const observed = reduceWorkflow(dryRun, {
    type: "dryRunEventSeen",
    layer: 234,
    totalLayer: 734,
    filename: "part.gcode",
    observedAt: "03:45:00"
  });

  const items = buildChecklistState(observed);

  assert.equal(byId(items, "connect").state, "done");
  assert.equal(byId(items, "safe-upload").state, "done");
  assert.equal(byId(items, "dry-run").state, "done");
  assert.equal(byId(items, "layer-seen").state, "done");
  assert.equal(byId(items, "recover").state, "available");
  assert.equal(byId(items, "layer-seen").detail["zh-CN"], "已看到 1 次真实层变化，最近层：234。");
  assert.equal(summarizeChecklistState(items, "zh-CN"), "可选：恢复官方状态 · 已完成 4/5");
});

test("buildChecklistState marks recovery complete without losing the tutorial context", () => {
  const connected = reduceWorkflow(initialWorkflow, { type: "boardConnected", portLabel: "COM6" });
  const recovering = reduceWorkflow(connected, { type: "recovering" });
  const recovered = reduceWorkflow(recovering, { type: "recovered" });

  const items = buildChecklistState(recovered);

  assert.equal(byId(items, "connect").state, "done");
  assert.equal(byId(items, "recover").state, "done");
  assert.equal(byId(items, "recover").detail.en, "main.py is removed. The custom listener will not auto-start after reset.");
  assert.equal(summarizeChecklistState(items, "en"), "Recovered · 3/5 done");
});

test("S3 checklist teaches provisioning, Sony readiness, and the armed gate", () => {
  const connected = reduceWorkflow(initialWorkflow, { type: "boardConnected", portLabel: "COM9" });
  const configured = reduceWorkflow(connected, { type: "safeUploaded" });
  const dryRun = reduceWorkflow(configured, { type: "dryRunEnabled" });
  const observed = reduceWorkflow(dryRun, {
    type: "dryRunEventSeen",
    layer: 42,
    filename: "short-test.gcode",
    observedAt: "05:20:00"
  });

  const items = buildChecklistState(observed, {
    hardwareRouteId: "esp32-s3-sony-ble",
    sonyReady: true
  });

  assert.equal(byId(items, "safe-upload").title["zh-CN"], "配置网络");
  assert.equal(byId(items, "dry-run").title["zh-CN"], "连接 Sony 相机");
  assert.equal(byId(items, "dry-run").state, "done");
  assert.equal(byId(items, "recover").title["zh-CN"], "准备正式触发");
  assert.equal(byId(items, "recover").state, "available");
  assert.match(byId(items, "recover").detail.en, /confirmation phrase/);
});
