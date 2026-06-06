import os
from dotenv import load_dotenv
from pymongo import MongoClient
import json
from bson import json_util

load_dotenv()

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME') or os.environ.get('DB_DATABASE', 'hrms_db')

print(f"Connecting to MongoDB: {mongo_url.split('@')[-1]} ...")
client = MongoClient(mongo_url)
db = client[db_name]

collections = db.list_collection_names()
print(f"Found {len(collections)} collections:")

schema_report = {}

for col_name in sorted(collections):
    col = db[col_name]
    count = col.count_documents({})
    print(f" - {col_name}: {count} documents")
    
    sample = col.find_one()
    if sample:
        # Convert ObjectId and datetime to string
        sample_str = json.dumps(sample, default=json_util.default, indent=2)
        schema_report[col_name] = {
            "count": count,
            "sample": json.loads(sample_str)
        }
    else:
        schema_report[col_name] = {
            "count": count,
            "sample": None
        }

with open("mongodb_inspect_report.json", "w") as f:
    json.dump(schema_report, f, indent=2)
print("Saved inspection report to mongodb_inspect_report.json")
client.close()
