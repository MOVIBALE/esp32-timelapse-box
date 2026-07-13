import assert from "node:assert/strict";
import test from "node:test";

import { initialWorkflow, reduceWorkflow } from "./workflow.js";

test("workflow starts disconnected and safe", () => {
  assert.equal(initialWorkflow.step, "connect");
  assert.equal(initialWorkflow.safetyMode, "disabled");
});

test("workflow reaches configure after board connection", () => {
  const state = reduceWorkflow(initialWorkflow, { type: "boardConnected", portLabel: "COM6" });

  assert.equal(state.step, "configure");
  assert.equal(state.board.portLabel, "COM6");
});

test("workflow records dry-run events but does not arm automatically", () => {
  const connected = reduceWorkflow(initialWorkflow, { type: "boardConnected", portLabel: "COM6" });
  const dryRun = reduceWorkflow(connected, { type: "dryRunEnabled" });
  const eventSeen = reduceWorkflow(dryRun, {
    type: "dryRunEventSeen",
    layer: 234,
    totalLayer: 734,
    filename: "part.gcode",
    observedAt: "03:45:00"
  });

  assert.equal(eventSeen.step, "observe");
  assert.equal(eventSeen.safetyMode, "dry-run");
  assert.equal(eventSeen.lastLayer, 234);
  assert.equal(eventSeen.totalLayer, 734);
  assert.equal(eventSeen.currentFile, "part.gcode");
  assert.equal(eventSeen.lastEventAt, "03:45:00");
});

test("workflow blocks armed state without confirmation", () => {
  const state = reduceWorkflow(initialWorkflow, { type: "armRequested", confirmed: false });

  assert.equal(state.safetyMode, "disabled");
  assert.equal(state.notice, "armedConfirmationRequired");
});

test("workflow enters armed only after explicit confirmation", () => {
  const state = reduceWorkflow(initialWorkflow, { type: "armRequested", confirmed: true });

  assert.equal(state.step, "armed");
  assert.equal(state.safetyMode, "armed");
});

test("workflow preserves connection and marks main.py removed after recovery", () => {
  const connected = reduceWorkflow(initialWorkflow, { type: "boardConnected", portLabel: "COM6" });
  const recovering = reduceWorkflow(connected, { type: "recovering" });
  const state = reduceWorkflow(recovering, { type: "recovered" });

  assert.equal(state.step, "recovered");
  assert.equal(state.safetyMode, "recovered");
  assert.equal(state.notice, "recovered");
  assert.equal(state.board.connected, true);
  assert.equal(state.board.portLabel, "COM6");
  assert.equal(state.mainPyRemoved, true);
});
