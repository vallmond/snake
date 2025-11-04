import { useCallback, useEffect, useRef, useState } from 'react';
import { advanceState, createInitialState, defaultConfig } from './engine';
import type { Direction, GameConfig, GameState, InputCommand } from './types';

const createFrameLoop = (
  configRef: { current: GameConfig },
  getState: () => GameState,
  setState: (state: GameState) => void,
  getQueue: () => InputCommand[],
  clearQueue: () => void,
  loopResetRef: { current: boolean },
) => {
  let animationFrame = 0;
  let previous = performance.now();
  let accumulator = 0;

  const frame = () => {
    const now = performance.now();
    if (loopResetRef.current) {
      loopResetRef.current = false;
      accumulator = 0;
      previous = now;
    }
    const dt = now - previous;
    previous = now;
    accumulator += dt;

    const commands = getQueue();
    const targetDelta = 1000 / configRef.current.tickRate;
    while (accumulator >= targetDelta) {
      const consumed = commands.splice(0, commands.length);
      const nextState = advanceState(getState(), consumed);
      setState(nextState);
      accumulator -= targetDelta;
      if (nextState.status !== 'running') {
        accumulator = 0;
        break;
      }
    }

    clearQueue();
    animationFrame = requestAnimationFrame(frame);
  };

  animationFrame = requestAnimationFrame(frame);

  return () => cancelAnimationFrame(animationFrame);
};

export const useGameEngine = (configOverride: Partial<GameConfig> = {}) => {
  const configRef = useRef({ ...defaultConfig, ...configOverride });
  const [state, setState] = useState(() => createInitialState(configRef.current));
  const stateRef = useRef(state);
  const queueRef = useRef<InputCommand[]>([]);
  const loopResetRef = useRef(false);

  const enqueueTurn = useCallback(
    (direction: Direction, snakeId = 'player') => {
      queueRef.current.push({ snakeId, type: 'turn', direction });
    },
    [],
  );

  const restart = useCallback(() => {
    queueRef.current.length = 0;
    const next = createInitialState(configRef.current);
    stateRef.current = next;
    setState(next);
    loopResetRef.current = true;
  }, []);

  useEffect(() => {
    configRef.current = { ...defaultConfig, ...configOverride };
    queueRef.current.length = 0;
    const next = createInitialState(configRef.current);
    stateRef.current = next;
    setState(next);
    loopResetRef.current = true;
  }, [configOverride]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const getState = () => stateRef.current;
    const set = (next: GameState) => {
      stateRef.current = next;
      setState(next);
    };

    const getQueue = () => queueRef.current;
    const clearQueue = () => {
      if (queueRef.current.length > 4) {
        queueRef.current.splice(0, queueRef.current.length - 4);
      }
    };

    const stop = createFrameLoop(configRef, getState, set, getQueue, clearQueue, loopResetRef);

    return () => {
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, enqueueTurn, restart };
};
