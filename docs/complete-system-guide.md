# Complete System Guide

This guide covers the complete ESP32 Timelapse Box workflow: the ESP32 board,
Klipper macro, Moonraker connection, experimental SnapOrca build, camera setup,
safe validation, normal printing, recovery, and community testing for additional
camera brands.

The project is an engineering prerelease. Read the route table before flashing
anything because the Sony automatic firmware and the multi-brand probe are separate
images with different capabilities.

## 1. Choose The Correct Route

| Route | Camera | Automatic Klipper timelapse | Current evidence |
| --- | --- | --- | --- |
| ESP32-S3 Sony route | Sony camera using the tested BLE remote service | Yes | Sony ZV-E10 physically validated |
| Compatible ESP32-C3 route | Existing C3 shutter box with working GPIO/HID output | Yes | Existing compatible hardware only |
| Multi-brand BLE Probe Alpha | Selected Canon, Fujifilm, Nikon, or Ricoh protocol candidates | No; manual scan, pair, and one-shot only | Source-level candidates, community hardware reports needed |

The Nikon D850 test belongs to the third route. It supports SnapBridge, but it
has not been proven to expose the Nikon BLE remote service expected by the
probe. A failed scan or pairing log is still a useful result. Do not install
SnapOrca or the Klipper macro solely for the D850 probe because that Alpha does
not listen to Klipper yet.

## 2. How The Automatic Route Works

```text
SnapOrca completes a layer
  -> G-code calls ESP_TIMELAPSE_SHOT
  -> the Klipper macro increments a shared sequence
  -> the ESP32 reads the sequence from Moonraker over Wi-Fi
  -> the ESP32 sends the camera shutter command
```

No PC listener remains running after setup. USB powers and configures the
ESP32; the board communicates with Klipper over Wi-Fi and with the tested Sony
camera over BLE.

The U1 native timelapse and ESP32 trigger are additive. They can both remain
enabled. The external ESP32 command does not replace the U1's native camera
command.

## 3. What You Need

For the validated Sony automatic route:

- ESP32-S3 DevKitC-1 N8 or N8R8;
- a data-capable USB cable and a stable 5 V USB power source;
- a Klipper printer with Moonraker reachable on the same LAN;
- access to the printer's Klipper configuration;
- Chrome or Edge, because the configurator uses Web Serial;
- a compatible Sony camera with Bluetooth remote control enabled;
- the experimental SnapOrca build for automatic Traditional/Smooth G-code.

For a long print, provide reliable camera power. A dummy battery or supported
continuous-power adapter only powers the camera; shutter control still comes
from BLE.

Back up these items before starting:

- `printer.cfg` and included Klipper configuration files;
- custom slicer presets and important 3MF projects;
- the ESP32 firmware image you may want to restore;
- a known-good official U1 firmware image if you separately test mixed nozzles.

## 4. Download The Released Files

### ESP32 Timelapse Box v0.1.0

Release:
<https://github.com/MOVIBALE/esp32-timelapse-box/releases/tag/v0.1.0>

Download:

- `esp32-timelapse-box-configurator-v0.1.0.zip`;
- `esp32-timelapse-box-s3-factory-v0.1.0.bin`;
- `SHA256SUMS.txt`.

The configurator ZIP contains the browser application, Klipper macro, C3
files, documentation, and launchers.

Verify downloaded files before flashing or installing. On Windows PowerShell:

```powershell
Get-FileHash .\downloaded-file -Algorithm SHA256
```

On macOS or Linux:

```sh
shasum -a 256 downloaded-file
```

Compare the result with the release's checksum file.

### Experimental SnapOrca 2.3.5 alpha.1

Release:
<https://github.com/MOVIBALE/OrcaSlicer/releases/tag/u1-experimental-2.3.5-alpha.1>

Windows users can choose the installer or portable ZIP. Keep the official
Snapmaker Orca installer available for rollback. The release also provides the
corresponding source and SHA-256 checksums.

### Optional multi-brand probe

Only download this when testing a non-Sony camera manually:
<https://github.com/MOVIBALE/esp32-timelapse-box/releases/tag/multibrand-probe-v0.1.0-alpha.1>

### Optional U1 mixed-nozzle firmware

This firmware is required only for the experimental mixed-nozzle validation
workflow. ESP32 timelapse does not require it:
<https://github.com/MOVIBALE/SnapmakerU1-Extended-Firmware/releases/tag/mixed-nozzle-u1-alpha.1>

Do not flash the mixed-nozzle firmware merely to enable timelapse.

## 5. Install The Klipper Macro

Extract the configurator ZIP. Copy:

```text
config/klipper/esp32_timelapse.cfg
```

to the printer's Klipper configuration directory. Add this line to
`printer.cfg`:

