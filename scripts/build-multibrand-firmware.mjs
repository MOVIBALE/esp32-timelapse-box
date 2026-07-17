import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runS3FirmwareBuild } from "./build-s3-firmware.mjs";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.exitCode = runS3FirmwareBuild({
  workspaceRoot,
  projectRelativePath: "firmware/esp32-s3-multibrand-nimble-experimental"
});
