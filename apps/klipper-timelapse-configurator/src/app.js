import {
  buildArmedBoardListenerConfig,
  buildEnabledDryRunBoardListenerConfig,
  buildSafeBoardListenerConfig,
  redactConfigSecrets
} from "./config/boardConfig.js";
import {
  formatMissingBoardFormConfig,
  validateBoardFormConfig
} from "./config/formValidation.js";
import { explainRawLog, visibleLogText } from "./i18n/logs.js";
import { t } from "./i18n/strings.js";
import {
  DEFAULT_HARDWARE_ROUTE_ID,
  getHardwareRoute
} from "./hardware/routes.js";
import {
  fetchMoonrakerStatus,
  formatMoonrakerProbeFailure,
  formatMoonrakerProbeResult
} from "./moonraker/client.js";
import { detectCurrentCapabilities } from "./platform/capabilities.js";
import { buildDiagnosticReport } from "./runtime/diagnosticReport.js";
import { createOperationGate } from "./runtime/operationGate.js";
import {
  buildBoardUploadManifest,
  buildListFilesCommand,
  buildRemoveMainCommand,
  buildWriteTextFileCommands
} from "./serial/boardFs.js";
import { parseBoardLine } from "./serial/boardMonitor.js";
import {
  buildSoftResetCommand,
  enterRawReplSequence,
  exitRawReplSequence,
  rawExec
} from "./serial/rawRepl.js";
import {
  buildArmCommand,
  buildConnectSonyCommand,
  buildDisarmCommand,
  buildPairSonyCommand,
  buildProvisionCommand,
  buildStatusCommands,
  parseS3StatusLine
} from "./serial/s3Commands.js";
import { BrowserSerialConnection, formatPortInfo } from "./serial/webSerial.js";
import { buildChecklistState, summarizeChecklistState } from "./state/checklist.js";
import { initialWorkflow, reduceWorkflow } from "./state/workflow.js";

const ui = queryUi();
const gate = createOperationGate({
  formatBusyMessage: (label) => tr("operationAlreadyRunning", { label })
});
let workflow = initialWorkflow;
let connection;
let keepReading = false;
let lineBuffer = "";
let language = "zh-CN";
let hardwareRouteId = DEFAULT_HARDWARE_ROUTE_ID;
let sonyState = { known: false, connected: false, ready: false };
let macroSource = "";

const serialButtons = [
  ui.provisionS3Button,
  ui.pairSonyButton,
  ui.connectSonyButton,
  ui.s3StatusButton,
  ui.disarmS3Button,
  ui.uploadSafeButton,
  ui.enableDryRunButton,
  ui.softResetButton,
  ui.recoverButton,
  ui.disconnectButton,
  ui.rawEnterButton,
  ui.rawExitButton,
  ui.probeButton,
  ui.removeProbeButton
];

boot();

function boot() {
  language = ui.languageSelect.value;
  applyStaticText();
  const capability = detectCurrentCapabilities();
  if (capability.canUseWebSerial) {
    setStatus(ui.browserStatus, tr("browserAvailableStatus"), "ok");
    appendFriendly("success", tr("browserSerialAvailable"));
  } else {
    setStatus(ui.browserStatus, tr("browserUnavailableStatus"), "error");
    appendFriendly("error", capability.blockers.includes("secureContextRequired")
      ? tr("browserNeedsLocalhost")
      : tr("browserNeedsChrome"));
    ui.connectButton.disabled = true;
  }

  setSerialButtonsEnabled(false);
  updateWorkflowUi();

  ui.connectButton.addEventListener("click", connectBoard);
  ui.disconnectButton.addEventListener("click", disconnectBoard);
  ui.testMoonrakerButton.addEventListener("click", testMoonrakerAccess);
  ui.provisionS3Button.addEventListener("click", provisionS3);
  ui.pairSonyButton.addEventListener("click", pairSony);
  ui.connectSonyButton.addEventListener("click", connectSony);
  ui.s3StatusButton.addEventListener("click", requestS3Status);
  ui.disarmS3Button.addEventListener("click", disarmS3);
  ui.uploadSafeButton.addEventListener("click", uploadSafeListener);
  ui.enableDryRunButton.addEventListener("click", enableDryRun);
  ui.softResetButton.addEventListener("click", softReset);
  ui.recoverButton.addEventListener("click", recoverStockBehavior);
  ui.rawEnterButton.addEventListener("click", enterRaw);
  ui.rawExitButton.addEventListener("click", exitRaw);
  ui.probeButton.addEventListener("click", writeReadProbe);
  ui.removeProbeButton.addEventListener("click", removeProbe);
  ui.armButton.addEventListener("click", armAfterConfirmation);
  ui.armedPhraseInput.addEventListener("input", updateWorkflowUi);
  ui.languageSelect.addEventListener("change", () => {
    language = ui.languageSelect.value;
    applyStaticText();
    updateWorkflowUi();
  });
  ui.copyLogButton.addEventListener("click", copyLogs);
  ui.copyReportButton.addEventListener("click", copyDiagnosticReport);
  ui.clearLogButton.addEventListener("click", clearLogs);
  for (const button of ui.hardwareRouteButtons) {
    button.addEventListener("click", () => selectHardwareRoute(button.dataset.route));
  }
}

