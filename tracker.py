import time
import datetime
import logging
import json
import socket
import sys
from pathlib import Path

logging.basicConfig(
    filename="tracker.log",
    level=logging.INFO,
    format="%(asctime)s - %(message)s"
)

import win32gui
import win32process
import psutil

from pynput import keyboard, mouse
from supabase import create_client

# =====================================================
# SUPABASE CONFIG
# =====================================================

url = "https://utwklfackfqmkmpmhvri.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0d2tsZmFja2ZxbWttcG1odnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzgwNzUsImV4cCI6MjA5NDY1NDA3NX0.7rNmCSgR8AOYsR-bhozYJiWRPtVqWwKy-UU9cECPa84"

supabase = create_client(url, key)

# =====================================================
# AGENT CONFIG
# =====================================================

def get_app_folder():
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).parent


def load_agent_config():
    app_folder = get_app_folder()
    config_path = app_folder / "agent_config.json"

    device_id = socket.gethostname()

    default_config = {
        "employee_id": f"UNREGISTERED-{device_id}",
        "employee_name": "Unregistered Employee",
        "employee_email": "",
        "department": "Unknown",
        "device_id": device_id
    }

    if not config_path.exists():
        return default_config

    with open(config_path, "r", encoding="utf-8") as file:
        config = json.load(file)

    config["device_id"] = config.get("device_id") or device_id

    return config


agent_config = load_agent_config()

employee_id = agent_config["employee_id"]
employee_name = agent_config["employee_name"]
employee_email = agent_config.get("employee_email", "")
department = agent_config.get("department", "Unknown")
device_id = agent_config["device_id"]

# =====================================================
# AUTO-REGISTER EMPLOYEE
# =====================================================

def register_employee():
    try:
        data = {
            "id": employee_id,
            "name": employee_name,
            "email": employee_email,
            "device_id": device_id,
            "department": department
        }

        supabase.table("employees").upsert(data).execute()

        logging.info(f"Employee registered: {employee_name} - {device_id}")

    except Exception as e:
        logging.error(f"Employee registration failed: {e}")

def push_status_change(status):
    data = {
        "employee_id": employee_id,
        "employee_name": employee_name,
        "employee_email": employee_email,
        "device_id": device_id,
        "department": department,
        "app_name": f"STATUS_CHANGE | {status}",
        "website": "status",
        "start_time": datetime.datetime.now().isoformat(),
        "end_time": datetime.datetime.now().isoformat(),
        "duration_seconds": 0,
        "category": "Neutral",
        "productivity_score": 0
    }
    try:
        supabase.table("activity_logs").insert(data).execute()
        logging.info(f"Status changed to {status}")
        print(f"[{datetime.datetime.now()}] Status changed to {status}", flush=True)
    except Exception as e:
        logging.error(f"Database Error saving status change: {e}")
        print(f"Database Error saving status change: {e}", flush=True)

import os
import urllib.request
import json

def load_env_var(name):
    val = os.environ.get(name)
    if val:
        return val.strip('\'"')
    try:
        paths = [
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "employee-dashboard", ".env.local"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env.local"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
        ]
        for p in paths:
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.strip().startswith(name + "="):
                            return line.split("=", 1)[1].strip().strip('\'"')
    except Exception:
        pass
    return None

def parse_domain(process_name, window_title):
    proc_lower = process_name.lower()
    if "chrome" in proc_lower or "edge" in proc_lower or "firefox" in proc_lower:
        cleaned_title = window_title
        for b in ["google chrome", "microsoft edge", "firefox", "opera", "chrome"]:
            cleaned_title = cleaned_title.replace(b, "").replace("-", "").strip()
        parts = [p.strip() for p in cleaned_title.split("|") if p.strip()]
        if not parts:
            parts = [p.strip() for p in cleaned_title.split("-") if p.strip()]
        if parts:
            site = parts[-1]
            if "." in site:
                return site.lower()
            return f"{site.lower()}.com"
        return "web browser"
    return process_name

