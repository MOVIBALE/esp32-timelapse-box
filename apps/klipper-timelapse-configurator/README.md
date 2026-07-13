# ESP32 Timelapse Box Configurator

ESP32 延时摄影盒子配置器是一个浏览器优先的本地 Web Serial 工具。它直接在 Chrome / Edge 中连接 ESP32，不需要 Electron、云服务或常驻电脑代理。

The ESP32 Timelapse Box Configurator is a browser-first local Web Serial tool. It connects directly to the ESP32 from Chrome or Edge without Electron, a cloud service, or a resident desktop agent.

## Hardware Routes / 硬件路线

- `ESP32-S3 + Sony BLE`: configure Wi-Fi and Moonraker, reconnect a paired Sony camera, inspect `ready` and macro state, run dry-run, then explicitly arm.
- `Compatible ESP32-C3 shutter box`: upload the MicroPython listener through raw REPL, choose HTTP polling or WebSocket agent mode, and recover by removing `main.py`.

兼容路线保留已有 Bambu CyberBrick ESP32-C3 快门盒支持。旧 `CYBERBRICK_SHOT` 宏和 `cyberbrick_shutter_trigger` WebSocket 方法仍作为兼容别名工作，但新安装应使用 `ESP32_TIMELAPSE_SHOT` 与 `esp32_timelapse_trigger`。

## Start / 启动

Windows:

```text
start-configurator.cmd
```

macOS:

```text
start-configurator.command
```

Both launchers open `http://127.0.0.1:8776/` and start a localhost-only static server. They do not open a serial port, write firmware, or trigger a shutter.

两个启动器都只会打开本机网页并启动静态服务器；不会自动打开串口、刷写固件或触发快门。

Manual developer start:

```powershell
python -m http.server 8776 --bind 127.0.0.1
```

## Safe S3 Flow / S3 安全流程

1. Select `ESP32-S3 + Sony BLE`, connect the board, and let the page immediately send `d` to lock dry-run.
2. Fill Wi-Fi and Moonraker, then provision the network.
3. Turn on the paired Sony camera, connect it, and require `ready=true`.
4. Start a short print and observe at least one dry-run layer event without a photo.
5. Enter `ARM DRY-RUN VERIFIED` only after the camera view and layer events are confirmed.
6. Use `锁定为 dry-run` immediately when photography is no longer required.

## Safe C3 Flow / C3 安全流程

1. Select the compatible ESP32-C3 route and connect its serial port.
2. Fill Wi-Fi, Moonraker, and backend mode.
3. Upload the forced `enabled=false, dry_run=true` listener.
4. Enable dry-run, soft reset, and observe real layer events.
5. Arm only after dry-run verification and the camera or phone is ready.
6. Remove `main.py` to restore stock startup behavior.

## Privacy And Safety / 隐私与安全

- S3 is automatically locked to dry-run after every browser serial connection.
- Armed mode requires a real dry-run event, camera readiness on the S3 route, and the exact confirmation phrase.
- Diagnostic reports redact the Wi-Fi password, SSID, private IPv4 addresses, and device addresses.
- Bundled configurations contain no local credentials, IP addresses, COM ports, or camera addresses.
- Raw REPL controls are shown only on the compatible C3 route.

## Verification / 验证

```powershell
npm test
npm run smoke:workflow
npm run smoke:screenshots
npm run verify:release
```

The workflow smoke uses simulated Web Serial devices for both routes. It must never send the S3 `a` command, write a non-dry-run C3 config, or access a real COM port.
