import requests
from pymongo import MongoClient

client = MongoClient('mongodb+srv://creativecloudakash_db_user:OKIlaoFRwNaRdEyO@hr-sai.u2bpdap.mongodb.net/hrms_db?retryWrites=true&w=majority&appName=HR-sai')
db = client.hrms_db

# List all users and their roles
users = list(db.users.find({}, {'email': 1, 'role': 1, 'name': 1, 'password_hash': 1}))
for u in users:
    print(f"  {u.get('role'):<15} {u.get('email'):<40} {u.get('name')}")

# Try login with each email
print("\n--- Testing logins ---")
passwords = ['Admin@123', 'admin123', 'Hr@123', 'password', 'Password@123', 'HRAdmin@123', '123456']
for u in users[:5]:
    for pwd in passwords:
        r = requests.post('http://127.0.0.1:8001/api/auth/login',
                          json={'email': u['email'], 'password': pwd},
                          timeout=5)
        if r.status_code == 200 and r.json().get('access_token'):
            print(f"SUCCESS: email={u['email']} password={pwd}")
            break

client.close()
