import assert from "node:assert/strict";
import test from "node:test";

import { parseBoardLine } from "./boardMonitor.js";

test("parseBoardLine detects dry-run layer events", () => {
  const event = parseBoardLine('__BOARD_LISTENER_EVENT__{"filename":"part.gcode","layer":234,"total_layer":734,"trigger_result":"DRY_RUN"}');

  assert.equal(event.type, "dryRunEvent");
  assert.equal(event.layer, 234);
  assert.equal(event.totalLayer, 734);
  assert.equal(event.filename, "part.gcode");
});

test("parseBoardLine detects board readiness", () => {
  const event = parseBoardLine('__BOARD_LISTENER_READY__{"enabled":true,"dry_run":true}');

  assert.equal(event.type, "ready");
  assert.equal(event.enabled, true);
  assert.equal(event.dryRun, true);
});

test("parseBoardLine detects errors", () => {
  const event = parseBoardLine('__BOARD_LISTENER_ERROR__{"error":"wifi connect failed"}');

  assert.equal(event.type, "error");
  assert.match(event.message, /wifi connect failed/);
});
