import customtkinter as ctk
import time
import datetime
import threading
import sys
import io
import collections
from pynput import keyboard, mouse

# Fix Windows console Unicode encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import win32gui
import win32process
import win32api
import psutil
from supabase import create_client

# =====================================================
# SUPABASE CONFIG
# =====================================================
url = "https://utwklfackfqmkmpmhvri.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0d2tsZmFja2ZxbWttcG1odnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzgwNzUsImV4cCI6MjA5NDY1NDA3NX0.7rNmCSgR8AOYsR-bhozYJiWRPtVqWwKy-UU9cECPa84"
supabase = create_client(url, key)

# =====================================================
# IDLE PATTERN DETECTION (Anti-Jiggler)
# =====================================================
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
global_last_input_time = time.time()

def update_app_activity(*args):
    global global_last_input_time
    if len(args) == 2:  # Mouse move
        detector.add_mouse_event(args[0], args[1])
    else:  # Keyboard or mouse click/scroll
        detector.add_keyboard_event()

    if not detector.is_suspicious():
        global_last_input_time = time.time()

# Start listeners globally
keyboard.Listener(on_press=update_app_activity).start()
mouse.Listener(on_move=update_app_activity, on_click=update_app_activity, on_scroll=update_app_activity).start()

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
# PRODUCTIVITY RULES
# =====================================================
PRODUCTIVITY_RULES = {
    "code.exe": ("Productive", 10),
    "pycharm64.exe": ("Productive", 10),
    "notion.exe": ("Productive", 8),
    "slack.exe": ("Work Communication", 7),
    "teams.exe": ("Work Communication", 7),
    "discord.exe": ("Communication", 4),
    "chrome.exe": ("Neutral", 5),
    "msedge.exe": ("Neutral", 5),
    "firefox.exe": ("Neutral", 5),
    "youtube": ("Distracting", -5),
    "instagram": ("Distracting", -10),
    "facebook": ("Distracting", -10),
    "spotify.exe": ("Entertainment", 2),
    "netflix": ("Entertainment", -10),
    "explorer.exe": ("System", 3),
    "idle": ("Idle", 0)
}

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

class TrackerApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        # App config
        self.title("WFH Tracker")
        self.geometry("400x500")
        self.resizable(False, False)
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")
        self.protocol("WM_DELETE_WINDOW", self.on_closing)

        # Global State
        self.logged_in_user = None
        self.is_tracking = False
        self.IDLE_THRESHOLD = 600
        self.last_activity = None
        self.activity_start_time = None
        self.session_idle_seconds = 0
        
        # Build UI
        self.show_login_frame()

    # =================================================
    # IDLE DETECTION
    # =================================================

    def classify_activity(self, activity):
        activity_lower = activity.lower()
        for keyword, value in PRODUCTIVITY_RULES.items():
            if keyword in activity_lower:
                return value
        return ("Unknown", 0)

    # =================================================
    # LOGIN UI
    # =================================================
    def show_login_frame(self):
        for widget in self.winfo_children():
            widget.destroy()

        self.login_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.login_frame.pack(fill="both", expand=True, padx=40, pady=60)

        # Title
        title_label = ctk.CTkLabel(self.login_frame, text="WFH Tracker", font=ctk.CTkFont(size=28, weight="bold"))
        title_label.pack(pady=(0, 10))
        
        subtitle_label = ctk.CTkLabel(self.login_frame, text="Sign in to your employee account", text_color="gray")
        subtitle_label.pack(pady=(0, 40))

        # Inputs
        self.username_entry = ctk.CTkEntry(self.login_frame, placeholder_text="Username", height=45)
        self.username_entry.pack(fill="x", pady=10)

        self.password_entry = ctk.CTkEntry(self.login_frame, placeholder_text="Password", show="*", height=45)
        self.password_entry.pack(fill="x", pady=10)

        self.error_label = ctk.CTkLabel(self.login_frame, text="", text_color="red", font=ctk.CTkFont(size=12))
        self.error_label.pack(pady=5)

        # Login Button
        self.login_btn = ctk.CTkButton(self.login_frame, text="Log In", height=45, font=ctk.CTkFont(weight="bold"), command=self.handle_login)
        self.login_btn.pack(fill="x", pady=(10, 0))

    def handle_login(self):
        username = self.username_entry.get().strip()
        password = self.password_entry.get().strip()

        if not username or not password:
            self.error_label.configure(text="Please enter all fields")
            return

        self.login_btn.configure(state="disabled", text="Logging in...")
        
        try:
            response = supabase.table("users").select("*").eq("username", username).eq("password", password).execute()
            data = response.data
            
            if len(data) > 0 and data[0]["role"] == "employee":
                self.logged_in_user = data[0]["username"]
                self.show_dashboard_frame()
            else:
                self.error_label.configure(text="Invalid credentials")
                self.login_btn.configure(state="normal", text="Log In")
        except Exception as e:
            self.error_label.configure(text="Database connection error")
            self.login_btn.configure(state="normal", text="Log In")

    # =================================================
    # DASHBOARD UI
    # =================================================
    def show_dashboard_frame(self):
        for widget in self.winfo_children():
            widget.destroy()

        self.dash_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.dash_frame.pack(fill="both", expand=True, padx=40, pady=40)

        # Header
        welcome_label = ctk.CTkLabel(self.dash_frame, text=f"Welcome, {self.logged_in_user}", font=ctk.CTkFont(size=24, weight="bold"))
        welcome_label.pack(pady=(0, 5))

        # Status indicator
        self.status_frame = ctk.CTkFrame(self.dash_frame, fg_color="green", corner_radius=15, height=30)
        self.status_frame.pack(fill="x", pady=20)
        
        self.status_label = ctk.CTkLabel(self.status_frame, text="● Tracking Active", font=ctk.CTkFont(weight="bold", size=14), text_color="white")
        self.status_label.pack(pady=5)

        # Current App Display
        info_label = ctk.CTkLabel(self.dash_frame, text="Currently Tracking:", text_color="gray")
        info_label.pack(pady=(20, 0))
        
        self.current_app_label = ctk.CTkLabel(self.dash_frame, text="Initializing...", font=ctk.CTkFont(size=14), wraplength=300)
        self.current_app_label.pack(pady=(5, 30))

        # Logout Button
        self.logout_btn = ctk.CTkButton(self.dash_frame, text="Stop & Logout", height=45, fg_color="transparent", border_width=2, border_color="gray", text_color="gray", hover_color="#333333", command=self.handle_logout)
        self.logout_btn.pack(side="bottom", fill="x")

        # Start Tracking Thread
        self.is_tracking = True
        self.push_status_change("online")
        self.tracking_thread = threading.Thread(target=self.tracking_loop, daemon=True)
        self.tracking_thread.start()

    def handle_logout(self):
        self.is_tracking = False
        self.push_current_log()
        self.push_status_change("offline")
        self.logged_in_user = None
        self.show_login_frame()

    def on_closing(self):
        self.is_tracking = False
        self.push_current_log()
        self.push_status_change("offline")
        self.destroy()

    def push_status_change(self, status):
        if not self.logged_in_user:
            return
        data = {
            "employee_name": self.logged_in_user,
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
            print(f"[{datetime.datetime.now()}] Status changed to {status}", flush=True)
        except Exception as e:
            print("Database Error saving status change:", e)

    # =================================================
    # TRACKING ENGINE
    # =================================================

    def push_current_log(self):
        if not self.last_activity or not self.activity_start_time:
            return

        end_time = datetime.datetime.now()
        duration = int((end_time - self.activity_start_time).total_seconds())
        
        if duration <= 0:
            return

        # Enriched domain telemetry
        parts = self.last_activity.split(" | ")
        proc = parts[0] if len(parts) > 0 else "Unknown"
        w_title = parts[1] if len(parts) > 1 else ""
        domain = parse_domain(proc, w_title)

        # Try Groq classification first, fallback to static rules
        groq_res = classify_activity_with_groq(self.last_activity, domain, self.logged_in_user)
        if groq_res:
            category, score = groq_res
        else:
            category, score = self.classify_activity(self.last_activity)

        data = {
            "employee_name": self.logged_in_user,
            "app_name": self.last_activity,
            "website": domain,
            "start_time": self.activity_start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "duration_seconds": duration,
            "category": category,
            "productivity_score": score
        }

        try:
            supabase.table("activity_logs").insert(data).execute()
            print(f"[{datetime.datetime.now()}] Saved telemetry for {self.logged_in_user}: {domain} ({duration}s)")
        except Exception as e:
            print("Database Error:", e)

    def tracking_loop(self):
        self.last_activity = None
        self.activity_start_time = None
        self.session_idle_seconds = 0
        last_heartbeat_time = time.time()

        try:
            while self.is_tracking:
                idle_time = time.time() - global_last_input_time

                if idle_time >= self.IDLE_THRESHOLD:
                    current_activity = "IDLE"
                    self.session_idle_seconds += 2
                else:
                    try:
                        hwnd = win32gui.GetForegroundWindow()
                        window_title = win32gui.GetWindowText(hwnd)
                        _, pid = win32process.GetWindowThreadProcessId(hwnd)
                        process = psutil.Process(pid)
                        process_name = process.name()
                        current_activity = f"{process_name} | {window_title}"
                    except:
                        current_activity = "Unknown"

                # Update UI safely
                try:
                    display_text = current_activity if len(current_activity) < 50 else current_activity[:47] + "..."
                    self.current_app_label.configure(text=display_text)
                except:
                    pass

                if self.last_activity is None:
                    self.last_activity = current_activity
                    self.activity_start_time = datetime.datetime.now()
                    self.session_idle_seconds = 0
                elif current_activity != self.last_activity:
                    # Push the completed activity
                    self.push_current_log()
                    
                    # Start new activity
                    self.last_activity = current_activity
                    self.activity_start_time = datetime.datetime.now()
                    self.session_idle_seconds = 0

                # Heartbeat check (every 60 seconds)
                now_time = time.time()
                if now_time - last_heartbeat_time >= 60:
                    h_status = "idle" if current_activity == "IDLE" else "online"
                    try:
                        self.push_status_change(h_status)
                    except Exception as e:
                        print("Heartbeat failed:", e)
                    last_heartbeat_time = now_time

                time.sleep(2)
        finally:
            self.push_status_change("offline")

if __name__ == "__main__":
    app = TrackerApp()
    app.mainloop()
