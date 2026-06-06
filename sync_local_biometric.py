#!/usr/bin/env python3
"""
Biometric Device Database Sync Client
======================================
This script connects to a local SQL Server or MS Access database used by your
biometric desktop software (e.g., Realsoft, eSSL, Realtime ADMS), extracts the
latest punches, and sends them to the live HR system API.

It can be run:
1. Every 1 minute using Windows Task Scheduler or Cron (default one-shot execution).
2. As a continuous background daemon (using the --daemon flag).

Prerequisites:
--------------
pip install requests pyodbc

Configuration:
--------------
Create a file named `sync_config.json` in the same directory as this script, or edit
the default variables below.
"""

import os
import sys
import json
import time
import logging
from datetime import datetime
import requests

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("biometric_sync.log", encoding="utf-8")
    ]
)
logger = logging.getLogger("biometric-sync")

# ==================== DEFAULT CONFIGURATION ====================
DEFAULT_CONFIG = {
    # Live Server Settings
    "api_url": "https://hr.dmrhospitals.com/api/realtime-biometric/push",
    "auth_token": "realtime_t304f_auth_token_2026",
    
    # Database Settings
    # Supported database_types: "mssql" (SQL Server) or "access" (MS Access)
    "database_type": "mssql",
    
    # MSSQL Connection String details
    "mssql_server": "DESKTOP-HM8HR79\\SQLEXPRESS",
    "mssql_database": "Realsoftwebuser",
    "mssql_user": "sa",
    "mssql_password": "abc@123",
    "mssql_driver": "ODBC Driver 17 for SQL Server", # change if needed (e.g. "SQL Server")
    
    # MS Access Connection String details
    "access_db_path": "C:\\Program Files (x86)\\Realtime\\DeviceData.mdb",
    
    # Biometric Table Settings
    "table_name": "DeviceLogs",
    "col_device_sn": "DeviceSrno",      # Serial Number column name
    "col_employee_code": "EmployeeCode", # Employee Pin/ID column name
    "col_punch_time": "PunchDateAndTime",# Log Time column name
    "col_direction": "Direction",        # In/Out Direction column
    "col_punch_mode": "PunchMode",       # Fingerprint/Face Verify Mode column
}

STATE_FILE = "sync_state.json"

def load_config():
    """Load configuration from sync_config.json, fallback to defaults."""
    config_file = "sync_config.json"
    if os.path.exists(config_file):
        try:
            with open(config_file, "r") as f:
                user_config = json.load(f)
                config = {**DEFAULT_CONFIG, **user_config}
                logger.info(f"Loaded configuration from {config_file}")
                return config
        except Exception as e:
            logger.error(f"Error loading {config_file}, using defaults. Error: {e}")
    
    # Save default config template if it doesn't exist
    try:
        with open(config_file, "w") as f:
            json.dump(DEFAULT_CONFIG, f, indent=4)
        logger.info(f"Created default template config at {config_file}")
    except Exception as e:
        logger.error(f"Could not save default config template: {e}")
        
    return DEFAULT_CONFIG

def get_connection(config):
    """Establish and return database connection using pyodbc or fallback to pymssql."""
    db_type = config.get("database_type", "mssql").lower()
    
    if db_type == "mssql":
        # Try pyodbc first
        try:
            import pyodbc
            conn_str = (
                f"DRIVER={{{config['mssql_driver']}}};"
                f"SERVER={config['mssql_server']};"
                f"DATABASE={config['mssql_database']};"
                f"UID={config['mssql_user']};"
                f"PWD={config['mssql_password']};"
                "MultipleActiveResultSets=True;"
            )
            logger.info(f"Connecting to MS SQL Server using pyodbc: {config['mssql_server']}...")
            conn = pyodbc.connect(conn_str)
            conn._use_mssql = False
            return conn
        except ImportError:
            logger.info("pyodbc not available. Trying pymssql fallback...")
            
        try:
            import pymssql
            server = config['mssql_server']
            logger.info(f"Connecting to MS SQL Server using pymssql: {server}...")
            conn = pymssql.connect(
                server=server,
                user=config['mssql_user'],
                password=config['mssql_password'],
                database=config['mssql_database']
            )
            conn._use_mssql = True
            return conn
        except ImportError:
            raise ImportError("Neither pyodbc nor pymssql is installed. Please run: pip install pyodbc or pip install pymssql")
            
    elif db_type == "access":
        import pyodbc
        conn_str = (
            f"DRIVER={{Microsoft Access Driver (*.mdb, *.accdb)}};"
            f"DBQ={config['access_db_path']};"
        )
        logger.info(f"Connecting to MS Access Database: {config['access_db_path']}...")
        conn = pyodbc.connect(conn_str)
        conn._use_mssql = False
        return conn
    else:
        raise ValueError(f"Unsupported database type: {db_type}")


