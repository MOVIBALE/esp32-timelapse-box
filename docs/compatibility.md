# Compatibility And Legacy Aliases

ESP32 Timelapse Box uses new canonical names while retaining narrowly scoped
compatibility aliases. New integrations should write canonical names. Existing
installations may continue reading or calling the legacy names during the v0.x
migration period.

| Surface | Canonical | Legacy compatibility |
| --- | --- | --- |
| Klipper macro | `ESP_TIMELAPSE_SHOT` | `CYBERBRICK_SHOT` |
| C3 WebSocket method | `esp32_timelapse_trigger` | `cyberbrick_shutter_trigger` |
| Filesystem utility | `esp32_timelapse_fs.py` | `cyberbrick_fs.py` wrapper |
| Wi-Fi password environment variable | `ESP32_TIMELAPSE_WIFI_PASS` | `CYBERBRICK_WIFI_PASS` |

The two Klipper macros route through one internal counter. The two C3 methods
route through one deduplicator. Calling or observing both names for one event
must not create two photos.

The compatible C3 route covers existing Bambu CyberBrick shutter hardware and
its established MicroPython/GPIO behavior. This does not make the project an
official Bambu Lab product. ESP32 Timelapse Box is independent and is **not affiliated
with, endorsed by, or supported by Bambu Lab**. The old product and
project names appear here only to identify interoperability and migration
behavior.

Sony compatibility is protocol-based. The ZV-E10 has been tested. Other models
that expose the same BLE remote service are candidates, not guarantees.
