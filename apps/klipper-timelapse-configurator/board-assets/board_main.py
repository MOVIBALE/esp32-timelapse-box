import time


STARTUP_DELAY_MS = 10000


def _sleep_ms(ms):
    try:
        time.sleep_ms(ms)
    except AttributeError:
        time.sleep(ms / 1000.0)


_sleep_ms(STARTUP_DELAY_MS)

try:
    import board_listener

    board_listener.main()
except KeyboardInterrupt:
    print("board listener interrupted")
except Exception as exc:
    print("board listener startup error {}: {}".format(type(exc).__name__, exc))
