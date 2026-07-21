# ESP32 Timelapse Box - Start Here

这是 ESP32 延时摄影盒子的离线浏览器配置包。页面只在本机运行，打开时不会自动选择串口、刷固件或触发快门。

This is the offline browser configuration package for ESP32 Timelapse Box. Opening it does not select a serial port, flash firmware, or trigger a shutter.

## Windows

Double-click `START-WINDOWS.cmd`.

## macOS

Run `START-MAC.command`. If Gatekeeper blocks it after extraction, open Terminal in this folder and run:

```sh
sh START-MAC.command
```

Both launchers open `http://127.0.0.1:8776/`. Use Chrome or Edge because Web Serial is required.

## Choose The Correct Route

- `ESP32-S3 + Sony BLE`: for the integrated ESP-IDF firmware that first pairs and then actively reconnects a compatible Sony camera.
- `Compatible ESP32-C3 shutter box`: for the existing MicroPython shutter-box hardware using browser file upload.

选错路线不会自动刷写固件，但操作和日志会不匹配；断开串口后可以重新选择。

## Safe First Run

1. Select the hardware route.
2. Connect the serial port. S3 is immediately locked to dry-run.
3. Fill Wi-Fi and Moonraker fields.
4. On first S3 use, open the camera's Bluetooth remote pairing screen and click the first-pair button; on later boots use the reconnect button.
5. Complete the route-specific setup shown by the checklist.
6. Run a short real print and observe at least one dry-run layer event.
7. Confirm the camera is ready.
8. Use armed only after dry-run verification and only while photography is required.
9. Return to dry-run when finished.

正式触发短语为 `ARM DRY-RUN VERIFIED`。不要跳过 dry-run，也不要在相机未准备好时输入该短语。

Full guides are in `docs/quickstart-esp32-s3-sony-ble.md` and `docs/quickstart-compatible-esp32-c3.md`.

For the complete system workflow, including Klipper, Moonraker, the released
experimental SnapOrca build, camera setup, dry-run, real printing, recovery,
and multi-brand testing, read:

- `docs/complete-system-guide.md`
- `docs/complete-system-guide.zh-CN.md`
