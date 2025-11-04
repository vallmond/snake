export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Snake {
  id: string;
  segments: Vec2[]; // head is index 0
  direction: Direction;
  alive: boolean;
  pendingTurn?: Direction; // queued turn applied next tick
  speed: number; // cells per tick fraction (1 => moves every tick)
  accumulator: number; // collects fractional speed to decide movement
  controller: 'player' | 'ai';
  pendingGrowth: number;
  effects: SnakeEffect[];
  safeUntilTick: number;
}

export type FoodKind = 'standard' | 'speed' | 'bulk';

export interface FoodEffectTemplate {
  type: 'speedBoost';
  multiplier: number;
  duration: number; // in ticks
}

export interface Food {
  id: string;
  position: Vec2;
  kind: FoodKind;
  growth: number;
  effect?: FoodEffectTemplate;
}

export interface SnakeEffect {
  type: 'speedBoost';
  multiplier: number;
  expiresAtTick: number;
}

export interface GameConfig {
  cols: number;
  rows: number;
  tickRate: number; // ticks per second
  seed: number;
  aiCount: number;
}

export interface GameState {
  tick: number;
  config: GameConfig;
  snakes: Snake[];
  foods: Food[];
  rngState: number;
  status: 'running' | 'gameover';
  respawnQueue: RespawnTicket[];
  stats: GameStats;
}

export interface InputCommand {
  snakeId: string;
  type: 'turn';
  direction: Direction;
}

export interface RespawnTicket {
  snakeId: string;
  controller: Snake['controller'];
  ticksRemaining: number;
}

export interface GameStats {
  playerKills: number;
  lastPlayerLength: number;
}