function selectHardwareRoute(routeId) {
  if (connection) return;
  hardwareRouteId = getHardwareRoute(routeId).id;
  sonyState = { known: false, connected: false, ready: false };
  macroSource = "";
  updateWorkflowUi();
}

async function connectBoard() {
  await runOperation(tr("operationConnect"), async () => {
    appendFriendly("info", tr("chooseSerial"));
    connection = await BrowserSerialConnection.request(navigator.serial, ui.baudSelect.value);
    ui.portInfo.textContent = formatPortInfo(connection.port.getInfo?.());
    workflow = reduceWorkflow(workflow, { type: "boardConnected", portLabel: "Web Serial" });
    keepReading = true;
    void readLoop();
    appendFriendly("success", tr("boardConnected"));
    const route = getHardwareRoute(hardwareRouteId);
    if (route.transport === "serial-command") {
      await connection.write(buildDisarmCommand());
      workflow = { ...workflow, safetyMode: "dry-run" };
      await writeS3StatusCommands();
      appendFriendly("success", tr("s3AutoDisarmed"));
    }
  });
}

async function disconnectBoard() {
  await runOperation(tr("operationDisconnect"), async () => {
    keepReading = false;
    await connection?.cancelRead();
    await connection?.close();
    connection = undefined;
    workflow = initialWorkflow;
    sonyState = { known: false, connected: false, ready: false };
    macroSource = "";
    ui.portInfo.textContent = tr("portNotSelected");
    appendFriendly("success", tr("boardDisconnectedDone"));
  });
}

async function provisionS3() {
  if (!connection) return;
  await runOperation(tr("operationProvisionS3"), async () => {
    const form = writableFormConfig();
    if (!form) return;

    await connection.write(buildProvisionCommand({
      ssid: form.wifi_ssid,
      password: form.wifi_password,
      host: form.u1_host
    }));
    await connection.write(buildDisarmCommand());
    workflow = reduceWorkflow(workflow, { type: "safeUploaded" });
    workflow = reduceWorkflow(workflow, { type: "dryRunEnabled" });
    await writeS3StatusCommands();
    appendFriendly("success", tr("s3Provisioned"));
  });
}

async function connectSony() {
  if (!connection) return;
  await runOperation(tr("operationConnectSony"), async () => {
    await connection.write(buildConnectSonyCommand());
    await writeS3StatusCommands();
    appendFriendly("info", tr("sonyConnectRequested"));
  });
}

async function pairSony() {
  if (!connection) return;
  await runOperation(tr("operationPairSony"), async () => {
    await connection.write(buildPairSonyCommand());
    workflow = workflow.safeConfigured
      ? reduceWorkflow(workflow, { type: "dryRunEnabled" })
      : { ...workflow, safetyMode: "dry-run" };
    await writeS3StatusCommands();
    appendFriendly("info", tr("sonyPairRequested"));
  });
}

async function requestS3Status() {
  if (!connection) return;
  await runOperation(tr("operationReadS3Status"), async () => {
    await writeS3StatusCommands();
    appendFriendly("info", tr("s3StatusRequested"));
  });
}

async function disarmS3() {
  if (!connection) return;
  await runOperation(tr("operationDisarmS3"), async () => {
    await connection.write(buildDisarmCommand());
    workflow = workflow.safeConfigured
      ? reduceWorkflow(workflow, { type: "dryRunEnabled" })
      : { ...workflow, safetyMode: "dry-run" };
    await writeS3StatusCommands();
    appendFriendly("success", tr("s3Disarmed"));
  });
}

