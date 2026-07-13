import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(resolve(root, "src/app.js"), "utf-8");

function functionBody(name) {
  const start = appJs.indexOf(`async function ${name}()`);
  assert.ok(start >= 0, `expected ${name} to exist`);
  const next = appJs.indexOf("\nasync function ", start + 1);
  return appJs.slice(start, next >= 0 ? next : appJs.length);
}

function namedFunctionBody(name) {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `expected ${name} to exist`);
  const next = appJs.indexOf("\nfunction ", start + 1);
  return appJs.slice(start, next >= 0 ? next : appJs.length);
}

test("board write operations validate required form fields before building configs", () => {
  assert.match(appJs, /from "\.\/config\/formValidation\.js"/);
  assert.match(appJs, /function writableFormConfig\(\)/);

  for (const name of ["uploadSafeListener", "enableDryRun", "armAfterConfirmation"]) {
    const body = functionBody(name);
    assert.match(body, /writableFormConfig\(\)/, `${name} should validate form fields`);
  }
});

test("safety mode tabs follow the workflow safety state", () => {
  assert.match(appJs, /modeTabs:\s*document\.querySelectorAll\("\.mode-tabs \[data-mode\]"\)/);
  assert.match(appJs, /function updateSafetyModeTabs\(/);

  const updateBody = namedFunctionBody("updateWorkflowUi");
  assert.match(updateBody, /updateSafetyModeTabs\(workflow\.safetyMode\)/);

  const tabBody = namedFunctionBody("updateSafetyModeTabs");
  assert.match(tabBody, /tab\.dataset\.active/);
  assert.match(tabBody, /tab\.dataset\.mode === safetyMode/);
});

test("beginner tutorial checklist follows the workflow state", () => {
  assert.match(appJs, /from "\.\/state\/checklist\.js"/);
  assert.match(appJs, /summarizeChecklistState/);
  assert.match(appJs, /checkpoints:\s*document\.querySelectorAll\("\[data-checkpoint\]"\)/);
  assert.match(appJs, /tutorialStepCue:\s*document\.querySelector\("#tutorialStepCue"\)/);
  assert.match(appJs, /function updateTutorialChecklist\(/);

  const updateBody = namedFunctionBody("updateWorkflowUi");
  assert.match(updateBody, /updateTutorialChecklist\(workflow\)/);

  const checklistBody = namedFunctionBody("updateTutorialChecklist");
  assert.match(checklistBody, /buildChecklistState\(workflow,\s*\{/);
  assert.match(checklistBody, /hardwareRouteId/);
  assert.match(checklistBody, /sonyReady: sonyState\.ready/);
  assert.match(checklistBody, /const summaryText = summarizeChecklistState\(items,\s*language\)/);
  assert.match(checklistBody, /ui\.tutorialStepCue\.textContent = summaryText/);
  assert.match(checklistBody, /checkpoint\.dataset\.state/);
  assert.match(checklistBody, /checkpoint\.querySelector\("\[data-checkpoint-status\]"\)/);
});

test("safety status uses localized beginner-facing labels", () => {
  assert.match(appJs, /function safetyModeText\(/);

  const updateBody = namedFunctionBody("updateWorkflowUi");
  assert.match(updateBody, /setStatus\(ui\.safetyStatus,\s*safetyModeText\(workflow\.safetyMode\),\s*workflow\.safetyMode\)/);
  assert.doesNotMatch(updateBody, /workflow\.safetyMode\.toUpperCase\(\)/);

  const safetyBody = namedFunctionBody("safetyModeText");
  for (const key of [
    "safetyModeDisabled",
    "safetyModeDryRun",
    "safetyModeArmed",
    "safetyModeRecovering",
    "safetyModeRecovered"
  ]) {
    assert.match(safetyBody, new RegExp(key));
  }
});

test("operation busy labels are localized instead of hard-coded Chinese", () => {
  assert.match(appJs, /createOperationGate\(\{\s*formatBusyMessage:/s);
  assert.match(appJs, /operationAlreadyRunning/);

  const hardCodedRunOperationCalls = [...appJs.matchAll(/runOperation\("([^"]+)"/g)]
    .map((match) => match[1]);

  assert.deepEqual(hardCodedRunOperationCalls, []);

  for (const key of [
    "operationConnect",
    "operationDisconnect",
    "operationUploadSafe",
    "operationEnableDryRun",
    "operationSoftReset",
    "operationRecover",
    "operationArm",
    "operationRawEnter",
    "operationRawExit",
    "operationProbeWrite",
    "operationProbeRemove"
  ]) {
    assert.match(appJs, new RegExp(`runOperation\\(tr\\("${key}"\\)`));
  }
});

test("S3 route uses serial commands and never enters raw REPL for setup", () => {
  assert.match(appJs, /buildProvisionCommand/);
  assert.match(appJs, /buildPairSonyCommand/);
  assert.match(appJs, /buildConnectSonyCommand/);
  assert.match(appJs, /buildDisarmCommand/);
  assert.match(appJs, /buildStatusCommands/);
  assert.match(appJs, /route\.transport === "serial-command"/);
  assert.match(appJs, /parseS3StatusLine/);
});

test("armed action branches between S3 command and C3 config upload", () => {
  const armStart = appJs.indexOf("async function armAfterConfirmation");
  const armEnd = appJs.indexOf("async function enterRaw", armStart);
  const armFunction = appJs.slice(armStart, armEnd);

  assert.match(armFunction, /buildArmCommand/);
  assert.match(armFunction, /buildArmedBoardListenerConfig/);
  assert.match(armFunction, /route\.transport/);
});
