# 多品牌 BLE 探针社区测试教程

本教程适用于 `ESP32 Timelapse Box Multi-brand BLE Probe 0.1.0-alpha.1`。
它会替换板上的 Sony 稳定固件，只用于人工配对和单次快门验证，不会响应
Klipper 层事件。

## 需要准备

- ESP32-S3-DevKitC-1 N8/N8R8 开发板和可传输数据的 USB-C 线；
- Windows、macOS 或 Linux 电脑；
- Python 3.10 或更高版本；
- Alpha 的 `multibrand-probe-...-factory.bin`；
- 稳定版 `esp32-timelapse-box-s3-factory-v0.1.0.bin`，用于随时恢复。

安装官方 Espressif 刷写工具和串口终端依赖：

```text
python -m pip install esptool pyserial
python -m serial.tools.list_ports
```

记下 ESP32-S3 的串口。Windows 示例为 `COM9`；macOS/Linux 通常类似
`/dev/cu.usbmodem...` 或 `/dev/ttyACM0`。下文的 `<PORT>` 必须替换成你
自己的串口。本 Alpha 只为仓库使用的 ESP32-S3-DevKitC-1 N8/N8R8 路线
构建；不要刷入 ESP32、ESP32-C3、ESP32-S2 或芯片型号不明的板子。
固件已启用 ESP32-S3 硬件 USB CDC/JTAG，`Serial` 命令通过同一个 USB-C
数据口传输。

## 刷入 Alpha

1. 关闭所有正在使用该串口的软件。
2. 先确认下载文件的 SHA-256 与 `SHA256SUMS.txt` 一致。
3. 在固件所在目录运行：

```text
python -m esptool --chip esp32s3 --port <PORT> erase-flash
python -m esptool --chip esp32s3 --port <PORT> write-flash 0x0 esp32-timelapse-box-multibrand-probe-v0.1.0-alpha.1-factory.bin
```

如果自动进入下载模式失败：按住开发板 `BOOT`，短按一次 `RESET`，松开
`BOOT` 后重试。不要对芯片型号不明的板子强制刷写。

## 打开串口

```text
python -m serial.tools.miniterm <PORT> 115200
```

按 `Ctrl+]` 退出。启动后应看到：

```text
__MB_READY__{"firmware":"multibrand-nimble-experimental","version":"0.1.0-alpha.1",...}
```

## 首次配对与单次快门

1. 在相机菜单中进入官方蓝牙遥控器的配对/注册界面。菜单名称会随型号和
   固件变化，以相机说明书为准。
2. 输入 `scan`，等待 10 至 20 秒，然后输入 `stop`。
3. 在 `__MB_CAMERA__` 列表中确认品牌和名称，输入 `connect N`。
4. 如果相机或串口要求确认，核对数字后输入 `yes`、`no` 或
   `pin NNNNNN`。不要确认不一致的数字。
5. 输入 `status`，只有看到 `connected=true` 和 `ready=true` 才继续。
6. 让相机回到正常拍摄界面，记录当前照片数量，然后只输入一次 `shot`。
7. `dispatched=true` 仅表示 ESP32 已发送协议命令。请在相机中确认是否
   新增照片，并记录结果。

## 断电重连测试

1. 输入 `disconnect`，关闭相机和 ESP32。
2. 重新开机，在相机正常拍摄界面输入 `saved`。
3. 输入 `connect N`，再用 `status` 检查 `ready=true`。
4. 再输入一次 `shot` 并检查新照片。

只有首次配对、单次快门和断电重连都通过，才能报告该型号“实机验证
通过”。失败也很有价值，请按仓库 Issue 模板提交。

## 日志脱敏

日志中的 BLE 地址属于设备标识。发布前把实际地址替换为
`XX:XX:XX:XX:XX:XX`。不要上传 Wi-Fi
密码、家庭网络地址、照片 EXIF、序列号或完整个人路径。本探针不使用
Wi-Fi，因此日志中不应出现 Wi-Fi 凭据。

## 恢复 Sony 稳定版

恢复会清除实验固件和 NVS 配对记录，之后需要重新配置 Wi-Fi 并重新配对
Sony：

```text
python -m esptool --chip esp32s3 --port <PORT> erase-flash
python -m esptool --chip esp32s3 --port <PORT> write-flash 0x0 esp32-timelapse-box-s3-factory-v0.1.0.bin
```

刷完后按 [Sony 快速入门](quickstart-esp32-s3-sony-ble.md)重新配置。

刷写命令依据 Espressif 官方 esptool 文档：
<https://docs.espressif.com/projects/esptool/en/latest/esp32s3/esptool/>。
