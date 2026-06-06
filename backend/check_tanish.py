from pymongo import MongoClient
import re

client = MongoClient('mongodb+srv://creativecloudakash_db_user:OKIlaoFRwNaRdEyO@hr-sai.u2bpdap.mongodb.net/hrms_db?retryWrites=true&w=majority&appName=HR-sai')
db = client['hrms_db']

def print_doc(doc):
    if not doc:
        return
    for k, v in doc.items():
        if k not in ('_id', 'password_hash'):
            print(f"  {k}: {v}")

# Search for Tanish by name
print("=== TANISH USER SEARCH ===")
tanish = db.users.find_one({"name": re.compile("tanish", re.IGNORECASE)})
if tanish:
    print_doc(tanish)
else:
    print("Not found by name. Searching by biometric_pin...")
    for pin in ["00000001", "1", "0000001"]:
        t = db.users.find_one({"biometric_pin": pin})
        if t:
            print(f"Found with biometric_pin={pin}:")
            print_doc(t)
            tanish = t
            break
    else:
        print("ERROR: No user found with biometric_pin 00000001 or 1!")
        print("All users with biometric_pin set:")
        for u in db.users.find({"biometric_pin": {"$exists": True}}, {"name":1, "employee_id":1, "biometric_pin":1}):
            print(f"  {u.get('name')} | emp_id={u.get('employee_id')} | pin={u.get('biometric_pin')}")

print()
print("=== LATEST PUNCHES (user_pin=00000001 or 1) ===")
punches = list(db.biometric_punches.find(
    {"user_pin": {"$in": ["00000001","1"]}},
    sort=[("received_at", -1)],
    limit=5
))
if punches:
    for p in punches:
        print(f"  punch_id={p.get('punch_id')} | emp={p.get('employee_name')} | matched={p.get('matched')} | timestamp={p.get('timestamp')} | received={p.get('received_at')}")
else:
    print("No punches found for this biometric ID!")

client.close()
