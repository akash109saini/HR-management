import asyncio
import logging
from typing import Dict, Any, List
from fastapi import FastAPI, APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("biometric-listener")

app = FastAPI(title="Biometric Integration Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ActiveWebSocketsManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"New client connected. Active: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info(f"Client disconnected. Active: {len(self.active_connections)}")

    async def broadcast(self, data: Dict[str, Any]):
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except Exception as e:
                logger.error(f"Error broadcasting to client: {e}")

ws_manager = ActiveWebSocketsManager()

# --- HTTP Webhook / Push receiver ---
@app.post("/api/biometric/webhook")
async def receive_webhook_log(payload: Dict[str, Any], request: Request):
    logger.info(f"Received webhook payload: {payload}")
    # Broadcast to all frontend clients in real-time
    await ws_manager.broadcast({
        "source": "webhook",
        "payload": payload
    })
    return {"status": "success", "message": "Log processed"}

@app.websocket("/ws/live-punches")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; read dummy client responses if any
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

# --- Async TCP Socket Listener for raw binary/text device logs ---
async def handle_tcp_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    client_address = writer.get_extra_info("peername")
    logger.info(f"New TCP connection from {client_address}")
    try:
        while True:
            data = await reader.read(1024)
            if not data:
                break
            
            raw_text = data.decode("utf-8", errors="ignore").strip()
            logger.info(f"Received from TCP client {client_address}: {raw_text}")
            
            # Broadcast raw data to frontend for real-time debug visualization
            await ws_manager.broadcast({
                "source": f"tcp_{client_address[0]}:{client_address[1]}",
                "raw_data": raw_text
            })
            
            # Send acknowledgement response back to device if expected by protocol
            writer.write(b"OK\n")
            await writer.drain()
    except Exception as e:
        logger.error(f"Error handling TCP client {client_address}: {e}")
    finally:
        writer.close()
        await writer.wait_closed()
        logger.info(f"TCP connection closed for {client_address}")

async def start_tcp_listener():
    server = await asyncio.start_server(handle_tcp_client, "0.0.0.0", 5005)
    logger.info("TCP socket listener started on port 5005")
    async with server:
        await server.serve_forever()

@app.on_event("startup")
async def startup_event():
    # Start the TCP socket listener concurrently in the asyncio event loop
    asyncio.create_task(start_tcp_listener())