```ini
[include esp32_timelapse.cfg]
```

Restart Klipper, not just the slicer. Moonraker should then expose:

```text
gcode_macro ESP_TIMELAPSE_SHOT
gcode_macro CYBERBRICK_SHOT
```

`ESP_TIMELAPSE_SHOT` is the canonical name. `CYBERBRICK_SHOT` is a deprecated
compatibility alias. Both update one shared sequence, so the slicer must call
only the canonical macro once per frame.

You can verify the canonical object by opening this URL on the printer LAN:

```text
http://PRINTER_HOST/printer/objects/query?gcode_macro%20ESP_TIMELAPSE_SHOT
```

Replace `PRINTER_HOST` with the printer IP address or hostname. A JSON response
containing `seq` confirms that Moonraker can read the macro.

On a generic Klipper printer, use Mainsail, Fluidd, SSH, or the printer's normal
configuration method. A stock U1 may not expose direct Klipper configuration
access. Use an already-established, documented configuration-access method;
the separate U1 Extended Firmware provides advanced access, but its
mixed-nozzle Alpha is not a timelapse dependency.

Do not manually run `ESP_TIMELAPSE_SHOT` while the box is armed unless you
intend to take a photo.

## 6. Flash The ESP32-S3 Sony Firmware

Install Espressif's flashing utility:

```text
python -m pip install esptool pyserial
python -m serial.tools.list_ports
```

Identify the ESP32-S3 port and close every application using it. Replace
`PORT` below with a value such as `COM9`, `/dev/cu.usbmodem...`, or
`/dev/ttyACM0`:

```text
python -m esptool --chip esp32s3 --port PORT erase-flash
python -m esptool --chip esp32s3 --port PORT write-flash 0x0 esp32-timelapse-box-s3-factory-v0.1.0.bin
```

Erasing the flash also erases saved Wi-Fi settings and camera bonds. If
automatic download mode fails, hold `BOOT`, tap `RESET`, release `BOOT`, and
retry.

This factory image is for the repository's ESP32-S3 DevKitC-1 N8/N8R8 route.
Do not force-flash it to a regular ESP32, ESP32-C3, ESP32-S2, or unidentified
board.

## 7. Launch The Browser Configurator

Extract `esp32-timelapse-box-configurator-v0.1.0.zip`.

- Windows: double-click `START-WINDOWS.cmd`.
- macOS: run `START-MAC.command`. If Gatekeeper blocks it, run
  `sh START-MAC.command` from Terminal.

The launcher opens <http://127.0.0.1:8776/>. Use Chrome or Edge. Web Serial
works on localhost or HTTPS and always requires the user to select the serial
port from the browser dialog.

Choose **ESP32-S3 + Sony BLE**, connect the board, and keep it in dry-run.
Enter:

- Wi-Fi SSID and password;
- Moonraker hostname or LAN IP address.

Save the network configuration, then read the board and Moonraker status. The
ESP32 and printer must be able to reach each other on the LAN. Opening the
configurator only reads status; it does not silently arm the box.

## 8. Pair And Prepare A Sony Camera

Before pairing:

- enable Bluetooth remote control on the camera;
- disconnect competing phone remote sessions;
- insert a memory card and verify the physical shutter works;
- use a power-saving setting suitable for the print duration;
- set focus and exposure so the shutter will not be blocked.

For the first pairing, leave the camera on its Bluetooth remote pairing screen
and click **Pair Sony for first use**. Approve the camera prompt. This action
forces `dry_run=true` and `armed=false` and performs no shutter write.

Wait for the interface to show `connected=true` and `ready=true`. Later boots
normally reconnect the saved camera automatically. Use **Connect paired Sony**
only as a retry.

Run one explicit manual shutter test from the configurator only after the
camera is ready. Confirm that exactly one new image was saved. A successful
serial command or GATT write is not a substitute for checking the camera.

## 9. Install And Configure Experimental SnapOrca

Back up custom presets and projects before installing the Alpha. Windows users
may install the EXE or extract the portable ZIP.

For a Snapmaker U1:

1. Select the appropriate **Snapmaker U1** printer/nozzle profile.
2. Open **Process > Other > Special Mode**.
3. Select **Off**, **Traditional**, or **Smooth** under Timelapse.
4. Slice again after changing the mode.

There is no separate ESP32 backend selector in the final design. The U1
profile declares ESP32 capability. When Timelapse is not Off, the slicer keeps
the U1 native hook and also emits `ESP_TIMELAPSE_SHOT`.

The print-send dialog's timelapse checkbox controls the printer's native
timelapse recording. It does not replace the ESP32 command already generated
in the G-code. Enable the process timelapse mode and the send-dialog checkbox
when you want both camera paths.

