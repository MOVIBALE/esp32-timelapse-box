# ESP32-S3 Multi-brand BLE Probe

Version `0.1.0-alpha.1` is a manually operated community hardware probe. It can
scan, pair, reconnect, and dispatch one shutter command to selected Canon,
Fujifilm, Nikon, and Ricoh BLE camera protocols. It is not the stable Sony
timelapse firmware, is not connected to Klipper, and has not been validated on
those camera brands by this project.

Read [README.zh-CN.md](README.zh-CN.md) for the Chinese guide.

## Evidence boundary

- Protocol code is derived from Furble commit
  `246de0861b8907a68eec3f2496dcfc666f41816b`.
- The local source vendors the required Furble camera core. Its MIT license and
  attribution are retained in `third_party/`.
- A successful build or `dispatched=true` log only proves that the ESP32 ran the
  code. The tester must confirm whether the camera created a new image.
- Sony is intentionally excluded. Continue using the sibling stable Bluedroid
  firmware for the hardware-validated Sony ZV-E10 route.

## Build

```powershell
node scripts/build-multibrand-firmware.mjs
```

The combined image is generated at
`.pio/build/esp32-s3-devkitc-1/firmware.factory.bin`.

## Serial commands

Open a 115200 baud terminal and send newline-terminated commands.

| Command | Effect |
| --- | --- |
| `scan` | Start passive discovery without GATT writes |
| `stop` | Stop scanning and print candidates |
| `list` | Print current candidates |
| `saved` | Load saved cameras from NVS |
| `connect N` | Pair or reconnect candidate index `N` |
| `status` | Print connection and readiness state |
| `shot` | Dispatch one manually requested shutter sequence |
| `disconnect` | Disconnect without deleting the bond |
| `forget` | Remove the active camera and its bond |
| `yes` / `no` | Answer a pending numeric comparison |
| `pin NNNNNN` | Enter a six-digit camera passkey |

The firmware never triggers a shutter at boot, scan, pair, or reconnect. All
machine-readable events start with `__MB_`. Follow the complete
[community test guide](../../docs/multibrand-community-testing.md) before
flashing and keep the stable Sony factory image available for recovery.
