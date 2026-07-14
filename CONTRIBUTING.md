# Contributing

## Scope

Changes should preserve both hardware routes, the canonical `ESP32_TIMELAPSE_SHOT` protocol, and documented compatibility aliases. Do not remove a legacy alias without a migration release.

## Development

1. Create a focused branch.
2. Add or update a failing test before changing behavior.
3. Keep S3 startup and serial connection unarmed.
4. Never commit real Wi-Fi credentials, private printer addresses, Bluetooth addresses, photos, logs, or local machine paths.
5. Run the relevant Python and Node tests, firmware build for firmware changes, and browser smoke for configurator changes.

Configurator checks:

```powershell
cd apps/klipper-timelapse-configurator
npm test
npm run smoke:workflow
```

Repository checks:

```powershell
node --test tests/repository_publication_policy.test.mjs
python -m pytest -q tests/test_board_file_contents.py tests/test_board_listener.py tests/test_cyberbrick_fs.py tests/test_esp32_timelapse_fs.py tests/test_moonraker_agent_protocol.py
cd apps/klipper-timelapse-configurator
npm run verify:release
```

`verify:release` is non-hardware: it does not open a serial port, arm a shutter, or upload firmware. It builds the ESP32-S3 image and public release assets locally.

## Pull Requests

Describe the hardware route, safety impact, compatibility impact, verification commands, and any real-hardware test that was intentionally not run. Preserve unrelated worktree changes and avoid mixing firmware, slicer, and documentation refactors unless the contract requires all three.

中文贡献说明：所有会影响真实快门的改动都必须先覆盖 dry-run；提交内容不得包含家庭网络、相机地址、打印机备份或本机路径。

## License

By submitting a contribution, you certify that you have the right to submit it and agree that it is licensed under `GPL-3.0-only`, the same license as this project. Do not submit code whose license is incompatible with GPLv3.

提交贡献即表示你确认有权提交，并同意该贡献按本项目相同的 `GPL-3.0-only` 许可证发布。不要提交与 GPLv3 不兼容的代码。
