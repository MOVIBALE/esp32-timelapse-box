import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArmedBoardListenerConfig,
  buildEnabledDryRunBoardListenerConfig,
  buildSafeBoardListenerConfig,
  redactConfigSecrets
} from "./boardConfig.js";

test("buildSafeBoardListenerConfig forces disabled dry-run", () => {
  const config = buildSafeBoardListenerConfig({
    enabled: true,
    dry_run: false,
    mode: "auto",
    wifi_ssid: "TestNetwork",
    wifi_password: "secret",
    u1_host: "192.0.2.10"
  });

  assert.equal(config.enabled, false);
  assert.equal(config.dry_run, true);
  assert.equal(config.mode, "auto");
  assert.equal(config.wifi_password, "secret");
});

test("buildEnabledDryRunBoardListenerConfig never arms shutter", () => {
  const config = buildEnabledDryRunBoardListenerConfig({
    enabled: false,
    dry_run: false,
    mode: "bad"
  });

  assert.equal(config.enabled, true);
  assert.equal(config.dry_run, true);
  assert.equal(config.mode, "http_poll");
});

test("board config stores only the Moonraker host for the board runtime", () => {
  const config = buildEnabledDryRunBoardListenerConfig({
    u1_host: "http://192.0.2.10:7125/"
  });

  assert.equal(config.u1_host, "192.0.2.10");
});

test("board config defaults are shareable and do not contain local Wi-Fi secrets", () => {
  const config = buildSafeBoardListenerConfig();

  assert.equal(config.wifi_ssid, "");
  assert.equal(config.wifi_password, "");
  assert.equal(config.u1_host, "printer.local");
});

test("buildArmedBoardListenerConfig requires explicit confirmation phrase", () => {
  assert.throws(
    () => buildArmedBoardListenerConfig({}, "随便"),
    /explicit armed confirmation required/
  );

  const config = buildArmedBoardListenerConfig({ mode: "http_poll" }, "ARM DRY-RUN VERIFIED");
  assert.equal(config.enabled, true);
  assert.equal(config.dry_run, false);
});

test("redactConfigSecrets hides Wi-Fi password", () => {
  assert.equal(
    redactConfigSecrets({ wifi_ssid: "TestNetwork", wifi_password: "secret" }),
    '{"wifi_ssid":"TestNetwork","wifi_password":"******"}'
  );
});
