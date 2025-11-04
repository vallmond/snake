import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameEngine } from './game/useGameEngine';
import type { Direction } from './game/types';
import './App.css';

type BoardPreset = {
  id: string;
  label: string;
  cols: number;
  rows: number;
  tickRate: number;
};

const boardPresets: BoardPreset[] = [
  { id: 'classic', label: 'Classic 24x18', cols: 24, rows: 18, tickRate: 8 },
  { id: 'standard', label: 'Standard 32x24', cols: 32, rows: 24, tickRate: 10 },
  { id: 'grand', label: 'Grand 40x30', cols: 40, rows: 30, tickRate: 12 },
];

const opponentOptions = [0, 1, 2, 3, 4];

const BASE_CELL_SIZE = 24;
const MIN_CELL_SIZE = 12;
const MOBILE_BREAKPOINT = 768;

const keyDirectionMap: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

const playerPalette = { head: '#10b981', body: '#34d399' };

const aiPalettes = [
  { head: '#f43f5e', body: '#fb7185' },
  { head: '#f97316', body: '#fb923c' },
  { head: '#6366f1', body: '#a855f7' },
  { head: '#22d3ee', body: '#38bdf8' },
];

const getSnakePalette = (snakeId: string, controller: 'player' | 'ai') => {
  if (controller === 'player') {
    return playerPalette;
  }
  const segment = snakeId.split('-')[1] ?? '1';
  const parsedIndex = Number.parseInt(segment, 10);
  const index = Number.isNaN(parsedIndex) ? 0 : Math.max(parsedIndex - 1, 0);
  return aiPalettes[index % aiPalettes.length];
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [boardPreset, setBoardPreset] = useState<BoardPreset['id']>('standard');
  const [aiCount, setAiCount] = useState<number>(3);
  const [cellSize, setCellSize] = useState(BASE_CELL_SIZE);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickVector, setJoystickVector] = useState({ x: 0, y: 0 });
  const joystickPointerId = useRef<number | null>(null);
  const lastJoystickDirection = useRef<Direction | null>(null);
  const joystickRef = useRef<HTMLDivElement>(null);

  const configOverride = useMemo(
    () => {
      const preset = boardPresets.find((option) => option.id === boardPreset) ?? boardPresets[0];
      return {
        cols: preset.cols,
        rows: preset.rows,
        tickRate: preset.tickRate,
        aiCount,
      };
    },
    [aiCount, boardPreset],
  );

  const { state, enqueueTurn, restart } = useGameEngine(configOverride);

  const boardSize = useMemo(
    () => ({
      width: state.config.cols * cellSize,
      height: state.config.rows * cellSize,
    }),
    [cellSize, state.config.cols, state.config.rows],
  );

  useEffect(() => {
    const computeResponsiveMetrics = () => {
      const width = window.innerWidth || document.documentElement.clientWidth || 1024;
      const height = window.innerHeight || document.documentElement.clientHeight || 768;
      setIsMobile(width <= MOBILE_BREAKPOINT);

      const horizontalGutter = width <= MOBILE_BREAKPOINT ? 24 : 96;
      const verticalGutter = width <= MOBILE_BREAKPOINT ? 260 : 360;

      const widthBased = Math.floor((width - horizontalGutter) / state.config.cols);
      const heightBased = Math.floor((height - verticalGutter) / state.config.rows);
      const candidates = [BASE_CELL_SIZE];
      if (Number.isFinite(widthBased)) {
        candidates.push(widthBased);
      }
      if (Number.isFinite(heightBased)) {
        candidates.push(heightBased);
      }
      const nextCellSize = Math.max(
        MIN_CELL_SIZE,
        Math.min(...candidates.filter((value) => Number.isFinite(value) && value > 0)),
      );
      setCellSize((previous) => (previous !== nextCellSize ? nextCellSize : previous));
    };

    computeResponsiveMetrics();
    window.addEventListener('resize', computeResponsiveMetrics);
    return () => {
      window.removeEventListener('resize', computeResponsiveMetrics);
    };
  }, [state.config.cols, state.config.rows]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'r') {
        event.preventDefault();
        restart();
        return;
      }

      if (state.status !== 'running' && (key === ' ' || key === 'enter')) {
        restart();
        return;
      }

      const direction = keyDirectionMap[event.key] ?? keyDirectionMap[key];
      if (direction) {
        event.preventDefault();
        enqueueTurn(direction);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true, passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [enqueueTurn, restart, state.status]);

  useEffect(() => {
    const threshold = 24;
    let startX: number | null = null;
    let startY: number | null = null;

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        return;
      }
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (startX === null || startY === null) {
        return;
      }
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) {
        startX = null;
        startY = null;
        return;
      }
      event.preventDefault();
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        enqueueTurn(deltaX > 0 ? 'right' : 'left');
      } else {
        enqueueTurn(deltaY > 0 ? 'down' : 'up');
      }
      startX = null;
      startY = null;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enqueueTurn]);

  const resolveDirectionFromVector = useCallback((dx: number, dy: number): Direction | null => {
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      return null;
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? 'right' : 'left';
    }
    return dy > 0 ? 'down' : 'up';
  }, []);

  const resetJoystick = useCallback(() => {
    joystickPointerId.current = null;
    lastJoystickDirection.current = null;
    setJoystickVector({ x: 0, y: 0 });
    setJoystickActive(false);
  }, []);

  const handleJoystickPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (state.status !== 'running') {
      restart();
    }
    joystickPointerId.current = event.pointerId;
    lastJoystickDirection.current = null;
    setJoystickActive(true);
    setJoystickVector({ x: 0, y: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [restart, state.status]);

  const handleJoystickPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (joystickPointerId.current !== event.pointerId) {
        return;
      }
      const container = joystickRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;
      const maxRadius = rect.width / 2;
      const magnitude = Math.sqrt(dx * dx + dy * dy);
      const clampFactor = magnitude > maxRadius ? maxRadius / magnitude : 1;
      const clampedX = dx * clampFactor;
      const clampedY = dy * clampFactor;
      setJoystickVector({ x: clampedX, y: clampedY });

      const direction = resolveDirectionFromVector(dx, dy);
      if (direction && direction !== lastJoystickDirection.current) {
        enqueueTurn(direction);
        lastJoystickDirection.current = direction;
      }
    },
    [enqueueTurn, resolveDirectionFromVector],
  );

  const handleJoystickPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (joystickPointerId.current !== event.pointerId) {
        return;
      }
      event.currentTarget.releasePointerCapture(event.pointerId);
      resetJoystick();
    },
    [resetJoystick],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const dpr = window.devicePixelRatio ?? 1;
    const { width, height } = boardSize;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= state.config.cols; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * cellSize + 0.5, 0);
      ctx.lineTo(x * cellSize + 0.5, height);
      ctx.stroke();
    }
    for (let y = 0; y <= state.config.rows; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellSize + 0.5);
      ctx.lineTo(width, y * cellSize + 0.5);
      ctx.stroke();
    }

    state.foods.forEach((food) => {
      const { x, y } = food.position;
      const originX = x * cellSize;
      const originY = y * cellSize;
      const centerX = originX + cellSize / 2;
      const centerY = originY + cellSize / 2;

      ctx.save();
      switch (food.kind) {
        case 'standard': {
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.arc(centerX, centerY, cellSize * 0.3, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'bulk': {
          const padding = cellSize * 0.18;
          ctx.fillStyle = '#fb923c';
          ctx.fillRect(originX + padding, originY + padding, cellSize - padding * 2, cellSize - padding * 2);
          break;
        }
        case 'speed': {
          ctx.translate(centerX, centerY);
          ctx.rotate(Math.PI / 4);
          const size = cellSize * 0.5;
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(-size / 2, -size / 2, size, size);
          break;
        }
        default:
          break;
      }
      ctx.restore();
    });

    state.snakes.forEach((snake) => {
      const palette = getSnakePalette(snake.id, snake.controller);
      const safe = state.tick < snake.safeUntilTick;
      ctx.save();
      if (safe) {
        ctx.globalAlpha = 0.75;
        ctx.shadowColor = palette.head;
        ctx.shadowBlur = 12;
      } else {
        ctx.shadowBlur = 0;
      }
      snake.segments.forEach((segment, index) => {
        const { x, y } = segment;
        ctx.fillStyle = index === 0 ? palette.head : palette.body;
        ctx.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
        if (safe) {
          ctx.strokeStyle = 'rgba(241, 245, 249, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x * cellSize + 1.5, y * cellSize + 1.5, cellSize - 3, cellSize - 3);
        }
      });
      ctx.restore();
    });
  }, [boardSize, state]);

  const opponentsAlive = state.snakes.filter((snake) => snake.controller === 'ai').length;
  const opponentsTotal = state.config.aiCount;
  const player = state.snakes.find((snake) => snake.id === 'player');
  const playerLength = player?.segments.length ?? 0;
  const playerBoost = player?.effects.find((effect) => effect.type === 'speedBoost');
  const boostTicksRemaining = playerBoost ? Math.max(playerBoost.expiresAtTick - state.tick, 0) : 0;
  const boostDisplay = playerBoost
    ? `${playerBoost.multiplier.toFixed(1)}× · ${boostTicksRemaining}t`
    : '—';

  return (
    <div className="app">
      <header className="hud">
        <div className="cluster">
          <div className="stat">
            Tick <span>{state.tick}</span>
          </div>
          <div className="stat">
            Length <span>{playerLength}</span>
          </div>
          <div className="stat">
            Food <span>{state.foods.length}</span>
          </div>
          <div className="stat">
            Opponents <span>{opponentsAlive}/{opponentsTotal}</span>
          </div>
          <div className="stat">
            Board <span>{state.config.cols}x{state.config.rows}</span>
          </div>
          <div className={`stat boost-stat${playerBoost ? '' : ' is-idle'}`}>
            Boost <span>{boostDisplay}</span>
          </div>
        </div>
        <div className="controls">
          <div className="control">
            <label htmlFor="board-select">Arena</label>
            <select
              id="board-select"
              value={boardPreset}
              onChange={(event) => setBoardPreset(event.target.value)}
            >
              {boardPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
          <div className="control">
            <label htmlFor="opponent-select">Opponents</label>
            <select
              id="opponent-select"
              value={aiCount}
              onChange={(event) => setAiCount(Number(event.target.value))}
            >
              {opponentOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="restart" onClick={restart}>
            Restart
          </button>
        </div>
      </header>
      <div className="board-wrapper" style={{ width: boardSize.width, height: boardSize.height }}>
        <canvas ref={canvasRef} className="board" />
        {state.status === 'gameover' && (
          <div className="overlay">
            <h2>Game Over</h2>
            <p>Press R or Enter to restart</p>
          </div>
        )}
      </div>
      {isMobile && (
        <div className="mobile-controls">
          <div
            ref={joystickRef}
            className={`joystick ${joystickActive ? 'is-active' : ''}`}
            onPointerDown={handleJoystickPointerDown}
            onPointerMove={handleJoystickPointerMove}
            onPointerUp={handleJoystickPointerUp}
            onPointerCancel={handleJoystickPointerUp}
            onPointerLeave={handleJoystickPointerUp}
          >
            <div
              className="joystick-thumb"
              style={{ transform: `translate(${joystickVector.x}px, ${joystickVector.y}px)` }}
            />
          </div>
        </div>
      )}
      <footer className="legend">
        <span>
          Controls: Arrow Keys or WASD steer. R or Enter restart. Yellow fruit adds length, orange crates add three,
          cyan diamonds grant a burst of speed. Freshly respawned snakes glow and phase through others for a moment.
          Longer snakes win head-on.
        </span>
      </footer>
    </div>
  );
}

export default App;
