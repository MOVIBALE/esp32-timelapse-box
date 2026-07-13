"""Board-resident Klipper listener for a compatible ESP32-C3 shutter box.

This module is meant to be started by a recoverable ``main.py`` shim after the
stock ``boot.py`` has initialized the original shutter service. Legacy
CyberBrick hardware remains supported through explicit compatibility aliases.
"""

import json
import time


CONFIG_PATH = "/board_listener_config.json"
BUTTON_PIN = 7
DEFAULT_PORT = 7125
DEFAULT_WEBSOCKET_PATH = "/websocket"
REMOTE_METHODS = (
    "esp32_timelapse_trigger",
    "cyberbrick_shutter_trigger",
)
DEFAULT_REMOTE_METHOD = REMOTE_METHODS[0]
EVENT_MARKER = "__BOARD_LISTENER_EVENT__"
READY_MARKER = "__BOARD_LISTENER_READY__"
ERROR_MARKER = "__BOARD_LISTENER_ERROR__"
STATUS_QUERY = (
    "/printer/objects/query?"
    "print_stats&timelapse&virtual_sdcard&exception_manager&webhooks"
)

DEFAULT_CONFIG = {
    "enabled": False,
    "dry_run": True,
    "mode": "http_poll",
    "wifi_ssid": "",
    "wifi_password": "",
    "u1_host": "printer.local",
    "poll_interval_ms": 500,
    "min_trigger_interval_ms": 1000,
    "trigger_press_ms": 180,
    "trigger_release_ms": 120,
    "startup_delay_ms": 10000,
}


def now_ms():
    try:
        return time.ticks_ms()
    except AttributeError:
        return int(time.monotonic() * 1000)


def default_config():
    out = {}
    for key, value in DEFAULT_CONFIG.items():
        out[key] = value
    return out


def merge_config(user_config):
    cfg = default_config()
    if user_config:
        for key, value in user_config.items():
            if key in cfg:
                cfg[key] = value
    cfg["mode"] = normalize_mode(cfg.get("mode"))
    return cfg


def load_config(path=CONFIG_PATH):
    try:
        with open(path, "r") as handle:
            return merge_config(json.loads(handle.read()))
    except Exception:
        return default_config()


def normalize_mode(mode):
    if mode in ("http_poll", "websocket_agent", "auto"):
        return mode
    return "http_poll"


def select_backend_runner(config, http_runner, websocket_runner, auto_runner):
    mode = normalize_mode((config or {}).get("mode", "http_poll"))
    if mode == "websocket_agent":
        return websocket_runner
    if mode == "auto":
        return auto_runner
    return http_runner


def run_auto_backend(config, runtime, http_runner, websocket_runner):
    if runtime.get("websocket_connected"):
        return websocket_runner(config, runtime)
    return http_runner(config, runtime)


def _print_json(marker, payload):
    try:
        print(marker + json.dumps(payload))
    except Exception as exc:
        print(marker + repr(payload) + " print_error=" + repr(exc))


def parse_moonraker_response(response_text):
    if "\r\n\r\n" in response_text:
        body = response_text.split("\r\n\r\n", 1)[1]
    elif "\n\n" in response_text:
        body = response_text.split("\n\n", 1)[1]
    else:
        body = response_text
    payload = json.loads(body)
    return payload["result"]["status"]


def build_moonraker_request(host):
    return (
        "GET {} HTTP/1.1\r\n"
        "Host: {}:7125\r\n"
        "Connection: close\r\n"
        "\r\n"
    ).format(STATUS_QUERY, host).encode("utf-8")


def query_moonraker_status(host, port=DEFAULT_PORT):
    import socket

    addr = socket.getaddrinfo(host, port)[0][-1]
    sock = socket.socket()
    try:
        sock.connect(addr)
        sock.send(build_moonraker_request(host))
        chunks = []
        while True:
            chunk = sock.recv(512)
            if not chunk:
                break
            chunks.append(chunk)
    finally:
        try:
            sock.close()
        except Exception:
            pass
    return parse_moonraker_response(b"".join(chunks).decode("utf-8", "replace"))


