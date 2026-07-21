# ESP32 延时摄影盒子完整教程

本文覆盖整套方案：ESP32 开发板、Klipper 宏、Moonraker、魔改 SnapOrca、
Sony 相机配对、dry-run、正式拍摄、恢复方法，以及 Nikon 等其他品牌的社区
兼容性测试。

这是工程预发布项目。Sony 自动延时摄影固件和多品牌实验探针是两个不同镜像，功能
边界不同，刷写前必须先选对路线。

## 1. 先选择路线

| 路线 | 相机 | 自动按层拍摄 | 当前验证状态 |
| --- | --- | --- | --- |
| ESP32-S3 Sony 路线 | 使用已知 Sony BLE 遥控服务的相机 | 支持 | Sony ZV-E10 已实机验证 |
| 兼容型 ESP32-C3 | 已有 GPIO/HID 快门输出的 C3 快门盒 | 支持 | 仅适用于已有兼容硬件 |
| 多品牌 BLE Probe Alpha | Canon、Fujifilm、Nikon、Ricoh 的部分候选协议 | 不支持，只能手动扫描、配对和单次快门 | 等待社区实机结果 |

Nikon D850 属于第三条路线。D850 支持 SnapBridge，但还不能确认它是否暴露
实验探针期待的 Nikon BLE 遥控服务。扫描或配对失败也有分析价值。不要为了
D850 探针安装 SnapOrca 或 Klipper 宏，因为当前多品牌 Alpha 不监听 Klipper。

## 2. 自动延时摄影的工作方式

```text
SnapOrca 完成一层
  -> G-code 调用 ESP_TIMELAPSE_SHOT
  -> Klipper 宏递增共享序号
  -> ESP32 通过 Wi-Fi 从 Moonraker 读取序号
  -> ESP32 通过 BLE 触发 Sony 相机
```

配置完成后不需要电脑常驻监听。USB 负责 ESP32 供电和配置，ESP32 通过局域网
连接 Klipper，通过 BLE 连接相机。

U1 原生延时摄影与 ESP32 外部快门是附加关系，可以同时开启。ESP32 命令
不会替换 U1 原生相机命令。

## 3. 所需设备

已验证的 Sony 自动路线需要：

- ESP32-S3 DevKitC-1 N8 或 N8R8；
- 支持数据传输的 USB 线和稳定 5V 电源；
- 同一局域网内可访问 Moonraker 的 Klipper 打印机；
- Klipper 配置文件访问能力；
- Chrome 或 Edge；
- 开启蓝牙遥控的兼容 Sony 相机；
- 用于生成传统/平滑拍摄 G-code 的魔改 SnapOrca。

长时间打印应给相机提供稳定电源。假电池或连续供电适配器只负责供电，快门
仍由 BLE 控制。

开始前备份：

- `printer.cfg` 和所有 include 配置；
- 自定义切片预设和重要 3MF；
- 需要恢复的 ESP32 固件；
- 如果另行测试混合喷嘴，保留可恢复的 U1 官方或 Extended Firmware。

## 4. 下载发布文件

### ESP32 Timelapse Box v0.1.0

<https://github.com/MOVIBALE/esp32-timelapse-box/releases/tag/v0.1.0>

下载配置器 ZIP、S3 `factory.bin` 和 `SHA256SUMS.txt`。配置器 ZIP 已包含
浏览器程序、Klipper 宏、C3 文件、文档和启动脚本。

刷写或安装前校验下载文件。Windows PowerShell：

```powershell
Get-FileHash .\下载文件 -Algorithm SHA256
```

macOS/Linux：

```sh
shasum -a 256 下载文件
```

结果必须与发布页校验文件一致。

### SnapOrca 2.3.5 alpha.1

<https://github.com/MOVIBALE/OrcaSlicer/releases/tag/u1-experimental-2.3.5-alpha.1>

Windows 可选安装版或便携 ZIP。发布页还包含源码和 SHA-256。保留官方
Snapmaker Orca 安装包以便恢复。

### 多品牌实验探针

仅在手动测试非 Sony 相机时下载：
<https://github.com/MOVIBALE/esp32-timelapse-box/releases/tag/multibrand-probe-v0.1.0-alpha.1>

### U1 混合喷嘴固件

