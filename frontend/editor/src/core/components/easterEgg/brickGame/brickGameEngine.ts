import {
  type Box,
  type MarkPose,
  type Quad,
  clamp,
  easeOutBack,
  lerpPose,
  logoPose,
  paddlePose,
} from "@app/components/easterEgg/brickGame/brickGameGeometry";

/**
 * Knock a stack of pages apart with the Stirling mark.
 *
 * The simulation runs in a fixed 800x560 playfield and the renderer scales that
 * to whatever canvas it is given, so physics behaves identically on every
 * screen and nothing has to be retuned per device pixel ratio.
 *
 * React owns none of the frame loop. The component constructs this, feeds it
 * input, and receives HUD state through `onStatus` only when it actually
 * changes, which keeps re-renders off the animation path.
 */

export const FIELD_W = 800;
export const FIELD_H = 560;

/** Small enough that the fastest ball advances ~2.5 units between checks. */
const PHYSICS_STEP = 1 / 240;
/** Caps catch-up work after a tab switch or a long paint stall. */
const MAX_FRAME_S = 1 / 15;

const COLS = 13;
const ROWS = 3;
const BRICK_W = 49;
const BRICK_H = 68;
const BRICK_GAP_X = 6;
const BRICK_GAP_Y = 8;
const WALL_TOP = 64;
const BRICK_FOLD = 12;

const PADDLE_W = 132;
const PADDLE_H = 16;
const PADDLE_Y = FIELD_H - 48;
const PADDLE_KEY_SPEED = 620;
/** Paddle-width and ball-speed multipliers, good and bad, and their duration. */
const WIDE_SCALE = 1.55;
const SHRINK_SCALE = 0.62;
const SLOW_FACTOR = 0.62;
const FAST_FACTOR = 1.4;
const EFFECT_S = 12;

const BALL_R = 7;
const BALL_SPEED_START = 340;
const BALL_SPEED_PER_BRICK = 4;
const BALL_SPEED_MAX = 560;
/** Keeps a bounce off the paddle from flattening into an unwinnable rally. */
const MIN_VERTICAL_RATIO = 0.32;
const MAX_BALLS = 6;
/** Angle spread applied when a split adds balls either side of the original. */
const SPLIT_SPREAD = 0.45;

const DROP_CHANCE = 0.24;
const POWERUP_W = 30;
const POWERUP_H = 20;
const POWERUP_FALL_SPEED = 145;
const POWERUP_SCORE = 25;

const START_LIVES = 3;

/**
 * Intro beats, in ms from the start. The mark's flight and the pages' sweep
 * overlap on purpose: the wall assembles itself while the logo is still on its
 * way down, so neither half is dead time.
 */
const INTRO_MS = 2000;
const MARK_FLIGHT_MS = 1500;
const BRICK_SWEEP_START_MS = 400;
const BRICK_STAGGER_COL_MS = 70;
const BRICK_STAGGER_ROW_MS = 90;
const BRICK_FADE_MS = 300;
/** How far a page slides down into place as it fades in. */
const BRICK_DROP = 14;

const BEST_SCORE_KEY = "stirling.easterEgg.best";

export type GamePhase = "intro" | "ready" | "playing" | "lost" | "won";

/** Worth catching. */
export type BoonKind = "wide" | "slow" | "multi" | "life";
/** Worth dodging. */
export type BaneKind = "shrink" | "fast" | "reverse";
export type DropKind = BoonKind | BaneKind;

export interface ActiveEffect {
  kind: DropKind;
  label: string;
  seconds: number;
  bad: boolean;
}

export interface GameStatus {
  phase: GamePhase;
  score: number;
  lives: number;
  bricksLeft: number;
  best: number;
  balls: number;
  /** Whatever is currently running, good or bad, for the HUD to show. */
  effects: ActiveEffect[];
}

