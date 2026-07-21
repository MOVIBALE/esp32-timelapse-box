import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  rmdirSync,
  symlinkSync,
  unlinkSync
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function needsWhitespaceSafeBuildPath(projectDirectory, platform = process.platform) {
  return platform === "win32" && /\s/.test(projectDirectory);
}

export function whitespaceSafeBuildRoot(projectDirectory, temporaryRoot = tmpdir()) {
  const id = createHash("sha256")
    .update(resolve(projectDirectory).toLowerCase())
    .digest("hex")
    .slice(0, 12);
  return resolve(temporaryRoot, `esp32-timelapse-build-${id}`);
}

export function resolvePlatformioPath({
  platform = process.platform,
  environment = process.env,
  homeDirectory = homedir(),
  exists = existsSync
} = {}) {
  if (environment.PLATFORMIO) return environment.PLATFORMIO;
  if (platform !== "win32") return "platformio";

  const localPath = resolve(homeDirectory, ".platformio", "penv", "Scripts", "platformio.exe");
  return exists(localPath) ? localPath : "platformio";
}

export function runS3FirmwareBuild({
  workspaceRoot,
  projectRelativePath = "firmware/esp32-s3-sony-ble-timelapse",
  platform = process.platform,
  platformioPath = resolvePlatformioPath({ platform }),
  spawn = spawnSync
} = {}) {
  const root = workspaceRoot || resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const projectDirectory = resolve(root, ...projectRelativePath.split("/"));
  let buildDirectory = projectDirectory;
  let temporaryDirectory = null;
  let junctionPath = null;

  try {
    if (needsWhitespaceSafeBuildPath(projectDirectory, platform)) {
      temporaryDirectory = whitespaceSafeBuildRoot(projectDirectory);
      mkdirSync(temporaryDirectory, { recursive: true });
      junctionPath = resolve(temporaryDirectory, "firmware");
      if (existsSync(junctionPath)) {
        throw new Error(`Stale firmware build junction must be removed first: ${junctionPath}`);
      }
      symlinkSync(projectDirectory, junctionPath, "junction");
      buildDirectory = junctionPath;
      process.stdout.write(`Using whitespace-safe firmware junction: ${junctionPath}\n`);
    }

    const result = spawn(
      platformioPath,
      ["run", "-d", buildDirectory, "-e", "esp32-s3-devkitc-1"],
      { cwd: root, shell: false, stdio: "inherit" }
    );
    if (result.error) throw result.error;
    return result.status ?? 1;
  } finally {
    if (junctionPath && existsSync(junctionPath)) unlinkSync(junctionPath);
    if (temporaryDirectory && existsSync(temporaryDirectory)) {
      rmdirSync(temporaryDirectory);
    }
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runS3FirmwareBuild();
}
