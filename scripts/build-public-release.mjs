import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPublicRelease } from "./publicRelease.mjs";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = buildPublicRelease({ workspaceRoot });

process.stdout.write(`ESP32 Timelapse Box v${result.version}\n`);
process.stdout.write(`Configurator bytes: ${result.configuratorBytes}\n`);
for (const asset of result.assets) process.stdout.write(`Asset: ${asset}\n`);
