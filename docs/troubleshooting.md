# Troubleshooting

## Browser Cannot Open The Serial Port

Use Chrome or Edge and open the configurator from `localhost` or HTTPS. Close
serial monitors, IDEs, and old listener processes. Confirm the USB cable carries
data, not power only.

## Sony Pairing Shows No Camera Prompt

Use **Pair Sony for first use**, not **Connect paired Sony**. The camera must stay
on its Bluetooth remote pairing screen. The firmware only accepts advertisements
with pairing and remote-control flags enabled. If the 30-second scan times out,
reopen that screen and retry. Pairing keeps dry-run and does not take a photo.

## Sony `ready=false`

`connected=true, ready=false` means BLE connected but FF01/FF02 service setup or
notification subscription is incomplete. Wait a few seconds and read status
again. If Sony remains `ready=false`, disarm, power-cycle the camera, click
**Connect paired Sony**, and inspect the raw service/CCCD logs. Do not arm until
`ready=true`.

## `b` Reports `no_bonded_target`

This board has no stored camera bond. Put the camera in pairing mode and use
`q` / **Pair Sony for first use** once. A fresh flash that erases NVS also erases
the bond.

## Macro Source Is Legacy

`macro_source=legacy` means the box is observing `CYBERBRICK_SHOT`. It remains
compatible and should still deduplicate correctly. Install the dual-name macro
and update the slicer to emit `ESP32_TIMELAPSE_SHOT`; keep the legacy alias until
all profiles and devices have migrated.

## No Layer Events

Confirm the print is active, Moonraker is reachable from the board's LAN, and
Klipper exposes `gcode_macro ESP32_TIMELAPSE_SHOT`. Check the configured host,
Wi-Fi status, `print_stats`, and whether polling was disabled with `e`. A browser
Moonraker preflight can fail because of CORS even while the board can reach
Moonraker directly.

## Duplicate Photos

Check that the slicer emits one timelapse macro per completed layer. Do not call
both public macro aliases manually for the same layer. On C3, keep both backends
on the same listener/deduplicator rather than running two independent listeners.

## Pairing Works But Printing Does Not Shoot

Read both `s` and `p`. You need Sony `ready=true`, `enabled=true`,
`dry_run=false`, `armed=true`, a healthy active print, and a new event beyond the
stored baseline. Dry-run intentionally logs events without photos.

## Immediate Safety Action

Click **Lock to dry-run** or send `d`. If serial is unavailable, power down the
ESP32. Never troubleshoot camera placement while the box is armed.

