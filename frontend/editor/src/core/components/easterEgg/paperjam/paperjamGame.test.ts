import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FIELD_W,
  type GameStatus,
  type Palette,
  PaperjamGame,
} from "@app/components/easterEgg/paperjam/paperjamGame";

const PALETTE: Palette = {
  markSoft: "#1",
  markStrong: "#2",
  page: "#3",
  pageEdge: "#4",
  field: "#5",
  fieldEdge: "#6",
  ball: "#7",
};

/** Records nothing: the renderer is exercised only to prove it does not throw. */
function stubContext(): CanvasRenderingContext2D {
  const noop = () => {};
  const ctx = {
    canvas: { width: 1600, height: 1120 },
    setTransform: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    save: noop,
    restore: noop,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

interface Harness {
  game: PaperjamGame;
  status: () => GameStatus;
  /** Runs `frames` animation frames at a steady 60fps. */
  run: (frames: number) => void;
}

/**
 * Serves from the middle and then runs the paddle away, so the ball is missed.
 * The paddle has to leave *after* the serve: a held ball sits on the paddle
 * wherever it is, so parking the paddle first just gets the ball served
 * straight back into it.
 */
function concedeABall({ game, run }: Harness): void {
  game.setPointer(FIELD_W / 2);
  run(2);
  game.act();
  game.setPointer(0);
  run(600);
}

function setup(options: { skipIntro?: boolean } = {}): Harness {
  let now = 0;
  let pending: FrameRequestCallback | null = null;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    pending = fn;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    pending = null;
  });

  let latest: GameStatus | null = null;
  const game = new PaperjamGame({
    ctx: stubContext(),
    palette: PALETTE,
    origin: null,
    skipIntro: options.skipIntro ?? true,
    onStatus: (next) => {
      latest = next;
    },
  });
  game.start();

  return {
    game,
    status: () => {
      if (!latest) throw new Error("game reported no status");
      return latest;
    },
    run: (frames) => {
      for (let i = 0; i < frames; i++) {
        const frame = pending;
        pending = null;
        if (!frame) return;
        now += 1000 / 60;
        frame(now);
      }
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PaperjamGame", () => {
  it("waits on the player before it moves anything", () => {
    const { status, run } = setup();
    expect(status().phase).toBe("ready");
    run(60);
    // A held ball scores nothing however long the player leaves it.
    expect(status().score).toBe(0);
    expect(status().bricksLeft).toBeGreaterThan(0);
  });

  it("holds the player off until the fly-in lands, then plays", () => {
    let now = 0;
    let pending: FrameRequestCallback | null = null;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
      pending = fn;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      pending = null;
    });
    let latest: GameStatus | null = null;
    const game = new PaperjamGame({
      ctx: stubContext(),
      palette: PALETTE,
      origin: { x: -80, y: -120, w: 30, h: 33 },
      skipIntro: false,
      onStatus: (next) => {
        latest = next;
      },
    });
    game.start();
    expect(latest?.phase).toBe("intro");

    // A serve during the fly-in is ignored rather than queued.
    game.act();
    expect(latest?.phase).toBe("intro");

    // The fly-in is 750ms; 60 frames at 60fps is comfortably past it.
    for (let i = 0; i < 60; i++) {
      const frame = pending;
      pending = null;
      if (!frame) break;
      now += 1000 / 60;
      frame(now);
    }
    expect(latest?.phase).toBe("ready");
  });

  it("skips the fly-in with no origin to fly in from", () => {
    // prefers-reduced-motion takes the same path.
    const { status } = setup({ skipIntro: false });
    expect(status().phase).toBe("ready");
  });

  it("clears pages and scores once the ball is served", () => {
    const { game, status, run } = setup();
    const before = status().bricksLeft;
    game.act();
    expect(status().phase).toBe("playing");
    run(240);
    expect(status().bricksLeft).toBeLessThan(before);
    expect(status().score).toBeGreaterThan(0);
  });

  it("costs a life when the paddle is nowhere near the ball", () => {
    // A dead-centre serve, so the return is predictable.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { game, status, run } = setup();
    game.act();
    game.setPointer(0); // park the paddle hard left
    run(600);
    expect(status().lives).toBeLessThan(3);
  });

  it("ends the round after the third miss", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const harness = setup();
    concedeABall(harness);
    expect(harness.status().lives).toBe(2);
    concedeABall(harness);
    expect(harness.status().lives).toBe(1);
    concedeABall(harness);
    expect(harness.status().lives).toBe(0);
    expect(harness.status().phase).toBe("lost");
  });

  it("remembers a best score across games", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const first = setup();
    // Ending the round is what commits the score.
    concedeABall(first);
    concedeABall(first);
    concedeABall(first);
    expect(first.status().phase).toBe("lost");
    const best = first.status().best;
    expect(best).toBeGreaterThan(0);

    first.game.stop();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();

    const second = setup();
    expect(second.status().best).toBe(best);
  });

  it("resets the board on restart", () => {
    const { game, status, run } = setup();
    game.act();
    run(240);
    const cleared = status().bricksLeft;
    game.restart();
    expect(status().phase).toBe("ready");
    expect(status().score).toBe(0);
    expect(status().lives).toBe(3);
    expect(status().bricksLeft).toBeGreaterThan(cleared);
  });

  it("simulates nothing while stopped, and does not lurch on resume", () => {
    const { game, status, run } = setup();
    game.act();
    run(60);
    const scoreBeforeStop = status().score;
    game.stop();
    run(600); // frames are no longer scheduled
    expect(status().score).toBe(scoreBeforeStop);

    // A long wall-clock gap while stopped must not be spent in one step.
    game.start();
    run(1);
    expect(status().bricksLeft).toBeGreaterThan(0);
  });

  it.each([-5000, FIELD_W + 5000])(
    "keeps the paddle on the field with the pointer at %i",
    (pointerX) => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const { game, status, run } = setup();
      game.setPointer(pointerX);
      run(5);
      game.act();
      // One second: long enough to reach the wall, short enough that the ball
      // has not yet come back down to where the paddle would have to catch it.
      run(60);
      // An unclamped paddle would carry the held ball off the field and
      // concede the moment it was served.
      expect(status().lives).toBe(3);
      expect(status().score).toBeGreaterThan(0);
    },
  );
});
