const DEFAULT_MOONRAKER_PORT = 7125;
const STATUS_PATH = "/printer/objects/query?print_stats&gcode_move";

export function normalizeMoonrakerTarget(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) throw new Error("moonraker host is required");

  const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
  const port = Number(url.port || DEFAULT_MOONRAKER_PORT);
  const origin = `${url.protocol}//${url.hostname}:${port}`;

  return {
    host: url.hostname,
    boardHost: url.hostname,
    port,
    origin,
    statusUrl: `${origin}${STATUS_PATH}`
  };
}

export async function fetchMoonrakerStatus(input, fetcher = fetch) {
  const target = normalizeMoonrakerTarget(input);
  const response = await fetcher(target.statusUrl);
  if (!response.ok) {
    throw new Error(`moonraker http ${response.status}`);
  }

  const payload = await response.json();
  const printStats = payload?.result?.status?.print_stats || {};
  const info = printStats.info || {};
  return {
    ok: true,
    state: printStats.state || "unknown",
    filename: printStats.filename || "",
    currentLayer: info.current_layer ?? null,
    totalLayer: info.total_layer ?? null
  };
}

export function formatMoonrakerProbeResult(status) {
  const layerText = formatLayerText(status.currentLayer, status.totalLayer);
  const fileText = status.filename ? ` / ${status.filename}` : "";
  return {
    "zh-CN": `浏览器能访问 Moonraker：${status.state}${layerText}${fileText}`,
    en: `Browser can reach Moonraker: ${status.state}${layerText}${fileText}`
  };
}

export function formatMoonrakerProbeFailure(error) {
  const reason = error?.message || "unknown error";
  return {
    "zh-CN": `浏览器暂时无法访问 Moonraker（${reason}）。板子仍可在局域网内直接轮询；如果要在网页里预检，请确认地址、端口和 Moonraker CORS。`,
    en: `Browser cannot reach Moonraker yet (${reason}). The board can still poll it on the LAN; for browser preflight, check host, port, and Moonraker CORS.`
  };
}

function formatLayerText(current, total) {
  if (current == null && total == null) return "";
  if (current != null && total != null) return ` layer ${current}/${total}`;
  if (current != null) return ` layer ${current}`;
  return ` ${total} total layers`;
}
