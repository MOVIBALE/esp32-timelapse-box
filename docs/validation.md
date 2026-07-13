# Validation Evidence

This document separates automated evidence from physical evidence. A passing
unit test does not prove that a particular camera, board, Wi-Fi network, or
printer is ready for armed operation.

## Physical Evidence

An anonymized Snapmaker U1 and Sony ZV-E10 print completed **135 / 135** expected
Smooth-mode layer events and camera-confirmed shutter sequences. Reconnect,
manual shutter, dry-run, canonical macro polling, and a real multi-material
print were also exercised during development.

The 135-frame run used an existing Sony BLE bond. The integrated firmware now
contains first-time pairing command `q`, but a fully erased board pairing from
fresh NVS is **not yet** / **尚未** repeated on physical hardware after the final
integration. v0.1.0 is therefore an engineering prerelease. The pairing path is
build-tested and statically checked to contain no FF01 shutter call.

## Automated Evidence

- ESP32-S3 firmware contract: 16/16 tests, including active first pairing,
  canonical/legacy selection, reconnect state reset, dry-run gates, and no
  pairing-time shutter write.
- ESP-IDF/PlatformIO release build: success; approximately 1.37 MB application
  image and 40 KB static RAM usage.
- Browser configurator: 139/139 tests.
- Browser workflows: both Compatible C3 and ESP32-S3 simulations pass in real
  headless Chrome; the S3 workflow writes `q`, `b`, `d`, `s`, and `p`, but never
  writes manual shutter `t` or armed `a`.
- Responsive rendering: 1440x900 and 390x844 screenshots are nonblank; at 390px
  the document width equals the viewport and mode labels have no internal text
  overflow.
- C3 protocol: canonical and legacy WebSocket methods share deduplication;
  HTTP polling, WebSocket agent, safe upload, and recovery have automated tests.
- Repository publication policy: primary product naming, required files, and
  tracked text are scanned for known credentials, private addresses, camera
  addresses, and local paths.

## Slicer Evidence

The SnapOrca patch has separate source-tree evidence for Off, Traditional, and
Smooth. The verified 135-layer model produced 0/135/135 frame commands. Smooth
single-tool output produced a real stabilization tower, completed model and
tower work before the frame, kept full Z clearance, and placed the final frame
after final purge. Bambu-native profiles retained their own behavior.

The SnapOrca source patch is not shipped in this repository. See the migration
prompt for the required independent review and build gates.

## Required Release-Hardware Gate

Before calling the S3 route stable rather than prerelease:

1. erase NVS/flash on one ESP32-S3;
2. flash the release `factory.bin`;
3. pair only through the browser's `q` action;
4. confirm no photo is created during pairing;
5. power-cycle both devices and reconnect with `b`;
6. pass a short dry-run print, one explicit manual `t` test, and a 10-20 layer
   armed print.

