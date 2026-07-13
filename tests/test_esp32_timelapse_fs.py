from __future__ import annotations

import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "tools" / "esp32_timelapse_fs.py"


def load_module():
    spec = importlib.util.spec_from_file_location("esp32_timelapse_fs", MODULE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_password_env_prefers_canonical_name(monkeypatch):
    fs = load_module()
    monkeypatch.setenv("ESP32_TIMELAPSE_WIFI_PASS", "canonical")
    monkeypatch.setenv("CYBERBRICK_WIFI_PASS", "legacy")

    assert fs.resolve_wifi_password(None) == "canonical"
    assert fs.resolve_wifi_password("argument") == "argument"


def test_password_env_falls_back_to_legacy_name(monkeypatch):
    fs = load_module()
    monkeypatch.delenv("ESP32_TIMELAPSE_WIFI_PASS", raising=False)
    monkeypatch.setenv("CYBERBRICK_WIFI_PASS", "legacy")

    assert fs.resolve_wifi_password(None) == "legacy"


def test_canonical_tool_builds_a_shareable_safe_config():
    fs = load_module()
    text = fs.build_board_listener_config(
        "TestSSID", "secret", "printer.local", mode="auto"
    )
    config = json.loads(text)

    assert config["wifi_ssid"] == "TestSSID"
    assert config["wifi_password"] == "secret"
    assert config["u1_host"] == "printer.local"
    assert config["mode"] == "auto"
    assert config["enabled"] is False
    assert config["dry_run"] is True


def test_canonical_defaults_do_not_embed_the_local_printer_address():
    fs = load_module()

    assert fs.DEFAULT_HOST == "printer.local"

