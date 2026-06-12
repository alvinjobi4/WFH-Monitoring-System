from supabase import create_client
import re

url = "https://utwklfackfqmkmpmhvri.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0d2tsZmFja2ZxbWttcG1odnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzgwNzUsImV4cCI6MjA5NDY1NDA3NX0.7rNmCSgR8AOYsR-bhozYJiWRPtVqWwKy-UU9cECPa84"

supabase = create_client(url, key)

def get_normalized_role_name(role_or_dept):
    val = (role_or_dept or "").lower().strip()
    if any(x in val for x in ["engineering", "software", "developer", "dev", "22222222"]):
        return "Software Developer"
    if any(x in val for x in ["design", "electrical", "designer", "frontend", "33333333"]):
        return "Designer"
    if any(x in val for x in ["recruiter", "hr", "hiring", "talent", "44444444"]):
        return "Recruiter"
    return "Knowledge Worker"

def extract_domain(website):
    if not website:
        return ""
    clean = website.strip()
    if " | " in clean:
        clean = clean.split(" | ")[-1]
    clean = re.sub(r"\s*-\s*(Google Chrome|Microsoft Edge|Firefox|Chrome|Web Browser)\s*$", "", clean, flags=re.IGNORECASE).strip()
    if clean.startswith("http"):
        try:
            from urllib.parse import urlparse
            clean = urlparse(clean).hostname or clean
        except:
            pass
    if clean.lower().startswith("www."):
        clean = clean[4:]
    if clean.lower().endswith(".exe"):
        clean = clean[:-4]
    return clean.lower()

def normalize_activity(app_name, website):
    process = app_name.split(" | ")[0].strip() if app_name else ""
    domain = extract_domain(website or app_name or "")
    
    cleaned_title = process.replace(".exe", "").replace(".EXE", "").strip()
    # Simple camel/pascal case splitter
    cleaned_title = re.sub(r"([A-Z])", r" \1", cleaned_title).strip()
    cleaned_title = " ".join(w.capitalize() for w in cleaned_title.split())
    
    lower_app = cleaned_title.lower()
    if any(x in lower_app for x in ["chrome", "edge", "firefox", "brave", "opera", "safari"]):
        cleaned_title = domain.split(".")[0].upper() if domain else "Web Browser"
        
    lower_title = cleaned_title.lower()
    if "whatsapp" in lower_title: cleaned_title = "WhatsApp"
    if "antigravity" in lower_title: cleaned_title = "Antigravity AI"
    if "code" in lower_title or "vs code" in lower_title: cleaned_title = "VS Code"
    if "pycharm" in lower_title: cleaned_title = "PyCharm"
    if "explorer" in lower_title: cleaned_title = "File Explorer"
    
    return process, cleaned_title, domain

def classify_activity(app_name, website, raw_category, role_name):
    process, cleaned_title, domain = normalize_activity(app_name, website)
    
    app_lower = process.lower()
    web_lower = (website or "").lower()
    if app_lower in ["idle", "unknown"] or raw_category == "Idle" or (app_lower == "unknown" and web_lower == "idle"):
        return "Idle"
        
    if app_name and app_name.startswith("STATUS_CHANGE"):
        return "Neutral"
        
    rules = []
    # Software Developer specific rules (Role 2)
    if role_name == "Software Developer":
        rules = [
            ("app", "contains", "code", "Productive"),
            ("app", "contains", "pycharm", "Productive"),
            ("domain", "contains", "github", "Productive"),
            ("domain", "exact", "stackoverflow.com", "Productive")
        ]
    # Designer specific rules (Role 3)
    elif role_name == "Designer":
        rules = [
            ("domain", "exact", "react.dev", "Productive"),
            ("app", "exact", "figma.exe", "Productive")
        ]
    # Recruiter specific rules (Role 4)
    elif role_name == "Recruiter":
        rules = [
            ("domain", "contains", "linkedin.com", "Productive")
        ]
        
    # Standard fallback rules (Role 1)
    std_rules = [
        ("domain", "exact", "slack.com", "Productive"),
        ("domain", "exact", "notion.so", "Productive"),
        ("domain", "exact", "youtube.com", "Unproductive"),
        ("app", "exact", "explorer.exe", "Neutral")
    ]
    
    all_rules = rules + std_rules
    
    for rtype, mtype, pattern, cat in all_rules:
        if rtype == "domain" and domain:
            if mtype == "exact" and domain == pattern.lower():
                return cat
            if mtype == "contains" and pattern.lower() in domain:
                return cat
        elif rtype == "app" and process:
            if mtype == "exact" and process.lower() == pattern.lower():
                return cat
            if mtype == "contains" and pattern.lower() in process.lower():
                return cat
                
    # Basic fallbacks
    lower_app = cleaned_title.lower()
    if any(x in lower_app for x in ["explorer", "system", "taskmgr", "cmd", "powershell"]):
        return "Neutral"
        
    return "Neutral"

try:
    emp_res = supabase.table("employees").select("*").execute()
    employees = emp_res.data
    emp_roles = {e["name"]: get_normalized_role_name(e.get("department")) for e in employees if e.get("name")}
    print("Employees role map:", emp_roles)
    
    logs_res = supabase.table("activity_logs").select("*").execute()
    logs = logs_res.data
    
    # Let's filter for Alvin and compute overall stats
    alvin_logs = [l for l in logs if l.get("employee_name") == "Alvin"]
    print(f"\nAlvin total logs count: {len(alvin_logs)}")
    
    productive_duration = 0
    active_duration = 0
    total_duration = 0
    
    for l in alvin_logs:
        app = l.get("app_name") or ""
        if app.startswith("STATUS_CHANGE"):
            continue
            
        dur = l.get("duration_seconds") or 0
        cat = classify_activity(app, l.get("website"), l.get("category"), emp_roles.get("Alvin", "Knowledge Worker"))
        
        if cat != "Idle":
            if cat in ["Productive", "Neutral"]:
                productive_duration += dur
            active_duration += dur
        total_duration += dur
        
    print(f"Alvin total duration: {total_duration / 3600:.2f}h ({total_duration}s)")
    print(f"Alvin active duration: {active_duration / 3600:.2f}h")
    print(f"Alvin productive duration: {productive_duration / 3600:.2f}h")
    print(f"Alvin productivity rate: {round((productive_duration / active_duration) * 100) if active_duration > 0 else 0}%")

except Exception as e:
    print("Error:", e)




