from supabase import create_client

url = "https://utwklfackfqmkmpmhvri.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0d2tsZmFja2ZxbWttcG1odnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzgwNzUsImV4cCI6MjA5NDY1NDA3NX0.7rNmCSgR8AOYsR-bhozYJiWRPtVqWwKy-UU9cECPa84"

supabase = create_client(url, key)

print("Starting employee department sync...")

# Alvin
try:
    print("Updating Alvin (EMP001)...")
    res = supabase.table("employees").update({"department": "Software Developer"}).eq("id", "EMP001").execute()
    print("Alvin updated:", res.data)
except Exception as e:
    print("Error updating Alvin:", e)

# Alan
try:
    print("Updating Alan (EMP002)...")
    res = supabase.table("employees").update({"department": "Software Developer"}).eq("id", "EMP002").execute()
    print("Alan updated:", res.data)
except Exception as e:
    print("Error updating Alan:", e)

# Nandu
try:
    print("Updating Nandu (EMP007)...")
    res = supabase.table("employees").update({"department": "Designer"}).eq("id", "EMP007").execute()
    print("Nandu updated:", res.data)
except Exception as e:
    print("Error updating Nandu:", e)

print("Employee sync completed.")
