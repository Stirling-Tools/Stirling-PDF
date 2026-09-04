import {
  type Box,
  type MarkPose,
  type Quad,
  clamp,
  easeOutCubic,
  lerpPose,
  logoPose,
  paddlePose,
} from "@app/components/easterEgg/paperjam/paperjamGeometry";

/**
 * Paperjam: knock the stack of pages apart with the Stirling mark.
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

const PADDLE_W = 132;
const PADDLE_H = 16;
const PADDLE_Y = FIELD_H - 48;
const PADDLE_KEY_SPEED = 620;

const BALL_R = 7;
const BALL_SPEED_START = 340;
const BALL_SPEED_PER_BRICK = 4;
const BALL_SPEED_MAX = 560;
/** Keeps a bounce off the paddle from flattening into an unwinnable rally. */
const MIN_VERTICAL_RATIO = 0.32;

const START_LIVES = 3;
const INTRO_MS = 750;
const BEST_SCORE_KEY = "stirling.paperjam.best";

export type GamePhase = "intro" | "ready" | "playing" | "lost" | "won";

export interface GameStatus {
  phase: GamePhase;
  score: number;
  lives: number;
  bricksLeft: number;
  best: number;
}

export interface Palette {
  markSoft: string;
  markStrong: string;
  page: string;
  pageEdge: string;
  field: string;
  fieldEdge: string;
  ball: string;
}

interface Brick {
  x: number;
  y: number;
  row: number;
  alive: boolean;
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

function buildBricks(): Brick[] {
  const marginX = (FIELD_W - (COLS * BRICK_W + (COLS - 1) * BRICK_GAP_X)) / 2;
  const bricks: Brick[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      bricks.push({
        x: marginX + col * (BRICK_W + BRICK_GAP_X),
        y: WALL_TOP + row * (BRICK_H + BRICK_GAP_Y),
        row,
        alive: true,
      });
    }
  }
  return bricks;
}

export class PaperjamGame {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly palette: Palette;
  private readonly onStatus: (status: GameStatus) => void;
  private readonly introFrom: MarkPose | null;

  private bricks = buildBricks();
  private phase: GamePhase = "intro";
  private score = 0;
  private lives = START_LIVES;
  private best = readBest();

  private paddleX = (FIELD_W - PADDLE_W) / 2;
  private paddleKeyDir = 0;
  private pointerX: number | null = null;