async function writeS3StatusCommands() {
  for (const command of buildStatusCommands()) {
    await connection.write(command);
  }
}

async function testMoonrakerAccess() {
  await runOperation(tr("moonrakerProbeBusy"), async () => {
    try {
      const status = await fetchMoonrakerStatus(ui.hostInput.value.trim());
      const message = formatMoonrakerProbeResult(status)[language];
      setStatus(ui.moonrakerStatus, tr("moonrakerReachable"), "ok");
      appendFriendly("success", message);
    } catch (error) {
      const message = formatMoonrakerProbeFailure(error)[language];
      setStatus(ui.moonrakerStatus, tr("moonrakerBlocked"), "error");
      appendFriendly("error", message);
    }
  });
}

async function uploadSafeListener() {
  if (!connection) return;
  await runOperation(tr("operationUploadSafe"), async () => {
    const form = writableFormConfig();
    if (!form) return;

    const [listenerText, mainText, baseConfig] = await loadBoardAssets();
    const config = buildSafeBoardListenerConfig({
      ...baseConfig,
      ...form
    });
    appendFriendly("info", tr("safeConfigPreview", { config: redactConfigSecrets(config) }));
    appendFriendly("info", tr("safeUploadRule"));

    const manifest = buildBoardUploadManifest({
      configText: JSON.stringify(config, null, 2),
      listenerText,
      mainText
    });
    for (const file of manifest) {
      await uploadOneFile(file.path, file.text);
    }
    await rawExec(connection, buildListFilesCommand());
    workflow = reduceWorkflow(workflow, { type: "safeUploaded" });
    appendFriendly("success", tr("safeUploadDone"));
  });
}

async function enableDryRun() {
  if (!connection) return;
  await runOperation(tr("operationEnableDryRun"), async () => {
    const form = writableFormConfig();
    if (!form) return;

    const config = buildEnabledDryRunBoardListenerConfig(form);
    appendFriendly("info", tr("dryRunConfigPreview", { config: redactConfigSecrets(config) }));
    await uploadOneFile("/board_listener_config.json", JSON.stringify(config, null, 2));
    await rawExec(connection, buildListFilesCommand());
    workflow = reduceWorkflow(workflow, { type: "dryRunEnabled" });
    appendFriendly("success", tr("dryRunEnabledDone"));
  });
}

async function softReset() {
  if (!connection) return;
  await runOperation(tr("operationSoftReset"), async () => {
    await connection.write(buildSoftResetCommand());
    appendFriendly("info", tr("softResetSent"));
  });
}

async function recoverStockBehavior() {
  if (!connection) return;
  await runOperation(tr("operationRecover"), async () => {
    workflow = reduceWorkflow(workflow, { type: "recovering" });
    await rawExec(connection, buildRemoveMainCommand());
    await rawExec(connection, buildListFilesCommand());
    workflow = reduceWorkflow(workflow, { type: "recovered" });
    appendFriendly("success", tr("recoverDone"));
  });
}

async function armAfterConfirmation() {
  if (!connection) return;
  await runOperation(tr("operationArm"), async () => {
    const form = writableFormConfig();
    if (!form) return;

    const confirmation = ui.armedPhraseInput.value.trim();
    const route = getHardwareRoute(hardwareRouteId);
    if (route.transport === "serial-command") {
      if (confirmation !== "ARM DRY-RUN VERIFIED") {
        throw new Error(tr("armedConfirmationRequired"));
      }
      if (!sonyState.ready) {
        throw new Error(tr("sonyNotReadyForArm"));
      }
      await connection.write(buildArmCommand());
      await writeS3StatusCommands();
      appendFriendly("success", tr("s3Armed"));
    } else {
      const config = buildArmedBoardListenerConfig(form, confirmation);
      await uploadOneFile("/board_listener_config.json", JSON.stringify(config, null, 2));
      appendFriendly("success", tr("armedWritten"));
    }
    workflow = reduceWorkflow(workflow, { type: "armRequested", confirmed: true });
  });
}

async function enterRaw() {
  if (!connection) return;
  await runOperation(tr("operationRawEnter"), async () => {
    await connection.write(enterRawReplSequence());
    appendFriendly("info", tr("rawEnterSent"));
  });
}

async function exitRaw() {
  if (!connection) return;
  await runOperation(tr("operationRawExit"), async () => {
    await connection.write(exitRawReplSequence());
    appendFriendly("info", tr("rawExitSent"));
  });
}

