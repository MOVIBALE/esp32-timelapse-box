export function parseBoardLine(line) {
  const raw = line.trim();
  if (!raw) return { type: "empty", raw };

  if (raw.startsWith("__BOARD_LISTENER_READY__")) {
    const payload = parseMarkerPayload(raw, "__BOARD_LISTENER_READY__");
    return {
      type: "ready",
      enabled: Boolean(payload.enabled),
      dryRun: Boolean(payload.dry_run),
      mode: payload.mode || payload.backend || "",
      raw,
      payload
    };
  }

  if (raw.startsWith("__BOARD_LISTENER_EVENT__")) {
    const payload = parseMarkerPayload(raw, "__BOARD_LISTENER_EVENT__");
    return {
      type: payload.trigger_result === "DRY_RUN" ? "dryRunEvent" : "triggerEvent",
      layer: payload.layer ?? null,
      totalLayer: payload.total_layer ?? payload.totalLayer ?? null,
      filename: payload.filename || "",
      triggerResult: payload.trigger_result || "",
      raw,
      payload
    };
  }

  if (raw.startsWith("__BOARD_LISTENER_ERROR__")) {
    const payload = parseMarkerPayload(raw, "__BOARD_LISTENER_ERROR__");
    return {
      type: "error",
      message: payload.error || payload.raw || raw,
      raw,
      payload
    };
  }

  if (/traceback|exception|error/i.test(raw)) {
    return { type: "error", message: raw, raw, payload: { raw } };
  }

  return { type: "log", raw, payload: { raw } };
}

function parseMarkerPayload(line, marker) {
  const text = line.slice(marker.length);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
