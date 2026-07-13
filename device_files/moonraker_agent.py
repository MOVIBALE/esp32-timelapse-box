"""MicroPython Moonraker WebSocket agent for an ESP32 timelapse shutter.

This file is not autostarted by itself. Keep stock boot.py unchanged. The old
CyberBrick method remains registered as a compatibility alias.
"""

import json
import os
import socket
import time

try:
    import binascii
except ImportError:
    import ubinascii as binascii


DEFAULT_HOST = "printer.local"
DEFAULT_PORT = 7125
DEFAULT_PATH = "/websocket"
DEFAULT_AGENT_NAME = "esp32_timelapse_box"
DEFAULT_VERSION = "0.1"
REMOTE_METHODS = (
    "esp32_timelapse_trigger",
    "cyberbrick_shutter_trigger",
)
DEFAULT_METHOD = REMOTE_METHODS[0]
DEFAULT_MIN_TRIGGER_INTERVAL_MS = 1000
BUTTON_PIN = 7
DEFAULT_PRESS_MS = 180
DEFAULT_RELEASE_MS = 50


U1_SUBSCRIPTION_OBJECTS = {
    "webhooks": ["state"],
    "print_stats": ["state", "filename", "info"],
    "timelapse": ["is_active"],
    "virtual_sdcard": ["is_active", "progress", "file_position", "file_size"],
    "exception_manager": ["exceptions"],
}


def _tobytes(value):
    if isinstance(value, bytes):
        return value
    return value.encode("utf-8")


def _b64(data):
    encoded = binascii.b2a_base64(data)
    return encoded.strip().decode("ascii")


def build_handshake_request(host, port, path, key):
    lines = [
        "GET %s HTTP/1.1" % path,
        "Host: %s:%s" % (host, port),
        "Upgrade: websocket",
        "Connection: Upgrade",
        "Sec-WebSocket-Key: %s" % key,
        "Sec-WebSocket-Version: 13",
        "",
        "",
    ]
    return _tobytes("\r\n".join(lines))


def encode_client_frame(payload, opcode=1, mask=None):
    payload = _tobytes(payload)
    length = len(payload)
    if mask is None:
        mask = os.urandom(4)
    if length < 126:
        header = bytes([0x80 | opcode, 0x80 | length])
    elif length < 65536:
        header = bytes([0x80 | opcode, 0x80 | 126, (length >> 8) & 0xFF, length & 0xFF])
    else:
        raise ValueError("websocket payload too large")
    masked = bytearray(length)
    for index in range(length):
        masked[index] = payload[index] ^ mask[index % 4]
    return header + mask + bytes(masked)


def encode_client_text_frame(text, mask=None):
    return encode_client_frame(text, 1, mask)


def encode_client_pong_frame(payload=b"", mask=None):
    return encode_client_frame(payload, 10, mask)


def _recv_exact(sock, size):
    data = b""
    while len(data) < size:
        chunk = sock.recv(size - len(data))
        if not chunk:
            raise OSError("socket closed")
        data += chunk
    return data


def recv_text_frame(sock):
    header = _recv_exact(sock, 2)
    opcode = header[0] & 0x0F
    masked = bool(header[1] & 0x80)
    length = header[1] & 0x7F
    if length == 126:
        ext = _recv_exact(sock, 2)
        length = (ext[0] << 8) | ext[1]
    elif length == 127:
        raise ValueError("large websocket frames unsupported")
    mask = b""
    if masked:
        mask = _recv_exact(sock, 4)
    payload = bytearray(_recv_exact(sock, length))
    if masked:
        for index in range(length):
            payload[index] ^= mask[index % 4]
    if opcode == 8:
        raise OSError("websocket closed")
    if opcode == 9:
        sock.send(encode_client_pong_frame(bytes(payload)))
        return None
    if opcode == 10:
        return None
    if opcode != 1:
        return None
    return bytes(payload).decode("utf-8")