  private ballX = 0;
  private ballY = 0;
  private ballVx = 0;
  private ballVy = 0;
  private ballSpeed = BALL_SPEED_START;

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
    /** Honours prefers-reduced-motion by landing the mark already in place. */
    skipIntro: boolean;
    onStatus: (status: GameStatus) => void;
  }) {
    this.ctx = options.ctx;
    this.palette = options.palette;
    this.onStatus = options.onStatus;
    this.introFrom = options.origin ? logoPose(options.origin) : null;
    if (options.skipIntro || !this.introFrom) {
      this.phase = "ready";
      this.introElapsed = INTRO_MS;
    }
    this.resetBall();
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

  setPointer(fieldX: number | null): void {
    this.pointerX = fieldX;
  }

  setKeyDir(dir: number): void {
    this.paddleKeyDir = dir;
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
    this.bricks = buildBricks();
    this.score = 0;
    this.lives = START_LIVES;
    this.ballSpeed = BALL_SPEED_START;
    this.phase = "ready";
    this.resetBall();
    this.emit();
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
    });
  }

  private resetBall(): void {
    this.ballX = this.paddleX + PADDLE_W / 2;
    this.ballY = PADDLE_Y - BALL_R - 1;
    this.ballVx = 0;
    this.ballVy = 0;
  }

  private launch(): void {
    // A shallow spread either side of straight up, so no two rounds open alike.
    const angle = Math.random() * 0.7 - 0.35 - Math.PI / 2;
    this.ballVx = Math.cos(angle) * this.ballSpeed;
    this.ballVy = Math.sin(angle) * this.ballSpeed;
    this.phase = "playing";
    this.emit();
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
      this.resetBall();
      return;
    }

    this.accumulator += dt;
    while (this.accumulator >= PHYSICS_STEP) {
      this.accumulator -= PHYSICS_STEP;
      this.stepBall(PHYSICS_STEP);
      if (this.phase !== "playing") {
        this.accumulator = 0;
        break;
      }
    }
  }

  private movePaddle(dt: number): void {
    if (this.pointerX !== null) {
      this.paddleX = this.pointerX - PADDLE_W / 2;
    } else if (this.paddleKeyDir !== 0) {
      this.paddleX += this.paddleKeyDir * PADDLE_KEY_SPEED * dt;
    }
    this.paddleX = clamp(this.paddleX, 0, FIELD_W - PADDLE_W);
  }

  private stepBall(step: number): void {
    this.ballX += this.ballVx * step;
    this.ballY += this.ballVy * step;

    if (this.ballX - BALL_R < 0) {
      this.ballX = BALL_R;
      this.ballVx = Math.abs(this.ballVx);
    } else if (this.ballX + BALL_R > FIELD_W) {
      this.ballX = FIELD_W - BALL_R;
      this.ballVx = -Math.abs(this.ballVx);
    }
    if (this.ballY - BALL_R < 0) {
      this.ballY = BALL_R;
      this.ballVy = Math.abs(this.ballVy);
    }

    this.hitPaddle();
    this.hitBricks();

    if (this.ballY - BALL_R > FIELD_H) this.loseLife();
  }

  private hitPaddle(): void {
    if (this.ballVy <= 0) return;
    const top = PADDLE_Y;
    const withinX =
      this.ballX + BALL_R >= this.paddleX &&
      this.ballX - BALL_R <= this.paddleX + PADDLE_W;
    const crossingTop =
      this.ballY + BALL_R >= top && this.ballY - BALL_R <= top + PADDLE_H;
    if (!withinX || !crossingTop) return;

    // Offset from centre steers the bounce, so the paddle aims rather than just blocks.
    const offset =
      (this.ballX - (this.paddleX + PADDLE_W / 2)) / (PADDLE_W / 2);
    const angle = -Math.PI / 2 + clamp(offset, -1, 1) * 1.05;
    this.ballY = top - BALL_R;
    this.ballVx = Math.cos(angle) * this.ballSpeed;
    this.ballVy = Math.sin(angle) * this.ballSpeed;
    this.enforceMinVertical();
  }

  private enforceMinVertical(): void {
    const minVy = this.ballSpeed * MIN_VERTICAL_RATIO;
    if (Math.abs(this.ballVy) >= minVy) return;
    this.ballVy = Math.sign(this.ballVy || -1) * minVy;
    const room = this.ballSpeed ** 2 - this.ballVy ** 2;
    this.ballVx = Math.sign(this.ballVx || 1) * Math.sqrt(Math.max(room, 0));
  }

  private hitBricks(): void {
    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      const nearestX = clamp(this.ballX, brick.x, brick.x + BRICK_W);
      const nearestY = clamp(this.ballY, brick.y, brick.y + BRICK_H);
      const dx = this.ballX - nearestX;
      const dy = this.ballY - nearestY;
      if (dx * dx + dy * dy > BALL_R * BALL_R) continue;

      // Reflect on whichever axis is least penetrated - that is the face it met.
      const cx = brick.x + BRICK_W / 2;
      const cy = brick.y + BRICK_H / 2;
      const overlapX = BRICK_W / 2 + BALL_R - Math.abs(this.ballX - cx);
      const overlapY = BRICK_H / 2 + BALL_R - Math.abs(this.ballY - cy);
      if (overlapX < overlapY) {
        this.ballX += Math.sign(this.ballX - cx || 1) * overlapX;
        this.ballVx = -this.ballVx;
      } else {
        this.ballY += Math.sign(this.ballY - cy || 1) * overlapY;
        this.ballVy = -this.ballVy;
      }

      brick.alive = false;
      this.score += 10 * (ROWS - brick.row);
      this.ballSpeed = Math.min(
        this.ballSpeed + BALL_SPEED_PER_BRICK,
        BALL_SPEED_MAX,
      );
      this.rescale();
      if (this.bricksLeft === 0) this.finish("won");
      else this.emit();
      // One brick per step: the ball cannot legitimately reach two at this scale.
      return;
    }
  }

  /** Keeps the velocity vector's length equal to the (now faster) ball speed. */
  private rescale(): void {
    const len = Math.hypot(this.ballVx, this.ballVy);
    if (len === 0) return;
    this.ballVx = (this.ballVx / len) * this.ballSpeed;
    this.ballVy = (this.ballVy / len) * this.ballSpeed;
  }

  private loseLife(): void {
    this.lives -= 1;
    if (this.lives <= 0) {
      this.finish("lost");
      return;
    }
    this.phase = "ready";
    this.resetBall();
    this.emit();
  }

  private finish(phase: "won" | "lost"): void {
    this.phase = phase;
    if (this.score > this.best) {
      this.best = this.score;
      writeBest(this.best);
    }
    this.resetBall();
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

    const introT = easeOutCubic(clamp(this.introElapsed / INTRO_MS, 0, 1));
    this.drawBricks(introT);
    this.drawMark(introT);
    if (this.phase === "playing" || this.phase === "ready") this.drawBall();
  }

  private drawBricks(alpha: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      const fold = 12;
      ctx.beginPath();
      ctx.moveTo(brick.x, brick.y);
      ctx.lineTo(brick.x + BRICK_W - fold, brick.y);
      ctx.lineTo(brick.x + BRICK_W, brick.y + fold);
      ctx.lineTo(brick.x + BRICK_W, brick.y + BRICK_H);
      ctx.lineTo(brick.x, brick.y + BRICK_H);
      ctx.closePath();
      ctx.fillStyle = this.palette.page;
      ctx.fill();
      ctx.strokeStyle = this.palette.pageEdge;
      ctx.lineWidth = 1;
      ctx.stroke();

      // The turned-down corner, tinted per row so the stack reads as depth.
      ctx.beginPath();
      ctx.moveTo(brick.x + BRICK_W - fold, brick.y);
      ctx.lineTo(brick.x + BRICK_W, brick.y + fold);
      ctx.lineTo(brick.x + BRICK_W - fold, brick.y + fold);
      ctx.closePath();
      ctx.fillStyle =
        brick.row === 0
          ? this.palette.markStrong
          : brick.row === 1
            ? this.palette.markSoft
            : this.palette.pageEdge;
      ctx.fill();
    }
    ctx.restore();
  }

  private drawMark(introT: number): void {
    const paddleBox: Box = {
      x: this.paddleX,
      y: PADDLE_Y,
      w: PADDLE_W,
      h: PADDLE_H,
    };
    const target = paddlePose(paddleBox);
    const pose =
      this.introFrom && introT < 1
        ? lerpPose(this.introFrom, target, introT)
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

  private drawBall(): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(this.ballX, this.ballY, BALL_R, 0, Math.PI * 2);
    ctx.fillStyle = this.palette.ball;
    ctx.fill();
  }
}
