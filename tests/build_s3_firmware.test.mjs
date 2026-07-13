import assert from "node:assert/strict";
import test from "node:test";

import {
  needsWhitespaceSafeBuildPath,
  resolvePlatformioPath,
  whitespaceSafeBuildRoot
} from "../scripts/build-s3-firmware.mjs";

test("Windows firmware builds use a safe path when the workspace contains spaces", () => {
  assert.equal(
    needsWhitespaceSafeBuildPath("C:\\Users\\Example\\ESP32 Timelapse Box\\firmware", "win32"),
    true
  );
  assert.equal(
    needsWhitespaceSafeBuildPath("C:\\src\\esp32-timelapse-box\\firmware", "win32"),
    false
  );
  assert.equal(
    needsWhitespaceSafeBuildPath("/home/user/ESP32 Timelapse Box/firmware", "linux"),
    false
  );
});

test("whitespace-safe build path is deterministic and contains no spaces", () => {
  const first = whitespaceSafeBuildRoot(
    "C:\\Users\\Example\\ESP32 Timelapse Box\\firmware",
    "C:\\Temp"
  );
  const second = whitespaceSafeBuildRoot(
    "C:\\Users\\Example\\ESP32 Timelapse Box\\firmware",
    "C:\\Temp"
  );

  assert.equal(first, second);
  assert.doesNotMatch(first, /\s/);
  assert.match(first.replace(/\\/g, "/"), /esp32-timelapse-build-[0-9a-f]{12}$/);
});

test("PlatformIO resolver prefers an explicit environment override", () => {
  assert.equal(
    resolvePlatformioPath({
      platform: "win32",
      environment: { PLATFORMIO: "D:\\pio\\platformio.exe" },
      exists: () => false
    }),
    "D:\\pio\\platformio.exe"
  );
  assert.equal(
    resolvePlatformioPath({ platform: "linux", environment: {}, exists: () => false }),
    "platformio"
  );
});
