#!/usr/bin/env python3
"""
Direct Biometric Machine Sync Client (Mac / pyzk)
==================================================
This script connects directly to the biometric machine's IP address over the LAN
using the ZK/Realtime network protocol, downloads the latest punches,
and sends them to the live HR system API.
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
        logging.FileHandler("direct_sync.log", encoding="utf-8")
    ]
)
logger = logging.getLogger("direct-sync")

# Configuration
CONFIG = {
    "device_ip": "192.168.1.224",
    "device_port": 5005,
    # LOCAL server (NestJS running on your Mac)
    "api_url": "http://localhost:8002/api/biometric/push",
    "auth_token": "realtime_t304f_auth_token_2026",
}

STATE_FILE = "direct_sync_state.json"

def get_last_sync_time():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r") as f:
                state = json.load(f)
                return state.get("last_sync_time")
        except Exception as e:
            logger.warning(f"Could not read state file: {e}")
    return None

def save_last_sync_time(last_time):
    try:
        with open(STATE_FILE, "w") as f:
            json.dump({"last_sync_time": last_time}, f)
    except Exception as e:
        logger.error(f"Could not write state file: {e}")

def run_sync():
    from zk import ZK
    
    last_sync_time_str = get_last_sync_time()
    last_sync_time = None
    if last_sync_time_str:
        try:
            last_sync_time = datetime.strptime(last_sync_time_str, "%Y-%m-%d %H:%M:%S")
            logger.info(f"Syncing logs after last synced timestamp: {last_sync_time_str}")
        except Exception:
            pass
            
    if not last_sync_time:
        # Default to start of today
        last_sync_time = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        logger.info(f"No previous sync state found. Syncing logs starting from today: {last_sync_time}")

    zk = ZK(CONFIG["device_ip"], port=CONFIG["device_port"], timeout=5)
    conn = None
    try:
        logger.info(f"Connecting to biometric machine at {CONFIG['device_ip']}:{CONFIG['device_port']}...")
        conn = zk.connect()
        logger.info("Connected successfully! Fetching logs...")
        
        # Disable device while fetching to avoid collisions
        conn.disable_device()
        attendance = conn.get_attendance()
        conn.enable_device()
        
        if not attendance:
            logger.info("No logs found on device.")
            return

        logger.info(f"Retrieved {len(attendance)} total logs from device. Filtering new punches...")
        
        payload = []
        max_time_in_batch = last_sync_time
        
        for record in attendance:
            # record.timestamp is a datetime object
            if record.timestamp > last_sync_time:
                punch_time_str = record.timestamp.strftime("%Y-%m-%d %H:%M:%S")
                
                payload.append({
                    "SerialNo": "RSS202512133928", # Machine Serial Number
                    "EmployeeCode": str(record.user_id).strip(),
                    "PunchDateAndTime": punch_time_str,
                    "Direction": "in" if record.status == 0 else "out",
                    "PunchMode": str(record.punch)
                })
                
                if record.timestamp > max_time_in_batch:
                    max_time_in_batch = record.timestamp

        if not payload:
            logger.info("No new logs to synchronize.")
            return

        logger.info(f"Found {len(payload)} new biometric logs. Pushing to live server...")
        
        # Send payload to server
        headers = {
            "Content-Type": "application/json",
            "x-biometric-token": CONFIG["auth_token"]
        }
        
        response = requests.post(CONFIG["api_url"], headers=headers, json=payload, timeout=15)
        if response.status_code == 200:
            logger.info(f"Successfully synced {len(payload)} logs to live server!")
            save_last_sync_time(max_time_in_batch.strftime("%Y-%m-%d %H:%M:%S"))
        else:
            logger.error(f"Server returned error code {response.status_code}: {response.text}")
            
    except Exception as e:
        logger.error(f"Failed to connect or pull data: {e}")
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass
            logger.info("Connection closed.")

def main():
    daemon_mode = "--daemon" in sys.argv
    if daemon_mode:
        logger.info("Starting Direct Biometric Sync Daemon. Press Ctrl+C to exit.")
        while True:
            try:
                run_sync()
            except Exception as e:
                logger.error(f"Daemon loop error: {e}")
            time.sleep(60)
    else:
        logger.info("Running single-shot Direct Biometric Sync...")
        run_sync()
        logger.info("Sync complete.")

if __name__ == "__main__":
    main()
