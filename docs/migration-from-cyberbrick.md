# Migration From Earlier CyberBrick Naming

This migration changes public naming and protocol preference without breaking
an already working installation.

## Safe Order

1. Back up the current Klipper configuration and board files.
2. Install `config/klipper/esp32_timelapse.cfg` with both macro names present.
3. Update the ESP32 firmware or C3 listener.
4. Update the browser configurator.
5. Update the slicer last so it emits `ESP_TIMELAPSE_SHOT`.
6. Return to dry-run and validate a short real print before arming again.

The rule is **canonical first** / **规范名称优先**: new output uses
`ESP_TIMELAPSE_SHOT`, `esp32_timelapse_trigger`,
`esp32_timelapse_fs.py`, and `ESP32_TIMELAPSE_WIFI_PASS`. Readers accept the old
names as a fallback.

Development builds briefly emitted `ESP32_TIMELAPSE_SHOT`. Do not keep that
command in a profile: the U1 Klipper parser reads it as `ESP32` and reports an
unknown command. Update the Klipper macro, firmware, and slicer together.

Do not remove / 不要删除 `CYBERBRICK_SHOT` from Klipper while any installed
slicer profile or old firmware may still use it. Do not remove the C3 legacy
method until all agents have migrated. Both aliases share a sequence and are
safe to keep during transition.

## Rollback / 回滚

If canonical events are not observed, disarm first. Restore the previous board
image or files, keep the dual-name Klipper macro, and switch the slicer back to
its previous output. A rollback must also repeat dry-run; an old bond or old
configuration is not evidence that armed behavior is still safe.
