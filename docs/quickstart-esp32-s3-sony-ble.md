# ESP32-S3 + Sony BLE Quick Start

This is the primary ESP32 Timelapse Box route. The ESP32-S3 reads Klipper
events over Wi-Fi and actively controls a compatible Sony camera over BLE. The
tested camera is a Sony ZV-E10. Other Sony models using the same BLE remote
service may work, but should be treated as unverified until a dry-run and manual
shutter test pass.

## 中文

### 准备

- ESP32-S3 DevKitC-1 N8 或 N8R8 开发板；
- USB 数据线；
- 可以访问 Moonraker 的 Klipper 打印机；
- Chrome 或 Edge；
- 支持蓝牙遥控的 Sony 相机。

### 1. 安装 Klipper 宏

把 `config/klipper/esp32_timelapse.cfg` 放进 Klipper 配置目录，并在
`printer.cfg` 中加入：

```ini
[include esp32_timelapse.cfg]
```

重启 Klipper 后，Moonraker 应能读取 `gcode_macro ESP32_TIMELAPSE_SHOT`。

### 2. 刷入 ESP32-S3 固件

普通用户使用 GitHub Release 中的 `factory.bin` 合并镜像，按发布说明将
它从地址 `0x0` 写入。源码构建使用：

```text
platformio run -e esp32-s3-devkitc-1
```

也可以让 PlatformIO 直接上传：

```text
platformio run -e esp32-s3-devkitc-1 -t upload --upload-port PORT
```

刷写不会自动连接相机或拍照。固件启动后为 `dry-run=true, armed=false`。

### 3. 打开 Web Serial 配置器

Windows 双击 `START-WINDOWS.cmd`，macOS 运行 `START-MAC.command`，然后在
Chrome/Edge 打开的页面中选择 `ESP32-S3 + Sony BLE`。

1. 点击“连接板子”，在浏览器弹窗中选择 ESP32 串口；
2. 填写 Wi-Fi 和 Moonraker 主机名；
3. 点击“配置网络并保持 dry-run”；
4. 点击“读取盒子状态”，确认网络状态和宏源。

Web Serial 只能在 `localhost` 或 HTTPS 页面工作。配置器只在用户点击
后访问串口，连接 S3 时会立即发送 `d`，再次锁定为 dry-run。

### 4. 首次配对 Sony

第一次使用时，在相机中打开蓝牙遥控并进入配对界面，然后点击“首次配对
Sony”。该按钮发送串口命令 `q`：

- 强制 `armed=false` 和 `dry_run=true`；
- 只寻找 `pairing_open=true` 且遥控已启用的 Sony；
- 完成加密绑定，但不写 FF01，因此不会触发快门；
- 相机出现确认提示时，在相机上同意。

看到 `SONY_BLUEDROID_SHUTTER_PAIRING_DONE bonded=true` 后，配对已保存。
以后开机不必重新配对，只需打开相机并点击“连接已配对 Sony”。等状态变为
`ready=true` 或界面显示“已连接，可拍摄”。

### 5. Dry-run 实打验证

先切一个 10 到 20 层的小模型并开始打印。保持 dry-run，观察至少一次：

```text
TIMELAPSE_MACRO_EVENT ... macro_source=canonical ... dry_run=true
```

此阶段相机不应新增照片。若宏源显示 `legacy`，系统仍兼容，但建议更新
切片和宏，使其输出 `ESP32_TIMELAPSE_SHOT`。

### 6. 正式拍摄

只有同时满足以下条件才继续：

- 已看到真实 dry-run 层事件；
- Sony 状态为 `ready=true`；
- 相机画面、存储卡和电量已确认；
- 你接受后续层事件会拍照。

输入 `ARM DRY-RUN VERIFIED` 并点击 armed 按钮。结束拍摄或调整设备前，
立即点击“锁定为 dry-run”。串口断开、重新上电或首次配对都不应被视为
自动 armed。

## English

### Prepare

Use an ESP32-S3 DevKitC-1 N8/N8R8, a USB data cable, a Klipper printer with
Moonraker, Chrome or Edge, and a compatible Sony camera with Bluetooth remote
control enabled.

### Install and flash

Install `config/klipper/esp32_timelapse.cfg` and include it from `printer.cfg`.
The canonical object is `gcode_macro ESP32_TIMELAPSE_SHOT`.

Regular users flash the merged `factory.bin` from the GitHub Release at address
`0x0`. Developers can build or upload from the firmware directory:

```text
platformio run -e esp32-s3-devkitc-1
platformio run -e esp32-s3-devkitc-1 -t upload --upload-port PORT
```

The firmware starts with `dry-run=true` and `armed=false`.

### Configure and pair

Launch the local configurator, choose `ESP32-S3 + Sony BLE`, connect through Web
Serial, provision Wi-Fi and Moonraker, then read status. On first use, leave the
camera on its Bluetooth remote pairing screen and click **Pair Sony for first
use**. The `q` command forces dry-run, creates the BLE bond, and performs no FF01
shutter write. Approve the prompt on the camera.

After `SONY_BLUEDROID_SHUTTER_PAIRING_DONE bonded=true`, later boots only need
**Connect paired Sony**. Wait for `ready=true`.

### Validate before arming

Run a short real print in dry-run and confirm at least one canonical
`ESP32_TIMELAPSE_SHOT` event without a photo. Only then enter
`ARM DRY-RUN VERIFIED` and arm. Use **Lock to dry-run** before changing the
camera or printer setup.

