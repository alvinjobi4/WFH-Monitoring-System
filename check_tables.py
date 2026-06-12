from supabase import create_client

url = "https://utwklfackfqmkmpmhvri.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0d2tsZmFja2ZxbWttcG1odnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzgwNzUsImV4cCI6MjA5NDY1NDA3NX0.7rNmCSgR8AOYsR-bhozYJiWRPtVqWwKy-UU9cECPa84"

supabase = create_client(url, key)

print("Checking employees table:")
try:
    response = supabase.table("employees").select("*").execute()
    print("employees data:")
    for row in response.data:
        print("  -", row)
except Exception as e:
    print("employees table error:", e)

print("\nChecking if users table still exists:")
try:
    response = supabase.table("users").select("*").execute()
    print("users data (should fail or be empty):", response.data)
except Exception as e:
    print("users table error (expected):", e)