def classify_activity_with_groq(app_name, website, employee_name):
    app_lower = (app_name or "").strip().lower()
    if "idle" in app_lower or "unknown" in app_lower:
        return "Idle", 0

    groq_api_key = load_env_var("NEXT_PUBLIC_GROQ_API_KEY") or load_env_var("GROQ_API_KEY")

    role_description = "General office tasks, writing, and coordination."
    try:
        user_res = supabase.table("users").select("id, role").eq("username", employee_name).execute()
        if user_res.data:
            user_id = user_res.data[0]["id"]
            role_res = supabase.table("employee_roles").select("roles(name, description)").eq("employee_id", user_id).execute()
            if role_res.data and role_res.data[0].get("roles"):
                role_description = role_res.data[0]["roles"].get("description") or role_description
    except Exception as e:
        print("Error fetching role context for AI:", e)

    prompt = f"""You are an AI WFH (Work From Home) productivity auditor.
Your job is to classify the following computer activity based on the employee's role.

Employee: {employee_name}
Role Description: {role_description}
Application Process: {app_name}
Active Tab / Website Domain: {website}

Determine:
1. "category": Choose exactly one of ["Productive", "Unproductive", "Neutral", "Idle"].
2. "score": A productivity score from -10 (highly distracting, e.g., gaming, social media during work) to 10 (highly productive, core job activities). Neutral operations (e.g. system files, finder, local folders) should be around 0 to 3.

Return the result as a raw JSON object containing exactly the keys "category" and "score"."""

    # Try Groq API
    if groq_api_key and "your_" not in groq_api_key:
        try:
            url = "https://api.groq.com/openai/v1/chat/completions"
            req_data = {
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "response_format": {
                    "type": "json_object"
                }
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(req_data).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {groq_api_key}",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                text = res_data["choices"][0]["message"]["content"]
                result = json.loads(text)
                return result.get("category"), int(result.get("score"))
        except Exception as e:
            print("Groq classification failed in Python:", e)

    return None

# =====================================================
# PRODUCTIVITY RULES
# =====================================================

PRODUCTIVITY_RULES = {

    # =================================================
    # DISTRACTING WEBSITES FIRST
    # =================================================

    "youtube": ("Distracting", -5),

    "instagram": ("Distracting", -10),

    "facebook": ("Distracting", -10),

    "netflix": ("Distracting", -10),

    "twitter": ("Distracting", -5),

    "reddit": ("Distracting", -5),

    # =================================================
    # PRODUCTIVE WEBSITES
    # =================================================

    "github": ("Productive", 10),

    "stackoverflow": ("Productive", 8),

    "jira": ("Productive", 9),

    "chatgpt": ("Productive", 7),

    "notion": ("Productive", 8),

    # =================================================
    # PRODUCTIVE APPS
    # =================================================

    "code.exe": ("Productive", 10),

    "pycharm64.exe": ("Productive", 10),

    "notion.exe": ("Productive", 8),

    "slack.exe": ("Work Communication", 7),

    "teams.exe": ("Work Communication", 7),

    # =================================================
    # ENTERTAINMENT APPS
    # =================================================

    "spotify.exe": ("Entertainment", 2),

    "discord.exe": ("Communication", 4),

    # =================================================
    # SYSTEM
    # =================================================

    "explorer.exe": ("System", 3),

    "idle": ("Idle", 0),

    # =================================================
    # BROWSERS (PRODUCTIVE)
    # =================================================

    "chrome.exe": ("Productive", 5),

    "msedge.exe": ("Productive", 5),

    "firefox.exe": ("Productive", 5)
}

# =====================================================
# IDLE DETECTION (With Anti-Jiggler/Pattern Detection)
# =====================================================

import collections

class SuspiciousInputDetector:
    def __init__(self):
        self.mouse_positions = collections.deque(maxlen=20)
        self.event_intervals = collections.deque(maxlen=20)
        self.last_event_time = None

    def add_mouse_event(self, x, y):
        now = time.time()
        self.mouse_positions.append((x, y))
        if self.last_event_time is not None:
            interval = now - self.last_event_time
            if interval > 0.05:  # Ignore micro-shakes
                self.event_intervals.append(interval)
        self.last_event_time = now

    def add_keyboard_event(self):
        now = time.time()
        if self.last_event_time is not None:
            interval = now - self.last_event_time
            if interval > 0.05:
                self.event_intervals.append(interval)
        self.last_event_time = now

    def is_suspicious(self):
        # 1. Repetitive coordinate check (simple oscillation/box jiggling)
        if len(self.mouse_positions) >= 10:
            unique_pos = set(self.mouse_positions)
            if len(unique_pos) <= 3:
                return True

        # 2. Perfect rhythm/interval check (automation/scripts running on a timer)
        if len(self.event_intervals) >= 5:
            intervals = list(self.event_intervals)
            avg = sum(intervals) / len(intervals)
            if avg > 0.8:
                variance = sum((x - avg) ** 2 for x in intervals) / len(intervals)
                std_dev = variance ** 0.5
                if std_dev < 0.05:  # Less than 50ms standard deviation (too perfect for human)
                    return True

        return False

detector = SuspiciousInputDetector()
last_input_time = time.time()
IDLE_THRESHOLD = 600  # 10 minutes (600 seconds)

def update_activity(*args):
    global last_input_time
    
    if len(args) == 2:  # Mouse move
        detector.add_mouse_event(args[0], args[1])
    else:  # Keyboard or mouse click/scroll
        detector.add_keyboard_event()

    if not detector.is_suspicious():
        last_input_time = time.time()
    else:
        # Suspicious activity ignored - user remains on path to idle
        pass


# Keyboard listener
keyboard.Listener(
    on_press=update_activity
).start()

# Mouse listener
mouse.Listener(
    on_move=update_activity,
    on_click=update_activity,
    on_scroll=update_activity
).start()

# =====================================================
# PRODUCTIVITY CLASSIFIER
# =====================================================

def classify_activity(activity):

    activity_lower = activity.lower()

    for keyword, value in PRODUCTIVITY_RULES.items():

        if keyword in activity_lower:
            return value

    return ("Unknown", 0)

# =====================================================
# SESSION TRACKING
# =====================================================

def start_tracking():
    global last_input_time

    register_employee()
    push_status_change("online")

    last_activity = None
    activity_start_time = None
    last_heartbeat_time = time.time()

    logging.info("Employee Monitoring Started")
    print("Employee Monitoring Started...\n", flush=True)

    # =====================================================
    # MAIN LOOP
    # =====================================================

    try:
        while True:

            idle_time = time.time() - last_input_time

            # =================================================
            # DETECT CURRENT ACTIVITY
            # =================================================

            if idle_time >= IDLE_THRESHOLD:

                current_activity = "IDLE"

            else:

                hwnd = win32gui.GetForegroundWindow()

                window_title = win32gui.GetWindowText(hwnd)

                _, pid = win32process.GetWindowThreadProcessId(hwnd)

                try:
                    process = psutil.Process(pid)
                    process_name = process.name()

                except:
                    process_name = "Unknown"

                current_activity = (
                    f"{process_name} | {window_title}"
                )

            # =================================================
            # FIRST ACTIVITY
            # =================================================

            if last_activity is None:

                last_activity = current_activity
                activity_start_time = datetime.datetime.now()

            # =================================================
            # ACTIVITY CHANGED
            # =================================================

            elif current_activity != last_activity:

                end_time = datetime.datetime.now()

                duration = int(
                    (
                        end_time - activity_start_time
                    ).total_seconds()
                )

                # =================================================
                # PRODUCTIVITY ANALYSIS
                # =================================================

                parts = last_activity.split(" | ")
                proc = parts[0] if len(parts) > 0 else "Unknown"
                w_title = parts[1] if len(parts) > 1 else ""
                domain = parse_domain(proc, w_title)

                # Try Groq classification first, fallback to static rules
                groq_res = classify_activity_with_groq(last_activity, domain, employee_name)
                if groq_res:
                    category, score = groq_res
                else:
                    category, score = classify_activity(last_activity)

                # =================================================
                # TERMINAL OUTPUT
                # =================================================

                print("\n===================================", flush=True)
                logging.info("Activity Finished")
                print("Activity :", last_activity, flush=True)
                print("Duration :", duration, "seconds", flush=True)
                print("Category :", category, flush=True)
                print("Score    :", score, flush=True)
                print("===================================\n", flush=True)

                # =================================================
                # SAVE TO SUPABASE
                # =================================================

                data = {
                    "employee_id": employee_id,
                    "employee_name": employee_name,
                    "employee_email": employee_email,
                    "device_id": device_id,
                    "department": department,
                    "app_name": last_activity,
                    "website": domain,
                    "start_time": activity_start_time.isoformat(),
                    "end_time": end_time.isoformat(),
                    "duration_seconds": duration,
                    "category": category,
                    "productivity_score": score
                }

                try:

                    supabase.table(
                        "activity_logs"
                    ).insert(data).execute()

                    logging.info("Session saved to Supabase")

                except Exception as e:

                    logging.error(f"Database Error: {e}")

                # =================================================
                # START NEW SESSION
                # =================================================

                last_activity = current_activity
                activity_start_time = end_time

            # Heartbeat check (every 60 seconds)
            now_time = time.time()
            if now_time - last_heartbeat_time >= 60:
                h_status = "idle" if current_activity == "IDLE" else "online"
                try:
                    push_status_change(h_status)
                except Exception as e:
                    logging.error(f"Heartbeat failed: {e}")
                last_heartbeat_time = now_time

            time.sleep(2)
    finally:
        push_status_change("offline")