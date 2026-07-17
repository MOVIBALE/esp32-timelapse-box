# Multi-brand BLE Probe Community Test Guide

This guide applies to `ESP32 Timelapse Box Multi-brand BLE Probe
0.1.0-alpha.1`. Flashing it replaces the stable Sony firmware. The probe only
supports manual pairing and one-shot testing; it does not react to Klipper.

## Prepare

- An ESP32-S3-DevKitC-1 N8/N8R8 board and a data-capable USB cable;
- Python 3.10 or newer;
- the Alpha `multibrand-probe-...-factory.bin`;
- stable `esp32-timelapse-box-s3-factory-v0.1.0.bin` for recovery.

Install Espressif's flashing tool and a serial terminal, then identify the port:

```text
python -m pip install esptool pyserial
python -m serial.tools.list_ports
```

This Alpha is built only for the repository's ESP32-S3-DevKitC-1 N8/N8R8
route. Do not flash it to ESP32, ESP32-C3, ESP32-S2, or an unidentified board.
The build enables the ESP32-S3 hardware USB CDC/JTAG console, so the same USB-C
data port carries the serial commands.
Replace `<PORT>` below with your actual port, such as `COM9`,
`/dev/cu.usbmodem...`, or `/dev/ttyACM0`.

## Flash the probe

Close applications using the port and verify the download against
`SHA256SUMS.txt`.

```text
python -m esptool --chip esp32s3 --port <PORT> erase-flash
python -m esptool --chip esp32s3 --port <PORT> write-flash 0x0 esp32-timelapse-box-multibrand-probe-v0.1.0-alpha.1-factory.bin
python -m serial.tools.miniterm <PORT> 115200
```

Use `Ctrl+]` to exit miniterm. If automatic download mode fails, hold `BOOT`,
tap `RESET`, release `BOOT`, and retry. Do not force-flash a board whose chip
type is unknown.

## Pair and test exactly one shot

1. Put the camera in its documented Bluetooth remote pairing/registration mode.
2. Enter `scan`, wait 10-20 seconds, then enter `stop`.
3. Verify the candidate and enter `connect N`.
4. Answer a verified pairing request with `yes`, `no`, or `pin NNNNNN`.
5. Enter `status`; continue only with `connected=true` and `ready=true`.
6. Return the camera to its normal shooting screen and note the image count.
7. Enter `shot` once and check the camera for one new image.

`dispatched=true` means only that the ESP32 invoked the driver. It is not camera
confirmation.

## Reconnect test

Enter `disconnect`, power-cycle both devices, then run `saved`, `connect N`,
`status`, and one `shot`. A model is physically validated only when first pair,
capture, and power-cycle reconnect all pass.

## Privacy and recovery

Replace every real BLE address with `XX:XX:XX:XX:XX:XX` before posting logs.
Remove credentials, private network
addresses, serial numbers, EXIF, and personal paths.

Restore stable Sony firmware with:

```text
python -m esptool --chip esp32s3 --port <PORT> erase-flash
python -m esptool --chip esp32s3 --port <PORT> write-flash 0x0 esp32-timelapse-box-s3-factory-v0.1.0.bin
```

Erasing also removes NVS, so repeat Sony Wi-Fi setup and pairing using the
[Sony quick start](quickstart-esp32-s3-sony-ble.md). Commands follow the
[official Espressif esptool documentation](https://docs.espressif.com/projects/esptool/en/latest/esp32s3/esptool/).
