from __future__ import annotations

import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "tools" / "cyberbrick_fs.py"
CANONICAL_MODULE = ROOT / "tools" / "esp32_timelapse_fs.py"


def load_module():
    spec = importlib.util.spec_from_file_location("cyberbrick_fs", MODULE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_canonical_module():
    spec = importlib.util.spec_from_file_location("esp32_timelapse_fs_test", CANONICAL_MODULE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_legacy_module_forwards_the_canonical_public_api():
    legacy = load_module()
    canonical = load_canonical_module()

    for name in [
        "main",
        "open_serial_no_reset",
        "build_board_listener_config",
        "upload_board_listener",
        "resolve_wifi_password",
    ]:
        assert callable(getattr(legacy, name))
        assert getattr(legacy, name).__name__ == getattr(canonical, name).__name__


def test_build_board_listener_config_stays_disabled_and_dry_run():
    cyberbrick_fs = load_module()
    text = cyberbrick_fs.build_board_listener_config(
        "TestSSID", "secret", "192.0.2.10", mode="websocket_agent"
    )
    cfg = json.loads(text)
    assert cfg["wifi_ssid"] == "TestSSID"
    assert cfg["wifi_password"] == "secret"
    assert cfg["u1_host"] == "192.0.2.10"
    assert cfg["mode"] == "websocket_agent"
    assert cfg["enabled"] is False
    assert cfg["dry_run"] is True


def test_upload_board_listener_writes_config_listener_then_main(monkeypatch):
    cyberbrick_fs = load_module()
    writes = []

    class FakeSerial:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(cyberbrick_fs, "open_serial_no_reset", lambda port, baud: FakeSerial())
    monkeypatch.setattr(cyberbrick_fs, "enter_raw_repl", lambda ser: "")
    monkeypatch.setattr(cyberbrick_fs, "read_device_info", lambda ser: "")
    monkeypatch.setattr(cyberbrick_fs, "list_files", lambda ser: "")
    monkeypatch.setattr(cyberbrick_fs, "leave_raw_repl", lambda ser: "")
    monkeypatch.setattr(cyberbrick_fs, "write_text_file", lambda ser, path, text: writes.append(path))

    cyberbrick_fs.upload_board_listener(
        "COM_TEST", 921600, "TestSSID", "secret", "192.0.2.10", reset=False
    )

    assert writes == ["/board_listener_config.json", "/board_listener.py", "/main.py"]
