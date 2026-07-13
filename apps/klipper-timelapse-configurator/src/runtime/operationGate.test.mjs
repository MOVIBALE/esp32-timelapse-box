import assert from "node:assert/strict";
import test from "node:test";

import { createOperationGate } from "./operationGate.js";

test("createOperationGate rejects concurrent operations", async () => {
  const gate = createOperationGate();
  let release;
  const first = gate.run("上传中", () => new Promise((resolve) => {
    release = resolve;
  }));

  await assert.rejects(
    () => gate.run("软重启", async () => undefined),
    /上传中 正在进行/
  );

  release();
  await first;
  await assert.doesNotReject(() => gate.run("软重启", async () => "ok"));
});

test("createOperationGate accepts a localized busy message formatter", async () => {
  const gate = createOperationGate({
    formatBusyMessage: (label) => `${label} is already running. Wait for it to finish.`
  });
  let release;
  const first = gate.run("Connecting", () => new Promise((resolve) => {
    release = resolve;
  }));

  await assert.rejects(
    () => gate.run("Soft reset", async () => undefined),
    /Connecting is already running/
  );

  release();
  await first;
});
