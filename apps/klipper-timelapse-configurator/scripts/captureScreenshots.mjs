import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

import {
  assertScreenshotArtifact,
  buildChromeScreenshotArgs,
  defaultBrowserCandidates,
  selectBrowserPath,
  withCacheBust
} from "../src/runtime/headlessChrome.js";
import { startStaticSmokeServer } from "../src/runtime/staticSmokeServer.js";

const root = resolve(import.meta.dirname, "..");
const outputDir = resolve(root, "../../logs/browser-smoke");
const staticServer = process.argv[2] ? null : await startStaticSmokeServer({ root });
const url = process.argv[2] || staticServer.url;
const browserPath = selectBrowserPath(defaultBrowserCandidates(process.env), existsSync);

if (!browserPath) {
  console.error("No Chrome or Edge executable found.");
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

try {
  for (const viewport of [
    { label: "desktop", width: 1440, height: 900 },
    { label: "mobile", width: 390, height: 844 }
  ]) {
    const screenshotPath = resolve(outputDir, `configurator-${viewport.label}-${viewport.width}x${viewport.height}.png`);
    const args = buildChromeScreenshotArgs({
      url: withCacheBust(url, `${viewport.label}-${viewport.width}x${viewport.height}`),
      width: viewport.width,
      height: viewport.height,
      screenshotPath
    });
    const result = await runChrome(browserPath, args);
    if (result.status !== 0) {
      throw new Error(result.error?.message || result.stderr || `Chrome exited with ${result.status}`);
    }
    assertScreenshotArtifact({
      bytes: readFileSync(screenshotPath),
      expectedWidth: viewport.width,
      expectedHeight: viewport.height,
      minBytes: 10_000
    });
    console.log(screenshotPath);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (staticServer) await staticServer.close();
}

function runChrome(command, args) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolveRun({ error, status: 1, stdout, stderr });
    });
    child.on("exit", (status) => {
      resolveRun({ status: status ?? 1, stdout, stderr });
    });
  });
}
