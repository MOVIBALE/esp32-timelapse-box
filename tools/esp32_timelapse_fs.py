from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import serial


DEFAULT_PORT = "COM6"
DEFAULT_BAUD = 921600
DEFAULT_HOST = "printer.local"
ROOT = Path(__file__).resolve().parents[1]


def resolve_wifi_password(cli_password: str | None) -> str | None:
    return (
        cli_password
        or os.environ.get("ESP32_TIMELAPSE_WIFI_PASS")
        or os.environ.get("CYBERBRICK_WIFI_PASS")
    )


def read_for(ser: serial.Serial, seconds: float) -> str:
    deadline = time.monotonic() + seconds
    chunks: list[bytes] = []
    while time.monotonic() < deadline:
        waiting = ser.in_waiting
        if waiting:
            chunks.append(ser.read(waiting))
        else:
            time.sleep(0.02)
    return b"".join(chunks).decode("utf-8", errors="replace")


def open_serial_no_reset(port: str = DEFAULT_PORT, baud: int = DEFAULT_BAUD) -> serial.Serial:
    ser = serial.Serial()
    ser.port = port
    ser.baudrate = baud
    ser.timeout = 0.1
    ser.write_timeout = 2
    ser.dtr = False
    ser.rts = True
    ser.open()
    return ser


def enter_raw_repl(ser: serial.Serial) -> str:
    ser.reset_input_buffer()
    ser.write(b"\x03")
    time.sleep(0.2)
    out = read_for(ser, 0.5)
    ser.write(b"\x01")
    time.sleep(0.2)
    out += read_for(ser, 1.0)
    if "raw REPL" not in out:
        raise RuntimeError("raw REPL not entered: {!r}".format(out))
    return out


def exec_raw(ser: serial.Serial, program: str, timeout_s: float = 2.0) -> str:
    ser.write(program.encode("utf-8"))
    ser.write(b"\x04")
    time.sleep(0.1)
    return read_for(ser, timeout_s)


def leave_raw_repl(ser: serial.Serial) -> str:
    ser.write(b"\x02")
    time.sleep(0.2)
    return read_for(ser, 0.5)


def soft_reset(ser: serial.Serial, wait_s: float = 2.0) -> str:
    ser.write(b"\x04")
    time.sleep(wait_s)
    return read_for(ser, 1.0)


def write_text_file(ser: serial.Serial, remote_path: str, text: str, chunk_size: int = 512) -> None:
    exec_raw(ser, "open({!r}, 'w').close()\nprint('__FS_TRUNCATED__')\n".format(remote_path), timeout_s=1.5)
    for index in range(0, len(text), chunk_size):
        chunk = text[index : index + chunk_size]
        program = "f=open({!r}, 'a')\nf.write({!r})\nf.close()\nprint('__FS_CHUNK__{}')\n".format(remote_path, chunk, index)
        exec_raw(ser, program, timeout_s=1.5)


def remove_file(ser: serial.Serial, remote_path: str) -> str:
    program = (
        "import os\n"
        "try:\n"
        "    os.remove({!r})\n"
        "    print('__FS_REMOVED__')\n"
        "except OSError as e:\n"
        "    print('__FS_REMOVE_ERR__' + repr(e))\n"
    ).format(remote_path)
    return exec_raw(ser, program, timeout_s=1.5)


def list_files(ser: serial.Serial) -> str:
    return exec_raw(ser, "import os, json\nprint('__FS_LIST__' + json.dumps(os.listdir('/')))\n", timeout_s=1.5)


def read_device_info(ser: serial.Serial) -> str:
    program = (
        "import json, os\n"
        "res={'files': os.listdir('/')}\n"
        "try:\n"
        "    import bbl_product\n"
        "    res['app_name']=bbl_product.get_app_name()\n"
        "    res['version']=bbl_product.get_version()\n"
        "except Exception as e:\n"
        "    res['bbl_product_error']=repr(e)\n"
        "print('__DEVICE_INFO__' + json.dumps(res))\n"
    )
    return exec_raw(ser, program, timeout_s=1.5)


def build_config(ssid: str, password: str, host: str) -> str:
    config = json.loads((ROOT / "device_files" / "u1_bridge_config.json").read_text(encoding="utf-8"))
    config["wifi_ssid"] = ssid
    config["wifi_password"] = password
    config["u1_host"] = host
    config["enabled"] = False
    config["dry_run"] = True
    return json.dumps(config, separators=(",", ":"))


def build_board_listener_config(ssid: str, password: str, host: str, mode: str = "http_poll") -> str:
    config = json.loads((ROOT / "device_files" / "board_listener_config.json").read_text(encoding="utf-8"))
    config["wifi_ssid"] = ssid
    config["wifi_password"] = password
    config["u1_host"] = host
    config["mode"] = mode
    config["enabled"] = False
    config["dry_run"] = True
    return json.dumps(config, separators=(",", ":"))


