import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = "firmware/esp32-s3-multibrand-nimble-experimental";
const main = readFileSync(`${root}/src/main.cpp`, "utf8");
const ricoh = readFileSync(`${root}/lib/furble/src/Ricoh.cpp`, "utf8");
const cameraList = readFileSync(`${root}/lib/furble/src/CameraList.cpp`, "utf8");
const platformio = readFileSync(`${root}/platformio.ini`, "utf8");
const readme = readFileSync(`${root}/README.md`, "utf8");

test("experimental firmware is an independent pinned NimBLE build", () => {
  assert.match(platformio, /framework\s*=\s*arduino/);
  assert.match(platformio, /NimBLE-Arduino@2\.5\.0/);
  assert.match(platformio, /MULTIBRAND_NIMBLE_EXPERIMENTAL=1/);
  assert.match(platformio, /ARDUINO_USB_MODE=1/);
  assert.match(platformio, /ARDUINO_USB_CDC_ON_BOOT=1/);
  assert.match(readme, /246de0861b8907a68eec3f2496dcfc666f41816b/);
  assert.equal(existsSync(`${root}/third_party/FURBLE-LICENSE.txt`), true);
});

test("Sony remains excluded from the NimBLE experiment", () => {
  assert.doesNotMatch(cameraList, /#include\s+"Sony\.h"/);
  assert.doesNotMatch(cameraList, /make_unique<Furble::Sony>/);
  assert.match(readme, /Sony is intentionally excluded/);
});

test("shutter writes require the explicit manual shot command", () => {
  assert.match(main, /command == "shot"/);
  assert.match(main, /__MB_SHOT_RESULT__/);
  assert.doesNotMatch(main.slice(main.indexOf("void setup()")), /shutterPress\s*\(/);
  assert.match(readme, /never triggers a shutter at boot, scan, pair, or reconnect/);
  assert.match(main, /\"dispatched\\\":true,\\\"camera_confirmed\\\":false/);
  assert.doesNotMatch(main, /__MB_SHOT_RESULT__\{\\\"ok\\\":true/);
});

test("camera-derived strings are escaped before machine-readable JSON output", () => {
  assert.match(main, /String jsonEscape\(/);
  assert.match(main, /jsonEscape\(String\(camera->getName\(\)\.c_str\(\)\)\)/);
  assert.match(main, /jsonEscape\(String\(camera->getAddress\(\)\.toString\(\)\.c_str\(\)\)\)/);
});

test("Ricoh pairing cannot silently accept numeric comparison", () => {
  assert.match(ricoh, /PairingApproval::requestConfirmation/);
  assert.match(ricoh, /injectConfirmPasskey\(connInfo, accepted\)/);
  assert.doesNotMatch(ricoh, /injectConfirmPasskey\(connInfo, true\)/);
  assert.doesNotMatch(ricoh, /fallback 123456/);
  assert.match(main, /command == "yes" \|\| command == "no"/);
  assert.match(main, /command\.startsWith\("pin "\)/);
});

test("serial status exposes readiness without claiming hardware validation", () => {
  assert.match(main, /__MB_READY__/);
  assert.match(main, /hardware_validated\\\":false/);
  assert.match(main, /__MB_STATUS__/);
  assert.match(main, /pairing_input_pending/);
});
