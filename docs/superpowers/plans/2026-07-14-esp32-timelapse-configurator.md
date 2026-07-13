# ESP32 Timelapse Browser Configurator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the browser configurator and support safe setup for both ESP32-S3 Sony BLE firmware and compatible ESP32-C3 MicroPython shutter boxes.

**Architecture:** A route model selects S3 serial-command behavior or C3 raw-REPL behavior. Shared Web Serial, Moonraker preflight, logs, localization, diagnostics, and safety state remain common. Route-specific operations live in small modules and the UI only exposes controls valid for the selected hardware.

**Tech Stack:** Static HTML/CSS, browser ES modules, Web Serial, Node.js tests, Playwright/Chrome screenshot smoke.

---

### Task 1: Lock The Public Brand And Legacy Allowlist

**Files:**
- Create: `apps/klipper-timelapse-configurator/src/branding/brandPolicy.js`
- Create: `apps/klipper-timelapse-configurator/src/branding/brandPolicy.test.mjs`
- Modify: `apps/klipper-timelapse-configurator/src/appStructure.test.mjs`

- [ ] **Step 1: Write failing public-brand tests**

Scan `index.html`, `strings.js`, and `diagnosticReport.js`. Require
`ESP32 延时摄影盒子` and `ESP32 Timelapse Box`; reject public `CyberBrick`,
`Bambu`, `BBL`, `拓竹`, and `竹子`. The policy module exports the canonical
names and an allowlist used by repository release checks.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --test-name-pattern="brand|public identity"`

Expected: FAIL on current CyberBrick UI strings.

- [ ] **Step 3: Implement the brand policy module**

Export immutable canonical names, repository URL, and explicit legacy terms.
The runtime UI imports canonical names rather than duplicating literals.

- [ ] **Step 4: Replace user-facing identity strings**

Update title, eyebrow, connection chain, diagnostic title, and bilingual copy.
Do not rename protocol aliases in compatibility code during this task.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- --test-name-pattern="brand|public identity"`

Expected: PASS.

- [ ] **Step 6: Commit the rebrand**

```text
git add apps/klipper-timelapse-configurator
git commit -m "feat: rebrand browser configurator"
```

### Task 2: Add A Tested Hardware Route Model

**Files:**
- Create: `apps/klipper-timelapse-configurator/src/hardware/routes.js`
- Create: `apps/klipper-timelapse-configurator/src/hardware/routes.test.mjs`
- Modify: `apps/klipper-timelapse-configurator/index.html`
- Modify: `apps/klipper-timelapse-configurator/src/app.js`
- Modify: `apps/klipper-timelapse-configurator/src/i18n/strings.js`

- [ ] **Step 1: Write route-model tests**

Require route IDs `esp32-s3-sony-ble` and `esp32-c3-compatible`. Assert S3 uses
serial command setup and C3 uses raw REPL upload. Assert both start disabled or
dry-run and neither route permits an automatic armed state.

- [ ] **Step 2: Verify RED**

Run: `node --test src/hardware/routes.test.mjs`

Expected: FAIL because the route model does not exist.

- [ ] **Step 3: Implement the route model**

Each route contains only stable behavior flags and i18n keys:

```js
export const HARDWARE_ROUTES = Object.freeze({
  "esp32-s3-sony-ble": Object.freeze({ transport: "serial-command", canUploadFiles: false }),
  "esp32-c3-compatible": Object.freeze({ transport: "micropython-raw-repl", canUploadFiles: true })
});
```

- [ ] **Step 4: Add an accessible segmented route control**

Place it before the action stack. Switching routes updates labels, visible
actions, workflow state, and help text without changing dimensions. Use buttons
with `aria-pressed`, not decorative cards.

- [ ] **Step 5: Verify route and structure tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit route selection**

```text
git add apps/klipper-timelapse-configurator
git commit -m "feat: add s3 and c3 setup routes"
```

### Task 3: Implement Safe ESP32-S3 Serial Commands

**Files:**
- Create: `apps/klipper-timelapse-configurator/src/serial/s3Commands.js`
- Create: `apps/klipper-timelapse-configurator/src/serial/s3Commands.test.mjs`
- Modify: `apps/klipper-timelapse-configurator/src/app.js`
- Modify: `apps/klipper-timelapse-configurator/src/state/workflow.js`
- Modify: `apps/klipper-timelapse-configurator/src/state/workflow.test.mjs`

- [ ] **Step 1: Write failing command-builder tests**

Test `buildProvisionCommand`, `buildStatusCommand`, `buildConnectSonyCommand`,
`buildDryRunCommand`, and `buildArmCommand`. Provisioning rejects `|`, CR, and
LF in fields so one form submission cannot inject another serial command.

