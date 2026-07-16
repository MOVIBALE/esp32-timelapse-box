# Compatible ESP32-C3 Quick Start

This route keeps existing ESP32-C3 shutter-box hardware useful. A MicroPython
listener runs on the board, reads Klipper/Moonraker events, and calls the
existing shutter output. The browser performs the raw REPL file upload; users
do not need to type raw REPL commands manually.

## 中文

### 适用范围

这条路线用于已经具备 MicroPython 和原有快门输出的兼容型 ESP32-C3
盒子。它不会把普通空白 ESP32-C3 自动变成蓝牙快门；设备仍需有可用的
GPIO/HID 快门实现。

### 1. 安装宏并打开配置器

安装 `config/klipper/esp32_timelapse.cfg`，确保 Klipper 暴露
`ESP_TIMELAPSE_SHOT`。运行根目录启动器，在 Chrome/Edge 中选择
“兼容型 ESP32-C3 快门盒”。

### 2. 第一次安全上传

1. 连接板子串口；
2. 填写 Wi-Fi、密码和 Moonraker 地址；
3. 监听方式先选 `HTTP 轮询`；
4. 点击“上传 disabled / dry-run”；
5. 点击“软重启观察”。

浏览器通过 raw REPL 写入：

```text
/board_listener_config.json
/board_listener.py
/main.py
```

第一次启动必须看到 `enabled=false` 和 `dry_run=true`。不要修改官方
`boot.py`。

### 3. 两个后端

- `HTTP 轮询` / HTTP polling：默认路线，直接轮询 Moonraker；
- `WebSocket 代理` / WebSocket agent：保持长连接并监听状态变化；
- `auto`：优先 WebSocket，不可用时回到 HTTP。

两个后端调用同一去重器，规范方法名为 `esp32_timelapse_trigger`，旧方法
`cyberbrick_shutter_trigger` 仍可兼容，但同一个共享事件只触发一次。

### 4. Dry-run 与正式模式

点击“启用 dry-run 监听”并软重启。开始一个短打印，确认日志中的层变化
结果为 `DRY_RUN`，且快门没有动作。完成验证后，输入
`ARM DRY-RUN VERIFIED` 才能写入 armed 配置。

恢复时点击“删除 main.py 恢复”，再软重启。该操作只移除自动启动入口，
不删除 `boot.py`。

### 可选命令行工具

高级用户可以使用 `tools/esp32_timelapse_fs.py`。建议通过环境变量传递
密码，避免出现在命令历史中：

```text
ESP32_TIMELAPSE_WIFI_PASS=<password>
python tools/esp32_timelapse_fs.py upload-board-listener --port PORT --ssid WIFI --host printer.local --mode http_poll --reset
```

## English

### Scope

Use this route for an existing compatible ESP32-C3 shutter box that already has
MicroPython and a working GPIO/HID shutter output. It does not add a Sony BLE
central implementation to a blank C3 board.

### Safe setup

Install `config/klipper/esp32_timelapse.cfg`, launch the configurator in Chrome
or Edge, and choose **Compatible ESP32-C3 shutter box**. Fill Wi-Fi and
Moonraker, then upload the disabled/dry-run listener. The browser enters raw
REPL and writes `board_listener_config.json`, `board_listener.py`, and `main.py`
for you.

The first boot must report `enabled=false` and `dry_run=true`. Start with HTTP
polling. WebSocket agent and `auto` remain available and share the same event
deduplication contract.

Enable dry-run, soft reset, and verify real layer events without shutter output.
Only then enter `ARM DRY-RUN VERIFIED`. To recover, delete `main.py` with the
configurator and reset; do not modify `boot.py`.