只用于混合口径喷嘴校验，不是 ESP32 延时摄影依赖：
<https://github.com/MOVIBALE/SnapmakerU1-Extended-Firmware/releases/tag/mixed-nozzle-u1-alpha.1>

不要为了延时摄影单独刷混合喷嘴固件。

## 5. 安装 Klipper 宏

解压配置器，把：

```text
config/klipper/esp32_timelapse.cfg
```

复制到打印机 Klipper 配置目录，在 `printer.cfg` 中加入：

```ini
[include esp32_timelapse.cfg]
```

重启 Klipper。Moonraker 应能读取：

```text
gcode_macro ESP_TIMELAPSE_SHOT
gcode_macro CYBERBRICK_SHOT
```

`ESP_TIMELAPSE_SHOT` 是规范名称，另一个只是旧设备兼容别名。两者写入同一个
共享序号，切片器每帧只应调用一次规范宏。

可在打印机局域网打开：

```text
http://打印机地址/printer/objects/query?gcode_macro%20ESP_TIMELAPSE_SHOT
```

返回 JSON 且包含 `seq`，说明 Moonraker 能读取宏。

通用 Klipper 可通过 Mainsail、Fluidd、SSH 或设备原有方式安装。原厂 U1
可能不直接开放 Klipper 配置访问，应使用已经确认的配置访问方案。U1 Extended
Firmware 可提供高级访问，但它的混合喷嘴 Alpha 不是延时摄影依赖。

盒子已 armed 时，手动执行宏会产生拍照请求，不要随意测试。

## 6. 刷入 ESP32-S3 Sony 固件

安装工具并查找串口：

```text
python -m pip install esptool pyserial
python -m serial.tools.list_ports
```

关闭占用串口的软件，用实际端口替换 `PORT`：

```text
python -m esptool --chip esp32s3 --port PORT erase-flash
python -m esptool --chip esp32s3 --port PORT write-flash 0x0 esp32-timelapse-box-s3-factory-v0.1.0.bin
```

擦除会同时清除 Wi-Fi 和蓝牙配对记录。自动下载失败时，按住 `BOOT`，点按
`RESET`，松开 `BOOT` 后重试。

该镜像只用于本项目的 ESP32-S3 DevKitC-1 N8/N8R8 路线，不要强刷到普通
ESP32、ESP32-C3、ESP32-S2 或无法确认型号的板子。

## 7. 启动浏览器配置器

解压配置器：

- Windows 双击 `START-WINDOWS.cmd`；
- macOS 运行 `START-MAC.command`，若被拦截则在终端执行
  `sh START-MAC.command`。

Chrome/Edge 打开 <http://127.0.0.1:8776/>。选择 **ESP32-S3 + Sony BLE**，
连接板子并保持 dry-run。填写 Wi-Fi 和 Moonraker 主机名或局域网 IP，保存后
读取盒子与 Moonraker 状态。

网页只在用户操作后访问串口。打开网页不会静默 armed。

## 8. 配对和准备 Sony 相机

配对前：

- 开启相机蓝牙遥控；
- 断开正在占用遥控连接的手机；
- 插入存储卡并确认实体快门可拍照；
- 调整休眠和供电以适应打印时长；
- 确保对焦和曝光设置不会阻止快门。

首次配对时让相机停在蓝牙遥控配对界面，点击 **首次配对 Sony**，并在相机
上确认。该操作会强制 `dry_run=true, armed=false`，配对过程不写快门命令。

等待 `connected=true, ready=true`。以后开机通常自动连接已有配对，只有失败
时才点击 **连接已配对 Sony**。

相机 ready 后执行一次手动快门测试，并亲自确认只新增一张照片。串口显示
成功或 GATT 写入成功不等于相机真的保存了照片。

## 9. 安装和设置魔改 SnapOrca

先备份预设与项目。Windows 可安装 EXE 或使用便携 ZIP。

U1 操作：

1. 选择对应的 **Snapmaker U1** 打印机/喷嘴预设；
2. 打开 **工艺 > 其他 > 特殊模式**；
3. 在延时摄影中选择 **关闭、传统模式或平滑模式**；
4. 改完模式后重新切片。

最终设计没有单独的“ESP32 后端”选择。U1 profile 已声明 ESP32 能力；只要
延时摄影不是关闭，切片器会保留 U1 原生 hook，同时追加
`ESP_TIMELAPSE_SHOT`。

