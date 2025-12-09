import React, { useState } from 'react';
import { Terminal, Copy, Check, Zap } from 'lucide-react';

interface ServerSetupProps {
  onClose: () => void;
}

const ServerSetup: React.FC<ServerSetupProps> = ({ onClose }) => {
  const [copied, setCopied] = useState(false);

  const getInstallScript = () => {
    return `#!/bin/bash

# ==========================================
# XSPACE BROADCAST SERVER (RETRO EDITION)
# Architecture: Singleton Stream + Broadcasting
# Optimization: Real-time Throttling (-re flag)
# Scale: Supports 50+ concurrent users on 1 vCPU
# ==========================================

echo -e "\\e[1;35m>>> STARTING INSTALLATION...\\e[0m"

# 1. KILL PROCESSES
pkill -f ngrok
pkill -f xspace.py

# 2. SYSTEM DEPENDENCIES
sudo apt-get update -qq
sudo apt-get install -y ffmpeg curl unzip -qq

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
pip uninstall google-genai google-generativeai -y -q
pip install groq aiohttp fastapi uvicorn yt-dlp websockets

# 7. CONFIG
echo ""
echo -e "\\e[1;33m>>> SETUP \\e[0m"
read -p "Enter GROQ_API_KEY: " GROQ_KEY
read -p "Enter NGROK_AUTHTOKEN: " NGROK_TOKEN
read -p "Ngrok Domain: " NGROK_DOMAIN

ngrok config add-authtoken $NGROK_TOKEN

# 8. SERVER CODE (xspace.py)
cat <<EOF > xspace.py
import asyncio
import os
import json
import logging
import struct
import time
from typing import List
from groq import AsyncGroq
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import yt_dlp
import uvicorn

# --- CONFIGURATION ---
API_KEY = "\${GROQ_KEY}"
BUFFER_SECONDS = 30
SAMPLE_RATE = 16000
CHANNELS = 1
SAMPWIDTH = 2
BUFFER_SIZE = SAMPLE_RATE * CHANNELS * SAMPWIDTH * BUFFER_SECONDS 

client = AsyncGroq(api_key=API_KEY)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("xspace")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"Client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        if not self.active_connections:
            return
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)

manager = ConnectionManager()

class AudioStreamProcessor:
    def __init__(self):
        self.is_running = False
        self.current_url = None
        self.current_tgt_lang = None
        self.audio_queue = asyncio.Queue()
        self.ffmpeg_process = None
        self.session_history = []
        
    async def start_stream(self, twitter_url: str, src_code: str, src_lang: str, tgt_lang: str):
        if self.is_running and self.current_url == twitter_url and self.current_tgt_lang == tgt_lang:
            logger.info(f"Joining existing stream ({tgt_lang})...")
            return

        if self.is_running:
            logger.info("Configuration changed. Restarting stream...")
            await self.stop_stream()

        self.is_running = True
        self.current_url = twitter_url
        self.current_tgt_lang = tgt_lang
        self.audio_queue = asyncio.Queue()
        self.session_history = []
        
        stream_url = await self.get_stream_url(twitter_url)
        if not stream_url:
            self.is_running = False
            return

        logger.info(f"Starting Broadcast Stream: {twitter_url} -> {tgt_lang}")
        asyncio.create_task(self.run_ffmpeg(stream_url))
        asyncio.create_task(self.process_audio(src_code, src_lang, tgt_lang))

    async def stop_stream(self):
        self.is_running = False
        if self.ffmpeg_process:
            try:
                self.ffmpeg_process.kill()
            except: pass
        self.current_url = None
        self.current_tgt_lang = None
        self.session_history = []

    async def get_stream_url(self, url: str):
        ydl_opts = {'format': 'bestaudio/best', 'quiet': True, 'noplaylist': True}
        loop = asyncio.get_event_loop()
        try:
            return await loop.run_in_executor(None, lambda: yt_dlp.YoutubeDL(ydl_opts).extract_info(url, download=False)['url'])
        except: return None

    async def run_ffmpeg(self, stream_url: str):
        self.ffmpeg_process = await asyncio.create_subprocess_exec(
            'ffmpeg', '-re', '-i', stream_url, '-f', 's16le', '-ac', '1', '-ar', '16000', '-vn', '-bufsize', '4096k', 'pipe:1',
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL
        )
        try:
            while self.is_running:
                chunk = await self.ffmpeg_process.stdout.read(4096)
                if not chunk: break
                await self.audio_queue.put(chunk)
        except Exception as e:
            logger.error(f"FFmpeg error: {e}")
        finally:
            self.is_running = False

    def add_wav_header(self, pcm_data):
        header = struct.pack('<4sI4s', b'RIFF', 36 + len(pcm_data), b'WAVE')
        header += struct.pack('<4sIHHIIHH', b'fmt ', 16, 1, CHANNELS, SAMPLE_RATE, SAMPLE_RATE * CHANNELS * SAMPWIDTH, CHANNELS * SAMPWIDTH, SAMPWIDTH * 8)
        header += struct.pack('<4sI', b'data', len(pcm_data))
        return header + pcm_data

    async def process_audio(self, src_code, src_lang, tgt_lang):
        audio_buffer = bytearray()
        while self.is_running:
            chunk = await self.audio_queue.get()
            audio_buffer.extend(chunk)
            if len(audio_buffer) >= BUFFER_SIZE:
                wav_data = self.add_wav_header(audio_buffer)
                audio_buffer = bytearray() 
                await self.transcribe_and_translate(wav_data, src_code, src_lang, tgt_lang)

    async def transcribe_and_translate(self, wav_data, src_code, src_lang, tgt_lang):
        retries = 3
        while retries > 0:
            try:
                logger.info(f"REQ -> Groq (Buffer: {BUFFER_SECONDS}s)")
                transcription = await client.audio.transcriptions.create(
                    file=("audio.wav", wav_data), model="whisper-large-v3", response_format="json", language=src_code
                )
                text = transcription.text
                if text and len(text.strip()) > 5:
                    logger.info(f"Transcript: {text[:50]}...")
                    chat = await client.chat.completions.create(
                        messages=[
                            {"role": "system", "content": f"You are a professional interpreter. Translate the following text from {src_lang} to {tgt_lang}. Output ONLY the translated text."},
                            {"role": "user", "content": text}
                        ],
                        model="llama-3.3-70b-versatile",
                        temperature=0.3,
                        max_tokens=1024,
                    )
                    translated = chat.choices[0].message.content
                    
                    message_payload = {
                        "transcript": translated,
                        "original": text,
                        "is_user": False,
                        "timestamp": time.time() # Added timestamp
                    }
                    self.session_history.append(message_payload)
                    await manager.broadcast(message_payload)
                break 
            except Exception as e:
                if "429" in str(e):
                    await asyncio.sleep(5)
                    retries -= 1
                else:
                    break

processor = AudioStreamProcessor()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        data = await websocket.receive_json()
        url = data.get("url")
        if url:
            if processor.session_history:
                 await websocket.send_json({"type": "history", "data": processor.session_history})

            asyncio.create_task(processor.start_stream(
                url, 
                data.get("src_code", "en"),
                data.get("source_language", "English"),
                data.get("target_language", "Russian")
            ))
            await websocket.send_json({"status": "Stream Joined"})
        while True:
            await websocket.receive_text() 
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        manager.disconnect(websocket)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
EOF

# 9. START SCRIPT
echo "#!/bin/bash" > start.sh
echo "pkill -f ngrok" >> start.sh
echo "pkill -f xspace.py" >> start.sh
echo "source \$HOME/miniconda3/etc/profile.d/conda.sh" >> start.sh
echo "conda activate xspace" >> start.sh
if [ -n "$NGROK_DOMAIN" ]; then
    echo "ngrok http --url=$NGROK_DOMAIN 8000 > /dev/null &" >> start.sh
else
    echo "ngrok http 8000 > /dev/null &" >> start.sh
fi
echo "sleep 3" >> start.sh
echo "python xspace.py" >> start.sh
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