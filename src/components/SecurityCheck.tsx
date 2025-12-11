import React, { useState } from 'react';
import { Shield, Lock, CheckCircle2 } from 'lucide-react';

interface SecurityCheckProps {
  onVerified: () => void;
  isDarkMode: boolean;
}

const SecurityCheck: React.FC<SecurityCheckProps> = ({ onVerified, isDarkMode }) => {
  const [sliderValue, setSliderValue] = useState(0);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setSliderValue(val);
    
    if (val === 100) {
      setIsUnlocking(true);
      setTimeout(() => {
        onVerified();
      }, 500);
    }
  };

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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm font-['VT323'] p-4">
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
            System requires manual authorization to establish secure uplink.
          </p>

          {/* Custom Slider */}
          <div className="w-full relative h-12">
            <input
              type="range"
              min="0"
              max="100"
              value={sliderValue}
              onChange={handleSliderChange}
              disabled={isUnlocking}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            />
            
            {/* Visual Track */}
            <div className={`absolute inset-0 flex items-center px-1 ${theme.sliderTrack} ${isDarkMode ? 'border border-green-500' : 'border-2 border-inset border-white'}`}>
               <span className={`w-full text-center font-bold tracking-widest pointer-events-none z-0 ${isDarkMode ? 'text-green-500/50' : 'text-white mix-blend-difference'}`}>
                 {isUnlocking ? "ACCESS GRANTED" : "SLIDE TO UNLOCK >>>"}
               </span>
            </div>

            {/* Visual Thumb */}
            <div 
                className={`absolute top-1 bottom-1 w-12 flex items-center justify-center transition-all duration-75 z-10 pointer-events-none ${isDarkMode ? 'bg-green-500' : 'bg-[#c0c0c0] border-2 border-t-white border-l-white border-b-black border-r-black'}`}
                style={{ left: `calc(${sliderValue}% - ${sliderValue * 0.48}px)` }} // simple math to keep thumb inside
            >
                {isUnlocking ? <CheckCircle2 size={20} className={isDarkMode ? 'text-black' : 'text-green-600'} /> : <div className={`w-4 h-4 border-2 ${isDarkMode ? 'border-black' : 'border-black opacity-50'}`} />}
            </div>
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