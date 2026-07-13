from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "device_files" / "board_listener.py"


def load_module():
    spec = importlib.util.spec_from_file_location("board_listener", MODULE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_default_config_starts_disabled_and_dry_run():
    listener = load_module()
    cfg = listener.default_config()
    assert cfg["enabled"] is False
    assert cfg["dry_run"] is True
    assert cfg["mode"] == "http_poll"
    assert cfg["u1_host"] == "printer.local"
    assert cfg["poll_interval_ms"] == 500


def status(layer, filename="part.gcode", state="printing", timelapse=True):
    return {
        "print_stats": {
            "state": state,
            "filename": filename,
            "info": {"current_layer": layer, "total_layer": 10},
        },
        "timelapse": {"is_active": timelapse},
        "virtual_sdcard": {"is_active": True},
        "webhooks": {"state": "ready"},
        "exception_manager": {"exceptions": []},
    }


def test_policy_uses_first_layer_as_baseline_then_triggers_on_next_layer():
    listener = load_module()
    policy = listener.LayerPolicy(min_interval_ms=0)
    assert policy.update(status(86), now_ms=1000) is None
    event = policy.update(status(87), now_ms=1500)
    assert event["layer"] == 87
    assert event["reason"] == "layer_changed"


def test_policy_does_not_trigger_when_timelapse_inactive():
    listener = load_module()
    policy = listener.LayerPolicy(min_interval_ms=0)
    assert policy.update(status(1, timelapse=False), now_ms=1000) is None


def test_handle_event_dry_run_does_not_call_trigger():
    listener = load_module()
    calls = []
    event = {"layer": 2}
    result = listener.handle_trigger_event(event, dry_run=True, trigger_fn=lambda: calls.append("trigger"))
    assert result["trigger_result"] == "DRY_RUN"
    assert calls == []


def test_trigger_gpio7_uses_open_drain_low_then_input_release():
    listener = load_module()
    calls = []
    sleeps = []
    listener.install_test_pin_and_sleep(calls, sleeps)
    assert listener.trigger_gpio7(180, 120) == "OK TRIGGER_GPIO7_180MS"
    assert calls == [("construct", 7, "OPEN_DRAIN", 0), ("init", 7, "IN", None)]
    assert sleeps == [180, 120]


def test_normalize_mode_accepts_known_modes_and_defaults_unknown():
    listener = load_module()
    assert listener.normalize_mode("http_poll") == "http_poll"
    assert listener.normalize_mode("websocket_agent") == "websocket_agent"
    assert listener.normalize_mode("auto") == "auto"
    assert listener.normalize_mode("bad") == "http_poll"


def test_select_backend_runner_returns_named_runner():
    listener = load_module()
    calls = []

    def http_runner(config, runtime):
        calls.append(("http", config["mode"]))

    def websocket_runner(config, runtime):
        calls.append(("ws", config["mode"]))

    config = listener.merge_config({"mode": "websocket_agent"})
    runtime = {}
    runner = listener.select_backend_runner(
        config,
        http_runner=http_runner,
        websocket_runner=websocket_runner,
        auto_runner=lambda cfg, rt: calls.append(("auto", cfg["mode"])),
    )
    runner(config, runtime)
    assert calls == [("ws", "websocket_agent")]


def test_parse_moonraker_response_extracts_status():
    listener = load_module()
    text = (
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n"
        '{"result":{"status":{"print_stats":{"state":"printing","info":{"current_layer":3}}}}}'
    )
    status_data = listener.parse_moonraker_response(text)
    assert status_data["print_stats"]["state"] == "printing"
    assert status_data["print_stats"]["info"]["current_layer"] == 3


def test_build_websocket_handshake_contains_required_headers():
    listener = load_module()
    request, key = listener.build_websocket_handshake(
        "192.0.2.10", "/websocket", random_bytes=b"abcdefghijklmnop"
    )
    text = request.decode("utf-8")
    assert "GET /websocket HTTP/1.1\r\n" in text
    assert "Host: 192.0.2.10:7125\r\n" in text
    assert "Upgrade: websocket\r\n" in text
    assert "Connection: Upgrade\r\n" in text
    assert "Sec-WebSocket-Key: " in text
    assert key


def test_websocket_agent_messages_register_canonical_and_legacy_remote_methods():
    listener = load_module()
    identify = listener.build_identify_message("esp32_timelapse_box", "0.1")
    registers = listener.build_register_method_messages()

    assert listener.REMOTE_METHODS == (
        "esp32_timelapse_trigger",
        "cyberbrick_shutter_trigger",
    )
    assert identify["method"] == "server.connection.identify"
    assert identify["params"]["type"] == "agent"
    assert identify["params"]["client_name"] == "esp32_timelapse_box"
    assert [item["id"] for item in registers] == [2, 3]
    assert all(item["method"] == "connection.register_remote_method" for item in registers)
    assert [item["params"]["method_name"] for item in registers] == list(listener.REMOTE_METHODS)


def test_trigger_deduper_allows_one_event_per_file_layer():
    listener = load_module()
    deduper = listener.TriggerDeduper(limit=4)
    event = {"filename": "part.gcode", "layer": 3}
    assert deduper.allow(event) is True
    assert deduper.allow(dict(event)) is False
    assert deduper.allow({"filename": "part.gcode", "layer": 4}) is True


def test_auto_mode_prefers_websocket_when_connected_otherwise_http():
    listener = load_module()
    calls = []

    def http_runner(config, runtime):
        calls.append("http")

    def websocket_runner(config, runtime):
        calls.append("ws")

    config = listener.default_config()
    runtime = {"websocket_connected": True}
    listener.run_auto_backend(config, runtime, http_runner, websocket_runner)
    runtime["websocket_connected"] = False
    listener.run_auto_backend(config, runtime, http_runner, websocket_runner)
    assert calls == ["ws", "http"]


def test_main_returns_disabled_without_running_backend():
    listener = load_module()
    calls = []
    result = listener.main(
        config={"enabled": False},
        runtime={"http_runner": lambda config, runtime: calls.append("http")},
    )
    assert result == "DISABLED"
    assert calls == []


def test_run_http_poll_backend_triggers_once_on_layer_change():
    listener = load_module()
    statuses = iter([status(1), status(2), status(2)])
    now_values = iter([1000, 2000, 3000])
    calls = []
    config = listener.merge_config({"enabled": True, "dry_run": False})
    runtime = {
        "query_fn": lambda host: next(statuses),
        "now_ms": lambda: next(now_values),
        "sleep_ms": lambda ms: None,
        "max_iterations": 3,
        "trigger_fn": lambda: calls.append("trigger") or "OK GPIO7",
    }

    events = listener.run_http_poll_backend(config, runtime)

    assert [event["layer"] for event in events] == [2]
    assert events[0]["trigger_result"] == "OK GPIO7"
    assert calls == ["trigger"]


def test_run_websocket_backend_handles_remote_method_dry_run():
    listener = load_module()
    sent = []
    config = listener.merge_config({"enabled": True, "dry_run": True, "mode": "websocket_agent"})
    runtime = {
        "socket": object(),
        "skip_registration": True,
        "max_iterations": 1,
        "recv_json": lambda sock: {
            "jsonrpc": "2.0",
            "id": 9,
            "method": "cyberbrick_shutter_trigger",
            "params": {"filename": "part.gcode", "layer": 7},
        },
        "send_json": lambda sock, payload: sent.append(payload),
    }

    events = listener.run_websocket_backend(config, runtime)

    assert events[0]["layer"] == 7
    assert events[0]["trigger_result"] == "DRY_RUN"
    assert sent == [{"jsonrpc": "2.0", "id": 9, "result": "DRY_RUN"}]


def test_run_websocket_backend_dedupes_the_same_event_across_both_method_names():
    listener = load_module()
    sent = []
    messages = iter(
        [
            {
                "jsonrpc": "2.0",
                "id": 10,
                "method": "esp32_timelapse_trigger",
                "params": {"filename": "part.gcode", "layer": 8},
            },
            {
                "jsonrpc": "2.0",
                "id": 11,
                "method": "cyberbrick_shutter_trigger",
                "params": {"filename": "part.gcode", "layer": 8},
            },
        ]
    )
    config = listener.merge_config(
        {"enabled": True, "dry_run": True, "mode": "websocket_agent"}
    )
    runtime = {
        "socket": object(),
        "skip_registration": True,
        "max_iterations": 2,
        "recv_json": lambda sock: next(messages),
        "send_json": lambda sock, payload: sent.append(payload),
    }

    events = listener.run_websocket_backend(config, runtime)

    assert len(events) == 1
    assert events[0]["layer"] == 8
    assert sent == [
        {"jsonrpc": "2.0", "id": 10, "result": "DRY_RUN"},
        {"jsonrpc": "2.0", "id": 11, "result": "DUPLICATE"},
    ]


def test_run_websocket_backend_registers_both_method_names():
    listener = load_module()
    sent = []
    responses = iter(
        [
            {"jsonrpc": "2.0", "id": 1, "result": "ok"},
            {"jsonrpc": "2.0", "id": 2, "result": "ok"},
            {"jsonrpc": "2.0", "id": 3, "result": "ok"},
            {"jsonrpc": "2.0", "method": "notify_status_update", "params": []},
        ]
    )
    config = listener.merge_config(
        {"enabled": True, "dry_run": True, "mode": "websocket_agent"}
    )
    runtime = {
        "socket": object(),
        "max_iterations": 1,
        "recv_json": lambda sock: next(responses),
        "send_json": lambda sock, payload: sent.append(payload),
    }

    listener.run_websocket_backend(config, runtime)

    assert [payload.get("params", {}).get("method_name") for payload in sent[1:]] == [
        "esp32_timelapse_trigger",
        "cyberbrick_shutter_trigger",
    ]