Mode behavior:

- **Off:** no native or ESP32 layer-frame command.
- **Traditional:** waits for current motion, calls `ESP_TIMELAPSE_SHOT`, waits
  at least 2000 ms, and continues without parking. The toolhead can remain in
  the image.
- **Smooth:** generates a real stabilization/prime tower, completes the model
  and tower work for the layer, lifts Z, parks the toolhead, waits for motion,
  takes the frame, and returns at clearance height. Smooth adds time and
  material, including on single-material prints.

The U1 profile uses an explicit validated park position. Generic Klipper
profiles must configure a safe position inside the printable area and outside
the model, tower, and exclusion zones.

Old projects that still contain a 1200 ms receiver dwell must be updated to at
least 2000 ms and sliced again. The current build deliberately rejects shorter
values.

### Generic Klipper printer profiles

The bundled U1 profile already contains the required values. A custom generic
Klipper printer must explicitly set and validate these printer-profile fields:

```text
supports_esp32_timelapse = 1
esp32_timelapse_gcode = ESP_TIMELAPSE_SHOT
esp32_timelapse_park_x = a safe X coordinate
esp32_timelapse_park_y = a safe Y coordinate
esp32_timelapse_travel_speed = 18000 mm/min or a printer-safe value
esp32_timelapse_dwell_ms = 2000 or greater
```

Do not copy the U1 park position to another printer. Smooth slicing must fail
until the position is inside that printer's active plate and outside models,
the tower, and exclusion areas.

## 10. Inspect The G-code Before Printing

Export the G-code and search for an executable line:

```text
ESP_TIMELAPSE_SHOT
```

Traditional should contain one block per printed layer:

```gcode
M400
ESP_TIMELAPSE_SHOT
G4 P2000
```

Smooth should additionally contain safe lift, park, and return moves. The
preview should show one physical tower. Multi-tool output may contain several
tower blocks on a layer, but they must occupy one tower location.

On Windows PowerShell, count external frame commands with:

```powershell
(Select-String -Path .\your-print.gcode -Pattern '^ESP_TIMELAPSE_SHOT$').Count
```

Expected results:

- Off: `0`;
- Traditional: one per printed layer;
- Smooth: one per printed layer.

Do not print if the G-code contains the obsolete broken command
`ESP32_TIMELAPSE_SHOT`. The correct command is `ESP_TIMELAPSE_SHOT`.

## 11. Complete The Required Dry-run

Use a 10-20 layer model for the first validation.

1. Confirm the camera reports `ready=true`.
2. Confirm the box reports `dry_run=true` and `armed=false`.
3. Slice with Traditional or Smooth and start the print.
4. Observe at least one real `ESP_TIMELAPSE_SHOT` event.
5. Confirm the log reports a dry-run event and the camera does not take a
   picture.
6. Stop or finish the short validation print.

The expected log contains a macro event with the canonical source and dry-run
state. If the source is `legacy`, the compatibility path can still work, but
the macro and slicer should be updated before release use.

## 12. Arm And Run A Real Timelapse

Only continue after the dry-run and manual one-shot tests pass.

1. Turn on the camera and check framing, focus, storage, and power.
2. Power the ESP32 and wait for `connected=true, ready=true`.
3. Confirm Moonraker is reachable and the canonical macro is visible.
4. Confirm the intended G-code contains the correct number of
   `ESP_TIMELAPSE_SHOT` lines.
5. In the configurator, enter the exact phrase:

   ```text
   ARM DRY-RUN VERIFIED
   ```

6. Click the armed action and verify `dry_run=false, armed=true`.
7. Start the intended print and watch the first external frame.

For Smooth mode, the expected order is: finish layer and tower work, lift,
park, wait, trigger, dwell, then return safely. If the head is still over the
model when the camera fires, stop the test and inspect the exported G-code and
selected timelapse mode.

When the print ends, or before touching the camera or printer, click **Lock to
dry-run**. If serial control is unavailable, power down the ESP32.

## 13. Normal Daily Workflow

After the installation has passed the short validation:

1. Turn on the printer and camera.
2. Power the ESP32.
3. Open the configurator and confirm Sony `ready=true` and Moonraker healthy.
4. Keep dry-run while changing hardware or framing.
5. Slice using the required Timelapse mode.
6. Inspect the command count and preview.
7. Arm only when everything is ready.
8. Send the print.
9. Check the first parked frame.
10. Return to dry-run after the job.

The ESP32 boots unarmed. Reconnecting a bonded camera does not take a picture
and does not automatically arm the system.

## 14. Multi-brand Camera Community Test

The multi-brand image is a separate manual probe. Flashing it replaces the
Sony automatic image. It supports `scan`, `connect`, `status`, one manual `shot`,
and reconnect testing. It does not read Klipper or perform automatic
timelapse.