```js
assert.equal(buildProvisionCommand({ssid:"Lab", password:"pw", host:"printer.local"}), "w Lab|pw|printer.local\n");
assert.throws(() => buildProvisionCommand({ssid:"bad\na", password:"pw", host:"printer.local"}), /unsupported/);
```

- [ ] **Step 2: Verify RED**

Run: `node --test src/serial/s3Commands.test.mjs`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement minimal builders**

Map status to `s\n`, Sony connect to `b\n`, dry-run/disarm to `d\n`, and arm to
`a\n`. Do not expose `t` as a beginner primary action; keep manual shutter in
the armed advanced area with a separate confirmation.

- [ ] **Step 4: Route S3 actions through serial-command functions**

Provisioning writes only the `w` command, status writes `s` and `p`, connect
writes `b`, and disarm writes `d`. The normal S3 flow never invokes raw REPL or
deletes `main.py`.

- [ ] **Step 5: Verify GREEN and workflow safety**

Run: `npm test`

Expected: PASS, including operation-gate and armed-state tests.

- [ ] **Step 6: Commit S3 setup**

```text
git add apps/klipper-timelapse-configurator
git commit -m "feat: configure esp32-s3 over web serial"
```

### Task 4: Deeply Localize Route-Specific Logs And Diagnostics

**Files:**
- Modify: `apps/klipper-timelapse-configurator/src/i18n/strings.js`
- Modify: `apps/klipper-timelapse-configurator/src/i18n/logs.js`
- Modify: `apps/klipper-timelapse-configurator/src/i18n/strings.test.mjs`
- Modify: `apps/klipper-timelapse-configurator/src/i18n/logs.test.mjs`
- Modify: `apps/klipper-timelapse-configurator/src/runtime/diagnosticReport.js`
- Modify: `apps/klipper-timelapse-configurator/src/runtime/diagnosticReport.test.mjs`

- [ ] **Step 1: Add failing translation tests**

Require Chinese and English entries for every hardware route, provisioning,
Sony connection, ready, dry-run, armed, legacy compatibility, and recovery
message. Require diagnostics to identify the selected route while redacting
Wi-Fi passwords and private IPv4 addresses.

- [ ] **Step 2: Verify RED**

Run: `node --test src/i18n/*.test.mjs src/runtime/diagnosticReport.test.mjs`

Expected: FAIL for missing route strings and IP redaction.

- [ ] **Step 3: Implement translations and redaction**

Translate terminal semantics, not only headings. Preserve raw logs separately.
Replace password values with `******` and private IPv4 values with
`[private-ip]` in copied reports.

- [ ] **Step 4: Verify GREEN**

Run: `npm test`

Expected: PASS with no untranslated primary-flow key.

- [ ] **Step 5: Commit localization**

```text
git add apps/klipper-timelapse-configurator/src/i18n apps/klipper-timelapse-configurator/src/runtime
git commit -m "feat: localize esp32 setup diagnostics"
```

### Task 5: Finish Responsive Interaction And Smoke Coverage

**Files:**
- Modify: `apps/klipper-timelapse-configurator/src/styles/workbench.css`
- Modify: `apps/klipper-timelapse-configurator/src/runtime/chromeWorkflowSmoke.js`
- Modify: `apps/klipper-timelapse-configurator/scripts/smokeWorkflow.mjs`
- Modify: `apps/klipper-timelapse-configurator/scripts/captureScreenshots.mjs`
- Modify: related smoke tests.

- [ ] **Step 1: Extend smoke tests before runtime changes**

Add one simulated workflow per route. The S3 run connects, provisions, requests
status, and disarms; it never emits raw-REPL bytes or `a`. The C3 run uploads
safe files and performs recovery; it never writes an armed config.

- [ ] **Step 2: Verify RED**

Run: `npm run smoke:workflow`

Expected: FAIL because only the C3 flow exists.

- [ ] **Step 3: Implement route-aware smoke fixtures**

Use neutral `__esp32Timelapse*` globals. Preserve aliases only inside the smoke
compatibility shim if an old test still imports them.

- [ ] **Step 4: Refine layout without changing the hardware-workbench direction**

Keep square or low-radius controls, stable action dimensions, restrained green
status color, and no decorative gradients/orbs. Ensure segmented controls,
buttons, log panes, and long English labels do not overlap at 390x844,
768x1024, and 1440x900.

- [ ] **Step 5: Run browser verification**

Run:

```text
npm run smoke:workflow
npm run smoke:screenshots
```

Expected: both route workflows pass and screenshots are nonblank with no
horizontal overflow.

- [ ] **Step 6: Commit UI verification**

```text
git add apps/klipper-timelapse-configurator
git commit -m "test: cover both browser setup routes"
```

