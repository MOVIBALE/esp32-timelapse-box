#!/bin/sh
cd "$(dirname "$0")" || exit 1
URL="http://127.0.0.1:8776/"

if command -v python3 >/dev/null 2>&1; then
  PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_CMD="python"
else
  echo "Python was not found. Install Python 3, then run this launcher again."
  exit 1
fi

echo "Opening $URL"
open "$URL" >/dev/null 2>&1 &
echo "Serving ESP32 Timelapse Box configurator at $URL"
echo "Close this window to stop the local web server."
$PYTHON_CMD -m http.server 8776 --bind 127.0.0.1
