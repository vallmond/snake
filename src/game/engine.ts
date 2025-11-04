import { createRng } from './prng';
import type {
  Direction,
  Food,
  FoodEffectTemplate,
  GameConfig,
  GameState,
  InputCommand,
  RespawnTicket,
  Snake,
  SnakeEffect,
  Vec2,
} from './types';

const directionVectors: Record<Direction, Vec2> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const allDirections: Direction[] = ['up', 'down', 'left', 'right'];

const opposite: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

const cellKey = (pos: Vec2) => `${pos.x},${pos.y}`;

const nextPosition = (from: Vec2, direction: Direction): Vec2 => {
  const delta = directionVectors[direction];
  return {
    x: from.x + delta.x,
    y: from.y + delta.y,
  };
};

export const defaultConfig: GameConfig = {
  cols: 32,
  rows: 24,
  tickRate: 10,
  seed: 1,
  aiCount: 2,
};

const clampConfig = (config: GameConfig): GameConfig => ({
  ...config,
  cols: Math.max(8, config.cols),
  rows: Math.max(8, config.rows),
  tickRate: Math.max(1, config.tickRate),
  aiCount: Math.max(0, Math.min(4, config.aiCount)),
});

const buildSnake = (
  id: string,
  head: Vec2,
  direction: Direction,
  controller: Snake['controller'],
  safeUntilTick = 0,
): Snake => {
  const vector = directionVectors[direction];
  const body: Vec2[] = [head];
  for (let i = 1; i < 3; i += 1) {
    body.push({ x: head.x - vector.x * i, y: head.y - vector.y * i });
  }
  return {
    id,
    segments: body,
    direction,
    alive: true,
    pendingTurn: undefined,
    speed: 1,
    accumulator: 0,
    controller,
    pendingGrowth: 0,
    effects: [],
    safeUntilTick,
  };
};

type Occupancy = Map<string, string>;

const applyInput = (snake: Snake, direction: Direction): Snake => {
  if (direction === opposite[snake.direction]) {
    return snake; // ignore illegal 180 turns
  }
  return { ...snake, pendingTurn: direction };
};

const maybeTurn = (snake: Snake): { direction: Direction; pendingTurn?: Direction } => {
  if (snake.pendingTurn && snake.pendingTurn !== opposite[snake.direction]) {
    return { direction: snake.pendingTurn, pendingTurn: undefined };
  }
  return { direction: snake.direction, pendingTurn: snake.pendingTurn };
};

type ProposedMove = {
  snake: Snake;
  willMove: boolean;
  direction: Direction;
  nextHead?: Vec2;
  growth: number;
  ateFoodId?: string;
  effectTemplate?: FoodEffectTemplate;
  newAccumulator: number;
  pendingTurn?: Direction;
  collided: boolean;
  reason?: 'wall' | 'body' | 'head';
  tailKey?: string;
};

const createSpawnPoints = (config: GameConfig): Array<{ head: Vec2; direction: Direction }> => {
  const margin = Math.max(3, Math.floor(Math.min(config.cols, config.rows) * 0.1));
  const rightX = Math.max(margin, config.cols - margin - 1);
  const leftX = Math.min(config.cols - margin - 1, margin);
  const topY = Math.min(config.rows - margin - 1, margin);
  const bottomY = Math.max(margin, config.rows - margin - 1);

  const centerX = Math.floor(config.cols / 2);

  return [
    { head: { x: leftX, y: topY }, direction: 'right' },
    { head: { x: rightX, y: topY }, direction: 'left' },
    { head: { x: rightX, y: bottomY }, direction: 'left' },
    { head: { x: leftX, y: bottomY }, direction: 'right' },
    { head: { x: centerX, y: topY }, direction: 'down' },
    { head: { x: centerX, y: bottomY }, direction: 'up' },
  ];
};

type FoodDefinition = {
  kind: Food['kind'];
  weight: number;
  growth: number;
  effect?: FoodEffectTemplate;
};