Follow the complete probe guide:
<https://github.com/MOVIBALE/esp32-timelapse-box/blob/Min/experimental-multibrand-ble/docs/multibrand-community-testing.md>

For a Nikon D850:

1. close any active SnapBridge session;
2. put the camera on its documented Bluetooth or smart-device pairing screen;
3. run `scan`, wait 10-20 seconds, then run `stop` and `list`;
4. connect only if a Nikon candidate appears;
5. continue to `shot` only if `status` reports `connected=true` and
   `ready=true`;
6. confirm the physical image count yourself;
7. power-cycle both devices and test the saved connection only after the first
   shot succeeds.

The D850 may use a SnapBridge handshake that the current probe cannot finish.
Do not repeatedly change camera settings or spend hours retrying. Submit the
sanitized log even when the result is a failure:
<https://github.com/MOVIBALE/esp32-timelapse-box/issues/new?template=multibrand-camera-test.yml>

Replace BLE addresses with `XX:XX:XX:XX:XX:XX` and remove credentials, serial
numbers, EXIF, private IP addresses, and personal paths.

## 15. Compatible ESP32-C3 Route

Choose this only for an existing compatible ESP32-C3 shutter box that already
has MicroPython and a working GPIO/HID shutter implementation. The browser can
upload the Moonraker listener, but it cannot turn a blank C3 into a Sony BLE
central.

In the configurator choose **Compatible ESP32-C3 shutter box**, enter Wi-Fi and
Moonraker settings, and upload the disabled/dry-run listener. Start with HTTP
polling. WebSocket and automatic fallback are optional and share one event
deduplicator. Complete the same dry-run gate before arming.

Full guide: [Compatible ESP32-C3 quick start](quickstart-compatible-esp32-c3.md).

## 16. Troubleshooting

### Browser cannot open the port

Use Chrome or Edge, a data USB cable, and the localhost launcher. Close serial
terminals, IDE monitors, and other browser tabs holding the port.

### Sony pairing shows no prompt

Use **Pair Sony for first use**, keep the camera on its remote pairing screen,
and retry after reopening that screen. Do not use the bonded-camera reconnect
button for a first pairing.

### `connected=true`, `ready=false`

Do not arm. Wait, read status again, then power-cycle the camera and use
**Connect paired Sony**. Persistent `ready=false` means service discovery or
notification setup did not complete.

### No layer events

Verify the printer is actively printing, Moonraker is reachable from the
ESP32's network, and `gcode_macro ESP_TIMELAPSE_SHOT` exists. Check that the
G-code actually contains `ESP_TIMELAPSE_SHOT`.

### Photos occur while the toolhead is printing

Traditional mode does not park. Select Smooth, slice again, verify the tower
and park moves in the new G-code, then send that new file.

### Duplicate photos

Do not emit or manually call both macro names for one layer. The current
SnapOrca output should contain only `ESP_TIMELAPSE_SHOT`; the printer's native
camera command is separate and may intentionally create a second camera path.

### Immediate safety action

Click **Lock to dry-run** or send serial command `d`. If the port is
unavailable, unplug the ESP32.

## 17. Recovery And Rollback

### ESP32

Reflash the desired factory image from address `0x0`. Erase first when changing
between the Sony automatic image and multi-brand probe. Erasing removes Wi-Fi and
camera bonds.

### Klipper

Remove this line from `printer.cfg` and restart Klipper:

```ini
[include esp32_timelapse.cfg]
```

Do this only after returning the slicer to Off or to a profile that does not
emit `ESP_TIMELAPSE_SHOT`.

### SnapOrca

Back up presets and projects, uninstall the experimental build, and install the
latest official Snapmaker Orca release:
<https://github.com/Snapmaker/OrcaSlicer/releases/latest>

### U1 mixed-nozzle firmware

Restore a known-good official or Extended Firmware image using its documented
upgrade/recovery procedure. Slicer rollback does not restore printer firmware.

## 18. Known Working Evidence And Limits

- A real U1, ESP32-S3, and Sony ZV-E10 Smooth print produced 135 expected
  external frames from 135 layers.
- A real multi-material Smooth print parked the head and retained U1 native
  timelapse at the same time.
- Saved Sony bonding and safe reconnect were physically tested.
- Other Sony models remain candidates until tested.
- Canon, Fujifilm, Nikon, and Ricoh are experimental manual probe routes only.
- The released SnapOrca build and firmware are unofficial Alpha/engineering
  prereleases.

This project is independent and is not affiliated with, endorsed by, or
supported by Snapmaker, Sony, Nikon, Bambu Lab, or another printer or camera
manufacturer.
