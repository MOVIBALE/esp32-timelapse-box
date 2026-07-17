# Experimental multi-brand camera BLE research

This is protocol research and a community validation probe, not a camera
compatibility claim. The stable ESP32-S3 firmware remains the
hardware-validated Sony ZV-E10 implementation.

## Frozen source

- Upstream: <https://github.com/gkoh/furble>
- Revision: `246de0861b8907a68eec3f2496dcfc666f41816b`
- Upstream license: MIT
- Local use: the experimental firmware vendors the required Furble camera core;
  attribution and the MIT license are retained under `third_party/`.

## Current evidence

| Protocol candidate | Offline contract | Local build | Project hardware |
| --- | --- | --- | --- |
| Canon BR-E1 remote | Imported and tested | Pass | Not tested |
| Canon smart-device | Imported and tested | Pass | Not tested |
| Fujifilm basic | Imported and tested | Pass | Not tested |
| Fujifilm secure | Imported and tested | Pass | Not tested |
| Nikon ML-L7 remote | Imported and tested | Pass | Not tested |
| Ricoh GR candidate | Imported; explicit approval required | Pass | Not tested |

“Imported and tested” means constants and control flow match the frozen
open-source reference. It does not prove that any specific camera accepts the
command. See the [community compatibility matrix](multibrand-community-compatibility.md).

## Integration boundary

The independent build at
`firmware/esp32-s3-multibrand-nimble-experimental` uses Arduino and
NimBLE-Arduino, exposes only a serial workflow, and has no Klipper/Moonraker
automation. Ricoh numeric comparison pauses for explicit `yes`, `no`, or
`pin NNNNNN` input and rejects on timeout.

The stable Sony firmware remains on ESP-IDF Bluedroid because that is the route
validated with the local ZV-E10. The experimental image replaces the stable
image when flashed; it does not add drivers to the stable firmware.

## Validation ladder

1. Passive scan with no connection.
2. User-requested connection and pairing.
3. Confirm `status` reports `ready=true`.
4. Dispatch exactly one manual `shot`.
5. Confirm a new image on the physical camera.
6. Power-cycle both devices and repeat through the saved bond.

Only steps 1-4 can be automated without the target camera. A model is not
listed as validated until a tester supplies evidence for steps 5-6.

## Deliberately excluded from this Alpha

- Klipper or Moonraker layer triggering;
- automatic shutter at boot, scan, pair, or reconnect;
- mobile-phone BLE HID;
- Sony inside the NimBLE probe;
- compatibility claims inferred from brand or protocol family.
