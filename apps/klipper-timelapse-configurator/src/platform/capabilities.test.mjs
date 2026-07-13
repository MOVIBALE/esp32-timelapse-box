import assert from "node:assert/strict";
import test from "node:test";

import { detectCapabilities } from "./capabilities.js";

test("detectCapabilities accepts Chrome or Edge over a secure context", () => {
  const result = detectCapabilities({
    isSecureContext: true,
    hasSerial: true,
    userAgent: "Mozilla/5.0 Chrome/126"
  });

  assert.equal(result.canUseWebSerial, true);
  assert.deepEqual(result.blockers, []);
});

test("detectCapabilities blocks insecure pages", () => {
  const result = detectCapabilities({
    isSecureContext: false,
    hasSerial: true,
    userAgent: "Mozilla/5.0 Chrome/126"
  });

  assert.equal(result.canUseWebSerial, false);
  assert.deepEqual(result.blockers, ["secureContextRequired"]);
});

test("detectCapabilities blocks browsers without Web Serial", () => {
  const result = detectCapabilities({
    isSecureContext: true,
    hasSerial: false,
    userAgent: "Mozilla/5.0 Firefox/140"
  });

  assert.equal(result.canUseWebSerial, false);
  assert.deepEqual(result.blockers, ["webSerialMissing"]);
});
