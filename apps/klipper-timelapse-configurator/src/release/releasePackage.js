import {
  existsSync as defaultExistsSync,
  mkdirSync as defaultMkdirSync,
  readdirSync as defaultReaddirSync,
  readFileSync as defaultReadFileSync,
  statSync as defaultStatSync,
  writeFileSync as defaultWriteFileSync
} from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";

export const RELEASE_VERSION = "0.1.0";

export const RELEASE_INCLUDE_PATHS = [
  "README.md",
  "README-FIRST.md",
  "CHANGELOG.md",
  "LICENSE",
  "START-WINDOWS.cmd",
  "START-MAC.command",
  "apps/klipper-timelapse-configurator/index.html",
  "apps/klipper-timelapse-configurator/README.md",
  "apps/klipper-timelapse-configurator/start-configurator.cmd",
  "apps/klipper-timelapse-configurator/start-configurator.command",
  "apps/klipper-timelapse-configurator/src",
  "apps/klipper-timelapse-configurator/board-assets",
  "apps/klipper-timelapse-configurator/scripts/serve-static.ps1",
  "config/klipper/esp32_timelapse.cfg",
  "device_files/board_main.py",
  "device_files/board_listener.py",
  "device_files/board_listener_config.json",
  "device_files/moonraker_agent.py",
  "tools/esp32_timelapse_fs.py",
  "tools/cyberbrick_fs.py",
  "docs/quickstart-esp32-s3-sony-ble.md",
  "docs/quickstart-compatible-esp32-c3.md",
  "docs/complete-system-guide.md",
  "docs/complete-system-guide.zh-CN.md",
  "docs/compatibility.md",
  "docs/migration-from-cyberbrick.md",
  "docs/protocol.md",
  "docs/klipper-smooth-timelapse-macro.md",
  "docs/klipper-timelapse-browser-configurator.md",
  "docs/validation.md",
  "docs/troubleshooting.md",
  "docs/release-v0.1.0.md",
  "docs/video-tutorial-script-cn.md",
  "docs/history/sony-ble-research.md",
  "docs/snaporca/esp32-timelapse-box-migration-prompt.md"
];

export const RELEASE_EXCLUDE_PATTERNS = [
  "logs/**",
  "backups/**",
  "external/**",
  "notes/**",
  "u1_config/**",
  "tests/**",
  "DSC*.jpg",
  "**/*.pcapng",
  "**/*.err.log",
  "**/*.out.log",
  "apps/klipper-timelapse-configurator/src/release/**",
  "apps/klipper-timelapse-configurator/src/runtime/chromeWorkflowSmoke.js",
  "apps/klipper-timelapse-configurator/src/runtime/headlessChrome.js",
  "apps/klipper-timelapse-configurator/src/runtime/staticSmokeServer.js",
  "apps/klipper-timelapse-configurator/src/**/*.test.mjs"
];

const TEXT_FILE_PATTERN = /\.(c|cfg|cmd|command|css|h|html|ini|js|json|md|mjs|po|py|txt)$/i;
const SENSITIVE_PATTERNS = [
  { label: "BLE or MAC address literal", pattern: /\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b/ },
  {
    label: "absolute Windows user path",
    pattern: /\b[A-Za-z]:[\\/]Users[\\/](?!Example(?:[\\/]|$)|USERNAME(?:[\\/]|$)|<)/i
  },
  {
    label: "absolute development path",
    pattern: /\b[A-Za-z]:[\\/](?:FC|Projects?|Repos?|src)[\\/]/i
  }
];

export function normalizeReleasePath(path) {
  return String(path).replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

export function isExcludedReleasePath(path) {
  const normalized = normalizeReleasePath(path);
  const fileName = basename(normalized);
  const excludedRoots = ["logs", "backups", "external", "notes", "u1_config", "tests"];

  return excludedRoots.some((root) => normalized === root || normalized.startsWith(`${root}/`))
    || /^DSC.*\.jpe?g$/i.test(fileName)
    || /\.pcapng$/i.test(fileName)
    || /\.err\.log$/i.test(fileName)
    || /\.out\.log$/i.test(fileName)
    || normalized.startsWith("apps/klipper-timelapse-configurator/src/release/")
    || [
      "apps/klipper-timelapse-configurator/src/runtime/chromeWorkflowSmoke.js",
      "apps/klipper-timelapse-configurator/src/runtime/headlessChrome.js",
      "apps/klipper-timelapse-configurator/src/runtime/staticSmokeServer.js"
    ].includes(normalized)
    || (
      normalized.startsWith("apps/klipper-timelapse-configurator/src/")
      && /\.test\.mjs$/i.test(fileName)
    );
}

export function validateReleasePackage({
  workspaceRoot,
  existsSync = defaultExistsSync,
  readdirSync = defaultReaddirSync,
  readFileSync = defaultReadFileSync,
  statSync = defaultStatSync
} = {}) {
  const root = workspaceRoot || process.cwd();
  const missingIncludes = RELEASE_INCLUDE_PATHS
    .filter((path) => !existsSync(resolve(root, path)));
  const files = collectReleaseFiles({
    workspaceRoot: root,
    existsSync,
    readdirSync,
    statSync
  });
  const sensitiveMatches = findSensitiveMatches({
    workspaceRoot: root,
    files,
    readFileSync
  });

  return {
    ok: missingIncludes.length === 0 && sensitiveMatches.length === 0,
    includePaths: RELEASE_INCLUDE_PATHS.slice(),
    excludePatterns: RELEASE_EXCLUDE_PATTERNS.slice(),
    files,
    missingIncludes,
    sensitiveMatches
  };
}

export function collectReleaseFiles({
  workspaceRoot,
  existsSync = defaultExistsSync,
  readdirSync = defaultReaddirSync,
  statSync = defaultStatSync
} = {}) {
  const root = workspaceRoot || process.cwd();
  const files = [];

  for (const includePath of RELEASE_INCLUDE_PATHS) {
    const absolutePath = resolve(root, includePath);
    if (!existsSync(absolutePath)) continue;
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      walkDirectory(absolutePath, { root, files, readdirSync, statSync });
    } else if (!isExcludedReleasePath(includePath)) {
      files.push(normalizeReleasePath(includePath));
    }
  }

  return [...new Set(files)].sort();
}