async function writeReadProbe() {
  if (!connection) return;
  await runOperation(tr("operationProbeWrite"), async () => {
    const payload = `formal_configurator_probe:${new Date().toISOString()}`;
    const code = [
      `payload=${JSON.stringify(payload)}`,
      `f=open(${JSON.stringify("/web_serial_probe.txt")},"w")`,
      "f.write(payload)",
      "f.close()",
      `f=open(${JSON.stringify("/web_serial_probe.txt")},"r")`,
      "print('WEB_SERIAL_PROBE_READ=' + f.read())",
      "f.close()"
    ].join("\n");
    await rawExec(connection, code);
    appendFriendly("info", tr("probeSent", { payload }));
  });
}

async function removeProbe() {
  if (!connection) return;
  await runOperation(tr("operationProbeRemove"), async () => {
    await rawExec(connection, [
      "import os",
      "try:",
      `    os.remove(${JSON.stringify("/web_serial_probe.txt")})`,
      "    print('WEB_SERIAL_PROBE_REMOVED')",
      "except OSError:",
      "    print('WEB_SERIAL_PROBE_REMOVE_SKIPPED')"
    ].join("\n"));
    appendFriendly("info", tr("probeRemoveSent"));
  });
}

async function uploadOneFile(path, text) {
  const commands = buildWriteTextFileCommands(path, text);
  appendFriendly("info", tr("writeFileProgress", { path, chars: text.length, chunks: commands.length - 1 }));
  for (let index = 0; index < commands.length; index += 1) {
    await rawExec(connection, commands[index]);
    appendRaw(`HOST sent ${path} command ${index + 1}/${commands.length}`);
  }
}

async function readLoop() {
  while (keepReading && connection) {
    try {
      const chunk = await connection.readChunk();
      if (chunk) handleSerialText(chunk);
    } catch (error) {
      if (keepReading) appendFriendly("error", serialErrorMessage(error));
      break;
    }
  }
}

function handleSerialText(text) {
  appendRaw(formatSerialText(text));
  lineBuffer += text.replace(/\r/g, "\n");
  while (lineBuffer.includes("\n")) {
    const index = lineBuffer.indexOf("\n");
    const line = lineBuffer.slice(0, index).trim();
    lineBuffer = lineBuffer.slice(index + 1);
    if (line) handleBoardLine(line);
  }
}

function handleBoardLine(line) {
  const route = getHardwareRoute(hardwareRouteId);
  const parsed = route.transport === "serial-command"
    ? parseS3StatusLine(line)
    : parseBoardLine(line);
  const explanation = explainRawLog(line, language);
  appendFriendly(explanation.level, visibleLogText(explanation, language));

  if (parsed.type === "sonyStatus") {
    sonyState = {
      known: true,
      connected: parsed.connected,
      ready: parsed.ready
    };
  } else if (parsed.type === "sonyPairing" && parsed.bonded && parsed.noFf01Writes) {
    sonyState = { known: true, connected: true, ready: false };
  } else if (parsed.type === "timelapseStatus") {
    macroSource = parsed.macroSource;
    workflow = {
      ...workflow,
      safetyMode: parsed.armed ? "armed" : parsed.enabled && parsed.dryRun ? "dry-run" : "disabled"
    };
  } else if (parsed.type === "timelapseEvent") {
    macroSource = parsed.macroSource;
    if (parsed.dryRun) {
      workflow = reduceWorkflow(workflow, {
        type: "dryRunEventSeen",
        layer: parsed.layer,
        totalLayer: workflow.totalLayer,
        filename: parsed.filename,
        observedAt: nowTime()
      });
    } else {
      workflow = {
        ...workflow,
        lastLayer: parsed.layer,
        currentFile: parsed.filename || workflow.currentFile,
        lastEventAt: nowTime()
      };
    }
  } else if (parsed.type === "ready") {
    workflow = {
      ...workflow,
      safetyMode: parsed.enabled ? (parsed.dryRun ? "dry-run" : "armed") : "disabled"
    };
  } else if (parsed.type === "dryRunEvent") {
    workflow = reduceWorkflow(workflow, {
      type: "dryRunEventSeen",
      layer: parsed.layer,
      totalLayer: parsed.totalLayer,
      filename: parsed.filename,
      observedAt: nowTime()
    });
  }
  updateWorkflowUi();
}

