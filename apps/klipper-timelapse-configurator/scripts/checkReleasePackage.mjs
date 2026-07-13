import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatReleasePackageReport,
  validateReleasePackage
} from "../src/release/releasePackage.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const report = validateReleasePackage({ workspaceRoot });

process.stdout.write(formatReleasePackageReport(report));

if (!report.ok) {
  process.exitCode = 1;
}
