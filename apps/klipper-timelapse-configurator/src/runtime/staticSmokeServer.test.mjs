import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { startStaticSmokeServer } from "./staticSmokeServer.js";

test("startStaticSmokeServer serves local app files on an ephemeral localhost port", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "esp32-timelapse-static-smoke-"));
  writeFileSync(resolve(root, "index.html"), "<!doctype html><title>Smoke</title>");
  writeFileSync(resolve(root, "app.js"), "export const ok = true;");
  const server = await startStaticSmokeServer({ root });

  try {
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    const html = await fetchText(server.url);
    const js = await fetchText(`${server.url}app.js`);

    assert.match(html, /Smoke/);
    assert.match(js, /ok = true/);
  } finally {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("startStaticSmokeServer blocks path traversal outside the app root", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "esp32-timelapse-static-smoke-"));
  writeFileSync(resolve(root, "index.html"), "ok");
  const server = await startStaticSmokeServer({ root });

  try {
    assert.equal(await requestStatus(server.url, "/..%2fsecret.txt"), 403);
  } finally {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  }
});

async function fetchText(url) {
  const response = await fetch(url);
  assert.equal(response.status, 200);
  return response.text();
}

function requestStatus(baseUrl, path) {
  const url = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: url.hostname,
      method: "GET",
      path,
      port: url.port
    }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    request.on("error", reject);
    request.end();
  });
}
