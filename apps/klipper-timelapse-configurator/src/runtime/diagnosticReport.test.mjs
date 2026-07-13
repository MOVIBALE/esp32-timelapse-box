import assert from "node:assert/strict";
import test from "node:test";

import { buildDiagnosticReport } from "./diagnosticReport.js";

test("buildDiagnosticReport creates a beginner-readable redacted Chinese report", () => {
  const report = buildDiagnosticReport({
    language: "zh-CN",
    generatedAt: "2026-06-08 08:30:00",
    workflow: {
      safetyMode: "dry-run",
      lastLayer: 236,
      totalLayer: 300,
      currentFile: "workflow-smoke.gcode",
      lastEventAt: "08:29:58",
      dryRunEvents: 1,
      mainPyRemoved: false
    },
    formConfig: {
      wifi_ssid: "TestNetwork",
      wifi_password: "SecretPassword",
      u1_host: "192.168.50.20",
      mode: "http_poll"
    },
    portInfo: "USB VID 0x303a / PID 0x1001",
    hardwareRouteId: "esp32-s3-sony-ble",
    sonyStatus: "已连接，可拍摄",
    macroSource: "canonical",
    moonrakerStatus: "可访问",
    recoveryStatus: "未执行",
    friendlyLogText: "[08:29:58] 检测到真实层变化，安全模式记录事件但不触发快门。SecretPassword",
    rawLogText: "[08:29:58] target=AA:BB:CC:DD:EE:FF ip=192.168.50.20 __BOARD_LISTENER_EVENT__{\"layer\":236,\"trigger_result\":\"DRY_RUN\",\"note\":\"SecretPassword\"}"
  });

  assert.match(report, /ESP32 延时摄影盒子 \/ Klipper 诊断报告/);
  assert.match(report, /生成时间: 2026-06-08 08:30:00/);
  assert.match(report, /安全状态: dry-run/);
  assert.match(report, /串口: USB VID 0x303a \/ PID 0x1001/);
  assert.match(report, /硬件路线: ESP32-S3 \+ Sony BLE/);
  assert.match(report, /Sony 状态: 已连接，可拍摄/);
  assert.match(report, /宏来源: canonical/);
  assert.match(report, /Wi-Fi SSID: \[configured\]/);
  assert.match(report, /Wi-Fi 密码: \*\*\*\*\*\*/);
  assert.match(report, /Moonraker: \[private-network\]/);
  assert.match(report, /监听方式: http_poll/);
  assert.match(report, /最近层: 236 \/ 300/);
  assert.match(report, /当前文件: workflow-smoke\.gcode/);
  assert.match(report, /Dry-run 事件: 1/);
  assert.match(report, /恢复状态: 未执行/);
  assert.match(report, /检测到真实层变化/);
  assert.match(report, /__BOARD_LISTENER_EVENT__/);
  assert.doesNotMatch(report, /SecretPassword/);
  assert.doesNotMatch(report, /192\.168\.50\.20/);
  assert.doesNotMatch(report, /AA:BB:CC:DD:EE:FF/);
  assert.match(report, /\[device-address\]/);
});

test("buildDiagnosticReport can render English labels without leaking passwords", () => {
  const report = buildDiagnosticReport({
    language: "en",
    generatedAt: "2026-06-08 08:30:00",
    workflow: {
      safetyMode: "disabled",
      dryRunEvents: 0,
      mainPyRemoved: true
    },
    formConfig: {
      wifi_ssid: "StudioWifi",
      wifi_password: "",
      u1_host: "printer.local",
      mode: "websocket_agent"
    },
    portInfo: "Not selected",
    hardwareRouteId: "esp32-c3-compatible",
    moonrakerStatus: "Not tested",
    recoveryStatus: "main.py removed",
    friendlyLogText: "",
    rawLogText: ""
  });

  assert.match(report, /ESP32 Timelapse Box \/ Klipper Diagnostic Report/);
  assert.match(report, /Hardware route: Compatible ESP32-C3 shutter box/);
  assert.match(report, /Safety: disabled/);
  assert.match(report, /Wi-Fi password: \(empty\)/);
  assert.match(report, /Moonraker: printer\.local/);
  assert.match(report, /Backend: websocket_agent/);
  assert.match(report, /Recovery: main\.py removed/);
  assert.doesNotMatch(report, /StudioWifi.*\n.*StudioWifi/s);
});
