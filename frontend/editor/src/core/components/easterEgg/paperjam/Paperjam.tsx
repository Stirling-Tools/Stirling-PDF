import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  FIELD_H,
  FIELD_W,
  type GameStatus,
  type Palette,
  PaperjamGame,
} from "@app/components/easterEgg/paperjam/paperjamGame";
import type { Box } from "@app/components/easterEgg/paperjam/paperjamGeometry";
import "@app/components/easterEgg/paperjam/Paperjam.css";

export interface PaperjamProps {
  /** Where the mark flies in from, in client coordinates. */
  originRect: DOMRect | null;
  onClose: () => void;
}

/**
 * Pulls the palette out of Paperjam.css. A probe element is used rather than
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
    field: read("--paperjam-field", "#000"),
    fieldEdge: read("--paperjam-field-edge", "#fff"),
    page: read("--paperjam-page", "#fff"),
    pageEdge: read("--paperjam-page-edge", "#000"),
    ball: read("--paperjam-ball", "#fff"),
    markSoft: read("--paperjam-mark-soft", "#fff"),
    markStrong: read("--paperjam-mark", "#fff"),
  };
  probe.remove();
  return palette;
}

/** Converts a client point into playfield units, matching the canvas letterbox. */
function toFieldX(canvas: HTMLCanvasElement, clientX: number): number {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return FIELD_W / 2;
  const scale = Math.min(rect.width / FIELD_W, rect.height / FIELD_H);
  const inset = (rect.width - FIELD_W * scale) / 2;
  return (clientX - rect.left - inset) / scale;
}

/** The origin rect expressed in playfield units, or null when off-screen. */
function toFieldBox(
  canvas: HTMLCanvasElement,
  rect: DOMRect | null,
): Box | null {
  if (!rect) return null;
  const canvasRect = canvas.getBoundingClientRect();
  if (canvasRect.width === 0 || canvasRect.height === 0) return null;
  const scale = Math.min(
    canvasRect.width / FIELD_W,
    canvasRect.height / FIELD_H,
  );
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
    headline: "No paperjam",
    detail: "Every page cleared. Click or press Space to go again",
  },
  lost: {
    headline: "Paperjam",
    detail: "Out of balls. Click or press Space to try again",
  },
};

export default function Paperjam({ originRect, onClose }: PaperjamProps) {
  const cabinetRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<PaperjamGame | null>(null);
  const [status, setStatus] = useState<GameStatus>({
    phase: "intro",
    score: 0,
    lives: 3,
    bricksLeft: 0,
    best: 0,
  });

  // The rect is only read once, at construction, so a re-render must not restart
  // the game by feeding a new object identity into the setup effect.
  const originRef = useRef(originRect);

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
      canvas.closest<HTMLElement>(".paperjam-cabinet") ?? canvas,
    );
    const skipIntro = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const game = new PaperjamGame({
      ctx,
      palette,
      origin: toFieldBox(canvas, originRef.current),
      skipIntro,
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game) return;
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        // Keyboard takes the paddle back off the pointer.
        game.setPointer(null);
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
    if (!canvas) return;
    gameRef.current?.setKeyDir(0);
    gameRef.current?.setPointer(toFieldX(canvas, event.clientX));
  };

  // Focus the shell rather than the close button, so the keys the game wants
  // are not being handed to a button that would act on them.
  useEffect(() => {
    cabinetRef.current?.focus();
  }, []);

  const banner = BANNERS[status.phase];

  return createPortal(
    <div className="paperjam-scrim">
      <div
        ref={cabinetRef}
        className="paperjam-cabinet"
        role="dialog"
        aria-modal="true"
        aria-label="Paperjam"
        tabIndex={-1}
      >
        <div className="paperjam-hud">
          <span className="paperjam-hud__title">Paperjam</span>
          <span className="paperjam-hud__stat">
            Score <b>{status.score}</b>
          </span>
          <span className="paperjam-hud__stat paperjam-hud__stat--best">
            Best <b>{Math.max(status.best, status.score)}</b>
          </span>
          <span className="paperjam-hud__stat">
            Balls <b>{status.lives}</b>
          </span>
          <button
            type="button"
            className="paperjam-close"
            onClick={onClose}
            aria-label="Close Paperjam"
          >
            &times;
          </button>
        </div>

        <div className="paperjam-stage">
          <canvas
            ref={canvasRef}
            className="paperjam-canvas"
            onPointerMove={handlePointerMove}
            onPointerDown={(event) => {
              handlePointerMove(event);
              gameRef.current?.act();
            }}
          />
          {banner && (
            <div className="paperjam-banner" aria-live="polite">
              <span className="paperjam-banner__headline">
                {banner.headline}
              </span>
              <span className="paperjam-banner__detail">{banner.detail}</span>
            </div>
          )}
        </div>

        <p className="paperjam-hint">
          Move with the pointer or the arrow keys. Esc to get back to work.
        </p>
      </div>
    </div>,
    document.body,
  );
}
