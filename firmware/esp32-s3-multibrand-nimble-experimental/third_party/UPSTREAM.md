# Furble-derived camera core

The files under `lib/furble/src` and `lib/blowfish/src` are derived from:

- Project: Furble
- Repository: https://github.com/gkoh/furble
- Commit: `246de0861b8907a68eec3f2496dcfc666f41816b`
- Upstream version: `v3.9.0-1-g246de08`
- License: MIT, reproduced in `FURBLE-LICENSE.txt`

Local changes remove the M5 display application, exclude Sony/FauxNY drivers,
add a serial command shell, avoid duplicate scan entries, and replace Ricoh's
automatic numeric-comparison acceptance with explicit serial approval.
