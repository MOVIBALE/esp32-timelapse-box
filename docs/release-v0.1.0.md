# ESP32 Timelapse Box v0.1.0

This is an **engineering prerelease** of ESP32 Timelapse Box / ESP32 延时摄影盒子.

## Download

- `esp32-timelapse-box-configurator-v0.1.0.zip`: offline bilingual browser configurator, Klipper macro, compatible C3 files, tools, and documentation.
- `esp32-timelapse-box-s3-factory-v0.1.0.bin`: merged ESP32-S3 factory image for flashing at address `0x0`.
- `SHA256SUMS.txt`: checksums for both assets.

## Included

- ESP32-S3 + Sony BLE first pairing, bonded reconnect, serial provisioning, dry-run, and armed operation.
- Compatible ESP32-C3 MicroPython route with HTTP polling and Moonraker WebSocket agent backends.
- Canonical `ESP32_TIMELAPSE_SHOT` macro and compatible `CYBERBRICK_SHOT` alias sharing one event sequence.
- Chrome/Edge Web Serial workflow for both board routes.
- Complete SnapOrca migration prompt for Off, Traditional, and Smooth modes.

## Verified

- A real Sony BLE print test produced 135 expected frames from 135 layers.
- ESP32-S3 firmware builds with PlatformIO and ESP-IDF.
- Browser workflow simulations keep S3 in dry-run until explicit arming.
- C3 canonical and legacy trigger methods deduplicate the same event.
- Release contents pass automated secret and local-path scans.

## Known Limits

- The integrated first-time pairing command has compiled and passed simulated contract tests, but has not yet been repeated on a board after erasing its Bluetooth bond database. Treat first pairing as experimental in this prerelease.
- Real hardware validation currently covers Sony ZV-E10. Other Sony models may use different BLE behavior.
- SnapOrca source changes are not bundled as a prebuilt slicer binary; use `docs/snaporca/esp32-timelapse-box-migration-prompt.md` in the maintained SnapOrca source task.
- Always complete a short dry-run print before armed operation.

## 中文说明

这是工程预发布版。配置器压缩包同时包含 S3 Sony BLE 路线和兼容型 C3 路线；S3 合并固件从 `0x0` 地址刷入。当前 135 层实机测试已经完成，但整合后的“清空蓝牙配对记录后首次配对”仍需专项复测，因此首次配对功能暂按实验能力发布。任何真实打印都应先完成 dry-run，再进入 armed。