async function runOperation(label, task) {
  try {
    setBusy(label);
    await gate.run(label, task);
  } catch (error) {
    appendFriendly("error", serialErrorMessage(error));
  } finally {
    setIdle();
    updateWorkflowUi();
  }
}

function setBusy(label) {
  setSerialButtonsEnabled(false);
  ui.connectButton.disabled = true;
  setStatus(ui.boardStatus, label, "working");
  ui.nextAction.textContent = tr("workingWait", { label });
}

function setIdle() {
  const connected = Boolean(connection);
  ui.connectButton.disabled = connected;
  setSerialButtonsEnabled(connected);
  setStatus(ui.boardStatus, connected ? tr("boardConnectedStatus") : tr("boardDisconnected"), connected ? "ok" : "idle");
}

function updateWorkflowUi() {
  updateHardwareRouteUi();
  const route = getHardwareRoute(hardwareRouteId);
  ui.lastLayer.textContent = workflow.lastLayer ?? "-";
  ui.totalLayer.textContent = workflow.totalLayer ?? "-";
  ui.currentFile.textContent = workflow.currentFile || "-";
  ui.lastEventAt.textContent = workflow.lastEventAt || "-";
  ui.dryRunEvents.textContent = String(workflow.dryRunEvents);
  ui.recoveryStatus.textContent = recoveryStatusText();
  ui.sonyStatus.textContent = sonyStatusText();
  ui.macroSource.textContent = macroSourceText();
  setStatus(ui.safetyStatus, safetyModeText(workflow.safetyMode), workflow.safetyMode);
  updateSafetyModeTabs(workflow.safetyMode);
  updateTutorialChecklist(workflow);
  ui.armButton.disabled = !connection
    || workflow.safetyMode !== "dry-run"
    || workflow.dryRunEvents < 1
    || (route.canConnectSony && !sonyState.ready)
    || ui.armedPhraseInput.value.trim() !== "ARM DRY-RUN VERIFIED";

  if (!connection) {
    ui.nextAction.textContent = tr("nextConnect");
  } else if (route.transport === "serial-command" && workflow.safetyMode === "disabled") {
    ui.nextAction.textContent = tr("nextS3Configure");
  } else if (route.transport === "serial-command" && workflow.safetyMode === "dry-run" && !sonyState.ready) {
    ui.nextAction.textContent = tr("nextS3Sony");
  } else if (route.transport === "serial-command" && workflow.safetyMode === "dry-run") {
    ui.nextAction.textContent = tr("nextS3DryRun");
  } else if (workflow.safetyMode === "disabled") {
    ui.nextAction.textContent = tr("nextSafe");
  } else if (workflow.safetyMode === "dry-run") {
    ui.nextAction.textContent = tr("nextDryRun");
  } else if (workflow.safetyMode === "armed") {
    ui.nextAction.textContent = tr("nextArmed");
  } else if (workflow.safetyMode === "recovered") {
    ui.nextAction.textContent = tr("nextRecovered");
  }
}

function updateHardwareRouteUi() {
  const route = getHardwareRoute(hardwareRouteId);
  const routeScope = route.transport === "serial-command" ? "s3" : "c3";
  ui.hardwareRouteDescription.textContent = tr(route.descriptionKey);
  for (const button of ui.hardwareRouteButtons) {
    const active = button.dataset.route === route.id;
    button.setAttribute("aria-pressed", String(active));
    button.disabled = Boolean(connection);
  }
  for (const element of ui.routePanels) {
    element.hidden = element.dataset.routePanel !== routeScope;
  }
  for (const button of ui.routeActionButtons) {
    button.hidden = button.dataset.routeAction !== routeScope;
  }
}

function recoveryStatusText() {
  if (workflow.mainPyRemoved) return tr("recoveryRemoved");
  if (workflow.safetyMode === "recovering") return tr("recoveryInProgress");
  return tr("recoveryNotRun");
}

function safetyModeText(mode) {
  return tr({
    disabled: "safetyModeDisabled",
    "dry-run": "safetyModeDryRun",
    armed: "safetyModeArmed",
    recovering: "safetyModeRecovering",
    recovered: "safetyModeRecovered"
  }[mode] || "safetyModeDisabled");
}

function sonyStatusText() {
  if (!sonyState.known) return tr("sonyUnknown");
  if (sonyState.ready) return tr("sonyReady");
  if (sonyState.connected) return tr("sonyConnectedNotReady");
  return tr("sonyDisconnected");
}

