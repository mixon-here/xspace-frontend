import React, { useState } from 'react';
import { Terminal, Copy, Check, Zap } from 'lucide-react';

interface ServerSetupProps {
  onClose: () => void;
}

const ServerSetup: React.FC<ServerSetupProps> = ({ onClose }) => {
  const [copied, setCopied] = useState(false);

  const getInstallScript = () => {
    // NOTE: using a template string inside a template string requires careful escaping of backslashes and $
    return `#!/bin/bash

# ==========================================
# XSPACE BROADCAST SERVER (v10.0 - GAME)
# Features:
# 1. LOGS: Detailed System Monitor (RAM/CPU/CONNS)
# 2. GAME: SQLite Leaderboard for Tetris
# 3. WATCHDOG: Keeps server healthy.
# ==========================================

echo -e "\\e[1;35m>>> STARTING INSTALLATION...\\e[0m"

# 1. KILL PROCESSES
pkill -f ngrok
pkill -f xspace.py
pkill -f "bash start.sh"

# 2. SYSTEM DEPENDENCIES
echo "Updating system..."
sudo apt-get update -qq
sudo apt-get install -y ffmpeg curl unzip build-essential sqlite3 -qq

# 3. NGROK
if ! command -v ngrok &> /dev/null; then
    curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
    echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
    sudo apt-get update -qq
    sudo apt-get install ngrok -y -qq
fi

# 4. MINICONDA
if [ ! -d "$HOME/miniconda3" ]; then
    mkdir -p ~/miniconda3
    wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O ~/miniconda3/miniconda.sh
    bash ~/miniconda3/miniconda.sh -b -u -p ~/miniconda3
    rm -rf ~/miniconda3/miniconda.sh
fi

# 5. PYTHON ENV
source "$HOME/miniconda3/etc/profile.d/conda.sh"
if ! conda info --envs | grep -q "xspace"; then
    conda create -n xspace python=3.11 -c conda-forge --override-channels -y
fi
conda activate xspace

# 6. LIBRARIES
echo "Installing Python libraries..."
pip uninstall google-genai google-generativeai -y -q
# Installing psutil, but server will survive without it
pip install --default-timeout=100 --retries 5 -U groq aiohttp fastapi uvicorn yt-dlp websockets curl-cffi psutil pydantic

# 7. CONFIG
echo ""
echo -e "\\e[1;33m>>> SETUP \\e[0m"
if [ -z "$GROQ_KEY" ]; then
    echo "Enter GROQ_API_KEY(s)."
    echo "Tip: You can enter multiple keys separated by commas (key1,key2,key3) to avoid Rate Limits."
    read -p "Keys: " GROQ_KEY
fi
if [ -z "$NGROK_TOKEN" ]; then
    read -p "Enter NGROK_AUTHTOKEN: " NGROK_TOKEN
fi
if [ -z "$NGROK_DOMAIN" ]; then
    read -p "Enter NGROK_DOMAIN (optional, press Enter for random): " NGROK_DOMAIN
fi

ngrok config add-authtoken $NGROK_TOKEN

# 8. SERVER CODE (xspace.py)
cat <<EOF > xspace.py
import asyncio
import os
import json
import logging
import struct
import time
import sqlite3
from typing import List, Dict, Set, Optional
from pydantic import BaseModel
from groq import AsyncGroq, RateLimitError
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import yt_dlp
import uvicorn

# Try importing psutil safely
try:
    import psutil
except ImportError:
    psutil = None

# --- CONFIGURATION ---
RAW_KEYS = "\${GROQ_KEY}"
API_KEYS = [k.strip() for k in RAW_KEYS.split(",") if k.strip()]
CURRENT_KEY_INDEX = 0

BUFFER_SECONDS = 30
SAMPLE_RATE = 16000
CHANNELS = 1
SAMPWIDTH = 2
BUFFER_SIZE = SAMPLE_RATE * CHANNELS * SAMPWIDTH * BUFFER_SECONDS 
MAX_HISTORY_ITEMS = 3000

# --- ANTI-CHEAT & GAME CONFIG ---
CLIENT_SECRET = "XSPACE_CLIENT_SECRET_98" # Must match client
ADMIN_SECRET_KEY = "ADMIN_SECRET_KEY"     # For deleting DB
MAX_PPS = 1000 # Max points per second theoretically possible in Tetris (loose limit)

# --- WATCHDOG CONFIG ---
MAX_BROADCAST_DURATION = 3 * 60 * 60  # 3 Hours (Hard Limit)
SILENCE_TIMEOUT = 10 * 60             # 10 Minutes (No audio detected)

# Initialize clients for rotation
clients = [AsyncGroq(api_key=k) for k in API_KEYS]

# Configure Logging (File + Console)
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("xspace.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("xspace")

# --- DATABASE SETUP ---
DB_FILE = "xspace.db"

def init_db():
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS scores
                     (name TEXT, score INTEGER, timestamp REAL, signature TEXT)''')
        conn.commit()
        conn.close()
        logger.info("💾 Database Initialized")
    except Exception as e:
        logger.error(f"DB Init Failed: {e}")

init_db()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MODELS ---
class ScoreSubmission(BaseModel):
    name: str
    score: int
    start_time: float
    signature: str

# --- SYSTEM MONITOR ---
async def monitor_system():
    """Logs system resource usage every 30 seconds to console"""
    while True:
        try:
            msg = "✅ HEARTBEAT: "
            if psutil:
                mem = psutil.virtual_memory()
                cpu = psutil.cpu_percent()
                msg += f"RAM={mem.percent}% | CPU={cpu}% | "
            
            # Connections
            conns = len(manager.active_connections) if 'manager' in globals() else 0
            msg += f"Listeners={conns}"
            
            logger.info(msg)
            
            await asyncio.sleep(30)
        except Exception as e:
            await asyncio.sleep(30)

async def get_working_client():
    global CURRENT_KEY_INDEX
    return clients[CURRENT_KEY_INDEX]

async def rotate_key():
    global CURRENT_KEY_INDEX
    if len(clients) > 1:
        CURRENT_KEY_INDEX = (CURRENT_KEY_INDEX + 1) % len(clients)
        logger.warning(f"🔄 RATE LIMIT HIT! Switching to API Key #{CURRENT_KEY_INDEX + 1}")
    else:
        logger.error("❌ RATE LIMIT HIT! No other keys available. Waiting 5s...")
        await asyncio.sleep(5)

async def translate_text(text: str, target_lang: str):
    if target_lang == "English": return text
    
    for attempt in range(len(clients) + 1): 
        try:
            client = await get_working_client()
            chat = await client.chat.completions.create(
                messages=[
                    {"role": "system", "content": f"Translate this to {target_lang}. Return ONLY text."},
                    {"role": "user", "content": text}
                ],
                model="llama-3.1-8b-instant", 
                temperature=0.3, max_tokens=1024,
            )
            return chat.choices[0].message.content
        except RateLimitError:
            await rotate_key()
            continue
        except Exception as e:
            logger.error(f"Translation error ({target_lang}): {e}")
            return text
            
    return text

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[tuple[WebSocket, str]] = []
        self.history: List[Dict] = [] 

    async def connect(self, websocket: WebSocket, target_lang: str = "English"):
        self.active_connections.append((websocket, target_lang))
        
        client_ip = "Unknown"
        if websocket.client:
            client_ip = websocket.client.host
        logger.info(f"🔌 CONNECTED: IP={client_ip} | LANG={target_lang} | TOTAL={len(self.active_connections)}")
        
        await self.broadcast_stats()

    def disconnect(self, websocket: WebSocket, client_ip: str = "Unknown"):
        self.active_connections = [c for c in self.active_connections if c[0] != websocket]
        logger.info(f"👋 DISCONNECTED: IP={client_ip} | REMAINING={len(self.active_connections)}")
        pass

    def get_needed_languages(self) -> Set[str]:
        return set(c[1] for c in self.active_connections)

    def get_stats(self):
        counts = {}
        for _, lang in self.active_connections:
            counts[lang] = counts.get(lang, 0) + 1
        return {"total": len(self.active_connections), "breakdown": counts}

    async def broadcast_stats(self):
        stats = self.get_stats()
        payload = {"type": "stats", "data": stats}
        for ws, _ in self.active_connections:
            try: await ws.send_json(payload)
            except: pass

    def add_history(self, original: str, translations: Dict[str, str]):
        if len(self.history) > MAX_HISTORY_ITEMS:
            self.history.pop(0)
        
        entry = {
            "original": original,
            "translations": translations,
            "timestamp": time.time()
        }
        self.history.append(entry)
        
        try:
            with open("session_log.jsonl", "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\\n")
        except Exception as e:
            logger.error(f"Disk Write Error: {e}")

    def clear_history(self):
        self.history = []
        logger.info("🧹 RAM History CLEARED.")

    async def broadcast_result(self, original: str, translations: Dict[str, str]):
        disconnected = []
        for ws, lang in self.active_connections:
            try:
                text_to_send = ""
                if lang == "English":
                    text_to_send = original
                elif lang in translations:
                    text_to_send = translations[lang]
                
                if text_to_send:
                    payload = {
                        "transcript": text_to_send,
                        "is_user": False,
                        "timestamp": time.time()
                    }
                    await ws.send_json(payload)
            except:
                disconnected.append(ws)
        
        for ws in disconnected:
            self.active_connections = [c for c in self.active_connections if c[0] != ws]
        
        if disconnected:
            await self.broadcast_stats()

    async def broadcast_meta(self, title: str):
        payload = {"type": "meta", "title": title}
        for ws, _ in self.active_connections:
            try: await ws.send_json(payload)
            except: pass

manager = ConnectionManager()

class AudioStreamProcessor:
    def __init__(self):
        self.is_running = False
        self.current_url = None
        self.current_title = ""
        self.audio_queue = asyncio.Queue()
        self.ffmpeg_process = None
        self.processing_task = None
        self.watchdog_task = None
        
        # Watchdog Stats
        self.start_time = 0
        self.last_activity_time = 0
        
    async def get_stream_info(self, url: str):
        ydl_opts = {
            'format': 'bestaudio/best', 
            'quiet': True, 
            'noplaylist': True,
            'extractor_args': {'twitter': {'impersonate': 'chrome'}},
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        loop = asyncio.get_event_loop()
        try:
            info = await loop.run_in_executor(None, lambda: yt_dlp.YoutubeDL(ydl_opts).extract_info(url, download=False))
            if not info: return None, None
            return info.get('url'), info.get('title', 'Unknown Broadcast')
        except Exception as e:
            logger.error(f"Failed to get stream info: {e}")
            return None, None

    async def stop_stream(self):
        if self.is_running:
            logger.info("🛑 STOPPING CURRENT STREAM & CLEANING RESOURCES...")
        
        self.is_running = False
        
        # Clear Data
        manager.clear_history() 
        
        if self.ffmpeg_process:
            try:
                self.ffmpeg_process.kill() 
                await self.ffmpeg_process.wait()
            except: pass
            self.ffmpeg_process = None

        if self.processing_task:
            self.processing_task.cancel()
            try: await self.processing_task
            except asyncio.CancelledError: pass
            self.processing_task = None

        if self.watchdog_task:
            self.watchdog_task.cancel()
            self.watchdog_task = None

        self.audio_queue = asyncio.Queue() 
        self.current_url = None
        self.current_title = ""
        await manager.broadcast_meta("") # Clears title on client side
        logger.info("✅ STREAM STOPPED & RAM FREED.")

    async def start_stream(self, twitter_url: str):
        await self.stop_stream()
        manager.clear_history()

        logger.info(f"⏳ INITIALIZING NEW STREAM: {twitter_url}")
        stream_url, title = await self.get_stream_info(twitter_url)
        
        if not stream_url:
            logger.error("❌ ERROR: Could not extract stream URL.")
            await manager.broadcast_meta("⚠️ SYSTEM ERROR: INVALID SPACE URL ⚠️")
            return

        self.is_running = True
        self.current_url = twitter_url
        self.current_title = title
        
        # Reset Watchdog timers
        self.start_time = time.time()
        self.last_activity_time = time.time()
        
        logger.info(f"🎙️ ON AIR: {title}")
        await manager.broadcast_meta(title)

        asyncio.create_task(self.run_ffmpeg(stream_url))
        self.processing_task = asyncio.create_task(self.process_audio())
        self.watchdog_task = asyncio.create_task(self.watchdog_loop())

    async def watchdog_loop(self):
        """Monitors stream health and auto-stops if necessary"""
        logger.info("👀 WATCHDOG: Started monitoring stream duration and silence.")
        while self.is_running:
            await asyncio.sleep(60) # Check every minute
            now = time.time()
            
            # Rule 1: Max Duration (3 Hours)
            if now - self.start_time > MAX_BROADCAST_DURATION:
                logger.warning("⏰ WATCHDOG: Max broadcast duration (3h) reached. Auto-stopping.")
                await self.stop_stream()
                break
                
            # Rule 2: Silence Detection (10 Minutes)
            if now - self.last_activity_time > SILENCE_TIMEOUT:
                logger.warning("⏰ WATCHDOG: No audio processed for 10m. Auto-stopping.")
                await self.stop_stream()
                break

    async def run_ffmpeg(self, stream_url: str):
        try:
            self.ffmpeg_process = await asyncio.create_subprocess_exec(
                'ffmpeg', '-re', '-i', stream_url, '-f', 's16le', '-ac', '1', '-ar', '16000', '-vn', '-bufsize', '4096k', 'pipe:1',
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL
            )
            while self.is_running:
                chunk = await self.ffmpeg_process.stdout.read(4096)
                if not chunk: break
                await self.audio_queue.put(chunk)
                # Update activity time since we received data
                self.last_activity_time = time.time()
        except Exception as e:
            if self.is_running: logger.error(f"FFmpeg error: {e}")

    async def process_audio(self):
        audio_buffer = bytearray()
        try:
            while self.is_running:
                try:
                    chunk = await asyncio.wait_for(self.audio_queue.get(), timeout=1.0)
                    audio_buffer.extend(chunk)
                except asyncio.TimeoutError:
                    continue
                
                if len(audio_buffer) >= BUFFER_SIZE:
                    temp_filename = f"temp_{int(time.time())}.wav"
                    with open(temp_filename, "wb") as f:
                        header = struct.pack('<4sI4s', b'RIFF', 36 + len(audio_buffer), b'WAVE')
                        header += struct.pack('<4sIHHIIHH', b'fmt ', 16, 1, CHANNELS, SAMPLE_RATE, SAMPLE_RATE * CHANNELS * SAMPWIDTH, CHANNELS * SAMPWIDTH, SAMPWIDTH * 8)
                        header += struct.pack('<4sI', b'data', len(audio_buffer))
                        f.write(header + audio_buffer)
                    
                    audio_buffer = bytearray() 
                    if os.path.exists(temp_filename):
                        with open(temp_filename, "rb") as f: wav_data = f.read()
                        asyncio.create_task(self.transcribe_and_distribute(wav_data, temp_filename))
        except asyncio.CancelledError:
            logger.info("Processing task cancelled.")

    async def transcribe_and_distribute(self, wav_data, filename):
        try:
            transcription = await clients[0].audio.transcriptions.create(
                file=("audio.wav", wav_data), 
                model="whisper-large-v3", 
                response_format="json"
            )
            text = transcription.text.strip()

            if text and len(text) > 5:
                # Update activity time since we got a valid transcript
                self.last_activity_time = time.time()
                
                logger.info(f"🗣️ TRANSCRIPT: {text[:40]}...")
                
                needed_langs = manager.get_needed_languages()
                translations_cache = {}
                
                target_langs = [l for l in needed_langs if l != "English"]
                
                tasks = [translate_text(text, lang) for lang in target_langs]
                
                if tasks:
                    results = await asyncio.gather(*tasks)
                    for i, lang in enumerate(target_langs):
                        translations_cache[lang] = results[i]
                
                manager.add_history(text, translations_cache)
                await manager.broadcast_result(text, translations_cache)
                
        except Exception as e:
            logger.error(f"Processing Error: {e}")
        finally:
            if os.path.exists(filename): os.remove(filename)

processor = AudioStreamProcessor()

# --- HTTP ENDPOINTS (GAME) ---

@app.get("/scores")
def get_scores():
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute("SELECT name, score, timestamp FROM scores ORDER BY score DESC LIMIT 50")
        rows = c.fetchall()
        conn.close()
        return [{"name": r[0], "score": r[1], "timestamp": r[2]} for r in rows]
    except Exception as e:
        logger.error(f"DB Read Error: {e}")
        return []

@app.post("/scores")
def submit_score(sub: ScoreSubmission):
    # LEVEL 1 SECURITY: Verify Hash
    msg = f"{sub.name}{sub.score}{CLIENT_SECRET}"
    expected_hash = 0
    for char in msg:
        expected_hash = ((expected_hash << 5) - expected_hash) + ord(char)
        expected_hash = expected_hash & expected_hash # 32bit int
    
    if str(expected_hash) != sub.signature:
        logger.warning(f"CHEAT ATTEMPT: Invalid Signature from {sub.name}")
        return {"status": "rejected", "reason": "signature_mismatch"}

    # LEVEL 2 SECURITY: Verify Time vs Score
    duration = time.time() - sub.start_time
    if duration <= 0: duration = 1
    pps = sub.score / duration
    
    if pps > MAX_PPS and sub.score > 500: # Only check significant scores
        logger.warning(f"CHEAT ATTEMPT: Impossible speed ({pps} pps) from {sub.name}")
        return {"status": "rejected", "reason": "impossible_speed"}

    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute("INSERT INTO scores VALUES (?, ?, ?, ?)", (sub.name, sub.score, time.time(), sub.signature))
        conn.commit()
        conn.close()
        logger.info(f"🏆 NEW SCORE: {sub.name} - {sub.score}")
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"DB Write Error: {e}")
        raise HTTPException(status_code=500)

@app.delete("/scores")
def clear_scores(key: str):
    if key != ADMIN_SECRET_KEY:
        raise HTTPException(status_code=403, detail="Unauthorized")
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute("DELETE FROM scores")
        conn.commit()
        conn.close()
        logger.info("🧹 DATABASE CLEARED BY ADMIN")
        return {"status": "cleared"}
    except Exception as e:
        return {"status": "error", "msg": str(e)}

@app.on_event("startup")
async def startup_event():
    # Start the background monitor
    asyncio.create_task(monitor_system())

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Capture IP immediately
    client_ip = "Unknown"
    if websocket.client:
        client_ip = websocket.client.host
        
    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action", "join")
            
            if action == "join":
                manager.active_connections = [c for c in manager.active_connections if c[0] != websocket]
                
                target_lang = data.get("target_language", "English")
                await manager.connect(websocket, target_lang)
                
                if processor.current_title:
                    await websocket.send_json({"type": "meta", "title": processor.current_title})
                
                if manager.history:
                     user_history_payload = []
                     for item in manager.history:
                         text_content = ""
                         if target_lang == "English":
                             text_content = item["original"]
                         elif target_lang in item["translations"]:
                             text_content = item["translations"][target_lang]
                         
                         if text_content:
                             user_history_payload.append({
                                 "transcript": text_content,
                                 "timestamp": item["timestamp"],
                                 "is_user": False
                             })
                     
                     if user_history_payload:
                        await websocket.send_json({"type": "history", "data": user_history_payload})

            elif action == "stream":
                url = data.get("url")
                if url:
                    logger.info(f"🔴 ADMIN COMMAND: START BROADCAST | IP={client_ip} | URL: {url}")
                    asyncio.create_task(processor.start_stream(url))
                    
    except WebSocketDisconnect:
        manager.disconnect(websocket, client_ip)
        await manager.broadcast_stats()
    except Exception as e:
        logger.error(f"WS Connection Error: {e}")
        manager.disconnect(websocket, client_ip)
        await manager.broadcast_stats()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
EOF

# 9. START SCRIPT
echo "#!/bin/bash" > start.sh
echo "pkill -f ngrok" >> start.sh
echo "pkill -f xspace.py" >> start.sh
echo "source \$HOME/miniconda3/etc/profile.d/conda.sh" >> start.sh
echo "conda activate xspace" >> start.sh

# Start Ngrok
if [ -n "\$NGROK_DOMAIN" ]; then
    echo "ngrok http --domain=\$NGROK_DOMAIN 8000 > /dev/null &" >> start.sh
else
    echo "ngrok http 8000 > /dev/null &" >> start.sh
fi
echo "sleep 3" >> start.sh

# Infinite Restart Loop
echo "while true; do" >> start.sh
echo "  echo 'Starting XSpace Server...'" >> start.sh
echo "  # Removed -u flag to prevent buffering issues if any" >> start.sh
echo "  python xspace.py" >> start.sh
echo "  echo '⚠️ Server stopped! Restarting in 3 seconds... (Press Ctrl+C to stop)'" >> start.sh
echo "  sleep 3" >> start.sh
echo "done" >> start.sh

chmod +x start.sh

echo ""
echo -e "\\e[1;32m>>> INSTALLATION COMPLETE! \\e[0m"
echo -e "\\e[1;36m   ./start.sh\\e[0m"
`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(getInstallScript());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm font-['VT323']">
      <div className="bg-[#c0c0c0] border-2 border-t-white border-l-white border-b-black border-r-black w-full max-w-4xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="bg-[#000080] text-white px-2 py-1 flex justify-between items-center select-none">
            <span className="font-bold tracking-wider text-xl">VPS INSTALLER.EXE</span>
            <button onClick={onClose} className="bg-[#c0c0c0] text-black w-6 h-6 flex items-center justify-center border border-t-white border-l-white border-b-black border-r-black font-bold active:border-t-black active:border-l-black active:border-b-white active:border-r-white">X</button>
        </div>

        <div className="p-4 flex flex-col gap-4 overflow-y-auto">
            <div className="flex justify-between items-center">
                 <p className="text-xl">INSTALLATION SCRIPT (BASH):</p>
                 <button 
                    onClick={copyToClipboard}
                    className="bg-[#c0c0c0] border-2 border-t-white border-l-white border-b-black border-r-black px-4 py-1 active:border-t-black active:border-l-black active:border-b-white active:border-r-white flex items-center gap-2"
                >
                    {copied ? <Check size={18} /> : <Copy size={18} />} {copied ? 'COPIED TO CLIPBOARD' : 'COPY SCRIPT'}
                </button>
            </div>
            
            <div className="bg-black border-2 border-t-black border-l-black border-b-white border-r-white p-4 h-96 overflow-y-auto">
              <pre className="text-lg font-mono text-[#00ff00] select-all whitespace-pre-wrap">
                {getInstallScript()}
              </pre>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ServerSetup;