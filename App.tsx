import React, { useState, useEffect, useRef } from 'react';
import { Play, Terminal, X as XIcon, ArrowDown, Sun, Moon, Volume2, VolumeX, Save, Radio, Lock } from 'lucide-react';
import { ConnectionState, TranscriptionItem, Language } from './types';
import ExplanationModal from './components/ExplanationModal';
import ServerSetup from './components/ServerSetup';
import SecurityCheck from './components/SecurityCheck';

const LANGUAGES: Language[] = [
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  // New Additions
  { code: 'id', name: 'Indonesian', flag: '🇮🇩' },
  { code: 'vi', name: 'Vietnamese', flag: '🇻🇳' },
  { code: 'ur', name: 'Urdu', flag: '🇵🇰' },
  { code: 'tl', name: 'Filipino', flag: '🇵🇭' },
  { code: 'bn', name: 'Bengali', flag: '🇧🇩' },
  { code: 'ha', name: 'Hausa', flag: '🇳🇬' },
  { code: 'yo', name: 'Yoruba', flag: '🇳🇬' },
];

// --- RETRO UI COMPONENTS ---

const RetroWindow: React.FC<{ title: string; children: React.ReactNode; className?: string; onClose?: () => void; isDark: boolean; actions?: React.ReactNode }> = ({ title, children, className = "", onClose, isDark, actions }) => {
    const styles = isDark ? {
        border: 'border border-green-500',
        bg: 'bg-gray-900',
        header: 'bg-green-900 text-green-100',
        closeBtn: 'hover:text-white text-green-500'
    } : {
        border: 'border-2 border-t-white border-l-white border-b-black border-r-black shadow-xl',
        bg: 'bg-[#c0c0c0]',
        header: 'bg-[#000080] text-white',
        closeBtn: 'bg-[#c0c0c0] text-black border border-t-white border-l-white border-b-black border-r-black active:border-inset'
    };

    return (
        <div className={`${styles.bg} ${styles.border} flex flex-col ${className}`}>
            <div className={`${styles.header} px-2 py-1 flex justify-between items-center select-none shrink-0`}>
                <span className="font-bold tracking-wider text-lg truncate pr-2">{title}</span>
                <div className="flex items-center gap-2">
                    {actions}
                    {onClose && (
                        <button onClick={onClose} className={`w-5 h-5 flex items-center justify-center font-bold text-sm leading-none ${styles.closeBtn}`}>
                            <XIcon size={14} />
                        </button>
                    )}
                </div>
            </div>
            <div className="flex-1 flex flex-col min-h-0 relative">
                {children}
            </div>
        </div>
    );
};

const RetroButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { isDark: boolean }> = ({ className, isDark, ...props }) => {
    const styles = isDark ? 
        "bg-black border border-green-500 text-green-500 hover:bg-green-900 active:bg-green-800" : 
        "bg-[#c0c0c0] border-2 border-t-white border-l-white border-b-black border-r-black active:border-t-black active:border-l-black active:border-b-white active:border-r-white text-black active:bg-[#a0a0a0]";

    return <button className={`px-4 py-1 transition-none ${styles} ${className}`} {...props} />;
};

const RetroInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { isDark: boolean }> = ({ className, isDark, ...props }) => {
    const styles = isDark ? 
        "bg-black border border-green-700 text-green-400 placeholder-green-900" : 
        "bg-white border-2 border-t-black border-l-black border-b-white border-r-white text-black";

    return <input className={`px-2 py-1 outline-none w-full ${styles} ${className}`} {...props} />;
};

const RetroSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { isDark: boolean }> = ({ className, isDark, ...props }) => {
    const styles = isDark ? 
        "bg-black border border-green-700 text-green-400" : 
        "bg-white border-2 border-t-black border-l-black border-b-white border-r-white text-black";

    return <select className={`px-2 py-1 outline-none w-full ${styles} ${className}`} {...props} />;
};

