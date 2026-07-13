import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_HARDWARE_ROUTE_ID,
  HARDWARE_ROUTES,
  getHardwareRoute
} from "./routes.js";

test("hardware route model exposes the S3 and compatible C3 workflows", () => {
  assert.equal(DEFAULT_HARDWARE_ROUTE_ID, "esp32-s3-sony-ble");
  assert.deepEqual(Object.keys(HARDWARE_ROUTES), [
    "esp32-s3-sony-ble",
    "esp32-c3-compatible"
  ]);

  assert.deepEqual(HARDWARE_ROUTES["esp32-s3-sony-ble"], {
    id: "esp32-s3-sony-ble",
    labelKey: "routeS3Label",
    descriptionKey: "routeS3Description",
    transport: "serial-command",
    canUploadFiles: false,
    canRecoverMain: false,
    canConnectSony: true,
    supportsBackendSelection: false,
    initialSafetyMode: "dry-run"
  });

  assert.deepEqual(HARDWARE_ROUTES["esp32-c3-compatible"], {
    id: "esp32-c3-compatible",
    labelKey: "routeC3Label",
    descriptionKey: "routeC3Description",
    transport: "micropython-raw-repl",
    canUploadFiles: true,
    canRecoverMain: true,
    canConnectSony: false,
    supportsBackendSelection: true,
    initialSafetyMode: "disabled"
  });
});

test("unknown route IDs safely fall back to the S3 dry-run route", () => {
  assert.equal(getHardwareRoute("unknown"), HARDWARE_ROUTES[DEFAULT_HARDWARE_ROUTE_ID]);
  assert.equal(getHardwareRoute().initialSafetyMode, "dry-run");
  assert.notEqual(getHardwareRoute().initialSafetyMode, "armed");
});

test("route definitions are immutable", () => {
  assert.equal(Object.isFrozen(HARDWARE_ROUTES), true);
  assert.equal(Object.isFrozen(getHardwareRoute("esp32-c3-compatible")), true);
});

