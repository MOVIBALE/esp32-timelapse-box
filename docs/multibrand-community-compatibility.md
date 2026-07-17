# Multi-brand BLE Probe Compatibility Matrix

This matrix separates source-level evidence from physical camera validation.
No untested row is a compatibility promise.

| Protocol route | Frozen upstream implementation | Local compile/contracts | Local physical test | Community result |
| --- | --- | --- | --- | --- |
| Canon BR-E1 remote | Furble | Pass | Not tested | Needed |
| Canon smart-device | Furble | Pass | Not tested | Needed |
| Fujifilm basic token | Furble | Pass | Not tested | Needed |
| Fujifilm secure | Furble | Pass | Not tested | Needed |
| Nikon ML-L7 remote | Furble | Pass | Not tested | Needed |
| Ricoh GR candidate | Furble-derived; local explicit approval | Pass | Not tested | Needed |
| Sony ZV-E10 | Separate stable Bluedroid route | Pass | Pass | Stable route only |

Evidence labels:

- **Protocol imported:** source and offline contract tests pass.
- **Community reported:** one complete report exists but is not reproduced.
- **Validated:** first pairing, one-shot capture, and power-cycle reconnect were
  confirmed on physical hardware with probe version and camera firmware noted.
- **Unsupported:** reproducible evidence shows this protocol route cannot work.

New camera results belong in the repository's **Multi-brand camera hardware
test** issue form. Reports must include exact camera model and firmware because
models from the same brand may use different BLE behavior.
