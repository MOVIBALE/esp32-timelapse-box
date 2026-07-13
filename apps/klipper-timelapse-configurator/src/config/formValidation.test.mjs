import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMissingBoardFormConfig,
  validateBoardFormConfig
} from "./formValidation.js";

test("validateBoardFormConfig requires Wi-Fi and Moonraker fields before board writes", () => {
  const result = validateBoardFormConfig({
    wifi_ssid: "",
    wifi_password: "",
    u1_host: ""
  });

  assert.deepEqual(result, {
    ok: false,
    missing: ["wifi_ssid", "wifi_password", "u1_host"]
  });
});

test("validateBoardFormConfig trims fields and accepts complete local config", () => {
  const result = validateBoardFormConfig({
    wifi_ssid: " TestNetwork ",
    wifi_password: " secret ",
    u1_host: " 192.0.2.10 "
  });

  assert.deepEqual(result, {
    ok: true,
    missing: [],
    value: {
      wifi_ssid: "TestNetwork",
      wifi_password: "secret",
      u1_host: "192.0.2.10"
    }
  });
});

test("formatMissingBoardFormConfig returns beginner-readable bilingual messages", () => {
  const message = formatMissingBoardFormConfig(["wifi_ssid", "u1_host"]);

  assert.match(message["zh-CN"], /Wi-Fi SSID/);
  assert.match(message["zh-CN"], /Moonraker 地址/);
  assert.match(message.en, /Wi-Fi SSID/);
  assert.match(message.en, /Moonraker address/);
});
