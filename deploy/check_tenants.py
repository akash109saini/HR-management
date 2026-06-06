import pymongo
import sys

MONGO_URL = "mongodb+srv://creativecloudakash_db_user:1Akash%40%40@hr-sai.u2bpdap.mongodb.net/hrms_db?retryWrites=true&w=majority&appName=HR-sai"
DB_NAME = "hrms_db"

def main():
    try:
        client = pymongo.MongoClient(MONGO_URL)
        db = client[DB_NAME]
        
        # Test connection
        print("Connecting to MongoDB Atlas...")
        client.admin.command('ping')
        print("Connected successfully!")
        
        print("\n--- Collections ---")
        for coll in db.list_collection_names():
            print(f"- {coll} (count: {db[coll].count_documents({})})")
            
        print("\n--- Tenants ---")
        for t in db.tenants.find():
            print(f"- ID: {t.get('id')}, Name: {t.get('name')}, Domain: {t.get('domain')}")
            
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
