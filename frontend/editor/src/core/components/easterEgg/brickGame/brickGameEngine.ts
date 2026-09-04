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
/** How much the wide power-up adds, and how long every timed effect lasts. */
const WIDE_FACTOR = 1.55;
const SLOW_FACTOR = 0.62;
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

const DROP_CHANCE = 0.22;
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

export type PowerKind = "wide" | "slow" | "multi" | "life";

export interface GameStatus {
  phase: GamePhase;
  score: number;
  lives: number;
  bricksLeft: number;
  best: number;
  balls: number;
  /** Seconds left on each timed effect; 0 means inactive. */
  wide: number;
  slow: number;
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

interface Powerup {
  x: number;
  y: number;
  kind: PowerKind;
}

const POWER_ORDER: PowerKind[] = ["wide", "slow", "multi", "life"];
/** Cumulative weights over POWER_ORDER; an extra ball is the rarest. */
const POWER_WEIGHTS = [0.34, 0.62, 0.87, 1];

function pickPowerKind(roll: number): PowerKind {
  for (let i = 0; i < POWER_WEIGHTS.length; i++) {
    if (roll < POWER_WEIGHTS[i]) return POWER_ORDER[i];
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
  private readonly images: readonly HTMLImageElement[];

  private bricks: Brick[];
  private phase: GamePhase = "intro";
  private score = 0;
  private lives = START_LIVES;
  private best = readBest();

  private paddleX = (FIELD_W - PADDLE_W) / 2;
  private paddleKeyDir = 0;
  private pointerX: number | null = null;

  private balls: Ball[] = [];
  private powerups: Powerup[] = [];
  private wideRemaining = 0;
  private slowRemaining = 0;
  private slowApplied = false;
  private nextBallSpeed = BALL_SPEED_START;

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
    this.powerups = [];
    this.wideRemaining = 0;
    this.slowRemaining = 0;
    this.slowApplied = false;
    this.phase = "ready";
    this.resetBalls();
    this.emit();
  }

  private get paddleW(): number {
    return this.wideRemaining > 0 ? PADDLE_W * WIDE_FACTOR : PADDLE_W;
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
      wide: Math.max(0, Math.ceil(this.wideRemaining)),
      slow: Math.max(0, Math.ceil(this.slowRemaining)),
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

  /** A ball's speed with the slow effect folded in. */
  private liveSpeed(ball: Ball): number {
    return ball.speed * (this.slowRemaining > 0 ? SLOW_FACTOR : 1);
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
    this.movePowerups(dt);

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
    const wideWas = this.wideRemaining > 0;
    if (this.wideRemaining > 0) this.wideRemaining -= dt;
    if (this.slowRemaining > 0) this.slowRemaining -= dt;

    // Velocity carries the slow factor, so it has to be rescaled on each flip.
    const slowNow = this.slowRemaining > 0;
    if (slowNow !== this.slowApplied) {
      this.slowApplied = slowNow;
      for (const ball of this.balls) this.rescale(ball);
    }
    if (wideWas !== this.wideRemaining > 0) this.emit();
  }

  private movePaddle(dt: number): void {
    if (this.pointerX !== null) {
      this.paddleX = this.pointerX - this.paddleW / 2;
    } else if (this.paddleKeyDir !== 0) {
      this.paddleX += this.paddleKeyDir * PADDLE_KEY_SPEED * dt;
    }
    this.paddleX = clamp(this.paddleX, 0, FIELD_W - this.paddleW);
  }

  private movePowerups(dt: number): void {
    if (this.powerups.length === 0) return;
    const top = PADDLE_Y;
    const left = this.paddleX;
    const right = this.paddleX + this.paddleW;
    const survivors: Powerup[] = [];
    let caught = false;

    for (const drop of this.powerups) {
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

    this.powerups = survivors;
    if (caught) this.emit();
  }

  private collect(kind: PowerKind): void {
    this.score += POWERUP_SCORE;
    switch (kind) {
      case "wide":
        this.wideRemaining = EFFECT_S;
        break;
      case "slow":
        this.slowRemaining = EFFECT_S;
        break;
      case "life":
        this.lives += 1;
        break;
      case "multi":
        this.splitBalls();
        break;
    }
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
    this.powerups.push({
      x: brick.x + (BRICK_W - POWERUP_W) / 2,
      y: brick.y + (BRICK_H - POWERUP_H) / 2,
      kind: pickPowerKind(Math.random()),
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
    // A fresh ball arrives with the board's effects cleared.
    this.powerups = [];
    this.wideRemaining = 0;
    this.slowRemaining = 0;
    this.slowApplied = false;
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
    this.powerups = [];
    this.resetBalls();
    this.emit();
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
    this.drawPowerups();
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

  private powerColour(kind: PowerKind): string {
    switch (kind) {
      case "wide":
        return this.palette.powerWide;
      case "slow":
        return this.palette.powerSlow;
      case "multi":
        return this.palette.powerMulti;
      case "life":
        return this.palette.powerLife;
    }
  }

  private drawPowerups(): void {
    const { ctx } = this;
    for (const drop of this.powerups) {
      const cx = drop.x + POWERUP_W / 2;
      const cy = drop.y + POWERUP_H / 2;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(drop.x, drop.y, POWERUP_W, POWERUP_H, 5);
      ctx.fillStyle = this.powerColour(drop.kind);
      ctx.fill();

      // Glyphs are drawn rather than set as text, so no font has to load.
      ctx.strokeStyle = this.palette.page;
      ctx.fillStyle = this.palette.page;
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      switch (drop.kind) {
        case "wide": {
          ctx.beginPath();
          ctx.moveTo(cx - 8, cy);
          ctx.lineTo(cx + 8, cy);
          ctx.moveTo(cx - 8, cy);
          ctx.lineTo(cx - 5, cy - 3);
          ctx.moveTo(cx - 8, cy);
          ctx.lineTo(cx - 5, cy + 3);
          ctx.moveTo(cx + 8, cy);
          ctx.lineTo(cx + 5, cy - 3);
          ctx.moveTo(cx + 8, cy);
          ctx.lineTo(cx + 5, cy + 3);
          ctx.stroke();
          break;
        }
        case "slow": {
          ctx.beginPath();
          ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx, cy - 3);
          ctx.lineTo(cx, cy);
          ctx.lineTo(cx + 3, cy);
          ctx.stroke();
          break;
        }
        case "multi": {
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
        }
        case "life": {
          ctx.beginPath();
          ctx.moveTo(cx - 5, cy);
          ctx.lineTo(cx + 5, cy);
          ctx.moveTo(cx, cy - 5);
          ctx.lineTo(cx, cy + 5);
          ctx.stroke();
          break;
        }
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
