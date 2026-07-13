# Event And Serial Protocol

## Klipper Event Contract

`config/klipper/esp32_timelapse.cfg` exposes two public macros:

- canonical: `ESP32_TIMELAPSE_SHOT`;
- compatibility: `CYBERBRICK_SHOT`.

Both call `_ESP32_TIMELAPSE_EVENT` and advance **one shared sequence / 同一个共享序列**.
The internal macro writes the same `seq` value back to both public objects. A
listener therefore sees one logical frame request regardless of which alias the
slicer called.

Consumers must prefer canonical data when both objects are valid. If canonical
is absent or invalid, they may fall back to legacy. A live source switch is
baselined and must not itself take a photo. If neither macro is available, the
firmware can use guarded Klipper layer/Z detection.

## ESP32-S3 Serial Commands

| Command | Meaning | Can write Sony FF01? |
| --- | --- | --- |
| `s` | Read Sony connection status | No |
| `q` | First-time Sony pairing | No |
| `b` | Connect a bonded Sony camera | No |
| `t` | Explicit manual shutter test | Yes |
| `r` | Release shutter button state | Yes |
| `p` | Read timelapse/Moonraker status | No |
| `a` | Arm valid print events | Enables later writes |
| `d` | Disarm and force dry-run | No |
| `e` | Toggle Moonraker polling | No |
| `w ...` | Save Wi-Fi and Moonraker settings | No |

`q` always sets `armed=false` and `dry_run=true` before active scanning. It only
accepts Sony advertisements with `pairing_open && remote_enabled`, performs BLE
security/bonding, and logs `no_ff01_writes=true`. Pairing and connection are
separate operations: first use calls `q`; later boots normally call `b`.

## Trigger Selection

For each Moonraker poll, the S3 firmware evaluates print health, macro sequence,
layer metadata, minimum interval, dry-run state, and Sony readiness. Canonical
macro changes win. Legacy changes are accepted only when canonical has no valid
event. Layer/Z fallback is used only when both macro sources are unavailable or
invalid.

The minimum trigger interval is 1000 ms. SnapOrca's Traditional and Smooth
output uses `M400`, one macro call, and a default 1200 ms dwell so the board and
camera have time to finish one frame before the next request.

## Compatible C3 Backends

The C3 listener accepts `esp32_timelapse_trigger` and the legacy
`cyberbrick_shutter_trigger` WebSocket method. HTTP polling and WebSocket agent
events feed one deduplication state. Event identity, sequence, print filename,
and layer are considered before calling the shutter output, so duplicate backend
delivery cannot intentionally produce two photos.

## Safety Invariants

- No route starts armed after install or browser connection.
- Pairing cannot call the shutter sequence.
- `a` is never sent by automated browser smoke tests.
- One valid completed-layer event maps to at most one shutter request.
- Diagnostics redact credentials and device/network identifiers.

