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
# XSPACE BROADCAST SERVER (v4.0 - LIGHTWEIGHT)
# Architecture: Groq API Only (No Heavy Local Models)
# Features: Admin Control, Multi-Language, Low CPU Usage
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
from typing import List, Dict, Set
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
        # Store tuple: (websocket, target_language_name)
        self.active_connections: List[tuple[WebSocket, str]] = []

    async def connect(self, websocket: WebSocket, target_lang: str = "English"):
        await websocket.accept()
        self.active_connections.append((websocket, target_lang))
        logger.info(f"Client joined ({target_lang}). Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections = [c for c in self.active_connections if c[0] != websocket]
        logger.info(f"Client disconnected. Total: {len(self.active_connections)}")

    def get_needed_languages(self) -> Set[str]:
        return set(c[1] for c in self.active_connections)

    async def broadcast_specific(self, language_map: Dict[str, str]):
        disconnected = []
        for ws, lang in self.active_connections:
            try:
                # Default to English if specific trans not found
                text = language_map.get(lang, language_map.get("English", ""))
                if text:
                    payload = {
                        "transcript": text,
                        "is_user": False,
                        "timestamp": time.time()
                    }
                    await ws.send_json(payload)
            except:
                disconnected.append(ws)
        
        for ws in disconnected:
            self.disconnect(ws)

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
        
    async def get_stream_info(self, url: str):
        # Use impersonation to get valid stream and title
        ydl_opts = {
            'format': 'bestaudio/best', 
            'quiet': True, 
            'noplaylist': True,
            'extractor_args': {'generic': {'impersonate': True}} 
        }
        loop = asyncio.get_event_loop()
        try:
            info = await loop.run_in_executor(None, lambda: yt_dlp.YoutubeDL(ydl_opts).extract_info(url, download=False))
            return info.get('url'), info.get('title', 'Unknown Broadcast')
        except Exception as e:
            logger.error(f"Failed to get stream info: {e}")
            return None, None

    async def start_stream(self, twitter_url: str):
        if self.is_running:
            logger.info("Restarting stream for new URL...")
            await self.stop_stream()

        self.is_running = True
        self.current_url = twitter_url
        self.audio_queue = asyncio.Queue()
        
        stream_url, title = await self.get_stream_info(twitter_url)
        if not stream_url:
            self.is_running = False
            return

        self.current_title = title
        logger.info(f"ON AIR: {title}")
        await manager.broadcast_meta(title)

        asyncio.create_task(self.run_ffmpeg(stream_url))
        asyncio.create_task(self.process_audio())

    async def stop_stream(self):
        self.is_running = False
        if self.ffmpeg_process:
            try: self.ffmpeg_process.kill()
            except: pass
        self.current_url = None
        self.current_title = ""
        await manager.broadcast_meta("")

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

    async def process_audio(self):
        audio_buffer = bytearray()
        while self.is_running:
            chunk = await self.audio_queue.get()
            audio_buffer.extend(chunk)
            
            if len(audio_buffer) >= BUFFER_SIZE:
                temp_filename = f"temp_{int(time.time())}.wav"
                with open(temp_filename, "wb") as f:
                    header = struct.pack('<4sI4s', b'RIFF', 36 + len(audio_buffer), b'WAVE')
                    header += struct.pack('<4sIHHIIHH', b'fmt ', 16, 1, CHANNELS, SAMPLE_RATE, SAMPLE_RATE * CHANNELS * SAMPWIDTH, CHANNELS * SAMPWIDTH, SAMPWIDTH * 8)
                    header += struct.pack('<4sI', b'data', len(audio_buffer))
                    f.write(header + audio_buffer)
                
                audio_buffer = bytearray() 
                # Read file back into memory for API call
                with open(temp_filename, "rb") as f:
                     wav_data = f.read()
                
                await self.transcribe_and_distribute(wav_data)
                
                if os.path.exists(temp_filename):
                    os.remove(temp_filename)

    async def transcribe_and_distribute(self, wav_data):
        try:
            # 1. Transcribe (Source Language) using GROQ WHISPER
            transcription = await client.audio.transcriptions.create(
                file=("audio.wav", wav_data), 
                model="whisper-large-v3", 
                response_format="json"
            )
            text = transcription.text.strip()

            if text and len(text) > 5:
                logger.info(f"Source: {text[:30]}...")
                
                # 2. Identify needed languages
                needed_langs = manager.get_needed_languages()
                results = {}
                
                # 3. Translate in parallel using GROQ LLAMA
                async def translate_one(lang):
                    # Optimized: If user wants same lang as source (approx), return source
                    # But since we don't know source lang code for sure, we just ask LLM to be safe or copy
                    # Simple heuristic: If Lang is English and text looks English, skip.
                    # Ideally, let LLM handle it.
                    try:
                        chat = await client.chat.completions.create(
                            messages=[
                                {"role": "system", "content": f"Translate this to {lang}. Return ONLY text."},
                                {"role": "user", "content": text}
                            ],
                            model="llama-3.3-70b-versatile",
                            temperature=0.3, max_tokens=1024,
                        )
                        return (lang, chat.choices[0].message.content)
                    except: return (lang, text)

                tasks = [translate_one(lang) for lang in needed_langs]
                if tasks:
                    translations = await asyncio.gather(*tasks)
                    for lang, trans_text in translations:
                        results[lang] = trans_text
                
                # 4. Broadcast
                await manager.broadcast_specific(results)
                
        except Exception as e:
            logger.error(f"Processing Error: {e}")

processor = AudioStreamProcessor()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    try:
        await websocket.accept()
        data = await websocket.receive_json()
        action = data.get("action", "join")
        
        if action == "stream":
            # Admin Mode
            manager.active_connections.append((websocket, "Admin"))
            url = data.get("url")
            if url:
                asyncio.create_task(processor.start_stream(url))
        else:
            # Viewer Mode
            target_lang = data.get("target_language", "English")
            manager.active_connections.append((websocket, target_lang))
            logger.info(f"Listener added: {target_lang}")
            
            if processor.current_title:
                await websocket.send_json({"type": "meta", "title": processor.current_title})

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