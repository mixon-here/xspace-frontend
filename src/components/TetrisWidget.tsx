import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, RotateCw, ArrowLeft, ArrowRight, ArrowDown, RefreshCw } from 'lucide-react';

interface TetrisWidgetProps {
  isDarkMode: boolean;
}

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 15; // Slightly shorter for widget size

const SHAPES = [
  [[1, 1, 1, 1]], // I
  [[1, 1], [1, 1]], // O
  [[0, 1, 0], [1, 1, 1]], // T
  [[1, 0, 0], [1, 1, 1]], // L
  [[0, 0, 1], [1, 1, 1]], // J
  [[0, 1, 1], [1, 1, 0]], // S
  [[1, 1, 0], [0, 1, 1]], // Z
];

const COLORS = [
    'transparent', 
    '#FF0D72', '#0DC2FF', '#0DFF72', '#F538FF', '#FF8E0D', '#FFE138', '#3877FF'
];

const createEmptyBoard = () => Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0));

const TetrisWidget: React.FC<TetrisWidgetProps> = ({ isDarkMode }) => {
  const [board, setBoard] = useState(createEmptyBoard());
  const [activePiece, setActivePiece] = useState<any>(null); // { shape, x, y, colorIdx }
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Game Loop Speed
  const speed = 800;
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Styles
  const theme = isDarkMode ? {
    bg: 'bg-black',
    border: 'border-green-500',
    cellEmpty: 'bg-green-900/20 border-green-900/30',
    cellFilled: 'bg-green-500 border-green-300',
    text: 'text-green-500',
    button: 'bg-green-900 text-green-100 hover:bg-green-700',
  } : {
    bg: 'bg-[#000000]',
    border: 'border-2 border-t-black border-l-black border-b-white border-r-white',
    cellEmpty: 'bg-[#202020]',
    cellFilled: 'bg-[#c0c0c0] border-white',
    text: 'text-black',
    button: 'bg-[#c0c0c0] border-2 border-t-white border-l-white border-b-black border-r-black active:border-inset text-black',
  };

  const spawnPiece = () => {
    const shapeIdx = Math.floor(Math.random() * SHAPES.length);
    const shape = SHAPES[shapeIdx];
    return {
      shape,
      x: Math.floor(BOARD_WIDTH / 2) - Math.floor(shape[0].length / 2),
      y: 0,
      colorIdx: shapeIdx + 1
    };
  };

  const checkCollision = (piece: any, moveX = 0, moveY = 0, newShape?: number[][]) => {
    const shape = newShape || piece.shape;
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (shape[y][x] !== 0) {
          const newX = piece.x + x + moveX;
          const newY = piece.y + y + moveY;
          
          if (
            newX < 0 || 
            newX >= BOARD_WIDTH || 
            newY >= BOARD_HEIGHT ||
            (newY >= 0 && board[newY][newX] !== 0)
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

  const drop = useCallback(() => {
    if (!activePiece || gameOver || !isPlaying) return;

    if (!checkCollision(activePiece, 0, 1)) {
        setActivePiece((prev: any) => ({ ...prev, y: prev.y + 1 }));
    } else {
        // Lock piece
        const newBoard = [...board];
        activePiece.shape.forEach((row: number[], y: number) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    const boardY = activePiece.y + y;
                    const boardX = activePiece.x + x;
                    if (boardY >= 0 && boardY < BOARD_HEIGHT) {
                        newBoard[boardY][boardX] = activePiece.colorIdx;
                    }
                }
            });
        });

        // Check clear lines
        let linesCleared = 0;
        for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
            if (newBoard[y].every(cell => cell !== 0)) {
                newBoard.splice(y, 1);
                newBoard.unshift(Array(BOARD_WIDTH).fill(0));
                linesCleared++;
                y++; // Recheck same row index
            }
        }
        
        setScore(prev => prev + (linesCleared * 100));
        setBoard(newBoard);

        const nextPiece = spawnPiece();
        if (checkCollision(nextPiece)) {
            setGameOver(true);
            setIsPlaying(false);
        } else {
            setActivePiece(nextPiece);
        }
    }
  }, [activePiece, board, gameOver, isPlaying]);

  // Controls
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
  }, [isPlaying, drop, activePiece]); // Dependencies for closure freshness

  // Game Loop
  useEffect(() => {
      if (isPlaying && !gameOver) {
          gameLoopRef.current = setInterval(drop, speed);
      } else {
          if (gameLoopRef.current) clearInterval(gameLoopRef.current);
      }
      return () => { if (gameLoopRef.current) clearInterval(gameLoopRef.current); };
  }, [isPlaying, gameOver, drop]);

  const startGame = () => {
      setBoard(createEmptyBoard());
      setScore(0);
      setGameOver(false);
      setActivePiece(spawnPiece());
      setIsPlaying(true);
  };

  const togglePause = () => {
      setIsPlaying(!isPlaying);
  };

  // Render Helper
  const getCellColor = (x: number, y: number) => {
      // Check active piece
      if (activePiece) {
          const relativeY = y - activePiece.y;
          const relativeX = x - activePiece.x;
          if (
              relativeY >= 0 && relativeY < activePiece.shape.length &&
              relativeX >= 0 && relativeX < activePiece.shape[0].length &&
              activePiece.shape[relativeY][relativeX] !== 0
          ) {
              return isDarkMode ? 'bg-green-500' : 'bg-red-500 border border-white'; // Active piece style
          }
      }
      // Check board
      if (board[y][x] !== 0) {
           return isDarkMode ? 'bg-green-700/80 border border-green-900' : 'bg-blue-600 border border-white';
      }
      return theme.cellEmpty;
  };

  return (
    <div className={`mt-4 p-2 border-2 ${isDarkMode ? 'border-green-600 bg-black' : 'border-t-white border-l-white border-b-black border-r-black bg-[#c0c0c0]'}`}>
        <div className={`text-center mb-1 text-sm font-bold uppercase ${isDarkMode ? 'text-green-500' : 'text-blue-900'}`}>
            BOREDOM_KILLER.EXE
        </div>
        <div className={`text-xs text-center mb-2 italic opacity-70 ${isDarkMode ? 'text-green-400' : 'text-black'}`}>
            "AMA is boring? Play this."
        </div>

        <div className={`relative mx-auto ${theme.bg} ${theme.border}`} style={{ width: 200, height: 300 }}>
            {/* Game Over Overlay */}
            {gameOver && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10 text-white">
                    <div className="text-xl font-bold text-red-500 mb-2">GAME OVER</div>
                    <div className="mb-4">Score: {score}</div>
                    <button onClick={startGame} className="px-3 py-1 bg-white text-black font-bold hover:bg-gray-200">
                        RESTART
                    </button>
                </div>
            )}
            
            {/* Start Overlay */}
            {!isPlaying && !gameOver && score === 0 && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10">
                    <Play size={48} className="text-green-500 mb-2 animate-pulse" />
                    <button onClick={startGame} className="px-3 py-1 bg-green-600 text-white font-bold hover:bg-green-500">
                        START
                    </button>
                </div>
            )}

            {/* Grid */}
            <div className="grid grid-cols-10 grid-rows-15 w-full h-full gap-px border border-white/10">
                {board.map((row, y) => (
                    row.map((_, x) => (
                        <div key={`${x}-${y}`} className={`w-full h-full ${getCellColor(x, y)}`} />
                    ))
                ))}
            </div>
        </div>

        <div className="flex justify-between items-center mt-2 px-2">
            <div className={`font-bold ${isDarkMode ? 'text-green-500' : 'text-black'}`}>SCORE: {score}</div>
            <div className="flex gap-1">
                 <button onClick={togglePause} className={`p-1 ${theme.button}`} title="Pause/Resume">
                    {isPlaying ? <span className="text-xs font-bold">||</span> : <Play size={14}/>}
                 </button>
                 <button onClick={startGame} className={`p-1 ${theme.button}`} title="Restart">
                    <RefreshCw size={14}/>
                 </button>
            </div>
        </div>
        
        {/* Mobile/Mouse Controls (Optional fallback) */}
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
