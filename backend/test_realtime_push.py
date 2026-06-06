import requests
import json

url = "http://127.0.0.1:8001/api/realtime-biometric/push"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer realtime_t304f_auth_token_2026"
}

payload = {
    "SerialNo": "RSS-TEST-DEVICE-001",
    "EmployeeCode": "EMP-ACME-002",
    "PunchDateAndTime": "2026-05-28 17:45:00",
    "PunchMode": "fingerprint",
    "Direction": "in"
}

print(f"Sending test push to {url}...")
try:
    response = requests.post(url, headers=headers, json=payload)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error connecting: {e}")
