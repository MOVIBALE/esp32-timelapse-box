from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "device_files" / "u1_bridge_config.json"
BOARD_MAIN = ROOT / "device_files" / "board_main.py"
BOARD_LISTENER_CONFIG = ROOT / "device_files" / "board_listener_config.json"


def test_default_json_starts_disabled_and_dry_run():
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))

    assert cfg["enabled"] is False
    assert cfg["dry_run"] is True
    assert cfg["u1_host"] == "printer.local"
    assert cfg["wifi_ssid"] == ""


def test_board_main_waits_and_imports_board_listener():
    text = BOARD_MAIN.read_text(encoding="utf-8")
    assert "STARTUP_DELAY_MS" in text
    assert "import board_listener" in text
    assert "boot.py" not in text.lower()


def test_board_listener_config_starts_disabled_and_dry_run():
    cfg = json.loads(BOARD_LISTENER_CONFIG.read_text(encoding="utf-8"))
    assert cfg["enabled"] is False
    assert cfg["dry_run"] is True
    assert cfg["wifi_ssid"] == ""
    assert cfg["wifi_password"] == ""
    assert cfg["u1_host"] == "printer.local"
