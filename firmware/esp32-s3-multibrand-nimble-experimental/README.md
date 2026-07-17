# ESP32-S3 multi-brand NimBLE experiment

This is an experimental, manually operated camera pairing and shutter probe.
It is not the stable Sony timelapse firmware and is not hardware-validated.

## Scope

- Canon EOS BR-E1 remote and smart-device modes
- Fujifilm basic token and secure modes
- Nikon ML-L7 remote mode
- Ricoh GR protocol candidate with explicit serial pairing approval

The camera drivers are derived from Furble at commit
`246de0861b8907a68eec3f2496dcfc666f41816b`. See `third_party/UPSTREAM.md`
and `third_party/FURBLE-LICENSE.txt`.

Sony is intentionally excluded. The hardware-validated Sony ZV-E10 firmware
continues to use ESP-IDF Bluedroid in the sibling stable project.

## Build

```powershell
platformio run -d firmware/esp32-s3-multibrand-nimble-experimental
```

Successful builds produce `.pio/build/esp32-s3-devkitc-1/firmware.factory.bin`.
Do not flash this image over a working Sony box unless you intend to run the
experiment and have retained the stable Sony image.

## Serial protocol

Use 115200 baud and newline-terminated commands:

| Command | Effect |
| --- | --- |
| `scan` | Start passive camera discovery; performs no GATT writes |
| `stop` | Stop scanning and print the candidate list |
| `list` | Stop scanning and print the current list |
| `saved` | Load bonded/saved cameras from NVS |
| `connect N` | Pair or reconnect candidate index N |
| `status` | Print machine-readable connection and readiness state |
| `shot` | Send one explicitly requested manual shutter sequence |
| `disconnect` | Disconnect without deleting the bond |
| `forget` | Disconnect and remove the active camera and BLE bond |
| `yes` / `no` | Approve or reject a pending numeric comparison |
| `pin NNNNNN` | Enter a passkey shown by the camera |

The firmware never triggers a shutter at boot, scan, pair, or reconnect. It is
not connected to Moonraker or Klipper. All machine-readable events start with
`__MB_`.

## Required validation sequence

1. Run `scan`, verify the detected brand/model, then `stop`.
2. Run `connect N` with the camera in its remote-pairing mode.
3. Respond to any `__MB_PAIRING_*` prompt on both camera and serial console.
4. Confirm `status` reports `ready=true`.
5. Run `shot` exactly once and verify a new image on the camera.
6. Power-cycle both devices, run `saved`, then `connect N` and repeat.

Until all six steps pass on physical hardware, the model remains experimental.
