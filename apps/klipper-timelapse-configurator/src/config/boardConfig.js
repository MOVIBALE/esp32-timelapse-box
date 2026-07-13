import { normalizeMoonrakerTarget } from "../moonraker/client.js";

const DEFAULT_CONFIG = {
  enabled: false,
  dry_run: true,
  mode: "http_poll",
  wifi_ssid: "",
  wifi_password: "",
  u1_host: "printer.local",
  poll_interval_ms: 500,
  min_trigger_interval_ms: 1000,
  trigger_press_ms: 180,
  trigger_release_ms: 120,
  startup_delay_ms: 10000
};

function normalizeMode(mode) {
  return ["http_poll", "websocket_agent", "auto"].includes(mode) ? mode : "http_poll";
}

function baseConfig(input = {}) {
  const merged = {
    ...DEFAULT_CONFIG,
    ...input
  };

  return {
    ...merged,
    mode: normalizeMode(input.mode),
    u1_host: normalizeMoonrakerTarget(merged.u1_host).boardHost,
    poll_interval_ms: Number(input.poll_interval_ms || DEFAULT_CONFIG.poll_interval_ms),
    min_trigger_interval_ms: Number(input.min_trigger_interval_ms || DEFAULT_CONFIG.min_trigger_interval_ms),
    trigger_press_ms: Number(input.trigger_press_ms || DEFAULT_CONFIG.trigger_press_ms),
    trigger_release_ms: Number(input.trigger_release_ms || DEFAULT_CONFIG.trigger_release_ms),
    startup_delay_ms: Number(input.startup_delay_ms || DEFAULT_CONFIG.startup_delay_ms)
  };
}

export function buildSafeBoardListenerConfig(input = {}) {
  return {
    ...baseConfig(input),
    enabled: false,
    dry_run: true
  };
}

export function buildEnabledDryRunBoardListenerConfig(input = {}) {
  return {
    ...baseConfig(input),
    enabled: true,
    dry_run: true
  };
}

export function buildArmedBoardListenerConfig(input = {}, confirmation = "") {
  if (confirmation !== "ARM DRY-RUN VERIFIED") {
    throw new Error("explicit armed confirmation required");
  }
  return {
    ...baseConfig(input),
    enabled: true,
    dry_run: false
  };
}

export function redactConfigSecrets(config) {
  return JSON.stringify({
    ...config,
    wifi_password: config.wifi_password ? "******" : ""
  });
}
