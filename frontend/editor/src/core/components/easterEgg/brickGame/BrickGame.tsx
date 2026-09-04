import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  BrickGame as BrickGameEngine,
  FIELD_H,
  FIELD_W,
  type GameStatus,
  type Palette,
} from "@app/components/easterEgg/brickGame/brickGameEngine";
import type { Box } from "@app/components/easterEgg/brickGame/brickGameGeometry";
import "@app/components/easterEgg/brickGame/BrickGame.css";

export interface BrickGameProps {
  /** Where the mark flies in from, in client coordinates. */
  originRect: DOMRect | null;
  /** Page thumbnails to face the bricks with; already decoded. */
  images?: readonly HTMLImageElement[];
  onClose: () => void;
}

/**
 * Pulls the palette out of BrickGame.css. A probe element is used rather than
 * reading the custom properties straight off the host because canvas needs a
 * resolved colour and these tokens are themselves `var()` chains.
 */
function resolvePalette(host: HTMLElement): Palette {
  const probe = document.createElement("span");
  probe.style.display = "none";
  host.appendChild(probe);
  const read = (name: string, fallback: string): string => {
    probe.style.color = `var(${name})`;
    return window.getComputedStyle(probe).color || fallback;
  };
  const palette: Palette = {
    field: read("--brick-game-field", "#000"),
    fieldEdge: read("--brick-game-field-edge", "#fff"),
    page: read("--brick-game-page", "#fff"),
    pageEdge: read("--brick-game-page-edge", "#000"),
    ball: read("--brick-game-ball", "#fff"),
    markSoft: read("--brick-game-mark-soft", "#fff"),
    markStrong: read("--brick-game-mark", "#fff"),
    powerWide: read("--brick-game-power-wide", "#fff"),
    powerSlow: read("--brick-game-power-slow", "#fff"),
    powerMulti: read("--brick-game-power-multi", "#fff"),
    powerLife: read("--brick-game-power-life", "#fff"),
  };
  probe.remove();
  return palette;
}

/** The scale factor from CSS pixels to playfield units for this canvas. */
function fieldScale(canvas: HTMLCanvasElement): number {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return 1;
  return Math.min(rect.width / FIELD_W, rect.height / FIELD_H);
}

/** Converts a client point into playfield units, matching the canvas letterbox. */
function toFieldX(canvas: HTMLCanvasElement, clientX: number): number {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return FIELD_W / 2;
  const scale = fieldScale(canvas);
  const inset = (rect.width - FIELD_W * scale) / 2;
  return (clientX - rect.left - inset) / scale;
}

/** The origin rect expressed in playfield units, or null when unmeasurable. */
function toFieldBox(
  canvas: HTMLCanvasElement,
  rect: DOMRect | null,
): Box | null {
  if (!rect) return null;
  const canvasRect = canvas.getBoundingClientRect();
  if (canvasRect.width === 0 || canvasRect.height === 0) return null;
  const scale = fieldScale(canvas);
  const insetX = (canvasRect.width - FIELD_W * scale) / 2;
  const insetY = (canvasRect.height - FIELD_H * scale) / 2;
  return {
    x: (rect.left - canvasRect.left - insetX) / scale,
    y: (rect.top - canvasRect.top - insetY) / scale,
    w: rect.width / scale,
    h: rect.height / scale,
  };
}

const BANNERS: Record<
  GameStatus["phase"],
  { headline: string; detail: string } | null
> = {
  intro: null,
  ready: { headline: "Ready", detail: "Click or press Space to serve" },
  playing: null,
  won: {
    headline: "All clear",
    detail: "Click or press Space to play again",
  },
  lost: {
    headline: "Out of balls",
    detail: "Click or press Space to try again",
  },
};

