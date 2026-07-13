export function buildChromeScreenshotArgs({
  url,
  width,
  height,
  screenshotPath,
  virtualTimeBudget = 2500
}) {
  return [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--virtual-time-budget=${virtualTimeBudget}`,
    `--window-size=${width},${height}`,
    `--screenshot=${screenshotPath}`,
    url
  ];
}

export function withCacheBust(url, token) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}smoke=${encodeURIComponent(token)}`;
}

export function readPngDimensions(bytes) {
  if (bytes.length < 24 || !hasPngSignature(bytes)) {
    throw new Error("screenshot is not a PNG");
  }
  const chunkType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (chunkType !== "IHDR") {
    throw new Error("screenshot PNG is missing IHDR");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20)
  };
}

export function assertScreenshotArtifact({
  bytes,
  expectedWidth,
  expectedHeight,
  minBytes = 10_000
}) {
  if (bytes.length < minBytes) {
    throw new Error(`screenshot is too small: ${bytes.length} bytes`);
  }
  const dimensions = readPngDimensions(bytes);
  if (dimensions.width !== expectedWidth || dimensions.height !== expectedHeight) {
    throw new Error(
      `screenshot has unexpected dimensions: ${dimensions.width}x${dimensions.height}`
    );
  }
  return dimensions;
}

export function defaultBrowserCandidates(env = {}) {
  return [
    joinPath(env.ProgramFiles, "Google/Chrome/Application/chrome.exe"),
    joinPath(env["ProgramFiles(x86)"], "Google/Chrome/Application/chrome.exe"),
    joinPath(env.LocalAppData, "Google/Chrome/Application/chrome.exe"),
    joinPath(env.ProgramFiles, "Microsoft/Edge/Application/msedge.exe"),
    joinPath(env["ProgramFiles(x86)"], "Microsoft/Edge/Application/msedge.exe")
  ].filter(Boolean);
}

export function selectBrowserPath(candidates, existsSync) {
  return candidates.find((path) => existsSync(path)) || "";
}

function joinPath(root, suffix) {
  if (!root) return "";
  return `${root.replace(/[\\/]$/, "")}/${suffix}`;
}

function hasPngSignature(bytes) {
  return bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a;
}
