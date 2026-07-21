import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const requiredFiles = [
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "README-FIRST.md",
  ".github/workflows/ci.yml",
  "scripts/build-s3-firmware.mjs",
  "scripts/build-public-release.mjs",
  "scripts/publicRelease.mjs",
  "scripts/build-multibrand-firmware.mjs",
  "scripts/build-multibrand-probe-release.mjs",
  "scripts/multibrandProbeRelease.mjs",
  "docs/multibrand-community-testing.md",
  "docs/multibrand-community-testing.zh-CN.md",
  "docs/multibrand-community-compatibility.md"
];
const primaryBrandSurfaces = [
  "README.md",
  "README-FIRST.md",
  "START-WINDOWS.cmd",
  "START-MAC.command",
  "apps/klipper-timelapse-configurator/index.html",
  "apps/klipper-timelapse-configurator/src/i18n/strings.js",
  "apps/klipper-timelapse-configurator/start-configurator.cmd",
  "apps/klipper-timelapse-configurator/start-configurator.command"
];
const forbiddenPrimaryTerms = ["CyberBrick", "Bambu", "BBL", "拓竹", "竹子"];
const sensitivePatterns = [
  ["BLE or MAC address literal", /\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b/],
  ["absolute Windows user path", /\b[A-Za-z]:[\\/]Users[\\/](?!Example(?:[\\/]|$)|USERNAME(?:[\\/]|$)|<)/i],
  ["absolute development path", /\b[A-Za-z]:[\\/](?:FC|Projects?|Repos?|src)[\\/]/i]
];
const textExtensions = new Set([".c", ".cfg", ".cmd", ".command", ".css", ".h", ".html", ".ini", ".js", ".json", ".md", ".mjs", ".py", ".txt"]);

test("public repository baseline files and product contract exist", () => {
  for (const path of requiredFiles) {
    assert.ok(existsSync(resolve(root, path)), `missing public repository file: ${path}`);
  }

  const readme = read("README.md");
  assert.match(readme, /^# ESP32 Timelapse Box/m);
  assert.match(readme, /ESP32 延时摄影盒子/);
  assert.match(readme, /ESP32-S3 \+ Sony BLE/);
  assert.match(readme, /compatible ESP32-C3/i);
  assert.match(readme, /135\s*\/\s*135/);
  assert.match(readme, /not affiliated/i);
  assert.match(readme, /GPL-3\.0-only/);
  assert.doesNotMatch(readme, /MIT licensed/i);

  const license = read("LICENSE");
  assert.match(license, /GNU GENERAL PUBLIC LICENSE/);
  assert.match(license, /Version 3, 29 June 2007/);
  assert.match(license, /END OF TERMS AND CONDITIONS/);

  const contributing = read("CONTRIBUTING.md");
  assert.match(contributing, /GPL-3\.0-only/);
});

test("primary product surfaces use only the canonical identity", () => {
  for (const path of primaryBrandSurfaces) {
    const text = read(path);
    for (const term of forbiddenPrimaryTerms) {
      assert.doesNotMatch(text, new RegExp(escapeRegExp(term), "i"), `${path} exposes legacy brand ${term}`);
    }
  }
});

test("tracked public text contains no local secrets or machine-specific evidence", () => {
  const violations = [];
  for (const path of trackedFiles()) {
    if (!isPublicationCandidate(path)) continue;
    const text = read(path);
    for (const [label, pattern] of sensitivePatterns) {
      if (pattern.test(text)) violations.push(`${path}: ${label}`);
    }
    if (extname(path).toLowerCase() === ".json") {
      for (const match of text.matchAll(/"wifi_password"\s*:\s*"([^"]*)"/gi)) {
        if (match[1] && match[1] !== "******") {
          violations.push(`${path}: non-empty wifi_password JSON value`);
        }
      }
    }
  }
  assert.deepEqual(violations, []);
});

function trackedFiles() {
  return execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf-8"
  }).split(/\r?\n/).filter(Boolean);
}

function isPublicationCandidate(path) {
  const normalized = path.replace(/\\/g, "/");
  if (!textExtensions.has(extname(normalized).toLowerCase())) return false;
  if (/(^|\/)tests?\//i.test(normalized) || /\.test\.[^.]+$/i.test(normalized)) return false;
  if (normalized.startsWith("docs/superpowers/")) return false;
  if (/^(backups|external|logs|notes|release|u1_config)\//.test(normalized)) return false;
  return true;
}

function read(path) {
  return readFileSync(resolve(root, path), "utf-8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
