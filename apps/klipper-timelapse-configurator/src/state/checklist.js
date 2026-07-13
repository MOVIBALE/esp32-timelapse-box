export function buildChecklistState(workflow, options = {}) {
  if (options.hardwareRouteId === "esp32-s3-sony-ble") {
    return buildS3ChecklistState(workflow, options);
  }
  return buildC3ChecklistState(workflow);
}

function buildC3ChecklistState(workflow) {
  const connected = Boolean(workflow.board?.connected);
  const safeUploaded = Boolean(workflow.safeConfigured)
    || ["safe-uploaded", "observe", "armed", "recover", "recovered"].includes(workflow.step);
  const dryRunActive = workflow.safetyMode === "dry-run" || workflow.dryRunEvents > 0 || workflow.safetyMode === "armed";
  const layerSeen = workflow.dryRunEvents > 0;
  const recovered = Boolean(workflow.mainPyRemoved);

  return [
    {
      id: "connect",
      title: bilingual("连接板子", "Connect board"),
      state: connected ? "done" : "current",
      detail: connected
        ? bilingual(`已连接：${workflow.board.portLabel || "Web Serial"}。`, `Connected: ${workflow.board.portLabel || "Web Serial"}.`)
        : bilingual("先连接板子并在 Chrome 弹窗里选择 COM 口。", "Connect the board and choose the COM port in Chrome.")
    },
    {
      id: "safe-upload",
      title: bilingual("上传安全监听器", "Upload safe listener"),
      state: safeUploaded ? "done" : connected ? "current" : "locked",
      detail: safeUploaded
        ? bilingual("安全监听器已上传，默认 disabled/dry-run。", "Safe listener uploaded with disabled/dry-run defaults.")
        : bilingual("填好 Wi-Fi 和 Moonraker 后上传安全监听器。", "Fill Wi-Fi and Moonraker, then upload the safe listener.")
    },
    {
      id: "dry-run",
      title: bilingual("启用 dry-run", "Enable dry-run"),
      state: dryRunActive ? "done" : safeUploaded ? "current" : "locked",
      detail: dryRunActive
        ? bilingual("dry-run 已启用，只记录层变化。", "Dry-run is active and only records layer changes.")
        : bilingual("启用 dry-run 后软重启，等待板子轮询 Moonraker。", "Enable dry-run, soft reset, then wait for board polling.")
    },
    {
      id: "layer-seen",
      title: bilingual("确认真实层变化", "Confirm real layer change"),
      state: layerSeen ? "done" : dryRunActive ? "current" : "locked",
      detail: layerSeen
        ? bilingual(
            `已看到 ${workflow.dryRunEvents} 次真实层变化，最近层：${workflow.lastLayer ?? "-"}。`,
            `Saw ${workflow.dryRunEvents} real layer change(s), latest layer: ${workflow.lastLayer ?? "-"}.`
          )
        : bilingual("开始真实打印后，等这里出现层变化再考虑 armed。", "Start a real print and wait for layer changes before arming.")
    },
    {
      id: "recover",
      completionKind: "recovered",
      title: bilingual("恢复官方状态", "Recover stock behavior"),
      state: recovered ? "done" : connected ? "available" : "locked",
      detail: recovered
        ? bilingual(
            "main.py 已删除。软重启后自定义监听器不会自动启动。",
            "main.py is removed. The custom listener will not auto-start after reset."
          )
        : bilingual("需要回到官方状态时，删除 main.py 后软重启。", "To return to stock behavior, delete main.py and soft reset.")
    }
  ];
}

