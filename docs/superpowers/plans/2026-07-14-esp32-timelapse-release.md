# ESP32 Timelapse Documentation And Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a sanitized bilingual public repository, a reproducible v0.1.0 release, and a complete SnapOrca migration prompt.

**Architecture:** Publication policy is executable: a repository audit classifies legacy-name references and secrets, while the release builder includes only explicit source/docs/artifact roots. User documentation separates first-run setup, compatibility migration, developer build steps, and historical research.

**Tech Stack:** Markdown, Node.js release tooling and tests, Git, GitHub CLI.

---

### Task 1: Establish The Public Repository Baseline

**Files:**
- Modify: `.gitignore`
- Create: `README.md`
- Create: `LICENSE`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `tests/repository_publication_policy.test.mjs`

- [ ] **Step 1: Write a failing repository policy test**

The test scans candidate tracked files and fails on non-empty Wi-Fi JSON values,
the known private printer address, BLE MAC literals, COM-only instructions in
the main README, and legacy brands outside explicit compatibility/history/test
paths. It also requires README, MIT license, security policy, and contribution
guide.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/repository_publication_policy.test.mjs`

Expected: FAIL for missing public files and the local C3 config secret.

- [ ] **Step 3: Sanitize or exclude local state**

Replace `device_files/board_listener_config.json` with empty Wi-Fi fields and
`printer.local`. Ignore `*.local.json`, `.env*`, generated firmware/build
directories, personal logs, printer snapshots, images, and release staging.

- [ ] **Step 4: Create public project files**

README begins with the product name and working architecture, then links the S3
and compatible C3 quick starts. Include the verified 135-layer result in
anonymized form, safety warnings, support matrix, and non-affiliation notice.
Use the standard MIT license with year 2026 and copyright holder MOVIBALE.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/repository_publication_policy.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit publication policy**

```text
git add .gitignore README.md LICENSE SECURITY.md CONTRIBUTING.md device_files/board_listener_config.json tests/repository_publication_policy.test.mjs
git commit -m "docs: establish public repository policy"
```

### Task 2: Write Quick Starts, Compatibility, And Migration Documentation

**Files:**
- Rewrite: `README-FIRST.md`
- Create: `docs/quickstart-esp32-s3-sony-ble.md`
- Create: `docs/quickstart-compatible-esp32-c3.md`
- Create: `docs/compatibility.md`
- Create: `docs/migration-from-cyberbrick.md`
- Create: `docs/validation.md`
- Modify: `docs/klipper-smooth-timelapse-macro.md`
- Modify: `docs/klipper-timelapse-browser-configurator.md`
- Modify: `docs/video-tutorial-script-cn.md`
- Modify: documentation contract tests.

- [ ] **Step 1: Update documentation tests first**

Require canonical macros, both hardware routes, safe setup order, legacy alias
matrix, non-affiliation wording, and the anonymized 135/135 evidence. Reject
private IPs, BLE addresses, passwords, and user-specific absolute paths from
public guides.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/docs_*.test.mjs tests/repository_publication_policy.test.mjs`

Expected: FAIL on old names and private evidence.

- [ ] **Step 3: Write the two quick starts**

S3 instructions cover build/flash, Web Serial provisioning, Sony bond/connect,
dry-run, arm/disarm, and recovery. C3 instructions cover compatible hardware,
safe raw-REPL upload, HTTP/WebSocket modes, legacy alias behavior, and deleting
`main.py` for recovery.

- [ ] **Step 4: Write compatibility and migration tables**

Document all old-to-new macro, method, tool, schema, and UI names. Mark the
Bambu Lab Timelapse Kit/CyberBrick route unofficial and independent. Provide the
safe migration order from the approved design.

- [ ] **Step 5: Preserve historical research accurately**

Add a historical banner to research docs instead of rewriting captured facts.
Remove those docs from beginner navigation while retaining technical evidence.

- [ ] **Step 6: Verify GREEN**

Run: `node --test tests/docs_*.test.mjs tests/repository_publication_policy.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit user documentation**

```text
git add README-FIRST.md docs tests
git commit -m "docs: add esp32 timelapse quick starts and migration"
```

### Task 3: Produce The Complete SnapOrca Task Prompt

**Files:**
- Create: `docs/snaporca/esp32-timelapse-box-migration-prompt.md`
- Create: `tests/snaporca_migration_prompt.test.mjs`

- [ ] **Step 1: Write a failing prompt contract test**

Require the prompt to cover canonical capability/config keys, legacy preset and
3MF reads, canonical save behavior, enum stability, G-code command/comments,
dual-name Klipper migration, UI translations, Smooth tower behavior, clearance,
final purge order, Bambu regression comparisons, real U1 preset evidence, and
the instruction not to modify mixed-nozzle work.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/snaporca_migration_prompt.test.mjs`

Expected: FAIL because the prompt is absent.

- [ ] **Step 3: Write the send-ready prompt**

Use direct imperative language, exact old/new keys, exact test expectations,
scope boundaries, required build commands, evidence tables, and a structured
completion report. Require the other task to inspect current SnapOrca state
before editing and preserve unrelated dirty-worktree changes.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/snaporca_migration_prompt.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the SnapOrca handoff**

```text
git add docs/snaporca tests/snaporca_migration_prompt.test.mjs
git commit -m "docs: add snaporca esp32 timelapse migration prompt"
```

### Task 4: Rebuild The Sanitized v0.1.0 Release

**Files:**
- Modify: `apps/klipper-timelapse-configurator/src/release/releasePackage.js`
- Modify: `apps/klipper-timelapse-configurator/src/release/releasePackage.test.mjs`
- Modify: `apps/klipper-timelapse-configurator/src/release/verifyRelease.js`
- Modify: `docs/browser-configurator-release-package.md`
- Create: `CHANGELOG.md`
- Create: `scripts/build-public-release.mjs`

- [ ] **Step 1: Change release tests first**

Require archive name `esp32-timelapse-box-v0.1.0.zip`, public docs, macro config,
both hardware routes, S3 firmware binaries, SHA-256 checksum file, and no tests,
private state, legacy-branded archive name, or secrets.

- [ ] **Step 2: Verify RED**

Run from the app directory: `npm run release:check`

Expected: FAIL because the current archive is CyberBrick-only.

- [ ] **Step 3: Update explicit include/exclude roots and scanners**

Release collection includes canonical source/docs/config and staged S3 build
artifacts. Sensitive patterns cover private IPv4 ranges, common token formats,
BLE MAC addresses, non-empty Wi-Fi values, local absolute paths, and forbidden
legacy branding outside compatibility files.

- [ ] **Step 4: Build artifacts reproducibly**

Run PlatformIO clean/build, copy only bootloader/partition/application binaries
with offsets documented in the release README, produce the browser ZIP, and
write SHA-256 checksums.

- [ ] **Step 5: Run the complete release verifier**

Run from the app directory:

```text
npm run verify:release
npm run release:zip
```

Expected: all Python, Node, app, smoke, documentation, firmware-build, archive,
and secret-scan gates pass.

- [ ] **Step 6: Commit release automation**

```text
git add CHANGELOG.md scripts apps/klipper-timelapse-configurator/src/release apps/klipper-timelapse-configurator/scripts docs/browser-configurator-release-package.md
git commit -m "build: prepare v0.1.0 public release"
```

### Task 5: Publish GitHub Repository And Release

**Files:**
- No source edits unless verification exposes a release defect.

- [ ] **Step 1: Perform a tracked-file completion audit**

Run `git status --short`, `git ls-files`, full test suites, clean firmware build,
release verifier, and secret scan. Inspect the generated ZIP listing and
checksums. Confirm ignored personal logs, photos, backups, U1 snapshots, and
external trees are absent from Git.

- [ ] **Step 2: Create the public GitHub repository**

Run:

```text
gh repo create MOVIBALE/esp32-timelapse-box --public --source . --remote origin --description "ESP32-S3/ESP32-C3 Klipper timelapse box with Sony BLE and legacy shutter-box compatibility"
```

Expected: repository created and `origin` configured.

- [ ] **Step 3: Push the release branch**

Push `Min/esp32-timelapse-box`, then create and push `main` only after the
verified history is ready. Protect against accidental force-push; use normal
fast-forward operations.

- [ ] **Step 4: Create v0.1.0 and upload artifacts**

Use `gh release create v0.1.0` with release notes from `CHANGELOG.md`, the
sanitized ZIP, firmware binaries, and checksum file. Mark it as a prerelease if
the compatible C3 hardware repeat test remains pending; otherwise publish it as
a normal release.

- [ ] **Step 5: Verify remote state**

Open the repository and release URLs, verify README rendering, license,
downloadable assets, default branch, and absence of private data. Record URLs
and release asset checksums in the completion report.