function macroSourceText() {
  return tr({
    canonical: "macroSourceCanonical",
    legacy: "macroSourceLegacy",
    none: "macroSourceLayerFallback"
  }[macroSource] || "macroSourceUnknown");
}

function setSerialButtonsEnabled(enabled) {
  const route = getHardwareRoute(hardwareRouteId);
  const routeScope = route.transport === "serial-command" ? "s3" : "c3";
  for (const button of serialButtons) {
    const actionScope = button.dataset.routeAction;
    button.disabled = !enabled || Boolean(actionScope && actionScope !== routeScope);
  }
}

function setStatus(element, text, tone) {
  element.textContent = text;
  element.dataset.tone = tone;
}

function updateSafetyModeTabs(safetyMode) {
  for (const tab of ui.modeTabs) {
    tab.dataset.active = String(tab.dataset.mode === safetyMode);
  }
}

function updateTutorialChecklist(workflow) {
  const items = buildChecklistState(workflow, {
    hardwareRouteId,
    sonyReady: sonyState.ready
  });
  const summaryText = summarizeChecklistState(items, language);
  const summary = {
    done: 0,
    current: 0
  };

  for (const item of items) {
    const checkpoint = [...ui.checkpoints].find((node) => node.dataset.checkpoint === item.id);
    if (!checkpoint) continue;
    checkpoint.dataset.state = item.state;
    checkpoint.querySelector("[data-checkpoint-title]").textContent = item.title[language];
    checkpoint.querySelector("[data-checkpoint-status]").textContent = checklistStateText(item.state);
    checkpoint.querySelector("[data-checkpoint-detail]").textContent = item.detail[language];
    if (item.state === "done") summary.done += 1;
    if (item.state === "current") summary.current += 1;
  }

  ui.tutorialStepCue.textContent = summaryText;
  ui.tutorialChecklistSummary.textContent = summaryText;
}

function checklistStateText(state) {
  return tr({
    done: "checkDone",
    current: "checkCurrent",
    available: "checkAvailable",
    locked: "checkLocked"
  }[state] || "checkLocked");
}

function formConfig() {
  return {
    wifi_ssid: ui.ssidInput.value.trim(),
    wifi_password: ui.passwordInput.value,
    u1_host: ui.hostInput.value.trim(),
    mode: ui.modeSelect.value
  };
}

function writableFormConfig() {
  const config = formConfig();
  const validation = validateBoardFormConfig(config);
  if (!validation.ok) {
    appendFriendly("error", formatMissingBoardFormConfig(validation.missing)[language]);
    return null;
  }
  return {
    ...config,
    ...validation.value
  };
}

async function loadBoardAssets() {
  const [listenerText, mainText, configText] = await Promise.all([
    fetchText("./board-assets/board_listener.py"),
    fetchText("./board-assets/board_main.py"),
    fetchText("./board-assets/board_listener_config.json")
  ]);
  return [listenerText, mainText, JSON.parse(configText)];
}

async function fetchText(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`无法读取 ${path}: HTTP ${response.status}`);
  return response.text();
}

function appendFriendly(level, text) {
  const item = document.createElement("div");
  item.className = "friendly-line";
  item.dataset.level = level;
  item.textContent = `[${nowTime()}] ${text}`;
  ui.friendlyLogs.append(item);
  ui.friendlyLogs.scrollTop = ui.friendlyLogs.scrollHeight;
}

function appendRaw(text) {
  ui.rawLog.textContent += `[${nowTime()}] ${text}\n`;
  ui.rawLog.scrollTop = ui.rawLog.scrollHeight;
}

async function copyLogs() {
  const text = `${ui.friendlyLogs.textContent}\n\n${ui.rawLog.textContent}`;
  try {
    await navigator.clipboard.writeText(text);
    appendFriendly("success", tr("logCopied"));
  } catch {
    appendFriendly("error", tr("logCopyDenied"));
  }
}

async function copyDiagnosticReport() {
  const text = buildDiagnosticReport({
    language,
    generatedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    workflow,
    formConfig: formConfig(),
    portInfo: ui.portInfo.textContent,
    hardwareRouteId,
    sonyStatus: sonyStatusText(),
    macroSource: macroSource || "none",
    moonrakerStatus: ui.moonrakerStatus.textContent,
    recoveryStatus: ui.recoveryStatus.textContent,
    friendlyLogText: ui.friendlyLogs.textContent,
    rawLogText: ui.rawLog.textContent
  });
  try {
    await navigator.clipboard.writeText(text);
    appendFriendly("success", tr("reportCopied"));
  } catch {
    appendFriendly("error", tr("reportCopyDenied"));
  }
}

