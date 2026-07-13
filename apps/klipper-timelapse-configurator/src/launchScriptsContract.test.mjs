import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(root, "../..");
const windowsLauncher = readFileSync(resolve(root, "start-configurator.cmd"), "utf-8");
const macLauncher = readFileSync(resolve(root, "start-configurator.command"), "utf-8");
const rootWindowsLauncher = readFileSync(resolve(workspaceRoot, "START-WINDOWS.cmd"), "utf-8");
const rootMacLauncher = readFileSync(resolve(workspaceRoot, "START-MAC.command"), "utf-8");
const windowsFallbackPath = resolve(root, "scripts/serve-static.ps1");

test("launch scripts serve the browser configurator on localhost only", () => {
  for (const script of [windowsLauncher, macLauncher]) {
    assert.match(script, /127\.0\.0\.1:8776/);
    assert.match(script, /http\.server\s+8776/);
    assert.match(script, /--bind\s+127\.0\.0\.1/);
  }
});

test("launch scripts stay browser-first and do not invoke board operations", () => {
  for (const script of [windowsLauncher, macLauncher]) {
    assert.doesNotMatch(script, /electron|tauri|serial|COM6|board_listener|main\.py/i);
  }
});

test("launch scripts open the local page before blocking on the server process", () => {
  assert.ok(windowsLauncher.indexOf("start \"\"") < windowsLauncher.indexOf("http.server 8776"));
  assert.ok(macLauncher.indexOf("open ") < macLauncher.indexOf("http.server 8776"));
});

test("Windows launcher can fall back to a bundled PowerShell localhost server", () => {
  assert.match(windowsLauncher, /serve-static\.ps1/);
  assert.equal(existsSync(windowsFallbackPath), true, "expected PowerShell fallback server");

  const fallback = readFileSync(windowsFallbackPath, "utf-8");
  assert.match(fallback, /TcpListener/);
  assert.match(fallback, /127\.0\.0\.1/);
  assert.match(fallback, /index\.html/);
  assert.doesNotMatch(fallback, /serial|COM6|board_listener|main\.py/i);
});

test("release root launchers only forward into the browser configurator app", () => {
  assert.match(rootWindowsLauncher, /apps\\klipper-timelapse-configurator/);
  assert.match(rootWindowsLauncher, /start-configurator\.cmd/);
  assert.match(rootMacLauncher, /apps\/klipper-timelapse-configurator/);
  assert.match(rootMacLauncher, /start-configurator\.command/);

  for (const script of [rootWindowsLauncher, rootMacLauncher]) {
    assert.doesNotMatch(script, /electron|tauri|serial|COM6|board_listener|main\.py/i);
  }
});
