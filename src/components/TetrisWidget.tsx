import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, RotateCw, ArrowLeft, ArrowRight, ArrowDown, RefreshCw, Trophy, Zap, Bug, AlertCircle } from 'lucide-react';

interface TetrisWidgetProps {
  isDarkMode: boolean;
  serverUrl?: string; // e.g., "wss://.../ws" -> convert to http for API
  isGodMode?: boolean;
}

// TYPES
interface Cell {
    color: string;
    letter: string | null;
    locked: boolean;
}

interface ScoreEntry {
    name: string;
    score: number;
    timestamp: number;
}

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 15;

const SHAPES = [
  [[1, 1, 1, 1]], // I
  [[1, 1], [1, 1]], // O
  [[0, 1, 0], [1, 1, 1]], // T
  [[1, 0, 0], [1, 1, 1]], // L
  [[0, 0, 1], [1, 1, 1]], // J
  [[0, 1, 1], [1, 1, 0]], // S
  [[1, 1, 0], [0, 1, 1]], // Z
];

const PORTAL_LETTERS = ['P', 'O', 'R', 'T', 'A', 'L'];
const COLORS = [
    'transparent', 
    '#FF0D72', '#0DC2FF', '#0DFF72', '#F538FF', '#FF8E0D', '#FFE138', '#3877FF'
];

// Anti-Cheat Salt (Client Side - Level 1)
const CLIENT_SECRET = "XSPACE_CLIENT_SECRET_98";

const createEmptyBoard = (): Cell[][] => 
    Array.from({ length: BOARD_HEIGHT }, () => 
        Array(BOARD_WIDTH).fill({ color: 'transparent', letter: null, locked: false })
    );