const App: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isHumanVerified, setIsHumanVerified] = useState(false); // Security Check State

  const [connectionState, setConnectionState] = useState<ConnectionState>('DISCONNECTED');
  const [transcriptions, setTranscriptions] = useState<TranscriptionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Settings
  const [adminUrl, setAdminUrl] = useState<string>(''); // For Admin input
  const [sessionTitle, setSessionTitle] = useState<string>(''); // Received from server
  const [serverUrl, setServerUrl] = useState<string>('wss://fallible-tenantless-pa.ngrok-free.dev/ws');
  
  // Voice
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.1);
  const [allVoices, setAllVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  
  // Admin & Modals
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showServerHelp, setShowServerHelp] = useState<boolean>(false);
  const [logoClicks, setLogoClicks] = useState<number>(0);
  const [showExplanation, setShowExplanation] = useState<boolean>(true);

  // Languages
  const [sourceLanguage, setSourceLanguage] = useState<Language>(LANGUAGES.find(l => l.code === 'en') || LANGUAGES[1]); 
  const [targetLanguage, setTargetLanguage] = useState<Language>(LANGUAGES.find(l => l.code === 'ru') || LANGUAGES[0]);

  // Timeline / Scroll
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const websocketRef = useRef<WebSocket | null>(null);

  // TTS Queue
  const speechQueue = useRef<string[]>([]);
  const isSpeaking = useRef<boolean>(false);
  const playbackSpeedRef = useRef<number>(1.1);

  // Theme constants
  const theme = isDarkMode ? {
      bg: 'bg-black',
      text: 'text-green-500',
      border: 'border-green-500',
      mutedText: 'text-green-800'
  } : {
      bg: 'bg-[#008080]',
      text: 'text-black',
      border: 'border-black',
      mutedText: 'text-gray-600'
  };

  // --- VOICE LOGIC ---
  useEffect(() => { 
      const loadVoices = () => {
          if (window.speechSynthesis) {
              const voices = window.speechSynthesis.getVoices();
              setAllVoices(voices);
          }
      }
      loadVoices();
      if (window.speechSynthesis && window.speechSynthesis.onvoiceschanged !== undefined) {
          window.speechSynthesis.onvoiceschanged = loadVoices;
      }
  }, []);

  // Filter voices when language changes or voices load
  useEffect(() => {
    if (allVoices.length === 0) return;

    // Filter by exact code match (e.g., 'ru-RU') or fuzzy match ('ru')
    const filtered = allVoices.filter(v => 
        v.lang.toLowerCase() === targetLanguage.code.toLowerCase() || 
        v.lang.toLowerCase().startsWith(targetLanguage.code.toLowerCase())
    );

    setAvailableVoices(filtered);

    // If current selected voice is not in new list, pick first available
    if (filtered.length > 0) {
        const currentStillValid = filtered.find(v => v.voiceURI === selectedVoiceURI);
        if (!currentStillValid) {
            setSelectedVoiceURI(filtered[0].voiceURI);
        }
    } else {
        setSelectedVoiceURI('');
    }
  }, [allVoices, targetLanguage, selectedVoiceURI]);


  // Auto-scroll logic
  useEffect(() => {
    if (chatContainerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
        if (scrollHeight - scrollTop - clientHeight < 200) {
            chatContainerRef.current.scrollTop = scrollHeight;
        }
    }
  }, [transcriptions.length]);

  const handleScroll = () => {
      if (chatContainerRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
          const isNearBottom = scrollHeight - scrollTop - clientHeight < 200;
          setShowScrollBottom(!isNearBottom);
      }
  };

  const scrollToBottom = () => {
      if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
  };

  // Secret Admin Handler on Avatar
  const handleAvatarClick = () => {
    setLogoClicks(prev => {
        const newCount = prev + 1;
        if (newCount >= 5) {
            setShowSettings(true);
            return 0;
        }
        return newCount;
    });
    setTimeout(() => setLogoClicks(0), 2000);
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newSpeed = parseFloat(e.target.value);
      setPlaybackSpeed(newSpeed);
      playbackSpeedRef.current = newSpeed;
  };

  const unlockAudio = () => {
      // iOS Hack: trigger empty speech on user interaction to unlock synth
      if (window.speechSynthesis && isMuted === false) {
          const u = new SpeechSynthesisUtterance("");
          window.speechSynthesis.speak(u);
      }
  }

  // TTS Logic
  const getSelectedVoice = (): SpeechSynthesisVoice | null => {
      if (!selectedVoiceURI || allVoices.length === 0) return null;
      return allVoices.find(v => v.voiceURI === selectedVoiceURI) || null;
  };

  const processSpeechQueue = () => {
    if (isSpeaking.current || speechQueue.current.length === 0 || isMuted) return;

    isSpeaking.current = true;
    const text = speechQueue.current.shift();
    if (!text) { isSpeaking.current = false; return; }

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getSelectedVoice();
    
    if (voice) utterance.voice = voice;
    utterance.rate = playbackSpeedRef.current; 

    utterance.onend = () => {
        isSpeaking.current = false;
        processSpeechQueue();
    };
    utterance.onerror = () => {
        isSpeaking.current = false;
        processSpeechQueue();
    };

    window.speechSynthesis.speak(utterance);
  };

  const speakManual = (text: string) => {
      window.speechSynthesis.cancel();
      isSpeaking.current = true;
      speechQueue.current = [];
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = getSelectedVoice();
      
      if (voice) utterance.voice = voice;
      utterance.rate = playbackSpeedRef.current;
      utterance.onend = () => {
          isSpeaking.current = false;
          processSpeechQueue(); 
      };
      window.speechSynthesis.speak(utterance);
  };

  const clearQueueAndStopSpeech = () => {
      speechQueue.current = [];
      isSpeaking.current = false;
      if (window.speechSynthesis) window.speechSynthesis.cancel();
  };

  const connectToBackend = async () => {
    // Attempt iOS unlock
    unlockAudio();

    clearQueueAndStopSpeech();
    setConnectionState('CONNECTING');
    setError(null);
    setTranscriptions([]);

    try {
      const ws = new WebSocket(serverUrl);
      websocketRef.current = ws;

      ws.onopen = () => {
        setConnectionState('CONNECTED');
        // Join the session (Viewer Mode)
        ws.send(JSON.stringify({
            action: 'join',
            target_language: targetLanguage.name, // "Russian"
        }));
      };

      ws.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            
            // Handle Metadata Update (Title, etc)
            if (data.type === 'meta') {
                if (data.title) setSessionTitle(data.title);
                return;
            }

            if (data.type === 'history') {
                const historyItems = data.data.map((item: any) => ({
                    id: 'hist-' + Math.random().toString(36),
                    text: item.transcript,
                    sender: item.is_user ? 'user' : 'model',
                    timestamp: item.timestamp ? new Date(item.timestamp * 1000) : new Date()
                }));
                setTranscriptions(historyItems);
                return;
            }
            if (data.error) {
                if (data.fatal) { setError(data.error); stopSession(); }
                return;
            }
            if (data.transcript) {
                const text = data.transcript;
                setTranscriptions(prev => [...prev, {
                    id: Date.now().toString(),
                    text: text,
                    sender: data.is_user ? 'user' : 'model',
                    timestamp: new Date()
                }]);
                if (!data.is_user && !isMuted) {
                    speechQueue.current.push(text);
                    processSpeechQueue();
                }
            }
        } catch (e) { console.error(e); }
      };

      ws.onerror = () => {
        setError("Connection Failed. Check Server.");
        setConnectionState('ERROR');
      };

      ws.onclose = () => {
        if (connectionState === 'CONNECTED') setConnectionState('DISCONNECTED');
      };

    } catch (netErr: any) {
      setError(netErr.message);
      setConnectionState('DISCONNECTED');
    }
  };

  const stopSession = () => {
    if (websocketRef.current) { websocketRef.current.close(); websocketRef.current = null; }
    clearQueueAndStopSpeech();
    setConnectionState('DISCONNECTED');
    setSessionTitle('');
  };

  const toggleSession = () => {
    if (connectionState === 'CONNECTED' || connectionState === 'CONNECTING') stopSession();
    else connectToBackend();
  };

  const handleAdminStartBroadcast = () => {
      if (!websocketRef.current || connectionState !== 'CONNECTED') {
          alert("Please ESTABLISH LINK first!");
          return;
      }
      if (!adminUrl) {
          alert("Enter a URL!");
          return;
      }
      // Send Admin Command
      websocketRef.current.send(JSON.stringify({
          action: 'stream',
          url: adminUrl,
          src_code: 'en', // Default source
          source_language: 'English'
      }));
      setShowSettings(false);
  };

  const toggleMute = () => {
      setIsMuted(!isMuted);
      if (!isMuted) clearQueueAndStopSpeech();
      else {
          speechQueue.current = [];
          unlockAudio();
      }
  };

  const handleDownloadTranscript = () => {
      if (transcriptions.length === 0) return;
      
      let content = `XSPACE TRANSCRIPT LOG - ${new Date().toLocaleString()}\n`;
      content += `SESSION: ${sessionTitle || 'Unknown'}\n`;
      content += `LANG: ${targetLanguage.name}\n`;
      content += `-------------------------------------------\n\n`;

      transcriptions.forEach(item => {
          const time = item.timestamp.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
          const speaker = item.sender === 'user' ? 'AUDIO' : 'TRANS';
          content += `[${time}] ${speaker}: ${item.text}\n`;
      });

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xspace_log_${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  // If not human verified, show security check
  if (!isHumanVerified) {
    return <SecurityCheck onVerified={() => setIsHumanVerified(true)} isDarkMode={isDarkMode} />;
  }

  return (
    <div className={`h-[100dvh] ${theme.bg} p-2 md:p-4 flex flex-col md:flex-row gap-4 font-['VT323'] text-xl leading-none overflow-hidden transition-colors duration-300`}>
      
      {/* --- SIDEBAR (FIXED) --- */}
      <RetroWindow title="XSpace Control" isDark={isDarkMode} className="w-full md:w-96 shrink-0 h-auto md:h-full flex flex-col max-h-[40vh] md:max-h-full">
        <div className="p-4 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
            
            {/* Header / Theme Switch */}
            <div className="flex justify-between items-center mb-2">
                <h1 className={`text-2xl font-bold ${isDarkMode ? 'text-green-500' : 'text-black'}`}>XSpace 98</h1>
                <button 
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className={`p-1 border ${isDarkMode ? 'border-green-500 text-green-500 hover:bg-green-900' : 'bg-white border-black hover:bg-gray-100'}`}
                >
                    {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                </button>
            </div>

            {/* Developer ID Card */}
            <div className={`border-2 p-3 flex gap-4 items-center relative group select-none cursor-pointer
                ${isDarkMode ? 'bg-gray-900 border-green-500' : 'bg-[#e0e0e0] border-t-white border-l-white border-b-black border-r-black'}`}
                onClick={handleAvatarClick}
            >
                <div className={`w-16 h-16 shrink-0 overflow-hidden relative border-2 ${isDarkMode ? 'border-green-500' : 'border-black'}`}>
                    <img 
                        src="https://unavatar.io/twitter/mixon_here" 
                        alt="Dev" 
                        className={`w-full h-full object-cover ${isDarkMode ? 'grayscale contrast-125' : ''}`}
                        onError={(e) => { e.currentTarget.src = 'https://placehold.co/64x64/000080/FFF?text=DEV'; }}
                    />
                </div>
                <div className="flex flex-col">
                    <span className={`font-bold text-sm tracking-widest ${theme.mutedText}`}>DEVELOPER ID</span>
                    <a href="https://x.com/mixon_here" target="_blank" className={`font-bold text-xl hover:underline ${isDarkMode ? 'text-green-400' : 'text-[#000080]'}`}>@mixon_here</a>
                    {/* UPDATED TEXT */}
                    <span className="text-xs uppercase opacity-70">Subscribe to Support</span>
                </div>
            </div>

            {/* Status / Session Info */}
            <fieldset className={`border-2 p-2 pt-1 mt-2 ${isDarkMode ? 'border-green-600' : 'border-t-white border-l-white border-b-black border-r-black'}`}>
                <legend className={`px-1 ml-2 text-sm ${theme.text}`}>Transmission Data</legend>
                <div className="flex items-center gap-3 mb-2">
                    <div className={`w-4 h-4 border border-black ${connectionState === 'CONNECTED' ? 'bg-[#00ff00] shadow-[0_0_10px_#00ff00]' : 'bg-[#500000]'}`} />
                    <span className={`uppercase tracking-widest ${theme.text}`}>
                        {connectionState === 'CONNECTED' ? 'ONLINE' : 'OFFLINE'}
                    </span>
                </div>
                
                {/* MARQUEE FOR SESSION TITLE */}
                <div className={`border-2 border-inset p-2 overflow-hidden ${isDarkMode ? 'bg-black border-green-800' : 'bg-black border-gray-600'}`}>
                    {connectionState === 'CONNECTED' ? (
                        <div className="whitespace-nowrap animate-marquee text-[#00ff00]">
                            {sessionTitle ? `>>> ON AIR: ${sessionTitle} <<<` : ">>> WAITING FOR SIGNAL <<<"}
                        </div>
                    ) : (
                        <div className="text-red-500 text-center">NO SIGNAL</div>
                    )}
                </div>
                <style>{`
                    @keyframes marquee {
                        0% { transform: translateX(100%); }
                        100% { transform: translateX(-100%); }
                    }
                    .animate-marquee {
                        display: inline-block;
                        padding-left: 100%;
                        animation: marquee 15s linear infinite;
                    }
                `}</style>
            </fieldset>

            {/* Config (User side only sees Language) */}
            <div className={`space-y-4 ${theme.text}`}>
                <div className="grid grid-cols-1 gap-2">
                    <div>
                        <label className="block mb-1">Target Language:</label>
                        <RetroSelect 
                            isDark={isDarkMode}
                            value={targetLanguage.code}
                            onChange={(e) => setTargetLanguage(LANGUAGES.find(l => l.code === e.target.value) || LANGUAGES[0])}
                            disabled={connectionState === 'CONNECTED'}
                        >
                            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
                        </RetroSelect>
                    </div>
                </div>
            </div>

            {/* Audio Config */}
            <fieldset className={`border-2 p-2 pt-1 ${isDarkMode ? 'border-green-600' : 'border-t-white border-l-white border-b-black border-r-black'}`}>
                <legend className={`px-1 ml-2 text-sm ${theme.text}`}>Audio Config</legend>
                <div className={`flex items-center justify-between mb-2 ${theme.text}`}>
                    <span>Sound:</span>
                    <RetroButton isDark={isDarkMode} onClick={toggleMute} className="flex items-center gap-2">
                        {isMuted ? <VolumeX size={16}/> : <Volume2 size={16}/>}
                        {isMuted ? "MUTED" : "ON"}
                    </RetroButton>
                </div>
                
                <div className={`space-y-2 ${isMuted ? "opacity-30 pointer-events-none" : ""}`}>
                     {/* Voice Selector */}
                    <div>
                         <label className={`block mb-1 text-sm ${theme.text}`}>Voice:</label>
                         <RetroSelect
                            isDark={isDarkMode}
                            value={selectedVoiceURI}
                            onChange={(e) => setSelectedVoiceURI(e.target.value)}
                            disabled={availableVoices.length === 0}
                         >
                            {availableVoices.length > 0 ? (
                                availableVoices.map(v => (
                                    <option key={v.voiceURI} value={v.voiceURI}>
                                        {v.name.length > 25 ? v.name.substring(0, 25) + '...' : v.name}
                                    </option>
                                ))
                            ) : (
                                <option>Default Device Voice</option>
                            )}
                         </RetroSelect>
                    </div>

                    <div className={`flex justify-between text-sm ${theme.text}`}>
                        <span>Speed</span>
                        <span>{playbackSpeed.toFixed(1)}x</span>
                    </div>
                    <input 
                        type="range" min="0.5" max="3.0" step="0.1"
                        value={playbackSpeed}
                        onChange={handleSpeedChange}
                        className={`w-full h-2 appearance-none ${isDarkMode ? 'bg-green-900' : 'bg-[#c0c0c0] border border-black'}`}
                    />
                </div>
            </fieldset>

            <RetroButton 
                isDark={isDarkMode}
                className="w-full py-3 font-bold text-xl uppercase tracking-widest"
                onClick={toggleSession}
            >
                {connectionState === 'CONNECTED' ? "Terminate Link" : "Establish Link"}
            </RetroButton>

             {error && (
                <div className={`p-2 border border-red-500 text-red-500 text-center ${isDarkMode ? 'bg-red-900/20' : 'bg-red-100'}`}>
                    ERR: {error}
                </div>
            )}
            
            <button onClick={() => setShowExplanation(true)} className={`w-full text-center underline ${theme.text} opacity-70 hover:opacity-100`}>System Help</button>
        </div>
      </RetroWindow>

      {/* --- MAIN CHAT --- */}
      <RetroWindow 
        title={`Stream Output - ${targetLanguage.name.toUpperCase()}`} 
        isDark={isDarkMode} 
        className="flex-1 min-h-0"
        actions={
            <button 
                onClick={handleDownloadTranscript} 
                className={`p-1 mr-2 ${isDarkMode ? 'hover:text-white' : 'hover:bg-gray-300'}`}
                title="Save Log to Disk"
            >
                <Save size={18} />
            </button>
        }
      >
          <div className={`flex-1 p-4 overflow-y-auto relative custom-scrollbar ${isDarkMode ? 'bg-black text-green-500' : 'bg-white text-black border-2 border-inset border-gray-400'}`}
               ref={chatContainerRef}
               onScroll={handleScroll}
          >
               {transcriptions.length === 0 && (
                   <div className="h-full flex flex-col items-center justify-center opacity-50">
                       <Radio size={64} className="animate-pulse mb-4" />
                       <p className="text-2xl">TUNING IN...</p>
                       <p className="text-sm opacity-60 mt-2">Waiting for translation data.</p>
                   </div>
               )}

               {transcriptions.map((item, index) => {
                   return (
                   <div key={item.id} className="mb-6 group">
                        <div className={`flex items-baseline gap-2 mb-1 text-sm border-b ${isDarkMode ? 'border-green-800 text-green-700' : 'border-gray-300 text-blue-800'}`}>
                            <span className="font-bold font-mono">
                                [{item.timestamp.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}]
                            </span>
                            <span className="font-bold tracking-wider">{item.sender === 'user' ? 'SOURCE' : 'TRANSLATION'}</span>
                        </div>
                        <div className="flex gap-3 items-start mt-2">
                            {item.sender === 'model' && (
                                <button 
                                    onClick={() => speakManual(item.text)}
                                    className={`mt-1 hover:text-red-500 transition-colors ${isDarkMode ? 'text-green-700' : 'text-gray-400'}`}
                                    title="Replay Audio"
                                >
                                    <Play size={20} fill="currentColor" />
                                </button>
                            )}
                            <p className="text-2xl leading-relaxed">{item.text}</p>
                        </div>
                   </div>
                   )
               })}
               
               {/* Jump to Live Button */}
               {showScrollBottom && (
                   <div className="sticky bottom-4 left-0 right-0 flex justify-center pointer-events-none">
                       <button 
                            onClick={scrollToBottom}
                            className={`px-6 py-2 font-bold shadow-lg pointer-events-auto flex items-center gap-2 animate-bounce border-2 ${
                                isDarkMode ? 'bg-green-900 border-green-400 text-green-100' : 'bg-[#ffff00] border-black text-black'
                            }`}
                       >
                           <ArrowDown size={20} /> JUMP TO LIVE
                       </button>
                   </div>
               )}
          </div>
      </RetroWindow>

      {showExplanation && <ExplanationModal isOpen={showExplanation} onClose={() => setShowExplanation(false)} isDarkMode={isDarkMode} />}
      
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <RetroWindow title="Admin Console (ROOT)" isDark={isDarkMode} className="w-full max-w-lg" onClose={() => setShowSettings(false)}>
                 {/* VERSION DISPLAY */}
                 <div className="absolute top-1 right-12 text-xs font-mono opacity-50 text-white">v0.0.1 beta</div>
                <div className={`p-6 space-y-6 ${theme.text}`}>
                    <div className="border-b pb-4 mb-4 border-gray-600">
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Lock size={20}/> BROADCAST CONTROL</h3>
                        <label className="block mb-1">Target URL (Twitter Space):</label>
                        <RetroInput 
                            isDark={isDarkMode}
                            value={adminUrl}
                            onChange={(e) => setAdminUrl(e.target.value)}
                            placeholder="https://x.com/..."
                        />
                        <div className="mt-4 flex justify-end">
                             <RetroButton 
                                isDark={isDarkMode} 
                                onClick={handleAdminStartBroadcast}
                                className="bg-red-600 text-white border-red-800 hover:bg-red-700"
                            >
                                START BROADCAST
                            </RetroButton>
                        </div>
                    </div>

                    <div>
                        <p className="mb-2 uppercase font-bold">WebSocket Endpoint:</p>
                        <RetroInput 
                            isDark={isDarkMode}
                            value={serverUrl}
                            onChange={(e) => setServerUrl(e.target.value)}
                            className="w-full font-mono text-lg"
                        />
                        <p className="text-sm opacity-60 mt-1">Must start with wss:// for secure connections.</p>
                    </div>
                    <div className="flex justify-end gap-4 pt-4 border-t border-gray-600">
                        <RetroButton isDark={isDarkMode} onClick={() => setShowServerHelp(true)}>Get Server Script</RetroButton>
                        <RetroButton isDark={isDarkMode} onClick={() => setShowSettings(false)}>Close</RetroButton>
                    </div>
                </div>
            </RetroWindow>
        </div>
      )}

      {showServerHelp && <ServerSetup onClose={() => setShowServerHelp(false)} />}

    </div>
  );
};

export default App;