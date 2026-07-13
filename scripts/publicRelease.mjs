import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { basename, resolve } from "node:path";

import {
  createReleaseArchive,
  RELEASE_VERSION
} from "../apps/klipper-timelapse-configurator/src/release/releasePackage.js";

export const PUBLIC_RELEASE_VERSION = RELEASE_VERSION;

export function publicReleasePaths({ workspaceRoot, version = PUBLIC_RELEASE_VERSION } = {}) {
  const root = workspaceRoot || process.cwd();
  const outputDirectory = resolve(root, "release", `v${version}`);

  return {
    outputDirectory,
    configuratorArchive: resolve(
      outputDirectory,
      `esp32-timelapse-box-configurator-v${version}.zip`
    ),
    factorySource: resolve(
      root,
      "firmware",
      "esp32-s3-sony-ble-timelapse",
      ".pio",
      "build",
      "esp32-s3-devkitc-1",
      "firmware.factory.bin"
    ),
    factoryRelease: resolve(
      outputDirectory,
      `esp32-timelapse-box-s3-factory-v${version}.bin`
    ),
    checksumFile: resolve(outputDirectory, "SHA256SUMS.txt")
  };
}

export function buildPublicRelease({
  workspaceRoot,
  version = PUBLIC_RELEASE_VERSION,
  date = new Date(),
  copy = copyFileSync,
  exists = existsSync,
  mkdir = mkdirSync,
  read = readFileSync,
  write = writeFileSync
} = {}) {
  const root = workspaceRoot || process.cwd();
  const paths = publicReleasePaths({ workspaceRoot: root, version });

  if (!exists(paths.factorySource)) {
    throw new Error(
      "Missing ESP32-S3 factory image. Run the PlatformIO firmware build before packaging."
    );
  }

  mkdir(paths.outputDirectory, { recursive: true });
  const configurator = createReleaseArchive({
    workspaceRoot: root,
    outputPath: paths.configuratorArchive,
    date
  });
  if (!configurator.ok) {
    const details = [
      ...configurator.report.missingIncludes.map((path) => `missing: ${path}`),
      ...configurator.report.sensitiveMatches.map(
        (match) => `sensitive: ${match.path} (${match.label})`
      )
    ];
    throw new Error(`Configurator package validation failed. ${details.join("; ")}`);
  }

  copy(paths.factorySource, paths.factoryRelease);
  const assets = [paths.configuratorArchive, paths.factoryRelease];
  write(paths.checksumFile, formatSha256Sums(assets, { read }), "utf-8");

  return {
    assets: [...assets, paths.checksumFile],
    configuratorBytes: configurator.bytes,
    paths,
    version
  };
}

export function formatSha256Sums(paths, { read = readFileSync } = {}) {
  return paths
    .map((path) => `${sha256(read(path))}  ${basename(path)}`)
    .join("\n") + "\n";
}

export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}
