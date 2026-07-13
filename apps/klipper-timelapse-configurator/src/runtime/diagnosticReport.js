const LABELS = {
  "zh-CN": {
    title: "ESP32 延时摄影盒子 / Klipper 诊断报告",
    generatedAt: "生成时间",
    safety: "安全状态",
    serial: "串口",
    hardwareRoute: "硬件路线",
    sonyStatus: "Sony 状态",
    macroSource: "宏来源",
    moonrakerStatus: "Moonraker 预检",
    wifiSsid: "Wi-Fi SSID",
    wifiPassword: "Wi-Fi 密码",
    moonraker: "Moonraker",
    backend: "监听方式",
    latestLayer: "最近层",
    currentFile: "当前文件",
    lastEvent: "最后事件",
    dryRunEvents: "Dry-run 事件",
    recovery: "恢复状态",
    friendlyLogs: "小白日志",
    rawLogs: "原始日志",
    empty: "(空)",
    none: "(无)"
  },
  en: {
    title: "ESP32 Timelapse Box / Klipper Diagnostic Report",
    generatedAt: "Generated at",
    safety: "Safety",
    serial: "Serial",
    hardwareRoute: "Hardware route",
    sonyStatus: "Sony status",
    macroSource: "Macro source",
    moonrakerStatus: "Moonraker preflight",
    wifiSsid: "Wi-Fi SSID",
    wifiPassword: "Wi-Fi password",
    moonraker: "Moonraker",
    backend: "Backend",
    latestLayer: "Latest layer",
    currentFile: "Current file",
    lastEvent: "Last event",
    dryRunEvents: "Dry-run events",
    recovery: "Recovery",
    friendlyLogs: "Beginner logs",
    rawLogs: "Raw logs",
    empty: "(empty)",
    none: "(none)"
  }
};

export function buildDiagnosticReport({
  language = "zh-CN",
  generatedAt,
  workflow = {},
  formConfig = {},
  portInfo,
  hardwareRouteId,
  sonyStatus,
  macroSource,
  moonrakerStatus,
  recoveryStatus,
  friendlyLogText,
  rawLogText
}) {
  const labels = LABELS[language] || LABELS["zh-CN"];
  const password = String(formConfig.wifi_password || "");
  const ssid = String(formConfig.wifi_ssid || "");
  const redact = (value) => redactSensitiveText(String(value ?? ""), { password, ssid });
  const layerText = workflow.lastLayer == null
    ? labels.none
    : `${workflow.lastLayer} / ${workflow.totalLayer ?? labels.none}`;

  return [
    labels.title,
    "",
    `${labels.generatedAt}: ${generatedAt || labels.none}`,
    `${labels.safety}: ${workflow.safetyMode || labels.none}`,
    `${labels.serial}: ${redact(portInfo || labels.none)}`,
    `${labels.hardwareRoute}: ${hardwareRouteText(hardwareRouteId, language)}`,
    `${labels.sonyStatus}: ${redact(sonyStatus || labels.none)}`,
    `${labels.macroSource}: ${redact(macroSource || labels.none)}`,
    `${labels.moonrakerStatus}: ${redact(moonrakerStatus || labels.none)}`,
    "",
    "[Config]",
    `${labels.wifiSsid}: ${ssid ? "[configured]" : labels.empty}`,
    `${labels.wifiPassword}: ${password ? "******" : labels.empty}`,
    `${labels.moonraker}: ${redact(formConfig.u1_host || labels.empty)}`,
    `${labels.backend}: ${redact(formConfig.mode || labels.empty)}`,
    "",
    "[Dry-run]",
    `${labels.latestLayer}: ${layerText}`,
    `${labels.currentFile}: ${redact(workflow.currentFile || labels.none)}`,
    `${labels.lastEvent}: ${redact(workflow.lastEventAt || labels.none)}`,
    `${labels.dryRunEvents}: ${workflow.dryRunEvents ?? 0}`,
    `${labels.recovery}: ${redact(recoveryStatus || labels.none)}`,
    "",
    `[${labels.friendlyLogs}]`,
    redact(nonEmptyText(friendlyLogText, labels.none)),
    "",
    `[${labels.rawLogs}]`,
    redact(nonEmptyText(rawLogText, labels.none))
  ].join("\n");
}

function nonEmptyText(text, fallback) {
  const value = String(text || "").trim();
  return value || fallback;
}

function hardwareRouteText(routeId, language) {
  const labels = {
    "esp32-s3-sony-ble": {
      "zh-CN": "ESP32-S3 + Sony BLE",
      en: "ESP32-S3 + Sony BLE"
    },
    "esp32-c3-compatible": {
      "zh-CN": "兼容型 ESP32-C3 快门盒",
      en: "Compatible ESP32-C3 shutter box"
    }
  };
  return labels[routeId]?.[language] || routeId || "(none)";
}

function redactSensitiveText(text, { password, ssid }) {
  let redacted = text;
  for (const secret of [password, ssid]) {
    if (secret) redacted = redacted.split(secret).join("******");
  }
  redacted = redacted.replace(/\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b/g, "[device-address]");
  return redacted.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (address) => (
    isPrivateIpv4(address) ? "[private-network]" : address
  ));
}

function isPrivateIpv4(address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [first, second] = octets;
  return first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 100 && second >= 64 && second <= 127);
}
