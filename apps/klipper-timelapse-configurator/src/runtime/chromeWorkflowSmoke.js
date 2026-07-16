export function buildChromeDebugArgs({
  remoteDebuggingPort,
  userDataDir,
  width = 1280,
  height = 900
}) {
  return [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--window-size=${width},${height}`,
    `--remote-debugging-port=${remoteDebuggingPort}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank"
  ];
}

export function buildFakeSerialInjection({
  usbVendorId = 0x303a,
  usbProductId = 0x1001
} = {}) {
  return `(() => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const nativeSetTimeout = window.setTimeout.bind(window);
  window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, Math.min(Number(delay) || 0, 5), ...args);
  let serialController;
  window.__esp32TimelapseSerialWrites = [];
  window.__esp32TimelapseClipboardText = "";
  window.__esp32TimelapseSerialOpened = false;
  window.__esp32TimelapseSerialClosed = false;
  window.__esp32TimelapseEmitSerial = (text) => {
    if (!serialController) return false;
    serialController.enqueue(encoder.encode(String(text)));
    return true;
  };
  const readable = new ReadableStream({
    start(controller) {
      serialController = controller;
    }
  });
  const writable = new WritableStream({
    write(chunk) {
      window.__esp32TimelapseSerialWrites.push(decoder.decode(chunk));
    }
  });
  const port = {
    readable,
    writable,
    getInfo() {
      return { usbVendorId: ${usbVendorId}, usbProductId: ${usbProductId} };
    },
    async open() {
      window.__esp32TimelapseSerialOpened = true;
    },
    async close() {
      window.__esp32TimelapseSerialClosed = true;
    }
  };
  Object.defineProperty(navigator, "serial", {
    configurable: true,
    value: {
      requestPort: async () => port,
      getPorts: async () => [port]
    }
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text) => {
        window.__esp32TimelapseClipboardText = String(text);
      }
    }
  });
})();`;
}

export function workflowSmokeSteps({
  wifiSsid,
  wifiPassword,
  moonrakerHost
}) {
  const fieldValues = JSON.stringify({
    ssidInput: wifiSsid,
    passwordInput: wifiPassword,
    hostInput: moonrakerHost
  });

  return [
    {
      label: "select compatible C3 route",
      expression: `document.querySelector('[data-route="esp32-c3-compatible"]').click()`,
      waitFor: `document.querySelector('[data-route="esp32-c3-compatible"]')?.getAttribute("aria-pressed") === "true"
        && document.querySelector("#uploadSafeButton")?.hidden === false`
    },
    {
      label: "fill required config",
      expression: `(() => {
        const values = ${fieldValues};
        for (const [id, value] of Object.entries(values)) {
          const input = document.querySelector("#" + id);
          input.value = value;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        document.querySelector("#modeSelect").value = "http_poll";
        document.querySelector("#modeSelect").dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`
    },
    {
      label: "connect fake serial",
      expression: `document.querySelector("#connectButton").click()`,
      waitFor: `document.querySelector("#boardStatus")?.textContent.includes("板子已连接")`
    },
    {
      label: "upload disabled dry-run",
      expression: `document.querySelector("#uploadSafeButton").click()`,
      waitFor: `document.querySelector("#friendlyLogs")?.textContent.includes("disabled/dry-run 监听器已上传")`
    },
    {
      label: "enable dry-run",
      expression: `document.querySelector("#enableDryRunButton").click()`,
      waitFor: `document.querySelector("#friendlyLogs")?.textContent.includes("dry-run 已启用")`
    },
    {
      label: "emit dry-run layer event",
      expression: `window.__esp32TimelapseEmitSerial('__BOARD_LISTENER_EVENT__{"layer":236,"total_layer":300,"filename":"workflow-smoke.gcode","trigger_result":"DRY_RUN"}\\n')`,
      waitFor: `document.querySelector("#dryRunEvents")?.textContent === "1"`
    }
  ];
}