const foodDefinitions: FoodDefinition[] = [
  { kind: 'standard', weight: 0.6, growth: 1 },
  { kind: 'bulk', weight: 0.2, growth: 3 },
  {
    kind: 'speed',
    weight: 0.2,
    growth: 1,
    effect: { type: 'speedBoost', multiplier: 1.6, duration: 18 },
  },
];

const totalFoodWeight = foodDefinitions.reduce((acc, definition) => acc + definition.weight, 0);

const pickFoodDefinition = (rng: ReturnType<typeof createRng>): FoodDefinition => {
  let value = rng.next() * totalFoodWeight;
  for (const definition of foodDefinitions) {
    value -= definition.weight;
    if (value <= 0) {
      return definition;
    }
  }
  return foodDefinitions[foodDefinitions.length - 1];
};

const MAX_FOOD = 5;

const RESPAWN_DELAY_TICKS = 24;
const SAFE_RESPAWN_TICKS = 12;

const isSnakeSafe = (snake: Snake, tick: number) => tick < snake.safeUntilTick;

const pruneEffects = (effects: SnakeEffect[], tick: number): SnakeEffect[] =>
  effects.filter((effect) => effect.expiresAtTick > tick);

const getSpeedMultiplier = (effects: SnakeEffect[]): number =>
  effects.reduce((multiplier, effect) => {
    if (effect.type === 'speedBoost') {
      return multiplier * effect.multiplier;
    }
    return multiplier;
  }, 1);

const manhattanDistance = (a: Vec2, b: Vec2) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const computeAiTurn = (snake: Snake, state: GameState, occupancy: Occupancy, rng: ReturnType<typeof createRng>): Direction | undefined => {
  if (!snake.alive) {
    return undefined;
  }

  const candidates = allDirections.filter((direction) => direction !== opposite[snake.direction]);
  const tailKey = cellKey(snake.segments[snake.segments.length - 1]);
  const willVacateTail = snake.pendingGrowth <= 0;

  let bestDirection: Direction | undefined;
  let bestScore = -Infinity;

  candidates.forEach((direction) => {
    const target = nextPosition(snake.segments[0], direction);

    if (target.x < 0 || target.y < 0 || target.x >= state.config.cols || target.y >= state.config.rows) {
      return;
    }

    const targetKey = cellKey(target);
    const occupant = occupancy.get(targetKey);
    const movingIntoSelfTail = occupant === snake.id && targetKey === tailKey && willVacateTail;
    if (occupant && !movingIntoSelfTail) {
      return;
    }

    let score = 0;
    if (state.foods.length > 0) {
      const closest = state.foods.reduce((acc, food) => Math.min(acc, manhattanDistance(food.position, target)), Infinity);
      score -= closest;
    }

    // prefer continuing straight slightly to reduce jitter
    if (direction === snake.direction) {
      score += 0.5;
    }

    // add small noise so ties break deterministically via rng
    score += (rng.next() - 0.5) * 0.1;

    if (score > bestScore) {
      bestScore = score;
      bestDirection = direction;
    }
  });

  return bestDirection;
};

export const createInitialState = (partialConfig: Partial<GameConfig> = {}): GameState => {
  const config = clampConfig({ ...defaultConfig, ...partialConfig });
  const rng = createRng(config.seed);

  const snakes: Snake[] = [];
  const spawnPoints = createSpawnPoints(config);
  const playerLayout = spawnPoints[0];
  snakes.push(buildSnake('player', playerLayout.head, playerLayout.direction, 'player'));

  for (let i = 0; i < config.aiCount; i += 1) {
    const layout = spawnPoints[i + 1] ?? spawnPoints[(i + 1) % spawnPoints.length];
    const id = `ai-${i + 1}`;
    snakes.push(buildSnake(id, layout.head, layout.direction, 'ai'));
  }

  const state: GameState = {
    tick: 0,
    config,
    snakes,
    foods: [],
    rngState: config.seed >>> 0,
    status: 'running',
    respawnQueue: [],
  };

  return replenishFood(state, rng);
};

