import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BRAND_EN,
  BRAND_ZH,
  REPOSITORY_URL,
  forbiddenPublicBrandTerms
} from "./brandPolicy.js";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("brand policy exposes the canonical bilingual identity", () => {
  assert.equal(BRAND_ZH, "ESP32 延时摄影盒子");
  assert.equal(BRAND_EN, "ESP32 Timelapse Box");
  assert.equal(REPOSITORY_URL, "https://github.com/MOVIBALE/esp32-timelapse-box");
  assert.deepEqual(forbiddenPublicBrandTerms, [
    "CyberBrick",
    "Bambu",
    "BBL",
    "拓竹",
    "竹子"
  ]);
});

test("primary configurator surfaces use the ESP32 Timelapse Box identity", () => {
  const surfaces = [
    "index.html",
    "src/i18n/strings.js",
    "src/runtime/diagnosticReport.js"
  ];
  const text = surfaces
    .map((path) => readFileSync(resolve(appRoot, path), "utf8"))
    .join("\n");

  assert.match(text, /ESP32 延时摄影盒子/);
  assert.match(text, /ESP32 Timelapse Box/);
  for (const term of forbiddenPublicBrandTerms) {
    assert.doesNotMatch(text, new RegExp(term, "i"), `${term} leaked into the primary UI`);
  }
});

