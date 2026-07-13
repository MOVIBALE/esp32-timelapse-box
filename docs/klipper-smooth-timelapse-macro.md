# Klipper And Smooth Timelapse Contract

The printer-side contract is deliberately small: the slicer decides when a
completed layer is photographically stable, and Klipper increments an event
counter. The ESP32 observes the counter through Moonraker.

## Install

Copy `config/klipper/esp32_timelapse.cfg` into the printer configuration and
include it from `printer.cfg`:

```ini
[include esp32_timelapse.cfg]
```

After restarting Klipper, both objects should exist:

```text
gcode_macro ESP32_TIMELAPSE_SHOT
gcode_macro CYBERBRICK_SHOT
```

`ESP32_TIMELAPSE_SHOT` is canonical. `CYBERBRICK_SHOT` is a deprecated alias;
both call one internal macro and expose the same sequence value. Do not install
two separate counters.

## Slicer Modes

### Off

No ESP32 frame macro is emitted. Enabling the backend while the timelapse mode
is Off must also suppress an old profile's duplicate timelapse hook.

### Traditional

One frame is requested after each completed layer, with no parking move:

```gcode
M400
ESP32_TIMELAPSE_SHOT
G4 P1200
```

`M400` waits for current motion. The dwell must be at least 1000 ms; 1200 ms is
the tested default. Traditional can leave a visible seam or small deposit on
some materials because the toolhead pauses near the model.

### Smooth

Smooth uses a real stabilization tower, including single-tool prints. The
slicer completes model and tower work for the layer, retracts, obtains full Z
clearance, parks, waits, requests one frame, then returns at clearance height
before lowering Z and restoring extrusion.

Representative order:

```gcode
; model and stabilization tower for this layer are complete
G1 E-0.8 F1800
G1 Z... F7200
G1 X... Y... F18000
M400
SAVE_GCODE_STATE NAME=ESP32_TIMELAPSE_SMOOTH
G90
ESP32_TIMELAPSE_SHOT
G4 P1200
RESTORE_GCODE_STATE NAME=ESP32_TIMELAPSE_SMOOTH
; return XY while raised, lower Z separately, then restore extrusion
```

The required lift is `max(0.2 mm, layer_height, z_hop)`. If printable-height
headroom is insufficient, slicing must fail rather than truncate the lift and
move sideways. The configured parking point and full generated tower outline
must be inside the printable region and clear of model/collision exclusions.

## Completed-Layer Timing

This project intentionally photographs **after the current complete layer**.
That avoids an empty-bed first frame and a missing final layer. On the final
layer, final purge / 最终 purge and final tower cleanup must finish before the
last frame. No positive model XY+E extrusion may occur after that frame.

Bambu-native profiles keep their bundled behavior and native frame hook. The
ESP32 backend must not rewrite or duplicate those profiles. Comparison output
is useful as a structural reference for tower generation, not as a reason to
change this project's completed-layer timing contract.

## Validation Before Printing

Inspect exported G-code for:

- Off: zero ESP32 frame macros;
- Traditional: exactly one `M400 -> ESP32_TIMELAPSE_SHOT -> G4` block per layer;
- Smooth: one physical tower, one frame per completed layer, safe raised return,
  and final purge before the final frame;
- no duplicate `CYBERBRICK_SHOT` plus `ESP32_TIMELAPSE_SHOT` calls for one layer.

Then run the ESP32 in dry-run on a short real print before arming.