发送打印窗口中的“延时摄影”勾选控制 U1 原生录像，不会替换 G-code 中已经
生成的 ESP32 命令。需要双路同时拍摄时，工艺中启用延时摄影模式，并在发送
窗口勾选原生延时摄影。

三种模式：

- **关闭：** 不生成原生或 ESP32 按层拍摄命令；
- **传统：** 当前运动完成后调用宏并等待至少 2000ms，不停车，画面可能包含
  工具头；
- **平滑：** 每个拍摄层生成真实稳定塔，完成模型和塔后抬 Z、停车、拍摄，
  再在安全高度返回。单材料也会增加稳定塔，因此耗材和时间都会增加。

旧项目若保存了 1200ms 等待时间，必须改为至少 2000ms 后重新切片；当前版
会主动拒绝过短值。

### 通用 Klipper 打印机 profile

U1 内置 profile 已经包含所需值。其他 Klipper 打印机必须在打印机 profile
中显式设置并验证：

```text
supports_esp32_timelapse = 1
esp32_timelapse_gcode = ESP_TIMELAPSE_SHOT
esp32_timelapse_park_x = 安全 X 坐标
esp32_timelapse_park_y = 安全 Y 坐标
esp32_timelapse_travel_speed = 18000 mm/min 或设备安全值
esp32_timelapse_dwell_ms = 2000 或更大
```

不要把 U1 停车坐标照搬到其他打印机。平滑模式停车点必须位于当前热床有效
区域内，并避开模型、稳定塔和禁入区；未正确配置时应停止切片。

## 10. 打印前检查 G-code

导出后搜索独立执行行：

```text
ESP_TIMELAPSE_SHOT
```

传统模式每层应有：

```gcode
M400
ESP_TIMELAPSE_SHOT
G4 P2000
```

平滑模式还应包含抬升、停车和安全返回。预览中应只有一座物理稳定塔；多工具
每层可能包含多个塔块，但空间位置应集中在同一座塔。

PowerShell 统计命令：

```powershell
(Select-String -Path .\your-print.gcode -Pattern '^ESP_TIMELAPSE_SHOT$').Count
```

关闭应为 0，传统和平滑应与打印层数一致。若出现错误旧命令
`ESP32_TIMELAPSE_SHOT`，不要打印；正确名称没有 `32`。

## 11. 必须先做 dry-run

第一次使用切一个 10-20 层小模型：

1. 确认相机 `ready=true`；
2. 确认盒子 `dry_run=true, armed=false`；
3. 用传统或平滑模式切片并开始打印；
4. 等待至少一个真实 `ESP_TIMELAPSE_SHOT` 事件；
5. 确认日志记录 dry-run，且相机没有拍照；
6. 完成或停止这次短测试。

若宏源显示 `legacy`，兼容路径仍可能工作，但正式使用前应更新宏与切片器。

## 12. Armed 后真实打印

只有 dry-run 和手动单次快门都通过后才继续：

1. 检查相机画面、对焦、存储卡和供电；
2. 打开 ESP32，等待 `connected=true, ready=true`；
3. 确认 Moonraker 正常且规范宏可读；
4. 检查目标 G-code 的命令数量；
5. 在配置器输入：

   ```text
   ARM DRY-RUN VERIFIED
   ```

6. 点击 armed，并确认 `dry_run=false, armed=true`；
7. 发起打印，观察第一张外部相机照片。

平滑模式正确顺序应为：完成本层模型和稳定塔、抬升、停车、等待运动结束、
拍照、等待、再安全返回。若拍照时工具头仍在模型上方，停止测试，核对新切片
文件和模式，避免误发旧 G-code。

打印结束或调整设备前，立即点击 **锁定为 dry-run**。串口不可用时直接给
ESP32 断电。

## 13. 日常使用流程

1. 打开打印机和相机；
2. 给 ESP32 供电；
3. 打开配置器，确认 Sony ready、Moonraker 正常；
4. 调整设备时保持 dry-run；
5. 选择延时摄影模式并切片；
6. 检查预览和宏数量；
7. 全部准备好后 armed；
8. 发送打印；
9. 检查第一张停车照片；
10. 打印结束后回到 dry-run。

ESP32 每次启动都不会自动 armed。已有配对相机自动重连时也不会拍照。

## 14. Nikon 和其他品牌社区测试

