# Changelog

All notable public changes to ESP32 Timelapse Box are documented here.

## [0.1.0] - 2026-07-14

Engineering prerelease.

### Added

- ESP32-S3 ESP-IDF firmware for active Sony BLE pairing, reconnect, and shutter control.
- Compatible ESP32-C3 MicroPython route with HTTP polling and Moonraker WebSocket backends.
- Canonical `ESP32_TIMELAPSE_SHOT` Klipper macro with a shared legacy alias.
- Bilingual Chrome/Edge Web Serial configurator with dry-run and armed safety gates.
- Traditional and Smooth SnapOrca integration specification, including a real single-material stabilization tower.
- Bilingual quick starts, compatibility matrix, migration guide, protocol, validation, troubleshooting, and video script.
- Deterministic release assets and SHA-256 checksums.

### Changed

- Project-owned source is now licensed under `GPL-3.0-only` instead of MIT.

### Compatibility

- Preserves `CYBERBRICK_SHOT`, `cyberbrick_shutter_trigger`, `cyberbrick_fs.py`, and legacy environment-variable aliases.
- Keeps the earlier compatible ESP32-C3 shutter-box route alongside the ESP32-S3 Sony BLE route.

### Safety

- S3 starts unarmed and dry-run is enforced after browser serial connection.
- First-time pairing performs no Sony shutter write.
- Armed mode requires a verified dry-run event, explicit confirmation phrase, and `ready=true`.