export function formatReleasePackageReport(report) {
  const lines = [
    `Release package check: ${report.ok ? "OK" : "FAILED"}`,
    `Included files: ${report.files.length}`,
    `Required include roots: ${report.includePaths.length}`,
    `Exclude patterns: ${report.excludePatterns.length}`
  ];

  if (report.missingIncludes.length) {
    lines.push("", "Missing includes:");
    lines.push(...report.missingIncludes.map((path) => `- ${path}`));
  }

  if (report.sensitiveMatches.length) {
    lines.push("", "Sensitive matches:");
    lines.push(...report.sensitiveMatches.map((match) => `- ${match.path}: ${match.label}`));
  }

  return `${lines.join("\n")}\n`;
}

export function defaultReleaseArchivePath({ workspaceRoot, date = new Date() } = {}) {
  void date;
  return resolve(
    workspaceRoot || process.cwd(),
    "release",
    `v${RELEASE_VERSION}`,
    `esp32-timelapse-box-configurator-v${RELEASE_VERSION}.zip`
  );
}

export function createReleaseArchive({
  workspaceRoot,
  outputPath,
  date = new Date(),
  existsSync = defaultExistsSync,
  mkdirSync = defaultMkdirSync,
  readdirSync = defaultReaddirSync,
  readFileSync = defaultReadFileSync,
  statSync = defaultStatSync,
  writeFileSync = defaultWriteFileSync
} = {}) {
  const root = workspaceRoot || process.cwd();
  const report = validateReleasePackage({
    workspaceRoot: root,
    existsSync,
    readdirSync,
    readFileSync,
    statSync
  });
  const archivePath = outputPath || defaultReleaseArchivePath({ workspaceRoot: root, date });

  if (!report.ok) {
    return { ok: false, report, outputPath: archivePath, bytes: 0 };
  }

  const entries = report.files.map((path) => ({
    name: path,
    data: readFileSync(resolve(root, path))
  }));
  const archive = buildZipArchive(entries, { date });

  mkdirSync(dirname(archivePath), { recursive: true });
  writeFileSync(archivePath, archive);

  return {
    ok: true,
    report,
    outputPath: archivePath,
    bytes: archive.length
  };
}

export function buildZipArchive(entries, { date = new Date() } = {}) {
  const localParts = [];
  const centralParts = [];
  const { dosDate, dosTime } = toDosDateTime(date);
  let offset = 0;

  for (const entry of entries) {
    const name = normalizeReleasePath(entry.name);
    if (!name || name.startsWith("/") || name.includes("..")) {
      throw new Error(`Unsafe release archive entry name: ${entry.name}`);
    }

    const nameBuffer = Buffer.from(name, "utf-8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const crc = crc32(data);
    const unixMode = getZipUnixMode(name);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE((3 << 8) | 20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE((unixMode << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    localParts.push(localHeader, nameBuffer, data);
    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function walkDirectory(directory, { root, files, readdirSync, statSync }) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    const releasePath = normalizeReleasePath(relative(root, absolutePath));
    if (isExcludedReleasePath(releasePath)) continue;

    if (entry.isDirectory()) {
      walkDirectory(absolutePath, { root, files, readdirSync, statSync });
    } else {
      files.push(releasePath);
    }
  }
}

function findSensitiveMatches({ workspaceRoot, files, readFileSync }) {
  const matches = [];

  for (const path of files) {
    if (!TEXT_FILE_PATTERN.test(path)) continue;
    const absolutePath = resolve(workspaceRoot, path);
    const text = readFileSync(absolutePath, "utf-8");

    for (const { label, pattern } of SENSITIVE_PATTERNS) {
      if (pattern.test(text)) matches.push({ path, label });
    }

    for (const match of text.matchAll(/"wifi_password"\s*:\s*"([^"]*)"/gi)) {
      const value = match[1];
      if (value && value !== "******") {
        matches.push({ path, label: "non-empty wifi_password JSON value" });
      }
    }
  }

  return matches;
}

function getZipUnixMode(name) {
  const executable = /\.command$/i.test(name);
  return executable ? 0o100755 : 0o100644;
}

function toDosDateTime(date) {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  return {
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

let crcTable;

function crc32(buffer) {
  if (!crcTable) crcTable = buildCrcTable();

  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
}