多品牌固件是独立的手动探针，刷入后会替换 Sony 自动延时摄影固件。它只支持
`scan`、`connect`、`status`、一次手动 `shot` 和重连测试，不读取 Klipper。

完整教程：
<https://github.com/MOVIBALE/esp32-timelapse-box/blob/Min/experimental-multibrand-ble/docs/multibrand-community-testing.md>

Nikon D850 测试步骤：

1. 关闭手机 SnapBridge 会话；
2. 让相机停在蓝牙或智能设备配对界面；
3. 输入 `scan`，等待 10-20 秒，再输入 `stop` 和 `list`；
4. 只有出现 Nikon 候选设备才继续连接；
5. 只有 `status` 显示 `connected=true, ready=true` 才执行一次 `shot`；
6. 人工确认相机是否真的新增照片；
7. 首次快门成功后再测试断电重连。

D850 可能使用当前探针无法完成的 SnapBridge 握手。失败一两次后应停止反复
尝试，提交脱敏日志：
<https://github.com/MOVIBALE/esp32-timelapse-box/issues/new?template=multibrand-camera-test.yml>

把 BLE 地址替换为 `XX:XX:XX:XX:XX:XX`，并删除凭据、序列号、EXIF、私有
IP 和个人路径。

## 15. 兼容型 ESP32-C3 路线

这条路线只用于已有 MicroPython 和可用 GPIO/HID 快门输出的 C3 快门盒。
配置器能上传 Moonraker 监听器，但不能把空白 C3 变成 Sony BLE 主动连接器。

在配置器选择 **兼容型 ESP32-C3 快门盒**，填写 Wi-Fi 和 Moonraker，先上传
disabled/dry-run 监听器。优先从 HTTP 轮询开始；WebSocket 和 auto 为可选
后端，并共用去重器。完整步骤见
[兼容型 ESP32-C3 快速入门](quickstart-compatible-esp32-c3.md)。

## 16. 常见故障

- **浏览器打不开串口：** 使用 Chrome/Edge、本地启动器和数据线，关闭串口
  工具、IDE 和占用端口的旧网页。
- **Sony 没有配对提示：** 首次必须使用“首次配对 Sony”，并让相机保持在
  遥控配对界面。
- **`connected=true, ready=false`：** 不要 armed。稍后重读状态；仍失败则
  重启相机并重连已有配对。
- **没有层事件：** 检查打印是否进行中、ESP32 能否访问 Moonraker、宏对象
  是否存在、G-code 是否真的包含规范命令。
- **拍照时工具头仍在打印：** 传统模式本来不停车。改成平滑模式，重新切片
  并确认发送的是新文件。
- **重复拍照：** 不要在同一层同时调用两个宏别名。U1 原生相机与 ESP32
  外部相机属于有意保留的两条独立拍摄链路。
- **立即停止：** 点击“锁定为 dry-run”或发送串口 `d`；无法连接时拔掉
  ESP32。

## 17. 恢复方法

### ESP32

从 `0x0` 重刷目标 factory 镜像。Sony 自动延时摄影镜像与多品牌探针互换时先擦除；
擦除会丢失 Wi-Fi 和蓝牙配对。

### Klipper

先让切片器停止输出宏，再从 `printer.cfg` 删除：

```ini
[include esp32_timelapse.cfg]
```

重启 Klipper。

### SnapOrca

备份预设与项目，卸载实验版，安装官方稳定版：
<https://github.com/Snapmaker/OrcaSlicer/releases/latest>

### U1 混合喷嘴固件

按对应固件文档刷回已知可用的官方或 Extended Firmware。恢复切片器不会
自动恢复打印机固件。

## 18. 已验证结果与限制

- U1 + ESP32-S3 + Sony ZV-E10 平滑模式完成过 135 层、135 张外部照片；
- 多材料平滑打印已验证停车拍照，并与 U1 原生延时摄影同时工作；
- Sony 配对记录保存和安全自动重连已实机验证；
- 其他 Sony 型号仍需逐个测试；
- Canon、Fujifilm、Nikon、Ricoh 当前只是手动实验探针；
- ESP32 固件和 SnapOrca 均为非官方工程 Alpha/预发布版本。

本项目为独立开源项目，与 Snapmaker、Sony、Nikon、Bambu Lab 或其他打印机、
相机厂商不存在官方隶属、认可或支持关系。
