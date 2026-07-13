export function explainRawLog(raw, language = "zh-CN", createdAt = Date.now()) {
  const line = {
    id: `${createdAt}-${raw.slice(0, 24)}`,
    raw,
    createdAt,
    level: "info",
    zh: "收到板子日志",
    en: "Received board log"
  };

  if (raw.includes("__BOARD_LISTENER_READY__")) {
    line.level = "success";
    line.zh = "板载监听器已启动，安全状态已返回";
    line.en = "Board listener is running and reported safety state";
  } else if (raw.includes("__BOARD_LISTENER_EVENT__") && raw.includes("DRY_RUN")) {
    line.level = "success";
    line.zh = "检测到真实层变化，安全模式记录事件但不触发快门";
    line.en = "Detected a real layer change; dry-run recorded it without triggering";
  } else if (raw.includes("SONY_BLUEDROID_SHUTTER_PAIRING_DONE") && raw.includes("bonded=true")) {
    line.level = "success";
    line.zh = "Sony 首次配对完成；配对过程不会触发快门";
    line.en = "First-time Sony pairing completed; pairing will not trigger the shutter";
  } else if (raw.includes("SONY_BLUEDROID_SHUTTER_PAIRING_START")) {
    line.zh = "已发现处于配对状态的 Sony，相机端确认后会保存绑定";
    line.en = "Found a Sony camera in pairing mode; approve on the camera to save the bond";
  } else if (raw.includes("SONY_BLUEDROID_SHUTTER_PAIRING_TIMEOUT") || raw.includes("SONY_BLUEDROID_SHUTTER_PAIRING_FAILED")) {
    line.level = "error";
    line.zh = "Sony 配对未完成，请重新打开相机的蓝牙遥控配对界面再试";
    line.en = "Sony pairing did not finish; reopen the camera's Bluetooth remote pairing screen and retry";
  } else if (raw.includes("SONY_BLUEDROID_SHUTTER_STATUS") && raw.includes("ready=true")) {
    line.level = "success";
    line.zh = "Sony 相机已连接并可拍摄";
    line.en = "Sony camera is connected and ready";
  } else if (raw.includes("SONY_BLUEDROID_SHUTTER_STATUS") && raw.includes("connected=true")) {
    line.zh = "Sony 相机已连接，正在完成遥控通道初始化";
    line.en = "Sony camera is connected; remote controls are still initializing";
  } else if (raw.includes("SONY_BLUEDROID_SHUTTER_STATUS")) {
    line.zh = "Sony 相机尚未连接";
    line.en = "Sony camera is not connected";
  } else if (raw.includes("TIMELAPSE_MACRO_EVENT") && raw.includes("action=trigger")) {
    const layer = raw.match(/\blayer=(-?\d+)/)?.[1] ?? "-";
    line.level = "success";
    if (raw.includes("dry_run=true")) {
      line.zh = `检测到第 ${layer} 层，当前为 dry-run，不会触发快门`;
      line.en = `Detected layer ${layer}; dry-run will not trigger the shutter`;
    } else {
      line.zh = `检测到第 ${layer} 层，armed 已提交快门触发`;
      line.en = `Detected layer ${layer}; armed mode submitted a shutter trigger`;
    }
  } else if (raw.includes("TIMELAPSE_STATUS")) {
    if (raw.includes("armed=true")) {
      line.level = "error";
      line.zh = "盒子当前处于 armed，真实层事件会触发快门";
      line.en = "The box is armed; real layer events will trigger the shutter";
    } else if (raw.includes("dry_run=true")) {
      line.level = "success";
      line.zh = "盒子已锁定为 dry-run，快门触发已禁用";
      line.en = "The box is locked to dry-run; shutter triggering is disabled";
    }
  } else if (raw.includes("TIMELAPSE_WIFI_CONNECTED")) {
    line.level = "success";
    line.zh = "盒子已连接 Wi-Fi";
    line.en = "The box connected to Wi-Fi";
  } else if (raw.includes("accepted=false")) {
    line.level = "error";
    line.zh = "盒子未接受这条命令，请查看原因并确认配对或连接状态";
    line.en = "The box did not accept this command; check the reason and pairing or connection state";
  } else if (raw.includes("__BOARD_LISTENER_ERROR__") || /traceback|exception|error/i.test(raw)) {
    line.level = "error";
    line.zh = "板子返回错误，展开原始日志查看细节";
    line.en = "Board returned an error; inspect the raw log";
  } else if (raw.includes("__FS_LIST__")) {
    line.level = "success";
    line.zh = "已确认板载文件列表";
    line.en = "Confirmed board file list";
  }

  return line;
}

export function visibleLogText(line, language = "zh-CN") {
  return language === "zh-CN" ? line.zh : line.en;
}