export interface Palette {
  markSoft: string;
  markStrong: string;
  page: string;
  pageEdge: string;
  field: string;
  fieldEdge: string;
  ball: string;
  powerWide: string;
  powerSlow: string;
  powerMulti: string;
  powerLife: string;
  /** Every bane shares one colour, so "do not catch this" is learnt once. */
  powerBane: string;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Base speed before any slow effect is applied. */
  speed: number;
}

interface Brick {
  x: number;
  y: number;
  row: number;
  col: number;
  alive: boolean;
  /** Index into the thumbnail list, or -1 to draw a blank page. */
  image: number;
  /** When this page starts fading in, in ms from the intro's start. */
  appearAt: number;
}

interface Drop {
  x: number;
  y: number;
  kind: DropKind;
}

/** A multiplier that expires, used for both the paddle and the ball. */
interface TimedEffect {
  kind: DropKind;
  factor: number;
  remaining: number;
}

/**
 * The drop table. Boons come first so a low roll is always good news, and they
 * hold about two thirds of the range: banes are there to be dodged, not to make
 * a good run feel unlucky. An extra ball is the rarest thing in the game.
 */
const DROP_TABLE: { kind: DropKind; upTo: number }[] = [
  { kind: "wide", upTo: 0.2 },
  { kind: "slow", upTo: 0.4 },
  { kind: "multi", upTo: 0.56 },
  { kind: "life", upTo: 0.65 },
  { kind: "shrink", upTo: 0.79 },
  { kind: "fast", upTo: 0.92 },
  { kind: "reverse", upTo: 1 },
];

const BANES: ReadonlySet<DropKind> = new Set<DropKind>([
  "shrink",
  "fast",
  "reverse",
]);

export function isBane(kind: DropKind): boolean {
  return BANES.has(kind);
}

function pickDropKind(roll: number): DropKind {
  for (const entry of DROP_TABLE) {
    if (roll < entry.upTo) return entry.kind;
  }
  return "wide";
}

