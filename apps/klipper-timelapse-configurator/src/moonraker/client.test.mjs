import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchMoonrakerStatus,
  formatMoonrakerProbeResult,
  normalizeMoonrakerTarget
} from "./client.js";

test("normalizeMoonrakerTarget accepts a bare Klipper host", () => {
  const target = normalizeMoonrakerTarget("192.0.2.10");

  assert.equal(target.host, "192.0.2.10");
  assert.equal(target.port, 7125);
  assert.equal(target.origin, "http://192.0.2.10:7125");
  assert.equal(
    target.statusUrl,
    "http://192.0.2.10:7125/printer/objects/query?print_stats&gcode_move"
  );
});

test("normalizeMoonrakerTarget strips protocol, port, and path for board host", () => {
  const target = normalizeMoonrakerTarget("http://printer.local:7125/status");

  assert.equal(target.host, "printer.local");
  assert.equal(target.port, 7125);
  assert.equal(target.boardHost, "printer.local");
});

test("fetchMoonrakerStatus parses print state and layer info", async () => {
  const fetcher = async (url) => {
    assert.equal(url, "http://192.0.2.10:7125/printer/objects/query?print_stats&gcode_move");
    return new Response(JSON.stringify({
      result: {
        status: {
          print_stats: {
            state: "printing",
            filename: "part.gcode",
            info: { current_layer: 12, total_layer: 80 }
          }
        }
      }
    }));
  };

  const status = await fetchMoonrakerStatus("192.0.2.10", fetcher);

  assert.deepEqual(status, {
    ok: true,
    state: "printing",
    filename: "part.gcode",
    currentLayer: 12,
    totalLayer: 80
  });
});

test("formatMoonrakerProbeResult gives beginner-readable success text", () => {
  const result = formatMoonrakerProbeResult({
    ok: true,
    state: "printing",
    filename: "part.gcode",
    currentLayer: 12,
    totalLayer: 80
  });

  assert.match(result["zh-CN"], /浏览器能访问 Moonraker/);
  assert.match(result.en, /Browser can reach Moonraker/);
});