def get_last_sync_time():
    """Read the last synced log timestamp from state file."""
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r") as f:
                state = json.load(f)
                return state.get("last_sync_time")
        except Exception as e:
            logger.warning(f"Could not read state file: {e}")
    return None

def save_last_sync_time(last_time):
    """Write the last synced log timestamp to state file."""
    try:
        with open(STATE_FILE, "w") as f:
            json.dump({"last_sync_time": last_time}, f)
    except Exception as e:
        logger.error(f"Could not write state file: {e}")

def run_sync(config):
    """Fetch new biometric logs and push them to the server."""
    last_sync_time = get_last_sync_time()
    
    # If no last_sync_time exists, default to start of today to avoid loading years of data
    if not last_sync_time:
        last_sync_time = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M:%S")
        logger.info(f"No previous sync state found. Syncing logs starting from today: {last_sync_time}")
    else:
        logger.info(f"Syncing logs after last synced timestamp: {last_sync_time}")

    conn = None
    try:
        conn = get_connection(config)
        cursor = conn.cursor()
        
        # Build query dynamically based on columns
        placeholder = "%s" if getattr(conn, '_use_mssql', False) else "?"
        query = (
            f"SELECT {config['col_device_sn']}, {config['col_employee_code']}, "
            f"{config['col_punch_time']}, {config['col_direction']}, {config['col_punch_mode']} "
            f"FROM {config['table_name']} "
            f"WHERE {config['col_punch_time']} > {placeholder} "
            f"ORDER BY {config['col_punch_time']} ASC"
        )
        
        cursor.execute(query, (last_sync_time,))
        rows = cursor.fetchall()
        
        if not rows:
            logger.info("No new logs found to synchronize.")
            return

        logger.info(f"Found {len(rows)} new biometric logs. Preparing payload...")
        
        payload = []
        max_time_in_batch = last_sync_time

        for row in rows:
            # Handle possible nulls and format values
            device_sn = str(row[0]).strip() if row[0] is not None else ""
            emp_code = str(row[1]).strip() if row[1] is not None else ""
            
            # Format punch date time string
            punch_time = row[2]
            if isinstance(punch_time, datetime):
                punch_time_str = punch_time.strftime("%Y-%m-%d %H:%M:%S")
            else:
                punch_time_str = str(punch_time).strip()
                
            direction = str(row[3]).strip() if row[3] is not None else "in"
            punch_mode = str(row[4]).strip() if row[4] is not None else "unknown"
            
            if not device_sn or not emp_code or not punch_time_str:
                continue

            payload.append({
                "SerialNo": device_sn,
                "EmployeeCode": emp_code,
                "PunchDateAndTime": punch_time_str,
                "Direction": direction,
                "PunchMode": punch_mode
            })
            
            # Track the latest punch time processed in this batch
            if punch_time_str > max_time_in_batch:
                max_time_in_batch = punch_time_str

        if not payload:
            logger.info("No valid logs found in batch.")
            return

        # Push to Remote Server in batches of 100 to prevent large requests
        batch_size = 100
        headers = {
            "Content-Type": "application/json",
            "x-biometric-token": config["auth_token"]
        }
        
        success_count = 0
        for i in range(0, len(payload), batch_size):
            batch = payload[i : i + batch_size]
            logger.info(f"Pushing batch of {len(batch)} records to live server...")
            
            try:
                response = requests.post(config["api_url"], headers=headers, json=batch, timeout=15)
                if response.status_code == 200:
                    res_data = response.json()
                    processed = res_data.get("processed_records", len(batch))
                    success_count += processed
                    logger.info(f"Successfully synced batch! Server processed: {processed} logs.")
                else:
                    logger.error(f"Server returned error code {response.status_code}: {response.text}")
                    break
            except Exception as e:
                logger.error(f"HTTP request failed: {e}")
                break
                
        if success_count > 0:
            logger.info(f"Synchronization batch completed. Total {success_count} logs pushed.")
            save_last_sync_time(max_time_in_batch)
            logger.info(f"Updated sync state to: {max_time_in_batch}")

    except Exception as e:
        logger.error(f"Database sync operation failed: {e}")
    finally:
        if conn:
            conn.close()
            logger.info("Database connection closed.")

def main():
    daemon_mode = "--daemon" in sys.argv
    config = load_config()
    
    # Ensure at least one database driver is installed
    try:
        import pyodbc
    except ImportError:
        try:
            import pymssql
        except ImportError:
            logger.critical("Required module 'pyodbc' or 'pymssql' is not installed. Please run: pip install pymssql")
            sys.exit(1)

    if daemon_mode:
        logger.info("Starting Biometric Sync Daemon. Press Ctrl+C to exit.")
        while True:
            try:
                run_sync(config)
            except Exception as e:
                logger.error(f"Daemon loop error: {e}")
            time.sleep(60) # Sync every 1 minute
    else:
        logger.info("Running single-shot Biometric Sync...")
        run_sync(config)
        logger.info("Sync complete.")

if __name__ == "__main__":
    main()
