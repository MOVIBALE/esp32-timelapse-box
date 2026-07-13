import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const defaultAppRoot = resolve(dirname(currentFile), "../..");
const defaultWorkspaceRoot = resolve(defaultAppRoot, "../..");

export function buildReleaseVerificationSteps({
  appRoot = defaultAppRoot,
  workspaceRoot = defaultWorkspaceRoot,
  nodePath = process.execPath,
  platform = process.platform,
  pythonPath = platform === "win32" ? "python" : "python3"
} = {}) {
  const steps = [
    {
      command: [nodePath, "--test", "apps\\klipper-timelapse-configurator\\src\\**\\*.test.mjs"],
      cwd: workspaceRoot,
      name: "formal app tests"
    },
    {
      command: [
        nodePath,
        "--test",
        "tests\\esp32_klipper_sony_timelapse.test.mjs",
        "tests\\esp32_timelapse_macro.test.mjs",
        "tests\\docs_public_contract.test.mjs",
        "tests\\public_release_builder.test.mjs",
        "tests\\repository_publication_policy.test.mjs"
      ],
      cwd: workspaceRoot,
      name: "public Node contract tests"
    },
    {
      command: [
        pythonPath,
        "-m",
        "pytest",
        "-q",
        "tests\\test_board_file_contents.py",
        "tests\\test_board_listener.py",
        "tests\\test_cyberbrick_fs.py",
        "tests\\test_esp32_timelapse_fs.py",
        "tests\\test_moonraker_agent_protocol.py"
      ],
      cwd: workspaceRoot,
      name: "compatible ESP32-C3 Python tests"
    },
    {
      command: [
        nodePath,
        "scripts\\build-s3-firmware.mjs"
      ],
      cwd: workspaceRoot,
      name: "ESP32-S3 ESP-IDF firmware build"
    },
    {
      command: [nodePath, "scripts/checkReleasePackage.mjs"],
      cwd: appRoot,
      name: "release package check"
    },
    {
      command: [nodePath, "scripts/buildReleaseZip.mjs"],
      cwd: appRoot,
      name: "release zip build"
    },
    {
      command: [nodePath, "scripts\\build-public-release.mjs"],
      cwd: workspaceRoot,
      name: "public release asset build"
    },
    {
      command: [nodePath, "scripts/smokeWorkflow.mjs"],
      cwd: appRoot,
      name: "simulated Web Serial workflow smoke"
    },
    {
      command: [nodePath, "scripts/captureScreenshots.mjs"],
      cwd: appRoot,
      name: "screenshot smoke"
    }
  ];

  if (platform === "win32") {
    steps.splice(5, 0, {
      command: [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        [
          "$script = (Resolve-Path 'apps\\klipper-timelapse-configurator\\scripts\\serve-static.ps1').Path",
          "$args = \"-NoProfile -ExecutionPolicy Bypass -File `\"$script`\" -Port 8789 -Once\"",
          "$p = Start-Process -WindowStyle Hidden -PassThru -FilePath powershell -ArgumentList $args",
          "Start-Sleep -Milliseconds 700",
          "$r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8789/' -TimeoutSec 5",
          "Write-Output \"HTTP $($r.StatusCode)\"",
          "Write-Output \"HAS_TITLE=$($r.Content -match 'Klipper')\"",
          "Start-Sleep -Milliseconds 300",
          "if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }"
        ].join("; ")
      ],
      cwd: workspaceRoot,
      name: "Windows PowerShell fallback smoke"
    });
  }

  return steps;
}

export function runReleaseVerification({
  appRoot = defaultAppRoot,
  workspaceRoot = defaultWorkspaceRoot,
  platform = process.platform,
  spawn = spawnSync,
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  const steps = buildReleaseVerificationSteps({ appRoot, workspaceRoot, platform });
  const results = [];

  for (const step of steps) {
    stdout.write(`\n=== ${step.name} ===\n`);
    stdout.write(`${formatCommand(step.command)}\n`);

    const result = spawn(step.command[0], step.command.slice(1), {
      cwd: step.cwd,
      encoding: "utf-8",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    if (result.stdout) stdout.write(result.stdout);
    if (result.stderr) stderr.write(result.stderr);

    const status = result.status ?? 1;
    results.push({ name: step.name, status });

    if (status !== 0) {
      stdout.write(`\nRelease verification failed at: ${step.name}\n`);
      return { ok: false, results };
    }
  }

  stdout.write("\nRelease verification: OK\n");
  return { ok: true, results };
}

function formatCommand(command) {
  return command.map((part) => (/\s/.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part)).join(" ");
}
