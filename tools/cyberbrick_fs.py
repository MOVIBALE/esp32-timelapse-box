"""Deprecated compatibility entry point for :mod:`esp32_timelapse_fs`.

Existing scripts may keep importing or executing ``cyberbrick_fs.py`` during
the 0.x release line. New documentation uses ``esp32_timelapse_fs.py``.
"""

from __future__ import annotations

try:
    from tools import esp32_timelapse_fs as _implementation
    from tools.esp32_timelapse_fs import *  # noqa: F401,F403
    from tools.esp32_timelapse_fs import main
except ImportError:  # Direct execution from the tools directory.
    import esp32_timelapse_fs as _implementation  # type: ignore[no-redef]
    from esp32_timelapse_fs import *  # type: ignore[no-redef]  # noqa: F401,F403
    from esp32_timelapse_fs import main  # type: ignore[no-redef]


def upload_board_listener(*args, **kwargs):
    """Forward while preserving dependency injection used by legacy tooling."""

    for name in (
        "open_serial_no_reset",
        "enter_raw_repl",
        "read_device_info",
        "write_text_file",
        "list_files",
        "leave_raw_repl",
        "soft_reset",
        "read_for",
    ):
        setattr(_implementation, name, globals()[name])
    return _implementation.upload_board_listener(*args, **kwargs)


if __name__ == "__main__":
    raise SystemExit(main())