export default function BrickGame({
  originRect,
  images,
  onClose,
}: BrickGameProps) {
  const cabinetRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<BrickGameEngine | null>(null);
  const [locked, setLocked] = useState(false);
  const [status, setStatus] = useState<GameStatus>({
    phase: "intro",
    score: 0,
    lives: 3,
    bricksLeft: 0,
    best: 0,
    balls: 1,
    wide: 0,
    slow: 0,
  });

  // Read once, at construction, so a re-render cannot restart the game by
  // feeding new object identities into the setup effect.
  const originRef = useRef(originRect);
  const imagesRef = useRef(images);

  const resize = useCallback((canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    resize(canvas);
    // The cabinet carries the palette custom properties, not the stage.
    const palette = resolvePalette(
      canvas.closest<HTMLElement>(".brick-game-cabinet") ?? canvas,
    );
    const skipIntro = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const game = new BrickGameEngine({
      ctx,
      palette,
      origin: toFieldBox(canvas, originRef.current),
      skipIntro,
      images: imagesRef.current,
      onStatus: setStatus,
    });
    gameRef.current = game;
    game.start();

    const observer = new ResizeObserver(() => resize(canvas));
    observer.observe(canvas);

    // A hidden tab stops delivering frames; re-baseline the clock on return so
    // the first frame back is not one enormous delta.
    const onVisibility = () => {
      if (document.hidden) game.stop();
      else game.start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      observer.disconnect();
      game.stop();
      gameRef.current = null;
    };
  }, [resize]);

  // Pointer lock keeps the aim from running out of the playfield mid-rally.
  useEffect(() => {
    const onChange = () => {
      const canvas = canvasRef.current;
      const isLocked =
        Boolean(canvas) && document.pointerLockElement === canvas;
      setLocked(isLocked);
      // Absolute tracking would jump the paddle on the next stray move.
      if (!isLocked) gameRef.current?.setPointer(null);
    };
    document.addEventListener("pointerlockchange", onChange);
    document.addEventListener("pointerlockerror", onChange);
    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      document.removeEventListener("pointerlockerror", onChange);
    };
  }, []);

  // Releasing the pointer on the way out, so the cursor is never left captured.
  useEffect(
    () => () => {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game) return;
      if (event.key === "Escape") {
        // While the pointer is captured, Escape belongs to the browser: it
        // releases the cursor, and only a second press closes the game.
        if (!document.pointerLockElement) onClose();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        game.setKeyDir(event.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        game.act();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        gameRef.current?.setKeyDir(0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [onClose]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const game = gameRef.current;
    if (!canvas || !game) return;
    if (document.pointerLockElement === canvas) {
      game.nudgePaddle(event.movementX / fieldScale(canvas));
      return;
    }
    game.setPointer(toFieldX(canvas, event.clientX));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (document.pointerLockElement !== canvas) {
      // Rejected when the browser declines (a recent release rate-limits the
      // next request, and an iframe needs allow="pointer-lock"). Play carries
      // on with absolute tracking, so there is nothing to report.
      void Promise.resolve(canvas.requestPointerLock()).catch(() => {});
      handlePointerMove(event);
    }
    gameRef.current?.act();
  };

  const banner = BANNERS[status.phase];

  return createPortal(
    <div className="brick-game-scrim">
      <div
        ref={cabinetRef}
        className="brick-game-cabinet"
        role="dialog"
        aria-modal="true"
        aria-label="Hidden game"
        tabIndex={-1}
      >
        <div className="brick-game-hud">
          <div className="brick-game-effects">
            {status.wide > 0 && (
              <span className="brick-game-effect brick-game-effect--wide">
                Wide {status.wide}s
              </span>
            )}
            {status.slow > 0 && (
              <span className="brick-game-effect brick-game-effect--slow">
                Slow {status.slow}s
              </span>
            )}
          </div>
          <span className="brick-game-hud__stat brick-game-hud__stat--first">
            Score <b>{status.score}</b>
          </span>
          <span className="brick-game-hud__stat brick-game-hud__stat--best">
            Best <b>{Math.max(status.best, status.score)}</b>
          </span>
          <span className="brick-game-hud__stat">
            Balls <b>{status.lives}</b>
          </span>
          <button
            type="button"
            className="brick-game-close"
            onClick={onClose}
            aria-label="Close game"
          >
            &times;
          </button>
        </div>

        <div className="brick-game-stage">
          <canvas
            ref={canvasRef}
            className={`brick-game-canvas${
              locked ? "" : " brick-game-canvas--aiming"
            }`}
            onPointerMove={handlePointerMove}
            onPointerDown={handlePointerDown}
          />
          {banner && (
            <div className="brick-game-banner" aria-live="polite">
              <div className="brick-game-banner__plate">
                <span className="brick-game-banner__headline">
                  {banner.headline}
                </span>
                <span className="brick-game-banner__detail">
                  {banner.detail}
                </span>
              </div>
            </div>
          )}
        </div>

        <p className="brick-game-hint">
          {locked
            ? "Pointer captured. Esc releases it, then Esc again to get back to work."
            : "Move with the pointer or the arrow keys. Click to capture the pointer, Esc to get back to work."}
        </p>
      </div>
    </div>,
    document.body,
  );
}
