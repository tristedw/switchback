#!/bin/sh
# autostart on the 7" screen. add to ~/.config/labwc/autostart or lxsession autostart
xset s off 2>/dev/null
xset -dpms 2>/dev/null
chromium-browser --kiosk --noerrdialogs --disable-infobars --enable-features=WebBluetooth \
  --check-for-update-interval=31536000 http://localhost:8787/