function clearLogs() {
  ui.friendlyLogs.textContent = "";
  ui.rawLog.textContent = "";
  appendFriendly("info", tr("logCleared"));
}

function formatSerialText(text) {
  return text.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

function serialErrorMessage(error) {
  if (error?.name === "NotFoundError") {
    return tr("portPermissionCancelled");
  }
  if (error?.name === "SecurityError") {
    return tr("serialSecurityError");
  }
  if (error?.name === "NetworkError") {
    return tr("serialNetworkError");
  }
  return error?.message || tr("serialGenericError");
}

function nowTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

function queryUi() {
  return {
    browserStatus: document.querySelector("#browserStatus"),
    languageSelect: document.querySelector("#languageSelect"),
    boardStatus: document.querySelector("#boardStatus"),
    safetyStatus: document.querySelector("#safetyStatus"),
    lastLayer: document.querySelector("#lastLayer"),
    totalLayer: document.querySelector("#totalLayer"),
    currentFile: document.querySelector("#currentFile"),
    lastEventAt: document.querySelector("#lastEventAt"),
    dryRunEvents: document.querySelector("#dryRunEvents"),
    portInfo: document.querySelector("#portInfo"),
    recoveryStatus: document.querySelector("#recoveryStatus"),
    moonrakerStatus: document.querySelector("#moonrakerStatus"),
    sonyStatus: document.querySelector("#sonyStatus"),
    macroSource: document.querySelector("#macroSource"),
    baudSelect: document.querySelector("#baudSelect"),
    ssidInput: document.querySelector("#ssidInput"),
    passwordInput: document.querySelector("#passwordInput"),
    hostInput: document.querySelector("#hostInput"),
    modeSelect: document.querySelector("#modeSelect"),
    hardwareRouteButtons: document.querySelectorAll("[data-route]"),
    hardwareRouteDescription: document.querySelector("#hardwareRouteDescription"),
    routePanels: document.querySelectorAll("[data-route-panel]"),
    routeActionButtons: document.querySelectorAll("[data-route-action]"),
    modeTabs: document.querySelectorAll(".mode-tabs [data-mode]"),
    checkpoints: document.querySelectorAll("[data-checkpoint]"),
    tutorialChecklistSummary: document.querySelector("#tutorialChecklistSummary"),
    tutorialStepCue: document.querySelector("#tutorialStepCue"),
    testMoonrakerButton: document.querySelector("#testMoonrakerButton"),
    connectButton: document.querySelector("#connectButton"),
    provisionS3Button: document.querySelector("#provisionS3Button"),
    pairSonyButton: document.querySelector("#pairSonyButton"),
    connectSonyButton: document.querySelector("#connectSonyButton"),
    s3StatusButton: document.querySelector("#s3StatusButton"),
    disarmS3Button: document.querySelector("#disarmS3Button"),
    uploadSafeButton: document.querySelector("#uploadSafeButton"),
    enableDryRunButton: document.querySelector("#enableDryRunButton"),
    softResetButton: document.querySelector("#softResetButton"),
    recoverButton: document.querySelector("#recoverButton"),
    disconnectButton: document.querySelector("#disconnectButton"),
    rawEnterButton: document.querySelector("#rawEnterButton"),
    rawExitButton: document.querySelector("#rawExitButton"),
    probeButton: document.querySelector("#probeButton"),
    removeProbeButton: document.querySelector("#removeProbeButton"),
    armedPhraseInput: document.querySelector("#armedPhraseInput"),
    armButton: document.querySelector("#armButton"),
    copyReportButton: document.querySelector("#copyReportButton"),
    copyLogButton: document.querySelector("#copyLogButton"),
    clearLogButton: document.querySelector("#clearLogButton"),
    friendlyLogs: document.querySelector("#friendlyLogs"),
    rawLog: document.querySelector("#rawLog"),
    nextAction: document.querySelector("#nextAction")
  };
}

function tr(key, values = {}) {
  return t(language, key, values);
}

function applyStaticText() {
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = tr(element.dataset.i18n);
  }
  document.documentElement.lang = language;
  document.title = tr("appTitle");
}
