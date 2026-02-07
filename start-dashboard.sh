#!/bin/bash

# Start the Vite dev server in the background
echo "Starting Rem Dashboard..."
cd "$(dirname "$0")"
npm run dev &
DEV_PID=$!

# Wait a moment for the server to start
sleep 3

# Open Chrome in kiosk mode for 800x480 display
echo "Opening Chrome in kiosk mode..."
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --kiosk \
  --window-size=800,480 \
  --window-position=0,0 \
  --disable-web-security \
  --disable-features=VizDisplayCompositor \
  --disable-extensions \
  --no-first-run \
  --no-default-browser-check \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  http://localhost:3000

# When Chrome closes, stop the dev server
echo "Stopping dev server..."
kill $DEV_PID