function buildS3ChecklistState(workflow, { sonyReady = false } = {}) {
  const connected = Boolean(workflow.board?.connected);
  const configured = Boolean(workflow.safeConfigured);
  const dryRunActive = workflow.safetyMode === "dry-run" || workflow.dryRunEvents > 0;
  const layerSeen = workflow.dryRunEvents > 0;
  const armed = workflow.safetyMode === "armed";

  return [
    {
      id: "connect",
      title: bilingual("连接板子", "Connect board"),
      state: connected ? "done" : "current",
      detail: connected
        ? bilingual(`已连接：${workflow.board.portLabel || "Web Serial"}，并自动锁定 dry-run。`, `Connected: ${workflow.board.portLabel || "Web Serial"}; dry-run was locked automatically.`)
        : bilingual("先连接板子并在 Chrome 弹窗里选择串口。", "Connect the board and choose its serial port in Chrome.")
    },
    {
      id: "safe-upload",
      title: bilingual("配置网络", "Provision network"),
      state: configured ? "done" : connected ? "current" : "locked",
      detail: configured
        ? bilingual("Wi-Fi 与 Moonraker 地址已写入，盒子保持 dry-run。", "Wi-Fi and Moonraker were written; the box remains in dry-run.")
        : bilingual("填写 Wi-Fi 与 Moonraker 地址，再点击配置网络。", "Fill Wi-Fi and Moonraker, then provision the network.")
    },
    {
      id: "dry-run",
      title: bilingual("连接 Sony 相机", "Connect Sony camera"),
      state: sonyReady ? "done" : configured ? "current" : "locked",
      detail: sonyReady
        ? bilingual("Sony 已连接并达到 ready=true。", "Sony is connected and reports ready=true.")
        : bilingual(
            "首次使用：让相机进入蓝牙遥控配对界面并点“首次配对 Sony”；以后开机直接点“连接已配对 Sony”。",
            "First use: open the camera's Bluetooth remote pairing screen and click Pair Sony for first use. Later boots only need Connect paired Sony."
          )
    },
    {
      id: "layer-seen",
      title: bilingual("确认 dry-run 层事件", "Confirm dry-run layer events"),
      state: layerSeen ? "done" : configured && sonyReady && dryRunActive ? "current" : "locked",
      detail: layerSeen
        ? bilingual(
            `已看到 ${workflow.dryRunEvents} 次层事件，最近层：${workflow.lastLayer ?? "-"}；期间没有触发快门。`,
            `Saw ${workflow.dryRunEvents} layer event(s), latest layer: ${workflow.lastLayer ?? "-"}; no shutter was triggered.`
          )
        : bilingual("开始短打印，至少看到一次层事件后再考虑 armed。", "Start a short print and observe at least one layer event before arming.")
    },
    {
      id: "recover",
      completionKind: "armed",
      title: bilingual("准备正式触发", "Prepare armed triggering"),
      state: armed ? "done" : layerSeen && sonyReady ? "available" : "locked",
      detail: armed
        ? bilingual("盒子已 armed；有效层事件会触发 Sony 快门。", "The box is armed; valid layer events trigger the Sony shutter.")
        : bilingual(
            "确认相机画面后输入确认短语；不拍摄时用“锁定为 dry-run”立即关闭快门触发。",
            "Confirm the camera view, then enter the confirmation phrase; use Lock to dry-run to disable shutter triggering immediately."
          )
    }
  ];
}

export function summarizeChecklistState(items, language = "zh-CN") {
  const done = items.filter((item) => item.state === "done").length;
  const progress = progressText(done, items.length, language);
  const recovered = items.find((item) => item.completionKind === "recovered" && item.state === "done");
  if (recovered) {
    return language === "zh-CN" ? `已恢复 · ${progress}` : `Recovered · ${progress}`;
  }

  const armed = items.find((item) => item.completionKind === "armed" && item.state === "done");
  if (armed) {
    return language === "zh-CN" ? `已 armed · ${progress}` : `Armed · ${progress}`;
  }

  const current = items.find((item) => item.state === "current");
  if (current) {
    return language === "zh-CN"
      ? `当前：${current.title[language]} · ${progress}`
      : `Current: ${current.title[language]} · ${progress}`;
  }

  const available = items.find((item) => item.state === "available");
  if (available) {
    return language === "zh-CN"
      ? `可选：${available.title[language]} · ${progress}`
      : `Optional: ${available.title[language]} · ${progress}`;
  }

  return progress;
}

function bilingual(zh, en) {
  return { "zh-CN": zh, en };
}

function progressText(done, total, language) {
  return language === "zh-CN" ? `已完成 ${done}/${total}` : `${done}/${total} done`;
}