export function s3WorkflowSmokeSteps({
  wifiSsid,
  wifiPassword,
  moonrakerHost
}) {
  const fieldValues = JSON.stringify({
    ssidInput: wifiSsid,
    passwordInput: wifiPassword,
    hostInput: moonrakerHost
  });

  return [
    {
      label: "fill S3 config",
      expression: `(() => {
        const values = ${fieldValues};
        for (const [id, value] of Object.entries(values)) {
          const input = document.querySelector("#" + id);
          input.value = value;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return true;
      })()`
    },
    {
      label: "connect S3 fake serial",
      expression: `document.querySelector("#connectButton").click()`,
      waitFor: `document.querySelector("#boardStatus")?.textContent.includes("板子已连接")
        && (window.__esp32TimelapseSerialWrites || []).includes("s\\n")
        && (window.__esp32TimelapseSerialWrites || []).includes("p\\n")
        && !(window.__esp32TimelapseSerialWrites || []).includes("d\\n")`
    },
    {
      label: "provision S3 network",
      expression: `document.querySelector("#provisionS3Button").click()`,
      waitFor: `document.querySelector("#friendlyLogs")?.textContent.includes("网络配置已写入")`
    },
    {
      label: "pair Sony without shooting",
      expression: `document.querySelector("#pairSonyButton").click()`,
      waitFor: `(window.__esp32TimelapseSerialWrites || []).includes("q\\n")
        && !(window.__esp32TimelapseSerialWrites || []).includes("t\\n")
        && !(window.__esp32TimelapseSerialWrites || []).includes("a\\n")`
    },
    {
      label: "emit Sony pairing completion",
      expression: `window.__esp32TimelapseEmitSerial(
        "SONY_BLUEDROID_SHUTTER_PAIRING_DONE bonded=true no_ff01_writes=true\\n"
      )`,
      waitFor: `document.querySelector("#friendlyLogs")?.textContent.includes("首次配对完成")`
    },
    {
      label: "connect paired Sony",
      expression: `document.querySelector("#connectSonyButton").click()`,
      waitFor: `(window.__esp32TimelapseSerialWrites || []).includes("b\\n")`
    },
    {
      label: "emit S3 ready statuses",
      expression: `window.__esp32TimelapseEmitSerial(
        "SONY_BLUEDROID_SHUTTER_STATUS connected=true ready=true\\n"
        + "TIMELAPSE_STATUS enabled=true dry_run=true armed=false macro_source=canonical\\n"
      )`,
      waitFor: `document.querySelector("#sonyStatus")?.textContent.includes("已连接，可拍摄")
        && document.querySelector("#macroSource")?.textContent.includes("ESP_TIMELAPSE_SHOT")`
    },
    {
      label: "emit S3 dry-run macro event",
      expression: `window.__esp32TimelapseEmitSerial(
        "TIMELAPSE_MACRO_EVENT trigger_source=klipper_macro action=trigger macro_source=canonical macro_seq=42 layer=42 filename=s3-workflow-smoke.gcode dry_run=true armed=false sony_ready=true\\n"
      )`,
      waitFor: `document.querySelector("#dryRunEvents")?.textContent === "1"
        && document.querySelector("#lastLayer")?.textContent === "42"`
    }
  ];
}

export function copyLogSmokeSteps({
  forbiddenSecret
} = {}) {
  const secret = JSON.stringify(String(forbiddenSecret || ""));
  return [
    {
      label: "copy logs",
      expression: `document.querySelector("#copyLogButton").click()`,
      waitFor: `typeof window.__esp32TimelapseClipboardText === "string"
        && window.__esp32TimelapseClipboardText.includes("__BOARD_LISTENER_EVENT__")
        && window.__esp32TimelapseClipboardText.includes("workflow-smoke.gcode")
        && window.__esp32TimelapseClipboardText.includes("检测到真实层变化")
        && !window.__esp32TimelapseClipboardText.includes(${secret})`
    }
  ];
}

export function copyReportSmokeSteps({
  forbiddenSecret
} = {}) {
  const secret = JSON.stringify(String(forbiddenSecret || ""));
  return [
    {
      label: "copy diagnostic report",
      expression: `document.querySelector("#copyReportButton").click()`,
      waitFor: `typeof window.__esp32TimelapseClipboardText === "string"
        && window.__esp32TimelapseClipboardText.includes("ESP32 延时摄影盒子 / Klipper 诊断报告")
        && window.__esp32TimelapseClipboardText.includes("安全状态: dry-run")
        && window.__esp32TimelapseClipboardText.includes("Wi-Fi 密码: ******")
        && window.__esp32TimelapseClipboardText.includes("workflow-smoke.gcode")
        && window.__esp32TimelapseClipboardText.includes("__BOARD_LISTENER_EVENT__")
        && !window.__esp32TimelapseClipboardText.includes(${secret})`
    }
  ];
}

export function recoverySmokeSteps() {
  return [
    {
      label: "recover stock behavior",
      expression: `document.querySelector("#recoverButton").click()`,
      waitFor: `document.querySelector("#recoveryStatus")?.textContent.includes("main.py 已删除")
        && document.querySelector("#safetyStatus")?.textContent.includes("已恢复")`
    }
  ];
}
