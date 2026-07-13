# Sony BLE Historical Research / Sony BLE 历史研究

This is **historical research, not a beginner guide / 历史研究，不是新手教程**.
New users should follow the S3 or C3 quick start instead.

## Why Two Hardware Routes Exist

The original compatible C3 shutter hardware behaves as a BLE HID peripheral for
phones and exposes a MicroPython/GPIO bridge. A Sony camera in Bluetooth remote
mode expects a remote/controller to initiate a Sony-specific BLE connection.
Those roles are not interchangeable.

The stock C3 MicroPython surface did not expose enough low-level BLE central
functionality to implement Sony pairing cleanly. That route was therefore kept
for its proven phone/HID/GPIO behavior, while an ordinary ESP32-S3 running
ESP-IDF Bluedroid became the active Sony controller.

## Discovery Sequence

1. Generic HID advertising did not produce a Sony pairing confirmation.
2. Sony manufacturer data exposed separate pairing-open and remote-enabled bits.
3. A pairing-only Bluedroid probe used active scanning, accepted the camera's
   security request, and created a bond without writing the shutter
   characteristic.
4. Service discovery identified the Sony remote service, FF01 command channel,
   FF02 notification channel, and CCCD subscription.
5. The proven focus/full-press/release sequence produced a real ZV-E10 photo.
6. Moonraker macro sequence polling was then added behind dry-run and explicit
   armed gates.

## Lessons Preserved In The Product

- First pairing and normal reconnect are separate commands (`q` and `b`).
- Pairing is always disarmed and contains no FF01 write.
- GATT service and characteristic handles are reset before reconnecting.
- A stored bond is convenience, not permission to arm.
- The compatible C3 route remains supported instead of being rewritten around
  a BLE role its stock runtime was not designed to perform.

