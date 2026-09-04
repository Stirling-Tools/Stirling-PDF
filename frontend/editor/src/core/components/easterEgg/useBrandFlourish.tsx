import {
  Suspense,
  lazy,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useAllFiles } from "@app/contexts/file/fileHooks";
import { collectThumbnailSources } from "@app/components/easterEgg/collectThumbnails";

// Its own chunk: nothing here is fetched unless somebody actually finds it.
const BrickGame = lazy(
  () => import("@app/components/easterEgg/brickGame/BrickGame"),
);

/**
 * How long to wait for thumbnails before opening regardless. They are blob URLs
 * already in memory, so this is normally not reached; it exists so a stalled
 * decode cannot hold the game shut.
 */
const DECODE_BUDGET_MS = 500;

export interface BrandFlourish {
  /**
   * Undefined where an admin has turned the hidden features off, so the
   * caller's trigger has nothing to call and no gate of its own to remember.
   */
  trigger?: (originRect: DOMRect | null) => void;
  overlay: ReactNode;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/** Whichever thumbnails decode inside the budget; a slow or broken one is dropped. */
async function loadWithinBudget(
  sources: readonly string[],
): Promise<HTMLImageElement[]> {
  if (sources.length === 0) return [];
  const settled = new Map<number, HTMLImageElement>();
  const loads = sources.map((src, index) =>
    loadImage(src).then((image) => {
      if (image) settled.set(index, image);
    }),
  );
  await Promise.race([
    Promise.all(loads),
    new Promise((resolve) => setTimeout(resolve, DECODE_BUDGET_MS)),
  ]);
  // Kept in source order so the wall reads like the document.
  return sources
    .map((_, index) => settled.get(index))
    .filter((image): image is HTMLImageElement => Boolean(image));
}

/**
 * Owns the hidden game's lifetime on the app side of the quick-nav seam. The
 * trigger lives out in the nav rail, which renders above the app's providers and
 * so cannot read app config itself; handing the rail an action that simply does
 * not exist when `enableEasterEggs` is false keeps the whole switch here.
 *
 * Being app-side is also what lets the bricks be faced with the user's own
 * pages: the file context is only reachable from in here.
 */
export function useBrandFlourish(): BrandFlourish {
  const { config } = useAppConfig();
  const enabled = config?.enableEasterEggs === true;
  const { fileStubs } = useAllFiles();
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  const [images, setImages] = useState<readonly HTMLImageElement[]>([]);
  const [open, setOpen] = useState(false);
  const openingRef = useRef(false);

  const thumbnailSources = useMemo(
    () => collectThumbnailSources(fileStubs),
    [fileStubs],
  );

  const trigger = useCallback(
    (originRect: DOMRect | null) => {
      if (openingRef.current || open) return;
      openingRef.current = true;
      setOrigin(originRect);
      void loadWithinBudget(thumbnailSources).then((loaded) => {
        setImages(loaded);
        setOpen(true);
        openingRef.current = false;
      });
    },
    [open, thumbnailSources],
  );

  const close = useCallback(() => setOpen(false), []);

  return {
    trigger: enabled ? trigger : undefined,
    overlay:
      enabled && open ? (
        <Suspense fallback={null}>
          <BrickGame originRect={origin} images={images} onClose={close} />
        </Suspense>
      ) : null,
  };
}
