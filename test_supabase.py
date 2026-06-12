from supabase import create_client

url = "https://utwklfackfqmkmpmhvri.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0d2tsZmFja2ZxbWttcG1odnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzgwNzUsImV4cCI6MjA5NDY1NDA3NX0.7rNmCSgR8AOYsR-bhozYJiWRPtVqWwKy-UU9cECPa84"

supabase = create_client(url, key)

response = supabase.table("activity_logs").select("employee_name").execute()
names = set(item['employee_name'] for item in response.data if item.get('employee_name'))
print(names)
