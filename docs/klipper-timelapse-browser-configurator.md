# Browser Configurator

The ESP32 Timelapse Box configurator is a static bilingual application under
`apps/klipper-timelapse-configurator/`. It uses Web Serial directly and does not
require Electron or a resident PC listener.

## Launch

- Windows: `START-WINDOWS.cmd`
- macOS: `START-MAC.command`
- development: run the app's local server and open `http://127.0.0.1:8776/`

Use Chrome or Edge. Web Serial requires localhost or HTTPS and always shows a
browser-controlled port picker; the page cannot silently choose a COM port.

## Hardware Routes

### ESP32-S3 + Sony BLE

The page sends the firmware's safe serial protocol:

- provision network while staying dry-run;
- **Pair Sony for first use** (`q`) with no shutter write;
- **Connect paired Sony** (`b`) on later boots;
- read Sony and Moonraker status (`s`, `p`);
- lock to dry-run (`d`);
- arm (`a`) only after the full gate passes.

The armed button stays disabled until a real dry-run event has been observed,
Sony reports `ready=true`, and the exact phrase `ARM DRY-RUN VERIFIED` is
present.

### Compatible ESP32-C3

The page enters MicroPython raw REPL on behalf of the user and writes only the
approved listener files. The initial config is `enabled=false, dry_run=true`.
HTTP polling, WebSocket agent, and automatic fallback are available. Recovery
deletes `main.py`; it does not modify `boot.py`.

## Beginner-Facing Behavior

- Chinese and English cover static UI, operation status, Sony pairing, logs,
  errors, and tutorial steps.
- Fast raw output is translated into stable explanations and a five-step
  checklist.
- Diagnostics redact Wi-Fi password, SSID, private IPv4 addresses, and device
  addresses.
- The hardware route is selected before actions, and routes cannot be switched
  while a serial connection is open.
- Concurrent serial operations are rejected.

## Verification

Run:

```text
npm test
npm run smoke:workflow
npm run smoke:screenshots
```

The workflow smoke uses fake Web Serial in real Chrome. It exercises both the
ESP32-S3 + Sony BLE route and the Compatible ESP32-C3 route without using real
hardware. The S3 smoke checks that pairing sends `q` while manual shutter `t`
and armed `a` are absent.

