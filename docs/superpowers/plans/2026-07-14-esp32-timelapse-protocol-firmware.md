# ESP32 Timelapse Protocol And Firmware Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the canonical ESP32 Timelapse trigger protocol while keeping every deployed CyberBrick/C3 macro and remote-method path functional.

**Architecture:** A dual-name Klipper macro synchronizes canonical and legacy sequence variables through one private counter. ESP32-S3 firmware selects the canonical Moonraker object first, falls back to the legacy object, then uses the existing layer detector. The MicroPython C3 agent registers both remote-method names and sends both through one deduper.

**Tech Stack:** Klipper Jinja/G-code macros, ESP-IDF C with cJSON, MicroPython/Python, Node.js contract tests, PlatformIO.

---

### Task 1: Add The Dual-Name Klipper Contract

**Files:**
- Create: `config/klipper/esp32_timelapse.cfg`
- Create: `tests/esp32_timelapse_macro.test.mjs`

- [ ] **Step 1: Write the failing macro contract test**

Create a Node test that reads the macro file and checks for `_ESP32_TIMELAPSE_EVENT`, `ESP32_TIMELAPSE_SHOT`, and `CYBERBRICK_SHOT`. Assert that both public macros call the private event exactly once and that the private event writes the same `next_seq` to both public `seq` variables.

```js
test("canonical and legacy shot macros share one sequence", () => {
  const text = readFileSync("config/klipper/esp32_timelapse.cfg", "utf8");
  assert.match(text, /\[gcode_macro _ESP32_TIMELAPSE_EVENT\]/);
  assert.match(text, /\[gcode_macro ESP32_TIMELAPSE_SHOT\]/);
  assert.match(text, /\[gcode_macro CYBERBRICK_SHOT\]/);
  assert.match(text, /MACRO=ESP32_TIMELAPSE_SHOT VARIABLE=seq VALUE=\{next_seq\}/);
  assert.match(text, /MACRO=CYBERBRICK_SHOT VARIABLE=seq VALUE=\{next_seq\}/);
});
```

- [ ] **Step 2: Run the test and verify the missing-file failure**

Run: `node --test tests/esp32_timelapse_macro.test.mjs`

Expected: FAIL because `config/klipper/esp32_timelapse.cfg` does not exist.

- [ ] **Step 3: Implement the shared counter macros**

Use one Jinja `next_seq` calculation and three `SET_GCODE_VARIABLE` commands. The private macro owns the authoritative counter; both public macros expose synchronized values. `RESPOND` uses `PREFIX=ESP32_TIMELAPSE`.

```ini
[gcode_macro _ESP32_TIMELAPSE_EVENT]
variable_seq: 0
gcode:
  {% set next_seq = printer["gcode_macro _ESP32_TIMELAPSE_EVENT"].seq|int + 1 %}
  SET_GCODE_VARIABLE MACRO=_ESP32_TIMELAPSE_EVENT VARIABLE=seq VALUE={next_seq}
  SET_GCODE_VARIABLE MACRO=ESP32_TIMELAPSE_SHOT VARIABLE=seq VALUE={next_seq}
  SET_GCODE_VARIABLE MACRO=CYBERBRICK_SHOT VARIABLE=seq VALUE={next_seq}
  RESPOND PREFIX=ESP32_TIMELAPSE MSG="shot_seq={next_seq}"

[gcode_macro ESP32_TIMELAPSE_SHOT]
variable_seq: 0
gcode:
  _ESP32_TIMELAPSE_EVENT

[gcode_macro CYBERBRICK_SHOT]
description: Deprecated compatibility alias for ESP32_TIMELAPSE_SHOT.
variable_seq: 0
gcode:
  _ESP32_TIMELAPSE_EVENT
```

- [ ] **Step 4: Run the contract test**

