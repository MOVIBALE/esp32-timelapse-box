# ESP32-S3 多品牌 BLE 探针

`0.1.0-alpha.1` 是供社区实机验证的手动探针。它可以扫描、配对、重连，
并向部分 Canon、Fujifilm、Nikon、Ricoh BLE 协议发送一次快门命令。

它目前**不是多品牌延时摄影固件**：不连接 Klipper/Moonraker，不会按层
自动拍照，也没有经过本项目对应品牌相机的实机验证。

## 证据边界

- 协议代码来源于 Furble 提交
  `246de0861b8907a68eec3f2496dcfc666f41816b`，MIT 许可证和署名保留在
  `third_party/`。
- 编译通过只说明代码可以构建。
- 日志中的 `dispatched=true` 只说明 ESP32 已调用协议驱动，**不代表相机
  确认拍照**。必须由测试者检查相机是否新增照片。
- Sony 不在此探针中。已经实机验证的 ZV-E10 路线继续使用相邻目录中的
  ESP-IDF Bluedroid 稳定固件。

## 编译

在仓库根目录运行：

```powershell
node scripts/build-multibrand-firmware.mjs
```

合并固件生成在
`.pio/build/esp32-s3-devkitc-1/firmware.factory.bin`。

## 串口命令

使用 115200 波特率，命令末尾发送换行。

| 命令 | 作用 |
| --- | --- |
| `scan` | 仅扫描，不执行 GATT 写入 |
| `stop` | 停止扫描并列出候选设备 |
| `list` | 列出当前候选设备 |
| `saved` | 从 NVS 载入已保存相机 |
| `connect N` | 配对或重连编号为 `N` 的相机 |
| `status` | 查看连接与 ready 状态 |
| `shot` | 人工发送一次快门序列 |
| `disconnect` | 断开，但保留配对记录 |
| `forget` | 删除当前相机及其配对记录 |
| `yes` / `no` | 确认或拒绝数字比较 |
| `pin NNNNNN` | 输入相机显示的六位密码 |

固件不会在启动、扫描、配对或重连时自动触发快门。刷写前请完整阅读
[社区测试教程](../../docs/multibrand-community-testing.zh-CN.md)，并准备好
Sony 稳定版 factory 固件用于恢复。