def _b64encode(data):
    try:
        import binascii

        encoded = binascii.b2a_base64(data).strip()
    except AttributeError:
        import ubinascii as binascii

        encoded = binascii.b2a_base64(data).strip()
    if isinstance(encoded, bytes):
        return encoded.decode("ascii")
    return encoded


def build_websocket_handshake(host, path="/websocket", random_bytes=None):
    if random_bytes is None:
        try:
            random_bytes = __import__("os").urandom(16)
        except Exception:
            random_bytes = b"0123456789abcdef"
    key = _b64encode(random_bytes)
    request = (
        "GET {} HTTP/1.1\r\n"
        "Host: {}:7125\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Key: {}\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "\r\n"
    ).format(path, host, key).encode("utf-8")
    return request, key


def build_identify_message(name="esp32_timelapse_box", version="0.1"):
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "server.connection.identify",
        "params": {
            "client_name": name,
            "version": version,
            "type": "agent",
            "url": "https://github.com/MOVIBALE/esp32-timelapse-box",
        },
    }


def build_register_method_message(method_name=DEFAULT_REMOTE_METHOD, request_id=2):
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "method": "connection.register_remote_method",
        "params": {"method_name": method_name},
    }


def build_register_method_messages(method_names=REMOTE_METHODS, start_id=2):
    return [
        build_register_method_message(method_name, start_id + index)
        for index, method_name in enumerate(method_names)
    ]


def _tobytes(value):
    if isinstance(value, bytes):
        return value
    return value.encode("utf-8")


def encode_client_frame(payload, opcode=1, mask=None):
    payload = _tobytes(payload)
    length = len(payload)
    if mask is None:
        try:
            mask = __import__("os").urandom(4)
        except Exception:
            mask = b"\x00\x00\x00\x00"
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


def recv_response(sock, req_id, recv_json_fn=None):
    if recv_json_fn is None:
        recv_json_fn = recv_json
    while True:
        message = recv_json_fn(sock)
        if message.get("id") == req_id:
            return message


def websocket_connect(host, port=DEFAULT_PORT, path=DEFAULT_WEBSOCKET_PATH):
    import socket

    addr = socket.getaddrinfo(host, port)[0][-1]
    sock = socket.socket()
    sock.connect(addr)
    request, _key = build_websocket_handshake(host, path)
    sock.send(request)
    response = b""
    while b"\r\n\r\n" not in response:
        response += sock.recv(256)
        if len(response) > 2048:
            raise OSError("websocket handshake too large")
    if b" 101 " not in response.split(b"\r\n", 1)[0]:
        raise OSError("websocket handshake failed")
    return sock


def _current_layer(status):
    info = (status.get("print_stats") or {}).get("info") or {}
    return info.get("current_layer")


def _total_layer(status):
    info = (status.get("print_stats") or {}).get("info") or {}
    return info.get("total_layer")


def _has_exceptions(status):
    return bool((status.get("exception_manager") or {}).get("exceptions") or [])


class LayerPolicy:
    def __init__(self, min_interval_ms=1000):
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

        if print_stats.get("state") != "printing":
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

        layer = _current_layer(status)
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
        if self.last_trigger_ms is not None and now_ms - self.last_trigger_ms < self.min_interval_ms:
            self.last_layer = layer
            return None

        self.last_layer = layer
        self.last_trigger_ms = now_ms
        return {
            "action": "trigger",
            "filename": filename,
            "layer": layer,
            "total_layer": _total_layer(status),
            "reason": "layer_changed",
        }


