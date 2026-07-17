import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildMultibrandProbeRelease } from "./multibrandProbeRelease.mjs";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = buildMultibrandProbeRelease({ workspaceRoot });
process.stdout.write(`Multi-brand BLE Probe v${result.version}\n`);
process.stdout.write(`Documentation bytes: ${result.docsBytes}\n`);
for (const asset of result.assets) process.stdout.write(`Asset: ${asset}\n`);
