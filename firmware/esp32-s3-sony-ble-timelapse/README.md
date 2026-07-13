# ESP32 Timelapse Box: ESP32-S3 + Sony BLE

This is the reference ESP-IDF firmware for the **ESP32 Timelapse Box**. It
connects an ESP32-S3 to Klipper/Moonraker over Wi-Fi and to a bonded compatible
Sony camera over BLE.

The firmware starts in `dry-run`. It **不会开机自动拍**, does not scan for the
camera on boot, and does not enter `armed` by itself. A real layer-triggered shutter requires
all of these conditions:

- Moonraker reports an active, healthy print;
- the Sony BLE service is connected and ready;
- the user explicitly sends the serial `a` command;
- the minimum trigger interval has elapsed.

## Trigger Contract

The preferred Klipper macro is `ESP32_TIMELAPSE_SHOT`. Its `macro seq` value is
read through Moonraker and takes priority over layer-number detection.

For compatibility with existing installations, firmware also reads the legacy
`CYBERBRICK_SHOT` macro. When both are valid, the canonical macro wins. A live
switch between macro sources establishes a new baseline and does not trigger a
photo. If both macro objects are absent, or their `seq` values are invalid, the
firmware keeps the 层号 fallback path available.

中文兼容规则：两个宏的 `seq` 都无效时继续走层号 fallback，不会因为看见
一个无效宏对象就关闭后备检测。

Install the dual-name macro from:

```text
config/klipper/esp32_timelapse.cfg
```

## Serial Commands

```text
s = print Sony connection status
p = print Klipper/Moonraker timelapse status
q = start first-time Sony pairing; keep the camera on its Bluetooth remote pairing screen
b = scan for and connect the bonded Sony camera without shooting
t = run one explicitly requested manual shutter sequence
a = arm real print-triggered shooting and leave dry-run
d = disarm immediately and return to dry-run
e = enable or disable Moonraker polling
w SSID|PASSWORD|HOST = save Wi-Fi and Moonraker settings to NVS
r = release shutter-button state
```

Pairing with `q` forces `dry-run` and disarms live capture before scanning. The
pairing-only path performs no FF01 writes / 配对过程不写 FF01，也不会触发快门。
After the camera confirms pairing once, use `b` for normal reconnects.

Network credentials are provisioned with `w SSID|PASSWORD|HOST`, stored in NVS,
and never committed to source. The build defaults contain an empty SSID and
password plus the shareable host `printer.local`.

## Sony BLE Sequence

After the user requests a shot, firmware writes the proven FF01 sequence and
waits for FF02 shutter-active state before release:

```text
focus_down 0107
full_down  0109
fully_up   0108
half_up    0106
```

The camera service is `8000FF00-FF00-FFFF-FFFF-FFFFFFFFFFFF`; FF01 is the
command characteristic and FF02 is the notification characteristic.

## Build

From this directory:

```powershell
..\..\.venv-platformio\Scripts\platformio.exe run
```

To upload, add the serial port reported by the operating system:

```powershell
..\..\.venv-platformio\Scripts\platformio.exe run -t upload --upload-port PORT
```

The custom partition table provides a 4 MB application partition for Wi-Fi plus
Bluedroid. Classic Bluetooth memory is released before Wi-Fi starts, and BLE
tasks are pinned separately from the Wi-Fi/event-loop workload.

## Safe Validation

1. Flash with `TIMELAPSE_DRY_RUN_DEFAULT=1`.
2. Provision Wi-Fi and Moonraker with `w`.
3. Confirm repeated HTTP status requests succeed without reboots.
4. On first use, open the camera's Bluetooth remote pairing screen, send `q`,
   and approve the camera prompt. On later boots, send `b` to reconnect.
5. Run a short print in dry-run and confirm macro events without photos.
6. Send `a` only after the camera and scene are ready.
7. Send `d` before changing the printer or camera setup.

An anonymized real validation completed 135 requested Smooth-mode frames with
135 continuous macro events and 135 camera-confirmed shutter sequences. This
evidence proves the current U1/Sony route but does not remove the dry-run gate
for a new installation.

## Compatibility Note

`CYBERBRICK_SHOT` is a deprecated protocol alias only. This independent project
is not affiliated with or endorsed by Bambu Lab or the CyberBrick project.