def send_json(sock, payload):
    sock.send(encode_client_text_frame(json.dumps(payload)))


def recv_json(sock):
    while True:
        text = recv_text_frame(sock)
        if text:
            return json.loads(text)


def recv_response(sock, req_id):
    while True:
        message = recv_json(sock)
        if message.get("id") == req_id:
            return message


def build_u1_subscription_request(req_id):
    return {
        "jsonrpc": "2.0",
        "id": req_id,
        "method": "printer.objects.subscribe",
        "params": {"objects": U1_SUBSCRIPTION_OBJECTS},
    }


def subscribe_u1_status(sock, req_id=3):
    send_json(sock, build_u1_subscription_request(req_id))
    return recv_response(sock, req_id)


def extract_status_update(message):
    result = message.get("result")
    if result and "status" in result:
        return result.get("status")
    if message.get("method") == "notify_status_update":
        params = message.get("params") or []
        if params:
            return params[0]
    return None


def _merge_dict(target, update):
    for key, value in update.items():
        current = target.get(key)
        if isinstance(current, dict) and isinstance(value, dict):
            _merge_dict(current, value)
        else:
            target[key] = value


def merge_status_update(snapshot, update):
    for object_name, fields in update.items():
        current = snapshot.get(object_name)
        if isinstance(current, dict) and isinstance(fields, dict):
            _merge_dict(current, fields)
        else:
            snapshot[object_name] = fields
    return snapshot


def handle_status_update(policy, snapshot, update, now_ms, dry_run=False, trigger_fn=None):
    merge_status_update(snapshot, update)
    event = policy.update(snapshot, now_ms)
    if not event:
        return None
    if dry_run:
        event["trigger_result"] = "DRY_RUN"
        return event
    if trigger_fn is None:
        trigger_fn = trigger_shutter
    event["trigger_result"] = trigger_fn()
    return event


def _get_current_layer(status):
    info = (status.get("print_stats") or {}).get("info") or {}
    return info.get("current_layer")


def _get_total_layer(status):
    info = (status.get("print_stats") or {}).get("info") or {}
    return info.get("total_layer")


def _has_exceptions(status):
    exceptions = (status.get("exception_manager") or {}).get("exceptions") or []
    return bool(exceptions)


class U1LayerShutterPolicy:
    def __init__(self, min_interval_ms=DEFAULT_MIN_TRIGGER_INTERVAL_MS):
        self.min_interval_ms = min_interval_ms
        self.filename = None
        self.last_layer = None
        self.last_trigger_ms = None
        self.disabled_for_current_print = False

    def _reset_for_print(self, filename):
        if filename != self.filename:
            self.filename = filename
            self.last_layer = None
            self.last_trigger_ms = None
            self.disabled_for_current_print = False

    def update(self, status, now_ms):
        print_stats = status.get("print_stats") or {}
        filename = print_stats.get("filename")
        self._reset_for_print(filename)

        state = print_stats.get("state")
        if state != "printing":
            self.last_layer = None
            self.last_trigger_ms = None
            self.disabled_for_current_print = False
            return None

        if (status.get("webhooks") or {}).get("state") not in (None, "ready"):
            return None

        if not (status.get("timelapse") or {}).get("is_active"):
            return None
        if not (status.get("virtual_sdcard") or {}).get("is_active"):
            return None

        if _has_exceptions(status):
            self.disabled_for_current_print = True
            return None
        if self.disabled_for_current_print:
            return None

        layer = _get_current_layer(status)
        if layer is None:
            return None
        if layer <= 0:
            self.last_layer = layer
            return None

        if self.last_layer is None:
            self.last_layer = layer
            return None
        if layer <= self.last_layer:
            return None

        if (
            self.last_trigger_ms is not None
            and now_ms - self.last_trigger_ms < self.min_interval_ms
        ):
            self.last_layer = layer
            return None

        self.last_layer = layer
        self.last_trigger_ms = now_ms
        return {
            "action": "trigger",
            "filename": filename,
            "layer": layer,
            "total_layer": _get_total_layer(status),
            "reason": "layer_changed",
        }


