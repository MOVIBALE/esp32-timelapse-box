# Changelog

All notable public changes to ESP32 Timelapse Box are documented here.

## [Unreleased]

## [0.1.0] - 2026-07-17

Engineering prerelease.

### Added

- ESP32-S3 ESP-IDF firmware for active Sony BLE pairing, reconnect, and shutter control.
- Compatible ESP32-C3 MicroPython route with HTTP polling and Moonraker WebSocket backends.
- Canonical `ESP_TIMELAPSE_SHOT` Klipper macro with a shared legacy alias.
- Bilingual Chrome/Edge Web Serial configurator with dry-run and armed safety gates.
- Traditional and Smooth SnapOrca integration specification, including a real single-material stabilization tower.
- Bilingual quick starts, compatibility matrix, migration guide, protocol, validation, troubleshooting, and video script.
- Deterministic release assets and SHA-256 checksums.

### Changed

- Project-owned source is now licensed under `GPL-3.0-only` instead of MIT.
- Renamed the callable macro from the development-only `ESP32_TIMELAPSE_SHOT`
  to `ESP_TIMELAPSE_SHOT` because the U1 Klipper parser truncates the former to
  `ESP32`.
- ESP32-S3 safely reconnects an existing Sony bond on boot without writing
  FF01 or entering armed mode; serial `b` remains an explicit retry.
- Opening the browser configurator reads S3 status without silently changing
  dry-run or armed state.
- The single USB-C ESP32-S3 build uses USB Serial/JTAG as its primary
  bidirectional console.

### Compatibility

- Preserves `CYBERBRICK_SHOT`, `cyberbrick_shutter_trigger`, `cyberbrick_fs.py`, and legacy environment-variable aliases.
- Keeps the earlier compatible ESP32-C3 shutter-box route alongside the ESP32-S3 Sony BLE route.

### Safety

- S3 starts unarmed; browser serial connection reads status without changing
  the current safety mode.
- First-time pairing performs no Sony shutter write.
- Armed mode requires a verified dry-run event, explicit confirmation phrase, and `ready=true`.

### Validated

- Completed a 135-layer real multi-material Smooth print with correct
  stabilization-tower timing, `X250 Y240` parking, and Sony-confirmed frames.
- Verified U1 native timelapse and the external ESP32/Sony route can remain
  enabled together without sharing shutter state.