function readBest(): number {
  try {
    const raw = window.localStorage.getItem(BEST_SCORE_KEY);
    const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeBest(score: number): void {
  try {
    window.localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // A blocked storage partition costs the player a leaderboard, nothing more.
  }
}

function buildBricks(imageCount: number): Brick[] {
  const marginX = (FIELD_W - (COLS * BRICK_W + (COLS - 1) * BRICK_GAP_X)) / 2;
  const bricks: Brick[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      bricks.push({
        x: marginX + col * (BRICK_W + BRICK_GAP_X),
        y: WALL_TOP + row * (BRICK_H + BRICK_GAP_Y),
        row,
        col,
        alive: true,
        // Pages run in reading order across the wall, so a loaded document is
        // recognisable rather than shuffled.
        image: imageCount > 0 ? (row * COLS + col) % imageCount : -1,
        appearAt:
          BRICK_SWEEP_START_MS +
          col * BRICK_STAGGER_COL_MS +
          row * BRICK_STAGGER_ROW_MS,
      });
    }
  }
  return bricks;
}

export class BrickGame {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly palette: Palette;
  private readonly onStatus: (status: GameStatus) => void;
  private readonly introFrom: MarkPose | null;

  private bricks: Brick[];
  private phase: GamePhase = "intro";
  private score = 0;
  private lives = START_LIVES;
  private best = readBest();

  private paddleX = (FIELD_W - PADDLE_W) / 2;
  private paddleKeyDir = 0;
  private pointerX: number | null = null;

  private balls: Ball[] = [];
  private drops: Drop[] = [];
  /** One at a time each, so opposites replace rather than cancel confusingly. */
  private paddleEffect: TimedEffect | null = null;
  private ballEffect: TimedEffect | null = null;
  private reverseRemaining = 0;
  private ballFactorApplied = 1;
  private nextBallSpeed = BALL_SPEED_START;
  private images: readonly HTMLImageElement[];

  private introElapsed = 0;
  private accumulator = 0;
  private lastFrame = 0;
  private rafId: number | null = null;
  private running = false;

  constructor(options: {
    ctx: CanvasRenderingContext2D;
    palette: Palette;
    /** The nav-rail logo's rect in playfield units; the mark flies in from it. */
    origin: Box | null;
    /** Honours prefers-reduced-motion by landing everything already in place. */
    skipIntro: boolean;
    /** Page thumbnails to face the bricks with; empty draws blank pages. */
    images?: readonly HTMLImageElement[];
    onStatus: (status: GameStatus) => void;
  }) {
    this.ctx = options.ctx;
    this.palette = options.palette;
    this.onStatus = options.onStatus;
    this.images = options.images ?? [];
    this.introFrom = options.origin ? logoPose(options.origin) : null;
    this.bricks = buildBricks(this.images.length);
    if (options.skipIntro || !this.introFrom) {
      this.phase = "ready";
      this.introElapsed = INTRO_MS;
    }
    this.resetBalls();
  }

  /** Also re-baselines the clock, so a stop/start pause costs no simulation time. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.emit();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  /**
   * Faces the bricks with these thumbnails. Called after construction because
   * the pages are rendered asynchronously; the wall starts blank and fills in,
   * usually while the fly-in is still running.
   */
  setImages(images: readonly HTMLImageElement[]): void {
    this.images = images;
    for (const [index, brick] of this.bricks.entries()) {
      brick.image = images.length > 0 ? index % images.length : -1;
    }
  }

  /** Absolute pointer position; null hands the paddle back to the keyboard. */
  setPointer(fieldX: number | null): void {
    this.pointerX = fieldX;
  }

  /** Relative motion, as delivered by a locked pointer. */
  nudgePaddle(deltaFieldX: number): void {
    this.paddleKeyDir = 0;
    const centre =
      (this.pointerX ?? this.paddleX + this.paddleW / 2) + deltaFieldX;
    this.pointerX = clamp(centre, 0, FIELD_W);
  }

  setKeyDir(dir: number): void {
    this.paddleKeyDir = dir;
    if (dir !== 0) this.pointerX = null;
  }

  /** Launches a held ball, or restarts once the round is over. */
  act(): void {
    if (this.phase === "ready") {
      this.launch();
      return;
    }
    if (this.phase === "lost" || this.phase === "won") this.restart();
  }

  restart(): void {
    this.bricks = buildBricks(this.images.length);
    this.score = 0;
    this.lives = START_LIVES;
    this.nextBallSpeed = BALL_SPEED_START;
    this.clearBoard();
    this.phase = "ready";
    this.resetBalls();
    this.emit();
  }

  private get paddleW(): number {
    return PADDLE_W * (this.paddleEffect?.factor ?? 1);
  }

  private get ballFactor(): number {
    return this.ballEffect?.factor ?? 1;
  }

  private get activeEffects(): ActiveEffect[] {
    const effects: ActiveEffect[] = [];
    const push = (kind: DropKind, label: string, remaining: number) => {
      effects.push({
        kind,
        label,
        seconds: Math.max(1, Math.ceil(remaining)),
        bad: isBane(kind),
      });
    };
    if (this.paddleEffect) {
      push(
        this.paddleEffect.kind,
        this.paddleEffect.kind === "wide" ? "Wide" : "Narrow",
        this.paddleEffect.remaining,
      );
    }
    if (this.ballEffect) {
      push(
        this.ballEffect.kind,
        this.ballEffect.kind === "slow" ? "Slow" : "Fast",
        this.ballEffect.remaining,
      );
    }
    if (this.reverseRemaining > 0) {
      push("reverse", "Reversed", this.reverseRemaining);
    }
    return effects;
  }

  private get bricksLeft(): number {
    return this.bricks.reduce((n, b) => n + (b.alive ? 1 : 0), 0);
  }

  private emit(): void {
    this.onStatus({
      phase: this.phase,
      score: this.score,
      lives: this.lives,
      bricksLeft: this.bricksLeft,
      best: this.best,
      balls: this.balls.length,
      effects: this.activeEffects,
    });
  }

  /** Parks a single held ball on the paddle, ready to be served. */
  private resetBalls(): void {
    this.balls = [
      {
        x: this.paddleX + this.paddleW / 2,
        y: PADDLE_Y - BALL_R - 1,
        vx: 0,
        vy: 0,
        speed: this.nextBallSpeed,
      },
    ];
  }

  private holdBall(): void {
    const held = this.balls[0];
    if (!held) return;
    held.x = this.paddleX + this.paddleW / 2;
    held.y = PADDLE_Y - BALL_R - 1;
    held.vx = 0;
    held.vy = 0;
  }

  private launch(): void {
    const held = this.balls[0];
    if (!held) return;
    // A shallow spread either side of straight up, so no two rounds open alike.
    const angle = Math.random() * 0.7 - 0.35 - Math.PI / 2;
    const speed = this.liveSpeed(held);
    held.vx = Math.cos(angle) * speed;
    held.vy = Math.sin(angle) * speed;
    this.phase = "playing";
    this.emit();
  }

  /** A ball's speed with any slow or fast effect folded in. */
  private liveSpeed(ball: Ball): number {
    return ball.speed * this.ballFactor;
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min((now - this.lastFrame) / 1000, MAX_FRAME_S);
    this.lastFrame = now;
    this.update(dt);
    this.draw();
    this.rafId = requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    if (this.phase === "intro") {
      this.introElapsed += dt * 1000;
      if (this.introElapsed >= INTRO_MS) {
        this.introElapsed = INTRO_MS;
        this.phase = "ready";
        this.emit();
      }
    }

    this.movePaddle(dt);

    if (this.phase !== "playing") {
      this.holdBall();
      return;
    }

    this.tickEffects(dt);
    this.moveDrops(dt);

    this.accumulator += dt;
    while (this.accumulator >= PHYSICS_STEP) {
      this.accumulator -= PHYSICS_STEP;
      this.stepBalls(PHYSICS_STEP);
      if (this.phase !== "playing") {
        this.accumulator = 0;
        break;
      }
    }
  }

  private tickEffects(dt: number): void {
    const before = this.activeEffects.length;

    if (this.paddleEffect) {
      this.paddleEffect.remaining -= dt;
      if (this.paddleEffect.remaining <= 0) this.paddleEffect = null;
    }
    if (this.ballEffect) {
      this.ballEffect.remaining -= dt;
      if (this.ballEffect.remaining <= 0) this.ballEffect = null;
    }
    if (this.reverseRemaining > 0) this.reverseRemaining -= dt;

    // Velocity carries the speed factor, so it is rescaled whenever it changes.
    if (this.ballFactor !== this.ballFactorApplied) {
      this.ballFactorApplied = this.ballFactor;
      for (const ball of this.balls) this.rescale(ball);
    }
    if (this.activeEffects.length !== before) this.emit();
  }

  private movePaddle(dt: number): void {
    const reversed = this.reverseRemaining > 0;
    if (this.pointerX !== null) {
      // Mirrored rather than negated, so the pointer still maps onto the field.
      // Relative nudges land in pointerX too, so they invert with it.
      const aim = reversed ? FIELD_W - this.pointerX : this.pointerX;
      this.paddleX = aim - this.paddleW / 2;
    } else if (this.paddleKeyDir !== 0) {
      const dir = reversed ? -this.paddleKeyDir : this.paddleKeyDir;
      this.paddleX += dir * PADDLE_KEY_SPEED * dt;
    }
    this.paddleX = clamp(this.paddleX, 0, FIELD_W - this.paddleW);
  }

  private moveDrops(dt: number): void {
    if (this.drops.length === 0) return;
    const top = PADDLE_Y;
    const left = this.paddleX;
    const right = this.paddleX + this.paddleW;
    const survivors: Drop[] = [];
    let caught = false;

    for (const drop of this.drops) {
      drop.y += POWERUP_FALL_SPEED * dt;
      const overlapsPaddle =
        drop.y + POWERUP_H >= top &&
        drop.y <= top + PADDLE_H &&
        drop.x + POWERUP_W >= left &&
        drop.x <= right;
      if (overlapsPaddle) {
        this.collect(drop.kind);
        caught = true;
        continue;
      }
      if (drop.y <= FIELD_H) survivors.push(drop);
    }

    this.drops = survivors;
    if (caught) this.emit();
  }

  private collect(kind: DropKind): void {
    // Banes are their own punishment; no points are taken for catching one.
    if (!isBane(kind)) this.score += POWERUP_SCORE;
    switch (kind) {
      case "wide":
        this.paddleEffect = { kind, factor: WIDE_SCALE, remaining: EFFECT_S };
        break;
      case "shrink":
        this.paddleEffect = { kind, factor: SHRINK_SCALE, remaining: EFFECT_S };
        break;
      case "slow":
        this.ballEffect = { kind, factor: SLOW_FACTOR, remaining: EFFECT_S };
        break;
      case "fast":
        this.ballEffect = { kind, factor: FAST_FACTOR, remaining: EFFECT_S };
        break;
      case "reverse":
        this.reverseRemaining = EFFECT_S;
        break;
      case "life":
        this.lives += 1;
        break;
      case "multi":
        this.splitBalls();
        break;
    }
    // A paddle that just changed width must not straddle the wall.
    this.paddleX = clamp(this.paddleX, 0, FIELD_W - this.paddleW);
  }

  /** Adds a ball either side of each existing one, up to the cap. */
  private splitBalls(): void {
    const spawned: Ball[] = [];
    for (const ball of this.balls) {
      for (const spread of [-SPLIT_SPREAD, SPLIT_SPREAD]) {
        if (this.balls.length + spawned.length >= MAX_BALLS) break;
        const angle = Math.atan2(ball.vy, ball.vx) + spread;
        const speed = Math.hypot(ball.vx, ball.vy) || this.liveSpeed(ball);
        spawned.push({
          x: ball.x,
          y: ball.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          speed: ball.speed,
        });
      }
    }
    this.balls.push(...spawned);
  }

  private stepBalls(step: number): void {
    for (const ball of this.balls) {
      ball.x += ball.vx * step;
      ball.y += ball.vy * step;

      if (ball.x - BALL_R < 0) {
        ball.x = BALL_R;
        ball.vx = Math.abs(ball.vx);
      } else if (ball.x + BALL_R > FIELD_W) {
        ball.x = FIELD_W - BALL_R;
        ball.vx = -Math.abs(ball.vx);
      }
      if (ball.y - BALL_R < 0) {
        ball.y = BALL_R;
        ball.vy = Math.abs(ball.vy);
      }

      this.hitPaddle(ball);
      this.hitBricks(ball);
    }

    const alive = this.balls.filter((ball) => ball.y - BALL_R <= FIELD_H);
    if (alive.length !== this.balls.length) {
      this.balls = alive;
      // Only the last ball off the field costs anything.
      if (this.balls.length === 0) this.loseLife();
      else this.emit();
    }
    if (this.phase === "playing" && this.bricksLeft === 0) this.finish("won");
  }

  private hitPaddle(ball: Ball): void {
    if (ball.vy <= 0) return;
    const top = PADDLE_Y;
    const width = this.paddleW;
    const withinX =
      ball.x + BALL_R >= this.paddleX &&
      ball.x - BALL_R <= this.paddleX + width;
    const crossingTop =
      ball.y + BALL_R >= top && ball.y - BALL_R <= top + PADDLE_H;
    if (!withinX || !crossingTop) return;

    // Offset from centre steers the bounce, so the paddle aims rather than just blocks.
    const offset = (ball.x - (this.paddleX + width / 2)) / (width / 2);
    const angle = -Math.PI / 2 + clamp(offset, -1, 1) * 1.05;
    const speed = this.liveSpeed(ball);
    ball.y = top - BALL_R;
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    this.enforceMinVertical(ball);
  }

  private enforceMinVertical(ball: Ball): void {
    const speed = this.liveSpeed(ball);
    const minVy = speed * MIN_VERTICAL_RATIO;
    if (Math.abs(ball.vy) >= minVy) return;
    ball.vy = Math.sign(ball.vy || -1) * minVy;
    const room = speed ** 2 - ball.vy ** 2;
    ball.vx = Math.sign(ball.vx || 1) * Math.sqrt(Math.max(room, 0));
  }

  private hitBricks(ball: Ball): void {
    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      const nearestX = clamp(ball.x, brick.x, brick.x + BRICK_W);
      const nearestY = clamp(ball.y, brick.y, brick.y + BRICK_H);
      const dx = ball.x - nearestX;
      const dy = ball.y - nearestY;
      if (dx * dx + dy * dy > BALL_R * BALL_R) continue;

      // Reflect on whichever axis is least penetrated - that is the face it met.
      const cx = brick.x + BRICK_W / 2;
      const cy = brick.y + BRICK_H / 2;
      const overlapX = BRICK_W / 2 + BALL_R - Math.abs(ball.x - cx);
      const overlapY = BRICK_H / 2 + BALL_R - Math.abs(ball.y - cy);
      if (overlapX < overlapY) {
        ball.x += Math.sign(ball.x - cx || 1) * overlapX;
        ball.vx = -ball.vx;
      } else {
        ball.y += Math.sign(ball.y - cy || 1) * overlapY;
        ball.vy = -ball.vy;
      }

      brick.alive = false;
      this.score += 10 * (ROWS - brick.row);
      ball.speed = Math.min(ball.speed + BALL_SPEED_PER_BRICK, BALL_SPEED_MAX);
      this.nextBallSpeed = ball.speed;
      this.rescale(ball);
      this.maybeDrop(brick);
      this.emit();
      // One brick per step: the ball cannot legitimately reach two at this scale.
      return;
    }
  }

  private maybeDrop(brick: Brick): void {
    if (Math.random() >= DROP_CHANCE) return;
    this.drops.push({
      x: brick.x + (BRICK_W - POWERUP_W) / 2,
      y: brick.y + (BRICK_H - POWERUP_H) / 2,
      kind: pickDropKind(Math.random()),
    });
  }

  /** Keeps a velocity vector's length equal to the ball's current live speed. */
  private rescale(ball: Ball): void {
    const len = Math.hypot(ball.vx, ball.vy);
    if (len === 0) return;
    const speed = this.liveSpeed(ball);
    ball.vx = (ball.vx / len) * speed;
    ball.vy = (ball.vy / len) * speed;
  }

  private loseLife(): void {
    this.lives -= 1;
    if (this.lives <= 0) {
      this.finish("lost");
      return;
    }
    // A fresh ball arrives with the board's effects cleared, good and bad.
    this.clearBoard();
    this.phase = "ready";
    this.resetBalls();
    this.emit();
  }

  private finish(phase: "won" | "lost"): void {
    this.phase = phase;
    if (this.score > this.best) {
      this.best = this.score;
      writeBest(this.best);
    }
    this.clearBoard();
    this.resetBalls();
    this.emit();
  }

  /** Drops in flight and every timed effect, gone. */
  private clearBoard(): void {
    this.drops = [];
    this.paddleEffect = null;
    this.ballEffect = null;
    this.reverseRemaining = 0;
    this.ballFactorApplied = 1;
  }

  private draw(): void {
    const { ctx } = this;
    const canvas = ctx.canvas;
    const scale = Math.min(canvas.width / FIELD_W, canvas.height / FIELD_H);
    const ox = (canvas.width - FIELD_W * scale) / 2;
    const oy = (canvas.height - FIELD_H * scale) / 2;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, ox, oy);

    ctx.fillStyle = this.palette.field;
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    ctx.strokeStyle = this.palette.fieldEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, FIELD_W - 1, FIELD_H - 1);

    this.drawBricks();
    this.drawDrops();
    this.drawMark();
    if (this.phase === "playing" || this.phase === "ready") this.drawBalls();
  }

  /** Traces a page outline with its corner turned down. */
  private pagePath(x: number, y: number): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + BRICK_W - BRICK_FOLD, y);
    ctx.lineTo(x + BRICK_W, y + BRICK_FOLD);
    ctx.lineTo(x + BRICK_W, y + BRICK_H);
    ctx.lineTo(x, y + BRICK_H);
    ctx.closePath();
  }

  private drawBricks(): void {
    const { ctx } = this;
    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      const appear = clamp(
        (this.introElapsed - brick.appearAt) / BRICK_FADE_MS,
        0,
        1,
      );
      if (appear <= 0) continue;
      const y = brick.y - (1 - appear) * BRICK_DROP;

      ctx.save();
      ctx.globalAlpha = appear;
      this.pagePath(brick.x, y);
      ctx.fillStyle = this.palette.page;
      ctx.fill();

      const image = this.images[brick.image];
      if (image) {
        // Clipped to the page outline so a thumbnail cannot bleed over the fold.
        ctx.save();
        this.pagePath(brick.x, y);
        ctx.clip();
        this.drawCover(image, brick.x, y);
        ctx.restore();
      }

      this.pagePath(brick.x, y);
      ctx.strokeStyle = this.palette.pageEdge;
      ctx.lineWidth = 1;
      ctx.stroke();

      // The turned-down corner, tinted per row so the stack reads as depth.
      ctx.beginPath();
      ctx.moveTo(brick.x + BRICK_W - BRICK_FOLD, y);
      ctx.lineTo(brick.x + BRICK_W, y + BRICK_FOLD);
      ctx.lineTo(brick.x + BRICK_W - BRICK_FOLD, y + BRICK_FOLD);
      ctx.closePath();
      ctx.fillStyle =
        brick.row === 0
          ? this.palette.markStrong
          : brick.row === 1
            ? this.palette.markSoft
            : this.palette.pageEdge;
      ctx.fill();
      ctx.restore();
    }
  }

  /** Fills the brick with the image, cropping the overflowing axis. */
  private drawCover(image: HTMLImageElement, x: number, y: number): void {
    const iw = image.naturalWidth || image.width;
    const ih = image.naturalHeight || image.height;
    if (iw === 0 || ih === 0) return;
    const scale = Math.max(BRICK_W / iw, BRICK_H / ih);
    const w = iw * scale;
    const h = ih * scale;
    this.ctx.drawImage(
      image,
      x + (BRICK_W - w) / 2,
      y + (BRICK_H - h) / 2,
      w,
      h,
    );
  }

  private dropColour(kind: DropKind): string {
    switch (kind) {
      case "wide":
        return this.palette.powerWide;
      case "slow":
        return this.palette.powerSlow;
      case "multi":
        return this.palette.powerMulti;
      case "life":
        return this.palette.powerLife;
      default:
        return this.palette.powerBane;
    }
  }

  private drawDrops(): void {
    const { ctx } = this;
    for (const drop of this.drops) {
      const cx = drop.x + POWERUP_W / 2;
      const cy = drop.y + POWERUP_H / 2;
      const bane = isBane(drop.kind);

      ctx.save();
      ctx.beginPath();
      if (bane) {
        // Banes are spiked as well as red: shape carries at a glance, and it
        // still reads for anyone who cannot tell the colours apart.
        const spike = 5;
        ctx.moveTo(drop.x, cy);
        ctx.lineTo(drop.x + spike, drop.y);
        ctx.lineTo(drop.x + POWERUP_W - spike, drop.y);
        ctx.lineTo(drop.x + POWERUP_W, cy);
        ctx.lineTo(drop.x + POWERUP_W - spike, drop.y + POWERUP_H);
        ctx.lineTo(drop.x + spike, drop.y + POWERUP_H);
        ctx.closePath();
      } else {
        ctx.roundRect(drop.x, drop.y, POWERUP_W, POWERUP_H, 5);
      }
      ctx.fillStyle = this.dropColour(drop.kind);
      ctx.fill();

      // Glyphs are drawn rather than set as text, so no font has to load.
      ctx.strokeStyle = this.palette.page;
      ctx.fillStyle = this.palette.page;
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      switch (drop.kind) {
        case "wide":
          // Outward arrows.
          ctx.moveTo(cx - 8, cy);
          ctx.lineTo(cx + 8, cy);
          for (const [tip, inner] of [
            [cx - 8, cx - 5],
            [cx + 8, cx + 5],
          ]) {
            ctx.moveTo(tip, cy);
            ctx.lineTo(inner, cy - 3);
            ctx.moveTo(tip, cy);
            ctx.lineTo(inner, cy + 3);
          }
          ctx.stroke();
          break;
        case "shrink":
          // The same arrows, turned inward.
          ctx.moveTo(cx - 8, cy);
          ctx.lineTo(cx + 8, cy);
          for (const [tip, outer] of [
            [cx - 4, cx - 7],
            [cx + 4, cx + 7],
          ]) {
            ctx.moveTo(tip, cy);
            ctx.lineTo(outer, cy - 3);
            ctx.moveTo(tip, cy);
            ctx.lineTo(outer, cy + 3);
          }
          ctx.stroke();
          break;
        case "slow":
          ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx, cy - 3);
          ctx.lineTo(cx, cy);
          ctx.lineTo(cx + 3, cy);
          ctx.stroke();
          break;
        case "fast":
          // Stacked chevrons, the usual shorthand for speed.
          for (const dy of [-3.5, 1]) {
            ctx.moveTo(cx - 5, cy + dy);
            ctx.lineTo(cx, cy + dy + 3.5);
            ctx.lineTo(cx + 5, cy + dy);
          }
          ctx.stroke();
          break;
        case "reverse":
          // A U-turn: right along the bottom, back along the top.
          ctx.moveTo(cx - 6, cy + 3.5);
          ctx.lineTo(cx + 3, cy + 3.5);
          ctx.arc(cx + 3, cy, 3.5, Math.PI / 2, -Math.PI / 2, false);
          ctx.lineTo(cx - 6, cy - 3.5);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx - 6, cy - 3.5);
          ctx.lineTo(cx - 3, cy - 6);
          ctx.moveTo(cx - 6, cy - 3.5);
          ctx.lineTo(cx - 3, cy - 1);
          ctx.stroke();
          break;
        case "multi":
          for (const [dx, dy] of [
            [-6, 2],
            [0, -3],
            [6, 2],
          ]) {
            ctx.beginPath();
            ctx.arc(cx + dx, cy + dy, 2.4, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        case "life":
          ctx.moveTo(cx - 5, cy);
          ctx.lineTo(cx + 5, cy);
          ctx.moveTo(cx, cy - 5);
          ctx.lineTo(cx, cy + 5);
          ctx.stroke();
          break;
      }
      ctx.restore();
    }
  }

  private drawMark(): void {
    const target = paddlePose({
      x: this.paddleX,
      y: PADDLE_Y,
      w: this.paddleW,
      h: PADDLE_H,
    });
    const flight = clamp(this.introElapsed / MARK_FLIGHT_MS, 0, 1);
    const pose =
      this.introFrom && flight < 1
        ? lerpPose(this.introFrom, target, easeOutBack(flight))
        : target;

    this.fillQuad(pose.a, this.palette.markSoft);
    this.fillQuad(pose.b, this.palette.markStrong);
  }

  private fillQuad(quad: Quad, fill: string): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(quad[0].x, quad[0].y);
    for (let i = 1; i < quad.length; i++) ctx.lineTo(quad[i].x, quad[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  private drawBalls(): void {
    const { ctx } = this;
    ctx.fillStyle = this.palette.ball;
    for (const ball of this.balls) {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