def websocket_connect(host=DEFAULT_HOST, port=DEFAULT_PORT, path=DEFAULT_PATH):
    addr = socket.getaddrinfo(host, port)[0][-1]
    sock = socket.socket()
    sock.connect(addr)
    key = _b64(os.urandom(16))
    sock.send(build_handshake_request(host, port, path, key))
    response = b""
    while b"\r\n\r\n" not in response:
        response += sock.recv(256)
        if len(response) > 2048:
            raise OSError("websocket handshake too large")
    if b" 101 " not in response.split(b"\r\n", 1)[0]:
        raise OSError("websocket handshake failed: " + response[:80].decode("utf-8", "replace"))
    return sock


def connect_wifi(ssid, password="", timeout_s=15):
    import network

    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if not wlan.isconnected():
        wlan.connect(ssid, password)
        deadline = time.time() + timeout_s
        while not wlan.isconnected() and time.time() < deadline:
            time.sleep_ms(200)
    return wlan.isconnected(), wlan.ifconfig()


def identify(sock, name=DEFAULT_AGENT_NAME, version=DEFAULT_VERSION):
    send_json(
        sock,
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "server.connection.identify",
            "params": {
                "client_name": name,
                "version": version,
                "type": "agent",
                "url": "https://github.com/MOVIBALE/esp32-timelapse-box",
            },
        },
    )
    return recv_response(sock, 1)


def register_remote_method(sock, method=DEFAULT_METHOD, request_id=2):
    send_json(
        sock,
        {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": "connection.register_remote_method",
            "params": {"method_name": method},
        },
    )
    return recv_response(sock, request_id)


def register_remote_methods(sock, methods=REMOTE_METHODS):
    return [
        register_remote_method(sock, method, request_id=2 + index)
        for index, method in enumerate(methods)
    ]


def _sleep_ms(ms):
    try:
        time.sleep_ms(ms)
    except AttributeError:
        time.sleep(ms / 1000)


def trigger_gpio7(duration_ms=DEFAULT_PRESS_MS):
    try:
        from machine import Pin

        mode = getattr(Pin, "OPEN_DRAIN", Pin.OUT)
        pin = Pin(BUTTON_PIN, mode, value=0)
        _sleep_ms(duration_ms)
        pin.init(Pin.IN)
        _sleep_ms(DEFAULT_RELEASE_MS)
        return "OK TRIGGER_GPIO7_{}MS".format(duration_ms)
    except Exception as exc:
        return "ERR TRIGGER_FAILED {}: {}".format(type(exc).__name__, exc)


def trigger_shutter():
    try:
        import klipper_bridge

        return klipper_bridge.trigger()
    except ImportError:
        return trigger_gpio7()
    except AttributeError:
        return trigger_gpio7()


def _normalize_methods(methods):
    if methods is None:
        return REMOTE_METHODS
    if isinstance(methods, str):
        return (methods,)
    return tuple(methods)


def serve(sock, methods=REMOTE_METHODS):
    methods = _normalize_methods(methods)
    while True:
        message = recv_json(sock)
        if message.get("method") not in methods:
            continue
        result = trigger_shutter()
        if "id" in message:
            send_json(sock, {"jsonrpc": "2.0", "id": message["id"], "result": result})


def run(ssid=None, password="", host=DEFAULT_HOST, port=DEFAULT_PORT, method=None):
    if ssid:
        ok, config = connect_wifi(ssid, password)
        if not ok:
            raise OSError("wifi connect failed: %r" % (config,))
    sock = websocket_connect(host, port)
    print("IDENTIFY", identify(sock))
    methods = _normalize_methods(method)
    print("REGISTER", register_remote_methods(sock, methods))
    serve(sock, methods)