Run: `node --test tests/esp32_timelapse_macro.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the macro contract**

```text
git add config/klipper/esp32_timelapse.cfg tests/esp32_timelapse_macro.test.mjs
git commit -m "feat: add dual-name timelapse macro"
```

### Task 2: Add The Canonical C3 Filesystem Tool And Legacy Wrapper

**Files:**
- Create: `tools/esp32_timelapse_fs.py`
- Modify: `tools/cyberbrick_fs.py`
- Create: `tests/test_esp32_timelapse_fs.py`
- Modify: `tests/test_cyberbrick_fs.py`

- [ ] **Step 1: Write failing tests for canonical environment variables and wrapper forwarding**

Tests import `tools.esp32_timelapse_fs`, assert the password resolver prefers
`ESP32_TIMELAPSE_WIFI_PASS` and falls back to `CYBERBRICK_WIFI_PASS`, and assert
the legacy module exports the canonical `main`, `open_serial_no_reset`, and
filesystem helpers.

```python
def test_password_env_prefers_canonical(monkeypatch):
    monkeypatch.setenv("ESP32_TIMELAPSE_WIFI_PASS", "new")
    monkeypatch.setenv("CYBERBRICK_WIFI_PASS", "old")
    assert fs.resolve_wifi_password(None) == "new"
```

- [ ] **Step 2: Verify RED**

Run: `python -m pytest tests/test_esp32_timelapse_fs.py tests/test_cyberbrick_fs.py -q`

Expected: FAIL because `tools.esp32_timelapse_fs` does not exist.

- [ ] **Step 3: Move the implementation behind the canonical module**

Copy the existing behavior into `esp32_timelapse_fs.py`, rename help text and
the preferred environment variable, and retain the legacy environment fallback.
Replace `cyberbrick_fs.py` with a deprecation wrapper that imports and calls the
canonical module without changing old CLI arguments.

- [ ] **Step 4: Verify GREEN**

Run: `python -m pytest tests/test_esp32_timelapse_fs.py tests/test_cyberbrick_fs.py -q`

Expected: PASS, including old imports.

- [ ] **Step 5: Commit the tool migration**

```text
git add tools/esp32_timelapse_fs.py tools/cyberbrick_fs.py tests/test_esp32_timelapse_fs.py tests/test_cyberbrick_fs.py
git commit -m "feat: add canonical esp32 filesystem tool"
```

### Task 3: Register Canonical And Legacy C3 Remote Methods

**Files:**
- Modify: `device_files/board_listener.py`
- Modify: `device_files/moonraker_agent.py`
- Modify: `apps/klipper-timelapse-configurator/board-assets/board_listener.py`
- Modify: `apps/web-serial-com6-check/board-assets/board_listener.py`
- Modify: `tests/test_board_listener.py`
- Modify: `tests/test_moonraker_agent_protocol.py`
- Modify: `tests/test_board_file_contents.py`

- [ ] **Step 1: Write failing dual-registration tests**

Assert `REMOTE_METHODS == ("esp32_timelapse_trigger", "cyberbrick_shutter_trigger")`.
Feed one message under each name and confirm each enters the same deduper. Feed
the same `filename` and `layer` under both names and confirm only one event is
triggered.

- [ ] **Step 2: Verify RED**

Run: `python -m pytest tests/test_board_listener.py tests/test_moonraker_agent_protocol.py tests/test_board_file_contents.py -q`

Expected: FAIL because only `cyberbrick_shutter_trigger` is registered.

- [ ] **Step 3: Implement multi-method registration**

Add canonical and legacy constants, generate unique JSON-RPC IDs while
registering both methods, accept either method in the receive loop, and retain
one `TriggerDeduper`. Change the connection identity and URL to the new public
repository. Do not emit two physical triggers for one dedupe key.

- [ ] **Step 4: Synchronize distributable board assets**

Copy the tested canonical board listener into both app asset directories. Keep
config JSON Wi-Fi fields empty and set the host to `printer.local`.

- [ ] **Step 5: Verify GREEN**

Run: `python -m pytest tests/test_board_listener.py tests/test_moonraker_agent_protocol.py tests/test_board_file_contents.py -q`

Expected: PASS.

- [ ] **Step 6: Commit C3 compatibility**

```text
git add device_files apps/klipper-timelapse-configurator/board-assets apps/web-serial-com6-check/board-assets tests/test_board_listener.py tests/test_moonraker_agent_protocol.py tests/test_board_file_contents.py
git commit -m "feat: support canonical and legacy c3 triggers"
```

### Task 4: Prefer Canonical Macro Events In ESP32-S3 Firmware

**Files:**
- Move: `firmware/esp32-sony-ble-bluedroid-shutter-probe/` to `firmware/esp32-s3-sony-ble-timelapse/`
- Modify: `firmware/esp32-s3-sony-ble-timelapse/main/sony_bluedroid_shutter_probe.c`
- Modify: `firmware/esp32-s3-sony-ble-timelapse/README.md`
- Modify: `tests/esp32_klipper_sony_timelapse.test.mjs`

- [ ] **Step 1: Update tests first for dual macro selection**

Change the source path in the test and require both query objects. Assert source
selection prefers `gcode_macro ESP32_TIMELAPSE_SHOT`, falls back to
`gcode_macro CYBERBRICK_SHOT`, records a macro source enum/string, and baselines
without triggering when the selected source changes.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/esp32_klipper_sony_timelapse.test.mjs`

