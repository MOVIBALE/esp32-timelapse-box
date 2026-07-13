import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createReleaseArchive,
  defaultReleaseArchivePath,
  formatReleasePackageReport
} from "../src/release/releasePackage.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const outputPath = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : defaultReleaseArchivePath({ workspaceRoot });

const result = createReleaseArchive({ workspaceRoot, outputPath });

process.stdout.write(formatReleasePackageReport(result.report));

if (!result.ok) {
  process.exitCode = 1;
} else {
  process.stdout.write(`Release zip: ${result.outputPath}\n`);
  process.stdout.write(`Archive bytes: ${result.bytes}\n`);
}
