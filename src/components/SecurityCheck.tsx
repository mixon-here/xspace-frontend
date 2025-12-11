import React, { useState, useRef, useEffect } from 'react';
import { Shield, Lock, CheckCircle2 } from 'lucide-react';

interface SecurityCheckProps {
  onVerified: () => void;
  isDarkMode: boolean;
}

const SecurityCheck: React.FC<SecurityCheckProps> = ({ onVerified, isDarkMode }) => {
  const [sliderValue, setSliderValue] = useState(0);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const theme = isDarkMode ? {
    bg: 'bg-black',
    border: 'border-green-500',
    text: 'text-green-500',
    sliderTrack: 'bg-green-900',
    sliderThumb: 'bg-green-500',
  } : {
    bg: 'bg-[#c0c0c0]',
    border: 'border-2 border-t-white border-l-white border-b-black border-r-black',
    text: 'text-black',
    sliderTrack: 'bg-gray-400 border border-gray-600',
    sliderThumb: 'bg-[#000080]',
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isUnlocking) return;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !trackRef.current || isUnlocking) return;

    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    
    setSliderValue(percentage);

    if (percentage >= 98) {
      setIsDragging(false);
      setIsUnlocking(true);
      setSliderValue(100);
      setTimeout(onVerified, 500);
    }
  };

  const handlePointerUp = () => {
    if (isUnlocking) return;
    setIsDragging(false);
    // Snap back if not completed
    if (sliderValue < 98) {
      const snapBack = () => {
        setSliderValue(prev => {
          if (prev <= 0) return 0;
          return Math.max(0, prev - 5); // Animate back speed
        });
      };
      
      const interval = setInterval(() => {
        setSliderValue(prev => {
           if (prev <= 0) {
             clearInterval(interval);
             return 0;
           }
           return Math.max(0, prev - 10);
        });
      }, 16);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm font-['VT323'] p-4 select-none">
      <div className={`w-full max-w-md p-1 ${theme.bg} ${theme.border} shadow-2xl`}>
        {/* Header */}
        <div className={`px-2 py-1 flex items-center gap-2 mb-4 ${isDarkMode ? 'bg-green-900 text-green-100' : 'bg-[#000080] text-white'}`}>
          <Shield size={16} />
          <span className="font-bold tracking-wider">SECURITY_PROTOCOL.EXE</span>
        </div>

        <div className={`p-6 flex flex-col items-center text-center ${theme.text}`}>
          <div className="mb-6 relative">
            {isUnlocking ? (
              <CheckCircle2 size={64} className="text-[#00ff00] animate-bounce" />
            ) : (
              <Lock size={64} className={isDarkMode ? 'text-green-500' : 'text-[#000080]'} />
            )}
          </div>

          <h2 className="text-2xl font-bold mb-2 uppercase">Human Verification</h2>
          <p className="mb-8 text-lg opacity-80">
            Swipe right to authorize uplink access.
          </p>

          {/* Custom Track Slider */}
          <div 
            ref={trackRef}
            className={`w-full relative h-16 touch-none cursor-pointer overflow-hidden ${theme.sliderTrack} ${isDarkMode ? 'border border-green-500' : 'border-2 border-inset border-white'}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {/* Background Text */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
               <span className={`font-bold tracking-[0.2em] text-xl animate-pulse ${isDarkMode ? 'text-green-500/50' : 'text-white mix-blend-difference'}`}>
                 {isUnlocking ? "ACCESS GRANTED" : "SLIDE TO UNLOCK >>>"}
               </span>
            </div>

            {/* Draggable Thumb */}
            <div 
                className={`absolute top-1 bottom-1 w-16 flex items-center justify-center transition-transform z-10 shadow-xl ${isDragging ? 'duration-0' : 'duration-100'} ${isDarkMode ? 'bg-green-500' : 'bg-[#c0c0c0] border-2 border-t-white border-l-white border-b-black border-r-black'}`}
                style={{ 
                    left: 0,
                    transform: `translateX(${sliderValue * (trackRef.current ? (trackRef.current.clientWidth - 64) / trackRef.current.clientWidth : 0.85)}%)` // 0.85 is a rough estimate to keep it in bounds dynamically, real calc happens in JS
                }}
            >
                {isUnlocking ? <CheckCircle2 size={24} className={isDarkMode ? 'text-black' : 'text-green-600'} /> : <div className={`w-6 h-6 border-2 rounded-full ${isDarkMode ? 'border-black' : 'border-black opacity-50'}`} />}
            </div>
            
            {/* Fill Progress (Optional visual flair) */}
            <div 
                className={`absolute top-0 bottom-0 left-0 pointer-events-none transition-all ${isDarkMode ? 'bg-green-900/50' : 'bg-[#000080]/20'}`}
                style={{ width: `${sliderValue}%` }}
            />
          </div>

          <div className="mt-4 text-sm opacity-50">
            {isUnlocking ? "Initializing..." : "Protected by XSpace Guard"}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityCheck;