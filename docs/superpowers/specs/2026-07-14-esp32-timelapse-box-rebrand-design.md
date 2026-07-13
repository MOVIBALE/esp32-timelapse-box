# ESP32 Timelapse Box Rebrand And Compatibility Design

**Status:** Approved direction on 2026-07-14

## 1. Purpose

Publish the project as **ESP32 延时摄影盒子 / ESP32 Timelapse Box** instead of
using CyberBrick or Bambu as the product identity. The public project supports
two proven hardware routes:

1. ESP32-S3 with Wi-Fi, Moonraker polling, and an active Sony BLE camera link.
2. Compatible ESP32-C3 MicroPython shutter hardware using GPIO/HID, with HTTP
   polling and Moonraker WebSocket agent backends.

The migration must not break existing printers, slicer profiles, G-code, or the
previous compatible C3 shutter box. Old names remain only where they are needed
for protocol compatibility, migration instructions, historical research, and
the compatibility matrix.

## 2. Naming Policy

### Public identity

- Chinese product name: `ESP32 延时摄影盒子`
- English product name: `ESP32 Timelapse Box`
- Short technical prefix: `ESP32_TIMELAPSE`
- Repository name: `esp32-timelapse-box`

The main README, configurator, diagnostic report, release archive, screenshots,
firmware documentation, and tutorial use the public identity above.

### Allowed legacy references

`CyberBrick`, `Bambu`, `Bambu Lab Timelapse Kit`, `CYBERBRICK_*`, and
`cyberbrick_*` may appear only in:

- compatibility tables;
- migration documentation;
- deprecated aliases and wrappers required for old deployments;
- historical protocol/research documents;
- tests that prove old identifiers still work;
- a clear non-affiliation statement.

The compatibility text may say: "Compatible with Bambu Lab Timelapse Kit /
CyberBrick hardware through an independent, unofficial integration." It must
not imply endorsement, partnership, or ownership of those brands.

Public feature descriptions use `平滑模式稳定塔 / smooth-mode stabilization
tower`, not a third-party brand name. Technical comparison documents may still
identify the source behavior they compare.

## 3. Canonical Trigger Contract

### Klipper macro names

The canonical slicer command is:

```gcode
ESP32_TIMELAPSE_SHOT
```

The installed Klipper configuration exposes three macros:

- `_ESP32_TIMELAPSE_EVENT`: private shared counter implementation;
- `ESP32_TIMELAPSE_SHOT`: canonical public command;
- `CYBERBRICK_SHOT`: deprecated compatibility alias.

Both public macros invoke the same private macro. One event increments one
shared sequence and writes that value into both public macro variables. This
keeps old firmware polling `gcode_macro CYBERBRICK_SHOT.seq` and new firmware
polling `gcode_macro ESP32_TIMELAPSE_SHOT.seq` synchronized without producing
two shutter events.

An old installation that contains only `CYBERBRICK_SHOT` remains usable because
new firmware also queries the legacy object. Existing old firmware becomes
compatible with new slicer output after the dual-name Klipper configuration is
installed.

### Moonraker remote method names

The canonical WebSocket agent method is:

```text
esp32_timelapse_trigger
```

Updated C3 agent firmware registers both `esp32_timelapse_trigger` and the
deprecated `cyberbrick_shutter_trigger`. Both names enter the same deduper and
trigger function. A macro calls exactly one method; it never calls both.

WebSocket migrations therefore update the board agent before switching the
Klipper macro to the canonical method. HTTP polling does not have this ordering
constraint.

### Firmware selection and deduplication

New ESP32-S3 firmware queries both macro objects in one Moonraker request:

1. Prefer a valid canonical `ESP32_TIMELAPSE_SHOT.seq`.
2. Fall back to a valid legacy `CYBERBRICK_SHOT.seq`.
3. Fall back to the proven layer/Z detection only when neither macro has a valid
   sequence.

If the selected source changes, firmware establishes a new baseline and does
not fire immediately. This prevents duplicate or stale shots during a live
migration. When both dual-name objects exist, only the canonical object is
observed because both counters are synchronized.

The C3 `auto` backend still permits only one active source at a time. HTTP and
WebSocket events continue through the existing `filename:layer` deduper.

## 4. Hardware Routes

### ESP32-S3 Sony BLE route

The current proven ESP-IDF/PlatformIO firmware becomes the primary reference
firmware under a product-oriented path. It keeps these safety properties:

- no camera scan or shutter trigger on boot;
- serial `b` explicitly starts connection to the bonded Sony camera;
- serial `a` arms and `d` immediately disarms;
- dry-run is the compiled default;
- Wi-Fi credentials are provisioned to NVS and never committed;
- macro events trigger only while the printer is genuinely printing and the
  Sony link reports ready;
- the layer/Z fallback remains available for generic Klipper printers.

The public documentation records the successful 135-layer real U1/Sony test as
an anonymized result, without private IP addresses, BLE addresses, serial ports,
or raw personal logs.

### Compatible ESP32-C3 MicroPython route

The existing board listener remains supported for the previous shutter box and
generic C3 boards with equivalent GPIO wiring. Its browser flow remains:

1. connect by Web Serial;
2. upload disabled/dry-run configuration;
3. reboot and verify board status;
4. enable dry-run and observe real print events;
5. arm only after explicit confirmation;
6. recover by deleting `main.py`.

Default assets contain empty Wi-Fi fields and `printer.local`. Any local test
configuration containing real credentials or addresses is excluded or
sanitized before publication.

The canonical developer tool is `esp32_timelapse_fs.py`. The old
`cyberbrick_fs.py` path remains as a small deprecation wrapper so existing
commands do not fail.

## 5. Browser Configurator

The existing static Chrome/Edge application remains browser-first and keeps its
hardware safety gates. It gains an explicit hardware route choice:

- `ESP32-S3 + Sony BLE`
- `兼容型 ESP32-C3 快门盒 / Compatible ESP32-C3 shutter box`

For the C3 route it keeps raw-REPL file upload and recovery. For the S3 route it
uses serial commands for network provisioning, Sony connect/status, dry-run,
arm, and disarm. ESP-IDF flashing in the browser is outside this release; the
release provides build/flash instructions and verified firmware artifacts.

All user-facing Chinese and English strings, terminal translations, diagnostic
titles, release filenames, and smoke-test globals use the new identity. Internal
legacy aliases are hidden from beginner screens and exposed only in an advanced
compatibility panel or migration report.

## 6. SnapOrca Migration

SnapOrca is modified in its separate source task, not directly by this
workspace implementation. This repository provides a complete, send-ready
prompt with the following contract:

- UI name: `ESP32 延时摄影盒子 / ESP32 Timelapse Box`;
- emitted command: `ESP32_TIMELAPSE_SHOT`;
- new canonical capability/config keys use `esp32_timelapse_*`;
- old `supports_cyberbrick_timelapse` and `cyberbrick_timelapse_*` keys are
  accepted when loading old printer presets and 3MF files;
- old values migrate into canonical fields without changing Off, Traditional,
  or Smooth enum semantics;
- newly saved presets use canonical keys;
- old G-code and old Klipper macros remain valid through aliases;
- smooth stabilization-tower behavior, safety clearance, final purge ordering,
  Bambu native behavior, and the verified 135-layer contract do not regress;
- the task must not mix in or revert the user's existing mixed-nozzle changes.

The prompt requires focused compatibility tests, real U1 preset G-code evidence,
Bambu reference comparisons, translation updates, and a clean diff report.

## 7. Repository And Release Boundary

The new public GitHub repository is `MOVIBALE/esp32-timelapse-box`, public, with
an MIT license for project-owned code. The README includes a non-affiliation and
trademark notice.

Included:

- current S3 firmware and compatible C3 board files;
- sanitized browser configurator;
- Klipper macro templates;
- build, flash, setup, migration, recovery, and troubleshooting docs;
- automated tests and release scripts;
- anonymized validation summary;
- the SnapOrca migration prompt.

Excluded:

- Wi-Fi credentials, local IP addresses, BLE MAC addresses, and account data;
- personal photos and raw serial/print logs;
- backups, local printer configuration snapshots, virtual environments,
  build caches, external source trees, and generated test reports;
- bundled third-party binaries without a clear redistribution license.

The first public release is `v0.1.0`. It includes source, a sanitized browser
configurator ZIP, checksums, and S3 firmware artifacts only after clean rebuild
and verification. Repository topics and release notes describe generic Klipper,
Moonraker, ESP32-S3, ESP32-C3, Sony BLE, and timelapse support.

## 8. Migration Order

1. Install the dual-name Klipper macro while current firmware remains active.
2. Verify both macro objects report the same sequence after calling either name.
3. Update S3 firmware or the C3 agent so it understands canonical and legacy
   identifiers.
4. Verify dry-run using the canonical command.
5. Update the browser configurator and public documentation.
6. Update SnapOrca to emit the canonical command and canonical schema.
7. Keep legacy aliases for the entire `0.x` release line. Removal, if ever
   proposed, requires a separate major-version decision and migration evidence.

## 9. Error Handling And Safety

- Missing canonical macro with a valid legacy macro is a compatibility state,
  not an error.
- Missing or invalid sequences on both macros activates layer fallback and a
  visible warning.
- A macro-source switch establishes a baseline without shooting.
- WebSocket registration failure for one alias is reported; the board may serve
  the successfully registered name but may not silently claim full compatibility.
- Every armed transition still requires the existing explicit phrase or serial
  command. Rebranding must not weaken safety gates.
- Diagnostic exports redact Wi-Fi passwords and private network values.
- Release checks fail when forbidden secrets, private IPs, device addresses, or
  unexpected legacy branding appear outside the allowlist.

## 10. Verification

Automated acceptance gates:

- Python unit tests for C3 listener behavior, dual remote methods, deduplication,
  sanitized assets, and deprecated tool wrappers;
- Node tests for dual-name Klipper macro text, S3 firmware source contracts,
  bilingual UI strings, release manifests, and legacy-name allowlists;
- configurator unit tests plus simulated Web Serial workflow smoke tests for
  both hardware routes;
- Playwright screenshots at desktop and mobile widths with no overlap or
  untranslated primary workflow text;
- PlatformIO/ESP-IDF clean build of the S3 reference firmware;
- release ZIP inspection, checksum generation, and secret scan;
- a migration test proving calls to either Klipper macro keep both exposed
  sequence variables synchronized;
- a firmware parsing test proving canonical preference, legacy fallback, source
  switch baselining, and no duplicate trigger;
- regression checks that the old C3 HTTP and WebSocket routes still enter the
  shared trigger deduper.

Hardware acceptance after software gates:

1. S3 dry-run observes canonical macro events.
2. S3 reconnects to the bonded Sony camera and reports ready.
3. One explicitly authorized manual shutter produces one photo.
4. A short Smooth print produces one photo per requested frame.
5. The compatible C3 box completes disabled upload, dry-run, and one authorized
   trigger using the legacy alias.

The public `v0.1.0` may be published after automated gates and the already
completed S3 135-layer evidence are documented. The C3 live recheck may be
listed as verified legacy compatibility only if hardware is available; otherwise
it is labeled automated compatibility pending a repeat hardware run.

## 11. Non-Goals

- Reimplementing SnapOrca inside this repository.
- Browser-based ESP-IDF flashing in `v0.1.0`.
- Supporting non-Sony BLE camera protocols without captured evidence.
- Renaming historical local workspace folders or altering ignored U1 backups.
- Removing legacy protocol aliases during the `0.x` release line.
