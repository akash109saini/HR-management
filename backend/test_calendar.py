import requests, json

# Login as admin
r = requests.post('http://127.0.0.1:8001/api/auth/login',
                  json={'email': 'admin@hrms.com', 'password': 'admin123'})
print("Login:", r.status_code)
token = r.json().get('access_token', '')
print("Token obtained:", bool(token))

headers = {'Authorization': f'Bearer {token}'}

# Test calendar for Tanish (EMP-TECH-003)
res = requests.get(
    'http://127.0.0.1:8001/api/attendance/calendar',
    params={'month': '2026-05', 'employee_id': 'EMP-TECH-003'},
    headers=headers
)
print("Calendar status:", res.status_code)
data = res.json()

if 'rows' in data:
    print(f"\nEmployee: {data['employee_name']} | Shift: {data['shift_time']} | Total days: {len(data['rows'])}")
    print()
    print(f"{'Date':<14} {'Weekday':<12} {'Shift Time':<14} {'In':<8} {'Out':<8} {'WH':<8} {'Late':<8} {'Early':<8} {'Status'}")
    print("-" * 90)
    for row in data['rows']:
        print(f"{row['display_date']:<14} {row['weekday']:<12} {row['shift_time']:<14} {row['in_time']:<8} {row['out_time']:<8} {row['working_hour']:<8} {row['late_by']:<8} {row['early_by']:<8} {row['status']}")
    
    # Summary
    from collections import Counter
    counts = Counter(r['status'] for r in data['rows'])
    print("\nSummary:", dict(counts))
else:
    print("Response:", json.dumps(data, indent=2))