const TetrisWidget: React.FC<TetrisWidgetProps> = ({ isDarkMode, serverUrl, isGodMode }) => {
  // GAME STATE
  const [board, setBoard] = useState<Cell[][]>(createEmptyBoard());
  const [activePiece, setActivePiece] = useState<any>(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameStartTime, setGameStartTime] = useState<number>(0);
  
  // LEADERBOARD STATE
  const [nickname, setNickname] = useState('');
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // FX STATE
  const [bonusMessage, setBonusMessage] = useState<{text: string, sub: string} | null>(null);

  // REFS
  const speed = 800;
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- API HELPERS ---
  const getHttpUrl = () => {
      if (!serverUrl) return null;
      // Convert wss:// or ws:// to https:// or http://
      return serverUrl.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws', '');
  };

  const fetchLeaderboard = async () => {
      const baseUrl = getHttpUrl();
      if (!baseUrl) {
          setFetchError("Missing Server URL");
          return;
      }
      setFetchError(null);
      try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

          const res = await fetch(`${baseUrl}/scores`, { 
              signal: controller.signal,
              headers: { 
                  'ngrok-skip-browser-warning': 'true' // CRITICAL FIX: Bypass Ngrok warning page
              }
          });
          clearTimeout(timeoutId);

          if (!res.ok) throw new Error("Status " + res.status);
          
          // Check if response is JSON (Ngrok might still send HTML if header is ignored)
          const contentType = res.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) {
              throw new Error("Received HTML instead of JSON. Check Ngrok URL.");
          }

          const data = await res.json();
          
          if (Array.isArray(data)) {
              // Ensure sorted descending
              const sorted = data.sort((a: any, b: any) => b.score - a.score);
              setLeaderboard(sorted);
          } else {
              setLeaderboard([]);
          }
      } catch (e: any) { 
          console.error("Leaderboard fetch failed", e);
          let msg = e.message || "Connection Error";
          if (msg.includes("<") || msg.includes("Unexpected token")) msg = "Server Error (Bad Response).";
          else if (msg === "Failed to fetch") msg = "Failed to fetch (Check HTTPS/Mixed Content)";
          setFetchError(msg);
      }
  };

  const submitScore = async () => {
      const baseUrl = getHttpUrl();
      if (!baseUrl || !nickname || score === 0) return;
      
      setIsSubmitting(true);
      
      // LEVEL 1 SECURITY: Simple Hash
      const msg = `${nickname}${score}${CLIENT_SECRET}`;
      let hash = 0;
      for (let i = 0; i < msg.length; i++) {
        const char = msg.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }

      const payload = {
          name: nickname,
          score: score,
          start_time: gameStartTime, // LEVEL 2 SECURITY: Server checks duration
          signature: hash.toString()
      };

      try {
          await fetch(`${baseUrl}/scores`, {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  'ngrok-skip-browser-warning': 'true' // CRITICAL FIX
              },
              body: JSON.stringify(payload)
          });
          await fetchLeaderboard();
      } catch (e) {
          alert("Failed to submit score. Server might be offline.");
      } finally {
          setIsSubmitting(false);
      }
  };

  useEffect(() => {
      if (showLeaderboard) fetchLeaderboard();
  }, [showLeaderboard, serverUrl]);

  // --- GAME LOGIC ---

  const spawnPiece = () => {
    const shapeIdx = Math.floor(Math.random() * SHAPES.length);
    const shapeTemplate = SHAPES[shapeIdx];
    const color = COLORS[shapeIdx + 1];
    
    // Add letters logic
    const shape = shapeTemplate.map(row => row.map(cell => {
        if (cell === 0) return { val: 0, letter: null };
        // 20% chance for a letter on a block
        const hasLetter = Math.random() < 0.2; 
        const letter = hasLetter ? PORTAL_LETTERS[Math.floor(Math.random() * PORTAL_LETTERS.length)] : null;
        return { val: 1, letter };
    }));

    return {
      shape,
      x: Math.floor(BOARD_WIDTH / 2) - Math.floor(shape[0].length / 2),
      y: 0,
      color
    };
  };

  const checkCollision = (piece: any, moveX = 0, moveY = 0, newShape?: any[][]) => {
    const shape = newShape || piece.shape;
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (shape[y][x].val !== 0) {
          const newX = piece.x + x + moveX;
          const newY = piece.y + y + moveY;
          
          if (
            newX < 0 || 
            newX >= BOARD_WIDTH || 
            newY >= BOARD_HEIGHT ||
            (newY >= 0 && board[newY][newX].locked) // Check locked property
          ) {
            return true;
          }
        }
      }
    }
    return false;
  };

  const rotate = () => {
    if (!activePiece || gameOver || !isPlaying) return;
    const rotatedShape = activePiece.shape[0].map((_: any, index: number) => 
      activePiece.shape.map((row: any[]) => row[index]).reverse()
    );
    
    if (!checkCollision(activePiece, 0, 0, rotatedShape)) {
        setActivePiece({ ...activePiece, shape: rotatedShape });
    }
  };

  const move = (dir: number) => {
    if (!activePiece || gameOver || !isPlaying) return;
    if (!checkCollision(activePiece, dir, 0)) {
        setActivePiece({ ...activePiece, x: activePiece.x + dir });
    }
  };

  const checkPortalBonus = (clearedRowsData: Cell[][]) => {
      // Collect all letters from cleared rows in order (top-down, left-right)
      let sequence = "";
      
      // Single line check (Legendary Bonus)
      for (const row of clearedRowsData) {
          const lineSeq = row.map(c => c.letter || "").join("");
          if (/P.*O.*R.*T.*A.*L/.test(lineSeq)) {
              return { type: "LEGENDARY", multiplier: 50 };
          }
          sequence += lineSeq;
      }

      // Mixed lines check (Epic Bonus)
      if (/P.*O.*R.*T.*A.*L/.test(sequence)) {
          return { type: "EPIC", multiplier: 5 };
      }

      return null;
  };

  const showFx = (title: string, sub: string) => {
      setBonusMessage({ text: title, sub: sub });
      setTimeout(() => setBonusMessage(null), 3000);
  }

  const drop = useCallback(() => {
    if (!activePiece || gameOver || !isPlaying) return;

    if (!checkCollision(activePiece, 0, 1)) {
        setActivePiece((prev: any) => ({ ...prev, y: prev.y + 1 }));
    } else {
        // LOCK PIECE
        const newBoard = board.map(row => row.map(cell => ({ ...cell }))); // Deep copy
        
        activePiece.shape.forEach((row: any[], y: number) => {
            row.forEach((cell, x) => {
                if (cell.val !== 0) {
                    const boardY = activePiece.y + y;
                    const boardX = activePiece.x + x;
                    if (boardY >= 0 && boardY < BOARD_HEIGHT) {
                        newBoard[boardY][boardX] = {
                            color: activePiece.color,
                            letter: cell.letter,
                            locked: true
                        };
                    }
                }
            });
        });

        // CHECK LINES
        let linesCleared = 0;
        const clearedRowsData: Cell[][] = [];
        
        for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
            if (newBoard[y].every(cell => cell.locked)) {
                clearedRowsData.push(newBoard[y]);
                newBoard.splice(y, 1);
                newBoard.unshift(Array(BOARD_WIDTH).fill({ color: 'transparent', letter: null, locked: false }));
                linesCleared++;
                y++; 
            }
        }
        
        let points = 0;
        if (linesCleared === 1) points = 100;
        if (linesCleared === 2) points = 300;
        if (linesCleared === 3) points = 500;
        if (linesCleared === 4) points = 800;

        // CHECK PORTAL BONUS
        if (linesCleared > 0) {
            const bonus = checkPortalBonus(clearedRowsData);
            if (bonus) {
                points *= bonus.multiplier;
                if (bonus.type === "LEGENDARY") showFx("PORTAL GOD!", `x${bonus.multiplier} BONUS`);
                else showFx("PORTAL SEQUENCE", `x${bonus.multiplier} BONUS`);
            }
        }
        
        setScore(prev => prev + points);
        setBoard(newBoard);

        const nextPiece = spawnPiece();
        if (checkCollision(nextPiece)) {
            setGameOver(true);
            setIsPlaying(false);
            if (score > 0) setShowLeaderboard(true); // Prompt to save score
        } else {
            setActivePiece(nextPiece);
        }
    }
  }, [activePiece, board, gameOver, isPlaying, score]);

  // CONTROLS
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (!isPlaying) return;
          if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
              e.preventDefault();
          }
          if (e.key === 'ArrowLeft') move(-1);
          if (e.key === 'ArrowRight') move(1);
          if (e.key === 'ArrowDown') drop();
          if (e.key === 'ArrowUp') rotate();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, drop, activePiece]);

  // FIX: Use a ref for the drop function to prevent interval restarts
  const dropRef = useRef(drop);
  useEffect(() => {
      dropRef.current = drop;
  }, [drop]);

  // GAME LOOP
  useEffect(() => {
      if (isPlaying && !gameOver) {
          gameLoopRef.current = setInterval(() => {
              if (dropRef.current) dropRef.current();
          }, speed);
      } else {
          if (gameLoopRef.current) clearInterval(gameLoopRef.current);
      }
      return () => { if (gameLoopRef.current) clearInterval(gameLoopRef.current); };
  }, [isPlaying, gameOver]); // Removed 'drop' dependency to fix stall hack

  const startGame = () => {
      setBoard(createEmptyBoard());
      setScore(0);
      setGameOver(false);
      setGameStartTime(Date.now() / 1000);
      setActivePiece(spawnPiece());
      setIsPlaying(true);
      setShowLeaderboard(false);
  };

  // DEBUG GOD MODE FUNCTIONS
  const debugTriggerPortalWin = () => {
      // Construct a board where the bottom row spells PORTAL
      const newBoard = createEmptyBoard();
      const letters = ['P', 'O', 'R', 'T', 'A', 'L'];
      
      // Fill bottom row except last cell
      for(let x=0; x<BOARD_WIDTH-1; x++) {
          newBoard[BOARD_HEIGHT-1][x] = {
              color: '#FFD700',
              locked: true,
              letter: x < letters.length ? letters[x] : null
          }
      }
      setBoard(newBoard);
      setScore(100);
      // Give player an I piece to drop
      setActivePiece({
          shape: [[[ {val:1, letter:null} ]], [[ {val:1, letter:null} ]], [[ {val:1, letter:null} ]], [[ {val:1, letter:null} ]]], // vertical line
          x: BOARD_WIDTH-1,
          y: 0,
          color: '#FFFFFF'
      });
  };

  const theme = isDarkMode ? {
    bg: 'bg-black',
    border: 'border-green-500',
    cellEmpty: 'bg-green-900/10 border-2 border-green-900/30', // MATCH BORDER WIDTH (2px)
    cellFilledBorder: 'border-2 border-green-400',
    text: 'text-green-500',
    button: 'bg-green-900 text-green-100 hover:bg-green-700',
  } : {
    bg: 'bg-[#000000]',
    border: 'border-2 border-t-black border-l-black border-b-white border-r-white',
    cellEmpty: 'bg-[#202020] border-2 border-[#2a2a2a]', // MATCH BORDER WIDTH (2px) - subtle grid
    cellFilledBorder: 'border-2 border-t-white border-l-white border-b-black border-r-black', // Classic 3D
    text: 'text-black',
    button: 'bg-[#c0c0c0] border-2 border-t-white border-l-white border-b-black border-r-black active:border-inset text-black',
  };

  // RENDER CELL
  const renderCell = (x: number, y: number) => {
      let cellData = board[y][x];

      // Overlay Active Piece
      if (activePiece) {
          const relY = y - activePiece.y;
          const relX = x - activePiece.x;
          if (
              relY >= 0 && relY < activePiece.shape.length &&
              relX >= 0 && relX < activePiece.shape[0].length &&
              activePiece.shape[relY][relX].val !== 0
          ) {
              cellData = { 
                  locked: false, 
                  color: activePiece.color, 
                  letter: activePiece.shape[relY][relX].letter 
              };
          }
      }

      if (cellData.color === 'transparent') {
          return <div key={`${x}-${y}`} className={`w-full h-full box-border ${theme.cellEmpty}`} />;
      }

      return (
          <div key={`${x}-${y}`} 
            className={`w-full h-full box-border flex items-center justify-center relative overflow-hidden ${theme.cellFilledBorder}`}
            style={{ backgroundColor: cellData.color }}
          >
              {cellData.letter && (
                  <span className="absolute inset-0 flex items-center justify-center font-bold text-white text-[10px] md:text-xs drop-shadow-md z-10 font-sans leading-none pointer-events-none">
                      {cellData.letter}
                  </span>
              )}
          </div>
      );
  };

  return (
    <div className={`mt-4 p-2 border-2 relative ${isDarkMode ? 'border-green-600 bg-black' : 'border-t-white border-l-white border-b-black border-r-black bg-[#c0c0c0]'}`}>
        
        {/* BONUS FX OVERLAY */}
        {bonusMessage && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-none animate-bounce">
                <div className="text-4xl font-bold text-yellow-400 drop-shadow-[0_4px_4px_rgba(0,0,0,1)] uppercase stroke-black">{bonusMessage.text}</div>
                <div className="text-2xl font-bold text-white drop-shadow-md">{bonusMessage.sub}</div>
            </div>
        )}

        <div className={`text-center mb-1 text-sm font-bold uppercase flex justify-between px-2 ${isDarkMode ? 'text-green-500' : 'text-blue-900'}`}>
            <span>PORTAL_TETRIS.EXE</span>
            {isGodMode && <span className="text-red-500 animate-pulse flex items-center gap-1"><Bug size={12}/> GOD MODE</span>}
        </div>

        <div className={`relative mx-auto ${theme.bg} ${theme.border}`} style={{ width: 200, height: 300 }}>
            
            {/* Start / Leaderboard Overlay */}
            {!isPlaying && (
                <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-20 text-white p-2">
                    {showLeaderboard ? (
                        <div className="w-full h-full flex flex-col">
                            <div className="text-yellow-400 font-bold mb-2 flex items-center justify-center gap-2"><Trophy size={16}/> TOP SCORES</div>
                            
                            {/* Submit Score Form */}
                            {gameOver && score > 0 && (
                                <div className="mb-2 w-full flex gap-1">
                                    <input 
                                        maxLength={14}
                                        placeholder="YOUR NAME"
                                        className="w-full bg-gray-800 border border-gray-600 px-1 text-sm uppercase"
                                        value={nickname}
                                        onChange={e => setNickname(e.target.value.toUpperCase())}
                                    />
                                    <button 
                                        disabled={isSubmitting}
                                        onClick={submitScore}
                                        className="bg-green-600 px-2 text-xs font-bold"
                                    >
                                        SAVE
                                    </button>
                                </div>
                            )}

                            <div className="flex-1 overflow-y-auto text-xs space-y-1 w-full custom-scrollbar pr-1 relative">
                                {fetchError ? (
                                    <div className="flex flex-col items-center justify-center h-full text-red-500 gap-2">
                                        <AlertCircle size={32}/>
                                        <div className="text-center font-bold">CONNECTION ERROR</div>
                                        <div className="text-[10px] text-center opacity-80 max-w-[150px] mb-2 leading-tight">
                                            {fetchError}
                                        </div>
                                        <button 
                                            onClick={fetchLeaderboard}
                                            className="bg-red-900 text-white px-3 py-1 text-xs border border-red-500 hover:bg-red-800"
                                        >
                                            RETRY CONNECTION
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        {leaderboard.map((entry, i) => (
                                            <div key={i} className="flex justify-between border-b border-gray-800 pb-1">
                                                <span className="text-gray-400">{i+1}. {entry.name.slice(0, 10)}</span>
                                                <span className="text-yellow-500">{entry.score}</span>
                                            </div>
                                        ))}
                                        {leaderboard.length === 0 && <div className="text-center opacity-50 mt-4">No records yet</div>}
                                    </>
                                )}
                            </div>
                            
                            <div className="flex gap-2 mt-2 w-full">
                                <button onClick={() => setShowLeaderboard(false)} className="flex-1 bg-gray-700 py-1 text-xs">BACK</button>
                                <button onClick={startGame} className="flex-1 bg-green-700 py-1 text-xs font-bold">PLAY AGAIN</button>
                            </div>
                        </div>
                    ) : (
                        // Main Menu
                        <>
                            <div className="mb-4 text-center">
                                <div className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">PORTAL</div>
                                <div className="text-xl tracking-[0.2em] text-gray-400">STACKER</div>
                            </div>
                            <button onClick={startGame} className="px-6 py-2 bg-green-600 text-white font-bold hover:bg-green-500 mb-2 w-32 border-2 border-white">
                                START
                            </button>
                            <button onClick={() => setShowLeaderboard(true)} className="px-6 py-2 bg-blue-800 text-white font-bold hover:bg-blue-700 w-32 border-2 border-gray-500">
                                SCORES
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Grid - REMOVED GAP, USED border-box logic */}
            <div className="grid grid-cols-10 grid-rows-15 w-full h-full gap-0 border border-white/10">
                {board.map((row, y) => (
                    row.map((_, x) => renderCell(x, y))
                ))}
            </div>
        </div>

        <div className="flex justify-between items-center mt-2 px-2">
            <div className={`font-bold ${isDarkMode ? 'text-green-500' : 'text-black'}`}>SCORE: {score}</div>
            <div className="flex gap-1">
                 <button onClick={() => setIsPlaying(!isPlaying)} className={`p-1 ${theme.button}`} title="Pause">
                    {isPlaying ? <span className="text-xs font-bold w-3 inline-block text-center">||</span> : <Play size={14}/>}
                 </button>
                 <button onClick={startGame} className={`p-1 ${theme.button}`} title="Restart">
                    <RefreshCw size={14}/>
                 </button>
            </div>
        </div>
        
        {/* GOD MODE CONTROLS */}
        {isGodMode && (
            <div className="mt-2 p-1 border border-red-500 bg-black/80 grid grid-cols-2 gap-1">
                <button onClick={() => showFx("TEST FX", "x50 BONUS")} className="text-[10px] bg-red-900 text-white p-1">TEST ANIM</button>
                <button onClick={debugTriggerPortalWin} className="text-[10px] bg-red-900 text-white p-1">WIN SCENARIO</button>
            </div>
        )}
        
        <div className="grid grid-cols-3 gap-1 mt-2">
            <button onMouseDown={() => move(-1)} className={`flex justify-center items-center py-1 ${theme.button}`}><ArrowLeft size={16}/></button>
            <button onMouseDown={() => rotate()} className={`flex justify-center items-center py-1 ${theme.button}`}><RotateCw size={16}/></button>
            <button onMouseDown={() => move(1)} className={`flex justify-center items-center py-1 ${theme.button}`}><ArrowRight size={16}/></button>
            <div/>
            <button onMouseDown={() => drop()} className={`flex justify-center items-center py-1 ${theme.button}`}><ArrowDown size={16}/></button>
            <div/>
        </div>
    </div>
  );
};

export default TetrisWidget;