Expected: FAIL because the canonical object and source-switch logic are absent.

- [ ] **Step 3: Rename the firmware directory and introduce explicit source state**

Use constants for canonical and legacy object names. Extend the event with
`macro_source`, parse both objects, select canonical-valid then legacy-valid,
and treat neither-valid as layer fallback. Keep `macro_present` true for only
the selected valid source.

- [ ] **Step 4: Baseline source changes**

Store the selected source beside `s_timelapse_last_macro_seq`. A change from
legacy to canonical or canonical to legacy resets only the macro baseline and
returns `macro_source_changed` without shooting. File changes and non-printing
states continue to reset every baseline.

- [ ] **Step 5: Update logs and documentation**

Status logs include `macro_source=canonical|legacy|none`. Beginner docs name the
canonical macro first and place old names only in a compatibility section. Keep
serial arm/disarm and no-auto-trigger guarantees unchanged.

- [ ] **Step 6: Verify source tests**

Run: `node --test tests/esp32_klipper_sony_timelapse.test.mjs`

Expected: PASS.

- [ ] **Step 7: Build the firmware cleanly**

Run from the renamed directory:

`..\..\.venv-platformio\Scripts\platformio.exe run`

Expected: `SUCCESS` for `esp32-s3-devkitc-1` and generated `firmware.bin`,
`bootloader.bin`, and `partitions.bin`.

- [ ] **Step 8: Commit the S3 migration**

```text
git add firmware/esp32-s3-sony-ble-timelapse tests/esp32_klipper_sony_timelapse.test.mjs
git commit -m "feat: prefer canonical timelapse macro on esp32-s3"
```

### Task 5: Run Protocol Regression Gates

**Files:**
- Modify only files needed to fix test-proven regressions.

- [ ] **Step 1: Run all Python tests**

Run: `python -m pytest tests -q`

Expected: all tests pass with no credential values in output.

- [ ] **Step 2: Run root Node tests**

Run: `node --test tests/*.test.mjs`

Expected: all tests pass.

- [ ] **Step 3: Search protocol references**

Run: `rg -n "CYBERBRICK|cyberbrick|Bambu|BBL|拓竹|竹子" config device_files firmware tools tests`

Expected: matches are limited to aliases, compatibility tests, and historical
material. Canonical source paths and primary descriptions use ESP32 Timelapse.

- [ ] **Step 4: Commit regression fixes if required**

```text
git add config device_files firmware tools tests
git commit -m "test: lock esp32 timelapse protocol compatibility"
```

