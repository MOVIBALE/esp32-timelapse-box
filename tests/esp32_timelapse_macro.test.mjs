import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const macroPath = "config/klipper/esp32_timelapse.cfg";

test("canonical and legacy shot macros share one sequence", () => {
  const text = readFileSync(macroPath, "utf8");

  for (const name of [
    "_ESP32_TIMELAPSE_EVENT",
    "ESP32_TIMELAPSE_SHOT",
    "CYBERBRICK_SHOT"
  ]) {
    assert.match(text, new RegExp(`\\[gcode_macro ${name}\\]`));
  }

  assert.match(
    text,
    /MACRO=_ESP32_TIMELAPSE_EVENT VARIABLE=seq VALUE=\{next_seq\}/
  );
  assert.match(
    text,
    /MACRO=ESP32_TIMELAPSE_SHOT VARIABLE=seq VALUE=\{next_seq\}/
  );
  assert.match(
    text,
    /MACRO=CYBERBRICK_SHOT VARIABLE=seq VALUE=\{next_seq\}/
  );
  assert.equal(countCalls(text, "ESP32_TIMELAPSE_SHOT"), 1);
  assert.equal(countCalls(text, "CYBERBRICK_SHOT"), 1);
  assert.match(text, /RESPOND PREFIX=ESP32_TIMELAPSE MSG="shot_seq=\{next_seq\}"/);
});

test("legacy macro is explicitly documented as a compatibility alias", () => {
  const text = readFileSync(macroPath, "utf8");
  const legacyBlock = macroBlock(text, "CYBERBRICK_SHOT");

  assert.match(legacyBlock, /Deprecated compatibility alias/);
  assert.match(legacyBlock, /^\s*_ESP32_TIMELAPSE_EVENT\s*$/m);
  assert.doesNotMatch(legacyBlock, /action_call_remote_method/);
});

function macroBlock(text, name) {
  const start = text.indexOf(`[gcode_macro ${name}]`);
  const next = text.indexOf("\n[gcode_macro ", start + 1);
  return text.slice(start, next === -1 ? text.length : next);
}

function countCalls(text, name) {
  return macroBlock(text, name)
    .split(/\r?\n/)
    .filter((line) => line.trim() === "_ESP32_TIMELAPSE_EVENT")
    .length;
}
