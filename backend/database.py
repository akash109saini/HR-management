from motor.motor_asyncio import AsyncIOMotorClient
import os

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
# Support both DB_NAME and DB_DATABASE environment variables
db_name = os.environ.get('DB_NAME') or os.environ.get('DB_DATABASE', 'hrms_db')
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]
