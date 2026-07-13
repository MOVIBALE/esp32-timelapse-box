import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
  formatSha256Sums,
  publicReleasePaths,
  PUBLIC_RELEASE_VERSION,
  sha256
} from "../scripts/publicRelease.mjs";

const workspaceRoot = resolve(import.meta.dirname, "..");

test("public release uses canonical deterministic asset names", () => {
  const paths = publicReleasePaths({ workspaceRoot });
  const normalized = Object.fromEntries(
    Object.entries(paths).map(([key, value]) => [key, value.replace(/\\/g, "/")])
  );

  assert.equal(PUBLIC_RELEASE_VERSION, "0.1.0");
  assert.match(normalized.outputDirectory, /release\/v0\.1\.0$/);
  assert.match(
    normalized.configuratorArchive,
    /esp32-timelapse-box-configurator-v0\.1\.0\.zip$/
  );
  assert.match(
    normalized.factoryRelease,
    /esp32-timelapse-box-s3-factory-v0\.1\.0\.bin$/
  );
  assert.match(normalized.factorySource, /firmware\.factory\.bin$/);
  assert.doesNotMatch(normalized.configuratorArchive, /cyberbrick/i);
  assert.doesNotMatch(normalized.factoryRelease, /cyberbrick/i);
});

test("SHA-256 manifest is stable and uses release basenames", () => {
  const data = new Map([
    ["C:/release/configurator.zip", Buffer.from("configurator")],
    ["C:/release/factory.bin", Buffer.from("firmware")]
  ]);
  const manifest = formatSha256Sums([...data.keys()], {
    read: (path) => data.get(path)
  });

  assert.equal(
    manifest,
    `${sha256(Buffer.from("configurator"))}  configurator.zip\n`
      + `${sha256(Buffer.from("firmware"))}  factory.bin\n`
  );
});
