import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workspaceRoot = resolve(appRoot, "../..");
const releaseModulePath = resolve(appRoot, "src/release/releasePackage.js");
const releaseScriptPath = resolve(appRoot, "scripts/checkReleasePackage.mjs");
const releaseZipScriptPath = resolve(appRoot, "scripts/buildReleaseZip.mjs");
const packageJson = JSON.parse(readFileSync(resolve(appRoot, "package.json"), "utf-8"));

test("release package manifest includes runtime files and excludes local-only artifacts", async () => {
  const {
    RELEASE_INCLUDE_PATHS,
    RELEASE_EXCLUDE_PATTERNS,
    isExcludedReleasePath
  } = await importReleasePackage();

  for (const required of [
    "README.md",
    "README-FIRST.md",
    "CHANGELOG.md",
    "LICENSE",
    "START-WINDOWS.cmd",
    "START-MAC.command",
    "apps/klipper-timelapse-configurator/index.html",
    "apps/klipper-timelapse-configurator/README.md",
    "apps/klipper-timelapse-configurator/src",
    "apps/klipper-timelapse-configurator/board-assets",
    "config/klipper/esp32_timelapse.cfg",
    "device_files/board_listener.py",
    "device_files/moonraker_agent.py",
    "tools/esp32_timelapse_fs.py",
    "docs/quickstart-esp32-s3-sony-ble.md",
    "docs/quickstart-compatible-esp32-c3.md",
    "docs/release-v0.1.0.md",
    "docs/video-tutorial-script-cn.md",
    "docs/snaporca/esp32-timelapse-box-migration-prompt.md"
  ]) {
    assert.ok(RELEASE_INCLUDE_PATHS.includes(required), `${required} should be included`);
  }

  for (const required of [
    "logs/**",
    "backups/**",
    "u1_config/**",
    "DSC*.jpg",
    "**/*.pcapng",
    "apps/klipper-timelapse-configurator/src/release/**",
    "apps/klipper-timelapse-configurator/src/**/*.test.mjs"
  ]) {
    assert.ok(RELEASE_EXCLUDE_PATTERNS.includes(required), `${required} should be excluded`);
  }

  for (const excluded of [
    "logs/web_serial_dryrun_events_20260608_033434.log",
    "backups/board_listener.py",
    "u1_config/printer.cfg",
    "DSC00013_button_crop.jpg",
    "logs/sony_ptp_remote_handshake.pcapng",
    "apps/klipper-timelapse-configurator/src/release/releasePackage.js",
    "apps/klipper-timelapse-configurator/src/runtime/chromeWorkflowSmoke.js",
    "apps/klipper-timelapse-configurator/src/config/boardConfig.test.mjs"
  ]) {
    assert.equal(isExcludedReleasePath(excluded), true, `${excluded} should be filtered out`);
  }
});

test("release package validation passes for current shareable files", async () => {
  const { normalizeReleasePath, validateReleasePackage } = await importReleasePackage();
  const report = validateReleasePackage({ workspaceRoot });

  assert.equal(report.ok, true);
  assert.deepEqual(report.missingIncludes, []);
  assert.deepEqual(report.sensitiveMatches, []);
  assert.ok(report.files.length > 20, "expected a non-trivial runtime package file list");
  assert.equal(report.files.some((file) => file.endsWith(".test.mjs")), false);

  const includedFiles = new Set(report.files);
  for (const file of report.files.filter((path) => path.endsWith(".js"))) {
    const source = readFileSync(resolve(workspaceRoot, file), "utf-8");
    for (const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      const dependency = normalizeReleasePath(relative(
        workspaceRoot,
        resolve(dirname(resolve(workspaceRoot, file)), match[1])
      ));
      assert.ok(includedFiles.has(dependency), `${file} requires missing ${dependency}`);
    }
  }
});

test("package exposes a release check script", () => {
  assert.equal(packageJson.scripts["release:check"], "node scripts/checkReleasePackage.mjs");
  assert.equal(existsSync(releaseScriptPath), true, "expected release check script");
});

test("package exposes a release zip script", () => {
  assert.equal(packageJson.scripts["release:zip"], "node scripts/buildReleaseZip.mjs");
  assert.equal(existsSync(releaseZipScriptPath), true, "expected release zip script");
});

test("package exposes the complete public release builder", () => {
  assert.equal(packageJson.scripts["release:public"], "node ../../scripts/build-public-release.mjs");
  assert.equal(existsSync(resolve(workspaceRoot, "scripts/build-public-release.mjs")), true);
});

test("default archive name uses the canonical product and release version", async () => {
  const { defaultReleaseArchivePath, RELEASE_VERSION } = await importReleasePackage();
  const archivePath = defaultReleaseArchivePath({ workspaceRoot });

  assert.equal(RELEASE_VERSION, "0.1.0");
  assert.ok(
    archivePath.replace(/\\/g, "/").endsWith(
      `/release/v${RELEASE_VERSION}/esp32-timelapse-box-configurator-v${RELEASE_VERSION}.zip`
    )
  );
  assert.doesNotMatch(archivePath, /cyberbrick/i);
});

test("release archive writer creates a zip with only safe relative entries", async () => {
  const { createReleaseArchive } = await importReleasePackage();
  const outputDir = mkdtempSync(resolve(tmpdir(), "esp32-timelapse-box-release-"));
  const outputPath = resolve(outputDir, "esp32-timelapse-box-configurator.zip");

  try {
    const result = createReleaseArchive({ workspaceRoot, outputPath });
    const archive = readFileSync(outputPath);
    const entries = readZipEntryNames(archive);
    const centralEntries = readZipCentralDirectoryEntries(archive);

    assert.equal(result.ok, true);
    assert.ok(result.bytes > 1000, "expected a non-empty zip archive");
    assert.ok(entries.includes("README-FIRST.md"));
    assert.ok(entries.includes("README.md"));
    assert.ok(entries.includes("CHANGELOG.md"));
    assert.ok(entries.includes("LICENSE"));
    assert.ok(entries.includes("START-WINDOWS.cmd"));
    assert.ok(entries.includes("START-MAC.command"));
    assert.ok(entries.includes("apps/klipper-timelapse-configurator/index.html"));
    assert.ok(entries.includes("apps/klipper-timelapse-configurator/README.md"));
    assert.ok(entries.includes("config/klipper/esp32_timelapse.cfg"));
    assert.ok(entries.includes("device_files/board_listener.py"));
    assert.ok(entries.includes("device_files/moonraker_agent.py"));
    assert.ok(entries.includes("tools/esp32_timelapse_fs.py"));
    assert.ok(entries.includes("docs/snaporca/esp32-timelapse-box-migration-prompt.md"));
    assert.equal(entries.some((entry) => entry.includes("\\") || entry.startsWith("/") || /^[A-Z]:/i.test(entry)), false);
    assert.equal(entries.some((entry) => entry.endsWith(".test.mjs")), false);
    assert.equal(entries.includes("apps/klipper-timelapse-configurator/package.json"), false);
    assert.equal(entries.some((entry) => entry.includes("/src/release/")), false);
    assert.equal(entries.some((entry) => entry.endsWith("chromeWorkflowSmoke.js")), false);
    assert.equal(entries.some((entry) => entry.startsWith("logs/")), false);
    assert.equal(entries.some((entry) => entry.startsWith("backups/")), false);

    for (const executable of [
      "START-MAC.command",
      "apps/klipper-timelapse-configurator/start-configurator.command"
    ]) {
      const entry = centralEntries.find((candidate) => candidate.name === executable);
      assert.ok(entry, `${executable} should have a central directory entry`);
      assert.equal(entry.versionMadeBy >> 8, 3, `${executable} should use Unix zip metadata`);
      assert.equal(entry.unixMode & 0o777, 0o755, `${executable} should preserve executable bits`);
    }
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

async function importReleasePackage() {
  assert.equal(existsSync(releaseModulePath), true, "expected src/release/releasePackage.js");
  return import(`${pathToFileURL(releaseModulePath).href}?t=${Date.now()}`);
}

function readZipCentralDirectoryEntries(buffer) {
  const entries = [];
  let offset = skipLocalEntries(buffer);

  while (offset < buffer.length - 4) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x02014b50) break;

    const versionMadeBy = buffer.readUInt16LE(offset + 4);
    const externalAttributes = buffer.readUInt32LE(offset + 38);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    entries.push({
      externalAttributes,
      name: buffer.subarray(nameStart, nameEnd).toString("utf-8"),
      unixMode: externalAttributes >>> 16,
      versionMadeBy
    });
    offset = nameEnd + extraLength + commentLength;
  }

  return entries;
}

function skipLocalEntries(buffer) {
  let offset = 0;

  while (offset < buffer.length - 4) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;

    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    offset += 30 + nameLength + extraLength + compressedSize;
  }

  return offset;
}

function readZipEntryNames(buffer) {
  const names = [];
  let offset = 0;

  while (offset < buffer.length - 4) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;

    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    names.push(buffer.subarray(nameStart, nameEnd).toString("utf-8"));
    offset = nameEnd + extraLength + compressedSize;
  }

  return names;
}
