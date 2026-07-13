import assert from "node:assert/strict";
import test from "node:test";

import * as headlessChrome from "./headlessChrome.js";

const {
  assertScreenshotArtifact,
  buildChromeScreenshotArgs,
  defaultBrowserCandidates,
  readPngDimensions,
  selectBrowserPath
} = headlessChrome;

test("buildChromeScreenshotArgs captures a delayed viewport screenshot", () => {
  const args = buildChromeScreenshotArgs({
    url: "http://127.0.0.1:8776/",
    width: 390,
    height: 844,
    screenshotPath: "C:/tmp/mobile.png"
  });

  assert.ok(args.includes("--headless=new"));
  assert.ok(args.includes("--virtual-time-budget=2500"));
  assert.ok(args.includes("--window-size=390,844"));
  assert.ok(args.includes("--screenshot=C:/tmp/mobile.png"));
  assert.equal(args.at(-1), "http://127.0.0.1:8776/");
});

test("withCacheBust adds a deterministic smoke query without dropping existing params", () => {
  assert.equal(typeof headlessChrome.withCacheBust, "function");
  assert.equal(
    headlessChrome.withCacheBust("http://127.0.0.1:8776/?lang=zh", "mobile-390x844"),
    "http://127.0.0.1:8776/?lang=zh&smoke=mobile-390x844"
  );
});

test("readPngDimensions reads PNG width and height from the IHDR header", () => {
  assert.equal(typeof readPngDimensions, "function");
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  png.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(png.buffer).setUint32(16, 390);
  new DataView(png.buffer).setUint32(20, 844);

  assert.deepEqual(readPngDimensions(png), { width: 390, height: 844 });
});

test("assertScreenshotArtifact rejects tiny or wrong-sized screenshots", () => {
  assert.equal(typeof assertScreenshotArtifact, "function");
  const png = new Uint8Array(64);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  png.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(png.buffer).setUint32(16, 390);
  new DataView(png.buffer).setUint32(20, 844);

  assert.throws(
    () => assertScreenshotArtifact({ bytes: png, expectedWidth: 390, expectedHeight: 844, minBytes: 1000 }),
    /too small/
  );
  assert.throws(
    () => assertScreenshotArtifact({ bytes: png, expectedWidth: 391, expectedHeight: 844, minBytes: 10 }),
    /unexpected dimensions/
  );
  assert.doesNotThrow(
    () => assertScreenshotArtifact({ bytes: png, expectedWidth: 390, expectedHeight: 844, minBytes: 10 })
  );
});

test("selectBrowserPath returns the first existing Chrome or Edge candidate", () => {
  const candidates = ["missing-chrome.exe", "C:/Chrome/chrome.exe", "C:/Edge/msedge.exe"];

  assert.equal(selectBrowserPath(candidates, (path) => path.includes("Chrome")), "C:/Chrome/chrome.exe");
});

test("defaultBrowserCandidates includes Chrome and Edge paths", () => {
  const candidates = defaultBrowserCandidates({
    ProgramFiles: "C:/Program Files",
    "ProgramFiles(x86)": "C:/Program Files (x86)",
    LocalAppData: "C:/Users/Example/AppData/Local"
  });

  assert.ok(candidates.some((path) => path.includes("Google/Chrome")));
  assert.ok(candidates.some((path) => path.includes("Microsoft/Edge")));
});
