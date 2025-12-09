import React from 'react';
import { X, Check, Zap, Volume2, Globe } from 'lucide-react';

interface ExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

const ExplanationModal: React.FC<ExplanationModalProps> = ({ isOpen, onClose, isDarkMode }) => {
  if (!isOpen) return null;

  // Theme Styles
  const theme = isDarkMode ? {
    window: 'bg-gray-900 border-green-500 text-green-500',
    header: 'bg-green-900 text-green-100',
    button: 'bg-black border border-green-500 hover:bg-green-900 text-green-500',
    text: 'text-green-400',
    iconBg: 'border border-green-500 bg-black text-green-500'
  } : {
    window: 'bg-[#c0c0c0] border-2 border-t-white border-l-white border-b-black border-r-black text-black',
    header: 'bg-[#000080] text-white',
    button: 'bg-[#c0c0c0] border-2 border-t-white border-l-white border-b-black border-r-black active:border-t-black active:border-l-black active:border-b-white active:border-r-white',
    text: 'text-gray-800',
    iconBg: 'bg-white border-2 border-inset border-gray-400'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm font-['VT323']">
      <div className={`w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] ${isDarkMode ? 'border border-green-500' : ''} ${theme.window}`}>
        
        {/* Header */}
        <div className={`px-2 py-1 flex justify-between items-center select-none ${theme.header}`}>
            <span className="font-bold tracking-wider text-xl flex items-center gap-2">
                <Globe size={18} /> SYSTEM_INFO.TXT
            </span>
            <button 
                onClick={onClose} 
                className={`w-6 h-6 flex items-center justify-center font-bold leading-none ${isDarkMode ? 'hover:text-white' : 'bg-[#c0c0c0] text-black border border-t-white border-l-white border-b-black border-r-black active:border-inset'}`}
            >
                <X size={14} />
            </button>
        </div>

        <div className="p-6 overflow-y-auto text-xl leading-relaxed">
            <div className="text-center mb-8">
                <h2 className={`text-4xl font-bold mb-2 uppercase ${isDarkMode ? 'text-green-400' : 'text-[#000080]'}`}>
                    XSpace Translator 98
                </h2>
                <p className={theme.text}>Real-time Audio Intelligence System</p>
            </div>

            <div className="space-y-6">
                
                <div className="flex items-start gap-4">
                    <div className={`p-2 shrink-0 ${theme.iconBg}`}>
                        <span className="font-bold text-2xl">1</span>
                    </div>
                    <div>
                        <h3 className="font-bold text-2xl mb-1">Paste Link</h3>
                        <p className={theme.text}>Copy the Twitter Space URL and paste it into the "Target URL" field.</p>
                    </div>
                </div>

                <div className="flex items-start gap-4">
                    <div className={`p-2 shrink-0 ${theme.iconBg}`}>
                        <span className="font-bold text-2xl">2</span>
                    </div>
                    <div>
                        <h3 className="font-bold text-2xl mb-1">Choose Language</h3>
                        <p className={theme.text}>Select the language they are speaking (Input) and the language you want to read/hear (Output).</p>
                    </div>
                </div>

                <div className="flex items-start gap-4">
                    <div className={`p-2 shrink-0 ${theme.iconBg}`}>
                        <Zap size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-2xl mb-1">Live Stream</h3>
                        <p className={theme.text}>Click "ESTABLISH LINK". The system will connect to the broadcast.</p>
                    </div>
                </div>

                <div className="flex items-start gap-4">
                    <div className={`p-2 shrink-0 ${theme.iconBg}`}>
                        <Volume2 size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-2xl mb-1">Performance Tip</h3>
                        <p className={theme.text}>
                            If your PC is slow, you can <b>MUTE</b> the audio playback in the sidebar. Text-only mode is extremely fast.
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <div className={`p-4 ${isDarkMode ? 'border-t border-green-900' : ''}`}>
            <button
            onClick={onClose}
            className={`w-full py-2 font-bold text-2xl uppercase ${theme.button}`}
            >
            OK, I Understand
            </button>
            
            <div className={`mt-4 text-center text-lg ${theme.text} opacity-70`}>
                Designed by <a href="https://x.com/mixon_here" target="_blank" className="underline hover:text-red-500">@mixon_here</a>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ExplanationModal;