import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { basename, resolve } from "node:path";

import { buildZipArchive } from "../apps/klipper-timelapse-configurator/src/release/releasePackage.js";

export const MULTIBRAND_PROBE_VERSION = "0.1.0-alpha.1";
export const MULTIBRAND_PROBE_DOCS = [
  "firmware/esp32-s3-multibrand-nimble-experimental/README.md",
  "firmware/esp32-s3-multibrand-nimble-experimental/README.zh-CN.md",
  "firmware/esp32-s3-multibrand-nimble-experimental/third_party/UPSTREAM.md",
  "firmware/esp32-s3-multibrand-nimble-experimental/third_party/FURBLE-LICENSE.txt",
  "docs/multibrand-community-testing.md",
  "docs/multibrand-community-testing.zh-CN.md",
  "docs/multibrand-community-compatibility.md",
  "docs/release-multibrand-probe-alpha.1.md"
];
export const MULTIBRAND_PROBE_ARCHIVE_ENTRIES = [
  { source: "docs/multibrand-community-testing.zh-CN.md", name: "README-FIRST.zh-CN.md" },
  { source: "docs/multibrand-community-testing.md", name: "README-FIRST.en.md" },
  { source: "docs/release-multibrand-probe-alpha.1.md", name: "RELEASE-NOTES.md" },
  { source: "docs/multibrand-community-compatibility.md", name: "COMPATIBILITY.md" },
  { source: "firmware/esp32-s3-multibrand-nimble-experimental/README.zh-CN.md", name: "FIRMWARE.zh-CN.md" },
  { source: "firmware/esp32-s3-multibrand-nimble-experimental/README.md", name: "FIRMWARE.en.md" },
  { source: "firmware/esp32-s3-multibrand-nimble-experimental/third_party/UPSTREAM.md", name: "LICENSES/FURBLE-UPSTREAM.md" },
  { source: "firmware/esp32-s3-multibrand-nimble-experimental/third_party/FURBLE-LICENSE.txt", name: "LICENSES/FURBLE-LICENSE.txt" }
];

export function multibrandProbeReleasePaths({ workspaceRoot, version = MULTIBRAND_PROBE_VERSION } = {}) {
  const root = workspaceRoot || process.cwd();
  const outputDirectory = resolve(root, "release", `multibrand-probe-v${version}`);
  return {
    outputDirectory,
    factorySource: resolve(root, "firmware", "esp32-s3-multibrand-nimble-experimental", ".pio", "build", "esp32-s3-devkitc-1", "firmware.factory.bin"),
    factoryRelease: resolve(outputDirectory, `esp32-timelapse-box-multibrand-probe-v${version}-factory.bin`),
    docsArchive: resolve(outputDirectory, `esp32-timelapse-box-multibrand-probe-v${version}-docs.zip`),
    checksumFile: resolve(outputDirectory, "SHA256SUMS.txt")
  };
}

export function buildMultibrandProbeRelease({
  workspaceRoot,
  version = MULTIBRAND_PROBE_VERSION,
  date = new Date(),
  exists = existsSync,
  mkdir = mkdirSync,
  read = readFileSync,
  write = writeFileSync,
  copy = copyFileSync
} = {}) {
  const root = workspaceRoot || process.cwd();
  const paths = multibrandProbeReleasePaths({ workspaceRoot: root, version });
  const required = [paths.factorySource, ...MULTIBRAND_PROBE_DOCS.map((path) => resolve(root, path))];
  const missing = required.filter((path) => !exists(path));
  if (missing.length) throw new Error(`Missing multi-brand probe release input: ${missing.join(", ")}`);

  const entries = MULTIBRAND_PROBE_ARCHIVE_ENTRIES.map(({ source, name }) => ({
    name,
    data: read(resolve(root, source))
  }));
  const archive = buildZipArchive(entries, { date });
  mkdir(paths.outputDirectory, { recursive: true });
  copy(paths.factorySource, paths.factoryRelease);
  write(paths.docsArchive, archive);
  const assets = [paths.factoryRelease, paths.docsArchive];
  write(paths.checksumFile, formatChecksums(assets, { read }), "utf8");
  return { assets: [...assets, paths.checksumFile], docsBytes: archive.length, paths, version };
}

export function formatChecksums(paths, { read = readFileSync } = {}) {
  return paths.map((path) => `${createHash("sha256").update(read(path)).digest("hex")}  ${basename(path)}`).join("\n") + "\n";
}
