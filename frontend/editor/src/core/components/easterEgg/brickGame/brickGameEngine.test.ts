import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BrickGame,
  FIELD_W,
  type GameStatus,
  type Palette,
} from "@app/components/easterEgg/brickGame/brickGameEngine";

const PALETTE: Palette = {
  markSoft: "#1",
  markStrong: "#2",
  page: "#3",
  pageEdge: "#4",
  field: "#5",
  fieldEdge: "#6",
  ball: "#7",
  powerWide: "#8",
  powerSlow: "#9",
  powerMulti: "#a",
  powerLife: "#b",
  powerBane: "#c",
};

interface DrawnImage {
  image: CanvasImageSource;
}

/** Records only the image draws, which is the one output a test asserts on. */
function stubContext(): {
  ctx: CanvasRenderingContext2D;
  drawn: DrawnImage[];
} {
  const noop = () => {};
  const drawn: DrawnImage[] = [];
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
    roundRect: noop,
    clip: noop,
    fill: noop,
    stroke: noop,
    save: noop,
    restore: noop,
    drawImage: (image: CanvasImageSource) => {
      drawn.push({ image });
    },
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    globalAlpha: 1,
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, drawn };
}

/** A stand-in for a decoded thumbnail; the engine only reads its dimensions. */
function fakeImage(): HTMLImageElement {
  return { naturalWidth: 60, naturalHeight: 80 } as HTMLImageElement;
}

interface Harness {
  game: BrickGame;
  status: () => GameStatus;
  drawn: DrawnImage[];
  /** Runs `frames` animation frames at a steady 60fps. */
  run: (frames: number) => void;
}

function setup(
  options: {
    skipIntro?: boolean;
    images?: readonly HTMLImageElement[];
  } = {},
): Harness {
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

  const { ctx, drawn } = stubContext();
  let latest: GameStatus | null = null;
  const game = new BrickGame({
    ctx,
    palette: PALETTE,
    origin: null,
    skipIntro: options.skipIntro ?? true,
    images: options.images,
    onStatus: (next) => {
      latest = next;
    },
  });
  game.start();

  return {
    game,
    drawn,
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

/** Seconds left on a named effect, or 0 when it is not running. */
function effectSeconds(status: GameStatus, kind: string): number {
  return status.effects.find((e) => e.kind === kind)?.seconds ?? 0;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BrickGame", () => {
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
    const game = new BrickGame({
      ctx: stubContext().ctx,
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

    const step = () => {
      const frame = pending;
      pending = null;
      if (!frame) return false;
      now += 1000 / 60;
      frame(now);
      return true;
    };

    // The intro is 2s, so one second in it must still be running.
    for (let i = 0; i < 60; i++) step();
    expect(latest?.phase).toBe("intro");

    for (let i = 0; i < 90; i++) step();
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
    const harness = setup();
    concedeABall(harness);
    expect(harness.status().lives).toBe(2);
  });

  it("ends the round after the third miss", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const harness = setup();
    concedeABall(harness);
    concedeABall(harness);
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

  it("moves the paddle by relative deltas from a captured pointer", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { game, status, run } = setup();
    // Drive it hard left with relative motion alone, then serve: the ball is
    // held on the paddle, so a paddle that did not move would score anyway.
    game.setPointer(FIELD_W / 2);
    run(2);
    for (let i = 0; i < 20; i++) game.nudgePaddle(-40);
    run(2);
    game.act();
    game.setPointer(null);
    run(60);
    // Serving straight up from the far left hits the first column.
    expect(status().score).toBeGreaterThan(0);
    expect(status().lives).toBe(3);
  });

  describe("power-ups", () => {
    /** Forces every brick to drop the chosen kind. */
    function alwaysDrop(kindRoll: number): void {
      let call = 0;
      vi.spyOn(Math, "random").mockImplementation(() => {
        call += 1;
        // launch angle, then alternating drop-chance / kind rolls
        if (call === 1) return 0.5;
        return call % 2 === 0 ? 0 : kindRoll;
      });
    }

    it("drops nothing when the roll never comes up", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.99);
      const { game, status, run } = setup();
      game.act();
      run(240);
      expect(status().score).toBeGreaterThan(0);
      expect(status().effects).toEqual([]);
    });

    /**
     * Peak rather than final value: losing a ball deliberately clears the
     * board's effects, so an effect can have come and gone by the last frame.
     */
    function peak(
      harness: Harness,
      pick: (status: GameStatus) => number,
    ): number {
      let best = 0;
      for (let chunk = 0; chunk < 30; chunk++) {
        harness.run(20);
        best = Math.max(best, pick(harness.status()));
      }
      return best;
    }

    it.each([
      ["wide", 0.1],
      ["slow", 0.3],
      ["shrink", 0.7],
      ["fast", 0.85],
      ["reverse", 0.97],
    ])("runs the %s effect when that drop is caught", (kind, roll) => {
      alwaysDrop(roll as number);
      const harness = setup();
      harness.game.act();
      expect(
        peak(harness, (s) => effectSeconds(s, kind as string)),
      ).toBeGreaterThan(0);
    });

    it("clears the board's effects when a ball is conceded", () => {
      alwaysDrop(0.1);
      const harness = setup();
      harness.game.act();
      expect(peak(harness, (s) => effectSeconds(s, "wide"))).toBeGreaterThan(0);
      // Run the paddle off and let the ball go.
      harness.game.setPointer(0);
      harness.run(900);
      expect(harness.status().lives).toBeLessThan(3);
      expect(harness.status().effects).toEqual([]);
    });

    it("splits into more balls when a multi drop is caught", () => {
      alwaysDrop(0.45);
      const { game, status, run } = setup();
      game.act();
      expect(status().balls).toBe(1);
      run(600);
      expect(status().balls).toBeGreaterThan(1);
    });

    it("grants a ball in reserve when a life drop is caught", () => {
      alwaysDrop(0.6);
      const { game, status, run } = setup();
      game.act();
      run(600);
      expect(status().lives).toBeGreaterThan(3);
    });

    it("only concedes when the last ball is lost", () => {
      alwaysDrop(0.45);
      const harness = setup();
      harness.game.act();
      harness.run(600);
      expect(harness.status().balls).toBeGreaterThan(1);

      // Run the paddle away: balls drain one at a time, and the life goes with
      // the last of them.
      harness.game.setPointer(0);
      harness.run(60);
      expect(harness.status().lives).toBe(3);
      harness.run(1200);
      expect(harness.status().lives).toBeLessThan(4);
    });
  });

  describe("thumbnails", () => {
    it("faces the pages with the supplied thumbnails", () => {
      const images = [fakeImage(), fakeImage(), fakeImage()];
      const { drawn, run } = setup({ images });
      run(2);
      expect(drawn.length).toBeGreaterThan(0);
      // Every draw is one of the supplied images, cycled across the wall.
      for (const entry of drawn) expect(images).toContain(entry.image);
      expect(new Set(drawn.map((d) => d.image)).size).toBe(images.length);
    });

    it("draws no image at all when none are supplied", () => {
      const { drawn, run } = setup();
      run(2);
      expect(drawn).toHaveLength(0);
    });
  });
});
