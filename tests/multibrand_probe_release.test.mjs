import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import {
  MULTIBRAND_PROBE_DOCS,
  MULTIBRAND_PROBE_ARCHIVE_ENTRIES,
  MULTIBRAND_PROBE_VERSION,
  buildMultibrandProbeRelease,
  multibrandProbeReleasePaths
} from "../scripts/multibrandProbeRelease.mjs";

test("alpha release uses a separate, unmistakable output path", () => {
  const paths = multibrandProbeReleasePaths({ workspaceRoot: "C:/repo" });
  assert.match(paths.outputDirectory.replaceAll("\\", "/"), /release\/multibrand-probe-v0\.1\.0-alpha\.1$/);
  assert.match(paths.factoryRelease, /multibrand-probe-v0\.1\.0-alpha\.1-factory\.bin$/);
  assert.equal(MULTIBRAND_PROBE_VERSION, "0.1.0-alpha.1");
});

test("alpha release packages firmware, bilingual guidance, attribution, and checksums", () => {
  const root = mkdtempSync(resolve(tmpdir(), "multibrand-probe-release-"));
  try {
    const paths = multibrandProbeReleasePaths({ workspaceRoot: root });
    mkdirSync(dirname(paths.factorySource), { recursive: true });
    writeFileSync(paths.factorySource, Buffer.from("factory-image"));
    for (const path of MULTIBRAND_PROBE_DOCS) {
      const target = resolve(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, `fixture:${path}\n`);
    }

    const result = buildMultibrandProbeRelease({ workspaceRoot: root, date: new Date("2026-07-17T00:00:00Z") });
    assert.equal(result.assets.length, 3);
    const archive = readFileSync(paths.docsArchive);
    for (const { name } of MULTIBRAND_PROBE_ARCHIVE_ENTRIES) {
      assert.equal(archive.includes(Buffer.from(name)), true);
    }
    assert.equal(archive.includes(Buffer.from("README-FIRST.zh-CN.md")), true);
    assert.equal(archive.includes(Buffer.from("LICENSES/FURBLE-LICENSE.txt")), true);
    const checksums = readFileSync(paths.checksumFile, "utf8");
    assert.match(checksums, /^[a-f0-9]{64}  esp32-timelapse-box-multibrand-probe-/m);
    assert.match(checksums, /-docs\.zip$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