const replenishFood = (state: GameState, rng = createRng(state.rngState)): GameState => {
  if (state.foods.length >= MAX_FOOD) {
    return state;
  }

  const occupied = new Set<string>();
  state.snakes.forEach((snake) => {
    snake.segments.forEach((segment) => occupied.add(cellKey(segment)));
  });
  state.foods.forEach((food) => occupied.add(cellKey(food.position)));

  const foods: Food[] = [...state.foods];
  const attempts = state.config.cols * state.config.rows;
  while (foods.length < MAX_FOOD) {
    let placed = false;
    for (let i = 0; i < attempts; i += 1) {
      const x = Math.floor(rng.next() * state.config.cols);
      const y = Math.floor(rng.next() * state.config.rows);
      const key = cellKey({ x, y });
      if (occupied.has(key)) {
        continue;
      }

      const definition = pickFoodDefinition(rng);
      foods.push({
        id: `food-${state.tick}-${foods.length}-${definition.kind}`,
        position: { x, y },
        kind: definition.kind,
        growth: definition.growth,
        effect: definition.effect ? { ...definition.effect } : undefined,
      });
      occupied.add(key);
      placed = true;
      break;
    }
    if (!placed) {
      break;
    }
  }

  return {
    ...state,
    foods,
    rngState: rng.state,
  };
};

