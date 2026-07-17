# Experimental multi-brand camera BLE research

This document describes protocol research, not a compatibility claim. The stable
ESP32-S3 firmware remains the hardware-validated Sony ZV-E10 implementation.

## Frozen source

- Upstream: <https://github.com/gkoh/furble>
- Revision: `246de0861b8907a68eec3f2496dcfc666f41816b`
- Upstream license: MIT
- Local use: protocol facts were independently represented as data and tests;
  Furble source is not vendored into the release.

Furble is the primary reference because it implements camera-specific BLE
drivers on ESP32 and publishes a tested-camera list. Canon BR-E1 projects are a
useful secondary reference, but they cover a narrower protocol.

## Current evidence levels

| Protocol candidate | Offline recognition | Shutter bytes | Pairing flow | Local hardware |
| --- | --- | --- | --- | --- |
| Canon BR-E1 remote | Implemented | Contract tested | Documented from upstream | Not tested |
| Canon smart-device | Implemented | Contract tested | Documented from upstream | Not tested |
| Fujifilm basic | Implemented | Contract tested | Token contract documented | Not tested |
| Fujifilm secure | Implemented | Contract tested | Complex secure flow documented | Not tested |
| Nikon ML-L7 remote | Implemented | Contract tested | Complex four-stage flow documented | Not tested |
| Ricoh GR | Heuristic/catalog only | Contract tested | Numeric comparison required | Not tested |

“Contract tested” means our constants match the frozen open-source reference.
It does not prove that a camera accepts the command.

## Integration boundary

`tools/camera_ble_protocol_catalog.mjs` is deliberately unable to connect,
pair, or write to a BLE device. It provides:

1. conservative advertisement classification;
2. normalized service and characteristic UUIDs;
3. ordered shutter write payloads;
4. an explicit evidence level for every candidate.

The current Sony firmware uses ESP-IDF Bluedroid because the tested ZV-E10 did
not complete pairing through the earlier NimBLE route. Furble uses NimBLE.
Therefore the protocol catalog is not linked into the stable firmware.

An independent build now exists at
`firmware/esp32-s3-multibrand-nimble-experimental`. It vendors only Furble's
camera core, pins the upstream revision and NimBLE-Arduino version, exposes a
serial-only workflow, and contains no Klipper/Moonraker automation. Its purpose
is to take each candidate through the physical validation ladder below.

Ricoh numeric comparison is not inherited as automatic acceptance. The local
driver pauses for `yes`, `no`, or `pin NNNNNN` serial input and rejects the
pairing request on timeout.

## Safe validation ladder

Every new camera must pass these gates in order:

1. Passive scan: identify only; no connection.
2. Connection probe: enumerate services; no pairing and no writes.
3. Pairing probe: pair and persist the bond; no shutter writes.
4. Manual shutter probe: one user-authorized trigger while logging each write.
5. Reconnect test: power cycle both devices and repeat a manual trigger.
6. Timelapse integration: only after repeatable manual capture succeeds.

Do not publish a model as supported until gates 1-5 pass on physical hardware.

## Deliberately not implemented

- automatic selection of a camera driver;
- a combined NimBLE multi-camera firmware;
- Bluedroid ports of the Furble drivers;
- mobile-phone BLE HID in the ESP32-S3 firmware;
- inferred support for untested models in the same brand.

These are implementation choices that need hardware evidence, not prerequisites
for preserving the stable Sony release.
