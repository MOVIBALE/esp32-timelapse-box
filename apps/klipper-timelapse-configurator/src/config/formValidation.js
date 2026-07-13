const FIELD_LABELS = {
  wifi_ssid: {
    "zh-CN": "Wi-Fi SSID",
    en: "Wi-Fi SSID"
  },
  wifi_password: {
    "zh-CN": "Wi-Fi 密码",
    en: "Wi-Fi password"
  },
  u1_host: {
    "zh-CN": "Moonraker 地址",
    en: "Moonraker address"
  }
};

export function validateBoardFormConfig(input = {}) {
  const value = {
    wifi_ssid: String(input.wifi_ssid || "").trim(),
    wifi_password: String(input.wifi_password || "").trim(),
    u1_host: String(input.u1_host || "").trim()
  };
  const missing = Object.keys(value).filter((key) => !value[key]);

  if (missing.length) {
    return { ok: false, missing };
  }

  return { ok: true, missing: [], value };
}

export function formatMissingBoardFormConfig(missing) {
  const zhFields = missing.map((field) => FIELD_LABELS[field]?.["zh-CN"] || field).join("、");
  const enFields = missing.map((field) => FIELD_LABELS[field]?.en || field).join(", ");

  return {
    "zh-CN": `请先填写：${zhFields}。未填完整前不会写入板子。`,
    en: `Fill in ${enFields} before writing to the board.`
  };
}