class TriggerDeduper:
    def __init__(self, limit=32):
        self.limit = limit
        self._keys = []

    def _key(self, event):
        filename = event.get("filename") or ""
        layer = event.get("layer")
        if layer is None:
            layer = "manual"
        return "{}:{}".format(filename, layer)

    def allow(self, event):
        key = self._key(event)
        if key in self._keys:
            return False
        self._keys.append(key)
        if len(self._keys) > self.limit:
            self._keys = self._keys[-self.limit :]
        return True


_TEST_PIN = None
_TEST_SLEEP_MS = None


def _sleep_ms(ms):
    if _TEST_SLEEP_MS:
        _TEST_SLEEP_MS(ms)
        return
    try:
        time.sleep_ms(ms)
    except AttributeError:
        time.sleep(ms / 1000.0)


def _pin_class():
    if _TEST_PIN:
        return _TEST_PIN
    from machine import Pin

    return Pin


def trigger_gpio7(duration_ms=180, release_ms=120):
    try:
        Pin = _pin_class()
        mode = getattr(Pin, "OPEN_DRAIN", getattr(Pin, "OUT", None))
        pin = Pin(BUTTON_PIN, mode, value=0)
        _sleep_ms(duration_ms)
        pin.init(Pin.IN)
        _sleep_ms(release_ms)
        return "OK TRIGGER_GPIO7_{}MS".format(duration_ms)
    except Exception as exc:
        return "ERR TRIGGER_FAILED {}: {}".format(type(exc).__name__, exc)


def handle_trigger_event(event, dry_run=True, trigger_fn=None):
    if dry_run:
        event["trigger_result"] = "DRY_RUN"
        return event
    if trigger_fn is None:
        trigger_fn = trigger_gpio7
    event["trigger_result"] = trigger_fn()
    return event


def install_test_pin_and_sleep(calls, sleeps):
    class TestPin:
        IN = "IN"
        OUT = "OUT"
        OPEN_DRAIN = "OPEN_DRAIN"

        def __init__(self, pin_id, mode=None, value=None):
            calls.append(("construct", pin_id, mode, value))

        def init(self, mode, value=None):
            calls.append(("init", BUTTON_PIN, mode, value))

    def sleep_ms(ms):
        sleeps.append(ms)

    global _TEST_PIN, _TEST_SLEEP_MS
    _TEST_PIN = TestPin
    _TEST_SLEEP_MS = sleep_ms


def run_http_poll_backend(config, runtime):
    runtime = runtime or {}
    policy = runtime.get("policy") or LayerPolicy(config.get("min_trigger_interval_ms", 1000))
    deduper = runtime.get("deduper") or TriggerDeduper()
    query_fn = runtime.get("query_fn") or (lambda host: query_moonraker_status(host))
    now_fn = runtime.get("now_ms") or now_ms
    sleep_fn = runtime.get("sleep_ms") or _sleep_ms
    trigger_fn = runtime.get("trigger_fn")
    max_iterations = runtime.get("max_iterations")
    events = []
    iteration = 0

    _print_json(
        READY_MARKER,
        {
            "backend": "http_poll",
            "host": config.get("u1_host"),
            "dry_run": config.get("dry_run"),
            "poll_interval_ms": config.get("poll_interval_ms"),
        },
    )

    while True:
        try:
            status = query_fn(config.get("u1_host"))
            event = policy.update(status, now_fn())
            if event and deduper.allow(event):
                handle_trigger_event(event, dry_run=config.get("dry_run", True), trigger_fn=trigger_fn)
                events.append(event)
                _print_json(EVENT_MARKER, event)
        except Exception as exc:
            runtime["last_error"] = "{}: {}".format(type(exc).__name__, exc)
            _print_json(ERROR_MARKER, {"backend": "http_poll", "error": runtime["last_error"]})

        iteration += 1
        if max_iterations is not None and iteration >= max_iterations:
            break
        sleep_fn(config.get("poll_interval_ms", 500))

    runtime["policy"] = policy
    runtime["deduper"] = deduper
    return events