def upload_dry_run_agent(port: str, baud: int, ssid: str, password: str, host: str, reset: bool) -> None:
    u1_bridge = (ROOT / "device_files" / "u1_bridge.py").read_text(encoding="utf-8")
    main_py = (ROOT / "device_files" / "main.py").read_text(encoding="utf-8")
    config = build_config(ssid, password, host)

    with open_serial_no_reset(port, baud) as ser:
        print(enter_raw_repl(ser), end="")
        print(read_device_info(ser), end="")
        write_text_file(ser, "/u1_bridge_config.json", config)
        write_text_file(ser, "/u1_bridge.py", u1_bridge)
        write_text_file(ser, "/main.py", main_py)
        print(list_files(ser), end="")
        print(leave_raw_repl(ser), end="")
        if reset:
            print(soft_reset(ser, wait_s=14.0), end="")
            print(read_for(ser, 8.0), end="")


def upload_board_listener(
    port: str,
    baud: int,
    ssid: str,
    password: str,
    host: str,
    reset: bool,
    mode: str = "http_poll",
) -> None:
    board_listener = (ROOT / "device_files" / "board_listener.py").read_text(encoding="utf-8")
    main_py = (ROOT / "device_files" / "board_main.py").read_text(encoding="utf-8")
    config = build_board_listener_config(ssid, password, host, mode=mode)

    with open_serial_no_reset(port, baud) as ser:
        print(enter_raw_repl(ser), end="")
        print(read_device_info(ser), end="")
        write_text_file(ser, "/board_listener_config.json", config)
        write_text_file(ser, "/board_listener.py", board_listener)
        write_text_file(ser, "/main.py", main_py)
        print(list_files(ser), end="")
        print(leave_raw_repl(ser), end="")
        if reset:
            print(soft_reset(ser, wait_s=14.0), end="")
            print(read_for(ser, 8.0), end="")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="ESP32 Timelapse Box filesystem helper for safe board-agent upload and recovery."
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    upload = sub.add_parser("upload-dry-run-agent")
    upload.add_argument("--port", default=DEFAULT_PORT)
    upload.add_argument("--baud", type=int, default=DEFAULT_BAUD)
    upload.add_argument("--ssid", required=True)
    upload.add_argument(
        "--password",
        help="Wi-Fi password. Prefer ESP32_TIMELAPSE_WIFI_PASS to avoid exposing it in process args.",
    )
    upload.add_argument("--host", default=DEFAULT_HOST)
    upload.add_argument("--reset", action="store_true")

    board_upload = sub.add_parser("upload-board-listener")
    board_upload.add_argument("--port", default=DEFAULT_PORT)
    board_upload.add_argument("--baud", type=int, default=DEFAULT_BAUD)
    board_upload.add_argument("--ssid", required=True)
    board_upload.add_argument(
        "--password",
        help="Wi-Fi password. Prefer ESP32_TIMELAPSE_WIFI_PASS to avoid exposing it in process args.",
    )
    board_upload.add_argument("--host", default=DEFAULT_HOST)
    board_upload.add_argument("--mode", choices=("http_poll", "websocket_agent", "auto"), default="http_poll")
    board_upload.add_argument("--reset", action="store_true")

    recover = sub.add_parser("remove-main")
    recover.add_argument("--port", default=DEFAULT_PORT)
    recover.add_argument("--baud", type=int, default=DEFAULT_BAUD)
    recover.add_argument("--reset", action="store_true")

    info = sub.add_parser("info")
    info.add_argument("--port", default=DEFAULT_PORT)
    info.add_argument("--baud", type=int, default=DEFAULT_BAUD)

    args = parser.parse_args()

    if args.cmd == "upload-dry-run-agent":
        password = resolve_wifi_password(args.password)
        if not password:
            raise SystemExit(
                "Wi-Fi password required via --password or ESP32_TIMELAPSE_WIFI_PASS "
                "(legacy CYBERBRICK_WIFI_PASS is also accepted)"
            )
        upload_dry_run_agent(args.port, args.baud, args.ssid, password, args.host, args.reset)
        return 0

    if args.cmd == "upload-board-listener":
        password = resolve_wifi_password(args.password)
        if not password:
            raise SystemExit(
                "Wi-Fi password required via --password or ESP32_TIMELAPSE_WIFI_PASS "
                "(legacy CYBERBRICK_WIFI_PASS is also accepted)"
            )
        upload_board_listener(args.port, args.baud, args.ssid, password, args.host, args.reset, mode=args.mode)
        return 0

    if args.cmd == "remove-main":
        with open_serial_no_reset(args.port, args.baud) as ser:
            print(enter_raw_repl(ser), end="")
            print(remove_file(ser, "/main.py"), end="")
            print(list_files(ser), end="")
            print(leave_raw_repl(ser), end="")
            if args.reset:
                print(soft_reset(ser), end="")
        return 0

    if args.cmd == "info":
        with open_serial_no_reset(args.port, args.baud) as ser:
            print(enter_raw_repl(ser), end="")
            print(read_device_info(ser), end="")
            print(leave_raw_repl(ser), end="")
        return 0

    raise AssertionError(args.cmd)


if __name__ == "__main__":
    raise SystemExit(main())