export const advanceState = (state: GameState, commands: InputCommand[]): GameState => {
  if (state.status !== 'running') {
    return state;
  }

  const rng = createRng(state.rngState);
  const respawnQueue: RespawnTicket[] = state.respawnQueue.map((ticket) => ({ ...ticket }));
  const respawnTicketsToAdd: RespawnTicket[] = [];
  const commandMap = new Map<string, Direction>();
  commands.forEach((command) => {
    if (command.type === 'turn') {
      commandMap.set(command.snakeId, command.direction);
    }
  });

  const initialOccupancy: Occupancy = new Map();
  state.snakes.forEach((snake) => {
    snake.segments.forEach((segment) => initialOccupancy.set(cellKey(segment), snake.id));
  });

  state.snakes.forEach((snake) => {
    if (snake.controller === 'ai' && !commandMap.has(snake.id)) {
      const aiDirection = computeAiTurn(snake, state, initialOccupancy, rng);
      if (aiDirection) {
        commandMap.set(snake.id, aiDirection);
      }
    }
  });

  const snakeLookup = new Map<string, Snake>();
  const snakes = state.snakes.map((snake) => {
    const activeEffects = snake.effects.length ? pruneEffects(snake.effects, state.tick) : snake.effects;
    let current = activeEffects === snake.effects ? snake : { ...snake, effects: activeEffects };

    if (!current.alive) {
      snakeLookup.set(current.id, current);
      return current;
    }

    if (commandMap.has(current.id)) {
      current = applyInput(current, commandMap.get(current.id)!);
    }

    snakeLookup.set(current.id, current);
    return current;
  });

  const safeLookup = new Map<string, boolean>();
  snakes.forEach((snake) => {
    safeLookup.set(snake.id, isSnakeSafe(snake, state.tick));
  });

  const occupancy: Occupancy = new Map();
  snakes.forEach((snake) => {
    snake.segments.forEach((segment) => occupancy.set(cellKey(segment), snake.id));
  });

  const proposedMoves: ProposedMove[] = snakes.map((snake) => {
    if (!snake.alive) {
      return {
        snake,
        willMove: false,
        direction: snake.direction,
        growth: 0,
        newAccumulator: snake.accumulator,
        pendingTurn: snake.pendingTurn,
        collided: true,
        reason: 'body',
      };
    }

    const { direction, pendingTurn } = maybeTurn(snake);
    const effectiveSpeed = snake.speed * getSpeedMultiplier(snake.effects);
    const accumulator = snake.accumulator + effectiveSpeed;
    const willMove = accumulator >= 1;
    const newAccumulator = willMove ? accumulator - 1 : accumulator;

    if (!willMove) {
      return {
        snake,
        willMove,
        direction,
        growth: 0,
        newAccumulator,
        pendingTurn,
        collided: false,
      };
    }

    const delta = directionVectors[direction];
    const currentHead = snake.segments[0];
    const nextHead: Vec2 = {
      x: currentHead.x + delta.x,
      y: currentHead.y + delta.y,
    };

    const tail = snake.segments[snake.segments.length - 1];
    const food = state.foods.find((item) => item.position.x === nextHead.x && item.position.y === nextHead.y);
    const growth = food ? food.growth : 0;
    const effectTemplate = food?.effect;
    const ateFoodId = food?.id;
    const tailKey = snake.pendingGrowth + growth > 0 ? undefined : cellKey(tail);

    return {
      snake,
      willMove,
      direction,
      nextHead,
      growth,
      ateFoodId,
      effectTemplate,
      newAccumulator,
      pendingTurn,
      collided: false,
      tailKey,
    };
  });

  const moveBySnake = new Map<string, ProposedMove>();
  proposedMoves.forEach((move) => moveBySnake.set(move.snake.id, move));

  // Boundary and occupancy checks
  proposedMoves.forEach((move) => {
    if (!move.willMove || move.collided) {
      return;
    }
    const { nextHead, snake } = move;
    if (!nextHead) {
      return;
    }

    if (nextHead.x < 0 || nextHead.y < 0 || nextHead.x >= state.config.cols || nextHead.y >= state.config.rows) {
      move.collided = true;
      move.reason = 'wall';
      return;
    }

    const key = cellKey(nextHead);
    const occupant = occupancy.get(key);
    if (occupant) {
      if (occupant === snake.id) {
        return;
      }

      const moverSafe = safeLookup.get(snake.id) ?? false;
      const occupantSafe = safeLookup.get(occupant) ?? false;

      if (moverSafe || occupantSafe) {
        return;
      }

      const otherMove = moveBySnake.get(occupant);
      const occupantSnake = snakeLookup.get(occupant);
      const occupantIsHead = occupantSnake
        ? occupantSnake.segments[0].x === nextHead.x && occupantSnake.segments[0].y === nextHead.y
        : false;
      const isHeadOn = occupantIsHead
        && otherMove?.willMove
        && otherMove.nextHead
        && otherMove.nextHead.x === snake.segments[0].x
        && otherMove.nextHead.y === snake.segments[0].y;

      if (isHeadOn) {
        return;
      }

      const otherTailVacates = otherMove?.willMove && otherMove?.tailKey === key;
      if (!otherTailVacates) {
        move.collided = true;
        move.reason = 'body';
      }
    }
  });

  const headCollisions = new Map<string, ProposedMove[]>();
  proposedMoves.forEach((move) => {
    if (!move.willMove || move.collided || !move.nextHead) {
      return;
    }
    const key = cellKey(move.nextHead);
    const list = headCollisions.get(key) ?? [];
    list.push(move);
    headCollisions.set(key, list);
  });

  headCollisions.forEach((moves) => {
    if (moves.length <= 1) {
      return;
    }
    const interactive = moves.filter((move) => !(safeLookup.get(move.snake.id) ?? false));
    if (interactive.length <= 1) {
      return;
    }

    const maxLength = Math.max(...interactive.map((move) => move.snake.segments.length));
    const winners = interactive.filter((move) => move.snake.segments.length === maxLength);

    if (winners.length === 1) {
      const winner = winners[0];
      interactive.forEach((move) => {
        if (move !== winner) {
          move.collided = true;
          move.reason = 'head';
        }
      });
      return;
    }

    interactive.forEach((move) => {
      move.collided = true;
      move.reason = 'head';
    });
  });

  const nextSnakes: Snake[] = proposedMoves.map((move) => {
    const { snake } = move;
    if (!snake.alive) {
      return snake;
    }

    if (!move.willMove) {
      return {
        ...snake,
        direction: move.direction,
        pendingTurn: move.pendingTurn,
        accumulator: move.newAccumulator,
      };
    }

    if (move.collided) {
      if (snake.controller === 'ai') {
        respawnTicketsToAdd.push({
          snakeId: snake.id,
          controller: snake.controller,
          ticksRemaining: RESPAWN_DELAY_TICKS,
        });
      }
      return {
        ...snake,
        alive: false,
        pendingTurn: undefined,
        accumulator: 0,
        pendingGrowth: 0,
        effects: [],
        safeUntilTick: state.tick,
      };
    }

    const newSegments = [move.nextHead!, ...snake.segments];
    let pendingGrowth = snake.pendingGrowth + move.growth;
    if (pendingGrowth > 0) {
      pendingGrowth -= 1;
    } else {
      newSegments.pop();
    }

    const effects = move.effectTemplate
      ? [
          ...snake.effects,
          {
            type: move.effectTemplate.type,
            multiplier: move.effectTemplate.multiplier,
            expiresAtTick: state.tick + move.effectTemplate.duration,
          },
        ]
      : snake.effects;

    return {
      ...snake,
      segments: newSegments,
      direction: move.direction,
      pendingTurn: move.pendingTurn,
      accumulator: move.newAccumulator,
      pendingGrowth,
      effects,
    };
  });

  const survivors = nextSnakes.filter((snake) => snake.alive);
  const foodsAfterEat = state.foods.filter((food) => !proposedMoves.some((move) => move.ateFoodId === food.id));
  const combinedQueue = respawnQueue.concat(respawnTicketsToAdd);
  const spawnLayouts = createSpawnPoints(state.config);
  const nextTick = state.tick + 1;

  const occupied = new Set<string>();
  survivors.forEach((snake) => {
    snake.segments.forEach((segment) => occupied.add(cellKey(segment)));
  });
  foodsAfterEat.forEach((food) => occupied.add(cellKey(food.position)));

  const respawnedSnakes: Snake[] = [];
  const updatedQueue: RespawnTicket[] = [];

  combinedQueue.forEach((ticket) => {
    const remaining = ticket.ticksRemaining - 1;
    if (ticket.controller !== 'ai') {
      if (remaining > 0) {
        updatedQueue.push({ ...ticket, ticksRemaining: remaining });
      }
      return;
    }

    if (remaining > 0) {
      updatedQueue.push({ ...ticket, ticksRemaining: remaining });
      return;
    }

    let spawned: Snake | undefined;
    if (spawnLayouts.length > 0) {
      const startIndex = Math.floor(rng.next() * spawnLayouts.length);
      for (let i = 0; i < spawnLayouts.length; i += 1) {
        const layout = spawnLayouts[(startIndex + i) % spawnLayouts.length];
        const candidate = buildSnake(
          ticket.snakeId,
          layout.head,
          layout.direction,
          ticket.controller,
          nextTick + SAFE_RESPAWN_TICKS,
        );
        const fits = candidate.segments.every((segment) => {
          if (
            segment.x < 0
            || segment.y < 0
            || segment.x >= state.config.cols
            || segment.y >= state.config.rows
          ) {
            return false;
          }
          const key = cellKey(segment);
          return !occupied.has(key);
        });
        if (fits) {
          spawned = candidate;
          break;
        }
      }
    }

    if (spawned) {
      respawnedSnakes.push(spawned);
      spawned.segments.forEach((segment) => occupied.add(cellKey(segment)));
    } else {
      updatedQueue.push({ ...ticket, ticksRemaining: 1 });
    }
  });

  const allSnakes = [...survivors, ...respawnedSnakes];

  const withFood = replenishFood(
    {
      ...state,
      snakes: allSnakes,
      foods: foodsAfterEat,
      tick: nextTick,
      rngState: rng.state,
      respawnQueue: updatedQueue,
    },
    rng,
  );

  const status = allSnakes.length === 0 || !allSnakes.some((snake) => snake.controller === 'player')
    ? 'gameover'
    : 'running';

  return {
    ...withFood,
    snakes: allSnakes,
    respawnQueue: updatedQueue,
    status,
  };
};

export type { Direction };
