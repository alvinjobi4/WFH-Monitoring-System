import threading
import logging

import pystray

from PIL import Image

# ==========================================
# LOGGING
# ==========================================

logging.basicConfig(
    filename="tracker.log",
    level=logging.INFO,
    format="%(asctime)s - %(message)s"
)

# ==========================================
# IMPORT YOUR TRACKER
# ==========================================

from tracker import start_tracking, push_status_change

# ==========================================
# CREATE SIMPLE ICON
# ==========================================

image = Image.new(
    "RGB",
    (64, 64),
    color=(0, 120, 255)
)

# ==========================================
# MENU (No Exit Option)
# ==========================================

menu = pystray.Menu(
    pystray.MenuItem(
        "WFH Monitor Active",
        lambda icon, item: None,
        enabled=False
    )
)

# ==========================================
# TRAY ICON
# ==========================================

icon = pystray.Icon(
    "WFH Monitor",
    image,
    "WFH Monitoring Active",
    menu
)

# ==========================================
# START TRACKER THREAD
# ==========================================

tracker_thread = threading.Thread(
    target=start_tracking
)

tracker_thread.daemon = True

tracker_thread.start()

# ==========================================
# RUN SYSTEM TRAY
# ==========================================

icon.run()
