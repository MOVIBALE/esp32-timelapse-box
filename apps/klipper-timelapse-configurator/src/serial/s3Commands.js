const UNSUPPORTED_SEPARATOR = /[|\r\n]/;

export function buildProvisionCommand({ ssid, password = "", host }) {
  const safeSsid = validateField(ssid, "SSID", { required: true });
  const safePassword = validateField(password, "Wi-Fi password");
  const safeHost = validateField(host, "Moonraker host", { required: true });
  return `w ${safeSsid}|${safePassword}|${safeHost}\n`;
}

export function buildConnectSonyCommand() {
  return "b\n";
}

export function buildPairSonyCommand() {
  return "q\n";
}

export function buildDisarmCommand() {
  return "d\n";
}

export function buildArmCommand() {
  return "a\n";
}

export function buildStatusCommands() {
  return ["s\n", "p\n"];
}

export function parseS3StatusLine(line) {
  const text = String(line || "").trim();
  const values = parseKeyValues(text);

  if (text.includes("SONY_BLUEDROID_SHUTTER_PAIRING_DONE")) {
    return {
      type: "sonyPairing",
      bonded: values.bonded === "true",
      noFf01Writes: values.no_ff01_writes === "true"
    };
  }

  if (text.includes("SONY_BLUEDROID_SHUTTER_STATUS")) {
    return {
      type: "sonyStatus",
      connected: values.connected === "true",
      ready: values.ready === "true"
    };
  }

  if (text.includes("TIMELAPSE_STATUS")) {
    return {
      type: "timelapseStatus",
      enabled: values.enabled === "true",
      dryRun: values.dry_run === "true",
      armed: values.armed === "true",
      macroSource: values.macro_source || "none"
    };
  }

  if (text.includes("TIMELAPSE_MACRO_EVENT") && values.action === "trigger") {
    return {
      type: "timelapseEvent",
      layer: numberOrNull(values.layer),
      filename: values.filename || "",
      dryRun: values.dry_run === "true",
      macroSource: values.macro_source || "none"
    };
  }

  return { type: "other" };
}

function validateField(value, label, { required = false } = {}) {
  const text = String(value ?? "").trim();
  if (required && !text) throw new Error(`${label} is required`);
  if (UNSUPPORTED_SEPARATOR.test(text)) {
    throw new Error(`${label} contains an unsupported serial separator`);
  }
  return text;
}

function parseKeyValues(text) {
  const values = {};
  for (const match of text.matchAll(/([a-zA-Z0-9_]+)=([^\s]*)/g)) {
    values[match[1]] = match[2];
  }
  return values;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
