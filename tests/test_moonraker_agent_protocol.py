from __future__ import annotations

import importlib
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEVICE_FILES = ROOT / "device_files"


def import_agent(monkeypatch):
    monkeypatch.syspath_prepend(str(DEVICE_FILES))
    sys.modules.pop("moonraker_agent", None)
    return importlib.import_module("moonraker_agent")


def test_build_handshake_request_uses_moonraker_websocket_headers(monkeypatch):
    agent = import_agent(monkeypatch)

    request = agent.build_handshake_request("192.0.2.10", 7125, "/websocket", "test-key")

    assert request.startswith(b"GET /websocket HTTP/1.1\r\n")
    assert b"Host: 192.0.2.10:7125\r\n" in request
    assert b"Upgrade: websocket\r\n" in request
    assert b"Connection: Upgrade\r\n" in request
    assert b"Sec-WebSocket-Key: test-key\r\n" in request
    assert request.endswith(b"\r\n\r\n")


def test_encode_client_text_frame_masks_payload(monkeypatch):
    agent = import_agent(monkeypatch)

    frame = agent.encode_client_text_frame("hi", mask=b"\x01\x02\x03\x04")

    assert frame[:2] == b"\x81\x82"
    assert frame[2:6] == b"\x01\x02\x03\x04"
    assert frame[6:] == bytes([ord("h") ^ 1, ord("i") ^ 2])


def test_recv_text_frame_replies_to_ping_with_masked_pong(monkeypatch):
    agent = import_agent(monkeypatch)
    monkeypatch.setattr(agent.os, "urandom", lambda size: b"\x01\x02\x03\x04")

    class FakeSocket:
        def __init__(self):
            self.data = bytearray(b"\x89\x02hi")
            self.sent = []

        def recv(self, size):
            chunk = self.data[:size]
            del self.data[:size]
            return bytes(chunk)

        def send(self, payload):
            self.sent.append(payload)

    sock = FakeSocket()

    assert agent.recv_text_frame(sock) is None
    assert sock.sent == [
        b"\x8a\x82\x01\x02\x03\x04" + bytes([ord("h") ^ 1, ord("i") ^ 2])
    ]


def test_recv_response_skips_notifications(monkeypatch):
    agent = import_agent(monkeypatch)
    messages = iter(
        [
            {"jsonrpc": "2.0", "method": "notify_agent_event", "params": []},
            {"jsonrpc": "2.0", "result": "ok", "id": 7},
        ]
    )
    monkeypatch.setattr(agent, "recv_json", lambda sock: next(messages))

    assert agent.recv_response(object(), 7) == {"jsonrpc": "2.0", "result": "ok", "id": 7}


def test_agent_exposes_canonical_and_legacy_remote_methods(monkeypatch):
    agent = import_agent(monkeypatch)

    assert agent.REMOTE_METHODS == (
        "esp32_timelapse_trigger",
        "cyberbrick_shutter_trigger",
    )
    assert agent.DEFAULT_METHOD == "esp32_timelapse_trigger"