def _message_params(message):
    params = message.get("params") or {}
    if isinstance(params, list):
        if params and isinstance(params[0], dict):
            return params[0]
        return {}
    return params


def _remote_trigger_event(message, sequence):
    params = _message_params(message)
    return {
        "action": "trigger",
        "filename": params.get("filename") or "",
        "layer": params.get("layer"),
        "reason": "websocket_agent",
        "sequence": sequence,
    }


def run_websocket_backend(config, runtime):
    runtime = runtime or {}
    host = config.get("u1_host")
    configured_method = runtime.get("remote_method")
    methods = runtime.get("remote_methods") or (
        (configured_method,) if configured_method else REMOTE_METHODS
    )
    sock = runtime.get("socket") or websocket_connect(host)
    send_json_fn = runtime.get("send_json") or send_json
    recv_json_fn = runtime.get("recv_json") or recv_json
    deduper = runtime.get("deduper") or TriggerDeduper()
    trigger_fn = runtime.get("trigger_fn")
    max_iterations = runtime.get("max_iterations")
    events = []
    iteration = 0
    sequence = runtime.get("sequence") or 0

    runtime["websocket_connected"] = True
    _print_json(READY_MARKER, {"backend": "websocket_agent", "host": host, "dry_run": config.get("dry_run")})
    try:
        if not runtime.get("skip_registration"):
            send_json_fn(sock, build_identify_message())
            recv_response(sock, 1, recv_json_fn)
            for register in build_register_method_messages(methods):
                send_json_fn(sock, register)
                recv_response(sock, register["id"], recv_json_fn)

        while True:
            message = recv_json_fn(sock)
            if message.get("method") in methods:
                sequence += 1
                event = _remote_trigger_event(message, sequence)
                if deduper.allow(event):
                    handle_trigger_event(event, dry_run=config.get("dry_run", True), trigger_fn=trigger_fn)
                    events.append(event)
                    _print_json(EVENT_MARKER, event)
                    result = event.get("trigger_result")
                else:
                    result = "DUPLICATE"
                if "id" in message:
                    send_json_fn(sock, {"jsonrpc": "2.0", "id": message["id"], "result": result})

            iteration += 1
            if max_iterations is not None and iteration >= max_iterations:
                break
    finally:
        runtime["websocket_connected"] = False
        runtime["sequence"] = sequence
        runtime["deduper"] = deduper
        if "socket" not in runtime:
            try:
                sock.close()
            except Exception:
                pass

    return events


def connect_wifi(ssid, password="", timeout_s=15):
    import network

    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if not wlan.isconnected():
        wlan.connect(ssid, password)
        deadline = time.time() + timeout_s
        while not wlan.isconnected() and time.time() < deadline:
            _sleep_ms(200)
    return wlan.isconnected(), wlan.ifconfig()


def main(config=None, runtime=None):
    runtime = runtime or {}
    cfg = merge_config(config if config is not None else load_config())
    _print_json(
        READY_MARKER,
        {"enabled": cfg.get("enabled"), "dry_run": cfg.get("dry_run"), "mode": cfg.get("mode")},
    )
    if not cfg.get("enabled"):
        return "DISABLED"

    if cfg.get("wifi_ssid"):
        wifi_fn = runtime.get("connect_wifi") or connect_wifi
        ok, info = wifi_fn(cfg.get("wifi_ssid"), cfg.get("wifi_password", ""))
        if not ok:
            raise OSError("wifi connect failed: {}".format(info))

    http_runner = runtime.get("http_runner") or run_http_poll_backend
    websocket_runner = runtime.get("websocket_runner") or run_websocket_backend
    auto_runner = runtime.get("auto_runner") or (
        lambda selected_config, selected_runtime: run_auto_backend(
            selected_config, selected_runtime, http_runner, websocket_runner
        )
    )
    runner = select_backend_runner(cfg, http_runner, websocket_runner, auto_runner)
    return runner(cfg, runtime)
