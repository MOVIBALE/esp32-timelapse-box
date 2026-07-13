import assert from "node:assert/strict";
import test from "node:test";

import { buildOpenOptions, formatPortInfo } from "./webSerial.js";

test("buildOpenOptions parses baud rate", () => {
  assert.deepEqual(buildOpenOptions("115200"), { baudRate: 115200 });
  assert.deepEqual(buildOpenOptions(921600), { baudRate: 921600 });
  assert.throws(() => buildOpenOptions("bad"), /Invalid baud rate/);
});

test("formatPortInfo renders known USB IDs", () => {
  assert.equal(
    formatPortInfo({ usbVendorId: 0x303a, usbProductId: 0x1001 }),
    "USB VID 0x303a / PID 0x1001"
  );
});
