import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArmCommand,
  buildConnectSonyCommand,
  buildDisarmCommand,
  buildPairSonyCommand,
  buildProvisionCommand,
  buildStatusCommands,
  parseS3StatusLine
} from "./s3Commands.js";

test("S3 command builders emit the proven single-letter serial protocol", () => {
  assert.equal(
    buildProvisionCommand({ ssid: "Studio", password: "secret", host: "printer.local" }),
    "w Studio|secret|printer.local\n"
  );
  assert.equal(buildConnectSonyCommand(), "b\n");
  assert.equal(buildPairSonyCommand(), "q\n");
  assert.equal(buildDisarmCommand(), "d\n");
  assert.equal(buildArmCommand(), "a\n");
  assert.deepEqual(buildStatusCommands(), ["s\n", "p\n"]);
});

test("S3 provisioning rejects serial command injection characters", () => {
  for (const value of ["bad|field", "bad\nfield", "bad\rfield"] ) {
    assert.throws(
      () => buildProvisionCommand({ ssid: value, password: "secret", host: "printer.local" }),
      /unsupported serial separator/
    );
    assert.throws(
      () => buildProvisionCommand({ ssid: "Studio", password: value, host: "printer.local" }),
      /unsupported serial separator/
    );
    assert.throws(
      () => buildProvisionCommand({ ssid: "Studio", password: "secret", host: value }),
      /unsupported serial separator/
    );
  }
});

test("S3 provisioning requires an SSID and Moonraker host", () => {
  assert.throws(
    () => buildProvisionCommand({ ssid: "", password: "secret", host: "printer.local" }),
    /SSID is required/
  );
  assert.throws(
    () => buildProvisionCommand({ ssid: "Studio", password: "secret", host: "" }),
    /Moonraker host is required/
  );
});

test("S3 status parser reports Sony readiness and safety mode", () => {
  assert.deepEqual(
    parseS3StatusLine("SONY_BLUEDROID_SHUTTER_STATUS connected=true ready=true command_ff01=true"),
    { type: "sonyStatus", connected: true, ready: true }
  );
  assert.deepEqual(
    parseS3StatusLine("TIMELAPSE_STATUS enabled=true dry_run=true armed=false macro_source=canonical"),
    { type: "timelapseStatus", enabled: true, dryRun: true, armed: false, macroSource: "canonical" }
  );
});

test("S3 status parser reports a completed first-time Sony pairing", () => {
  assert.deepEqual(
    parseS3StatusLine("SONY_BLUEDROID_SHUTTER_PAIRING_DONE bonded=true no_ff01_writes=true"),
    { type: "sonyPairing", bonded: true, noFf01Writes: true }
  );
});

test("S3 status parser extracts canonical dry-run frame events", () => {
  assert.deepEqual(
    parseS3StatusLine(
      "TIMELAPSE_MACRO_EVENT trigger_source=klipper_macro action=trigger reason=macro_seq_changed macro_source=canonical macro_seq=12 layer=36 filename=part.gcode dry_run=true armed=false sony_ready=true"
    ),
    {
      type: "timelapseEvent",
      layer: 36,
      filename: "part.gcode",
      dryRun: true,
      macroSource: "canonical"
    }
  );
  assert.deepEqual(parseS3StatusLine("ordinary log"), { type: "other" });
});
