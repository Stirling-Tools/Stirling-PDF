import {
  Suspense,
  lazy,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useAllFiles } from "@app/contexts/file/fileHooks";
import { thumbnailGenerationService } from "@app/services/thumbnailGenerationService";
import {
  type ThumbnailRequest,
  planThumbnails,
} from "@app/components/easterEgg/collectThumbnails";
import type { StirlingFile } from "@app/types/fileContext";

// Its own chunk: nothing here is fetched unless somebody actually finds it.
const BrickGame = lazy(
  () => import("@app/components/easterEgg/brickGame/BrickGame"),
);

/** Small: the bricks are 49x68, so anything larger is detail nobody sees. */
const THUMBNAIL_SCALE = 0.3;

export interface BrandFlourish {
  /**
   * Undefined where an admin has turned the hidden features off, so the
   * caller's trigger has nothing to call and no gate of its own to remember.
   */
  trigger?: (originRect: DOMRect | null) => void;
  overlay: ReactNode;
}

function decode(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/**
 * Renders the planned pages, reusing anything already generated.
 *
 * Work is grouped into one service call per file, and `onBatch` fires as each
 * file lands so the wall fills in progressively rather than waiting on the
 * slowest document. Order is kept against the plan, so pages stay interleaved
 * across files however they arrive.
 */
async function renderPlan(
  plan: readonly ThumbnailRequest[],
  files: readonly StirlingFile[],
  onBatch: (images: HTMLImageElement[]) => void,
): Promise<void> {
  const sources = new Map<number, string>();
  const missingByFile = new Map<number, number[]>();
  plan.forEach((request, index) => {
    if (request.existing) {
      sources.set(index, request.existing);
      return;
    }
    const pending = missingByFile.get(request.fileIndex) ?? [];
    pending.push(index);
    missingByFile.set(request.fileIndex, pending);
  });

  const publish = async () => {
    const ordered = plan
      .map((_, index) => sources.get(index))
      .filter((src): src is string => Boolean(src));
    const decoded = await Promise.all(ordered.map(decode));
    onBatch(decoded.filter((img): img is HTMLImageElement => Boolean(img)));
  };

  // Anything the app had already rendered goes up straight away.
  if (sources.size > 0) await publish();

  for (const [fileIndex, planIndexes] of missingByFile) {
    const file = files[fileIndex];
    if (!file) continue;
    try {
      const buffer = await file.arrayBuffer();
      const results = await thumbnailGenerationService.generateThumbnails(
        file.fileId,
        buffer,
        planIndexes.map((index) => plan[index].pageNumber),
        { scale: THUMBNAIL_SCALE },
      );
      for (const result of results) {
        if (!result.success || !result.thumbnail) continue;
        const planIndex = planIndexes.find(
          (index) => plan[index].pageNumber === result.pageNumber,
        );
        if (planIndex !== undefined) sources.set(planIndex, result.thumbnail);
      }
      await publish();
    } catch {
      // A document that will not render just leaves its bricks blank.
    }
  }
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
  const { files, fileStubs } = useAllFiles();
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<readonly HTMLImageElement[]>([]);
  // Read at trigger time, so the render pass never restarts on a re-render.
  const filesRef = useRef(files);
  const stubsRef = useRef(fileStubs);
  filesRef.current = files;
  stubsRef.current = fileStubs;
  const runRef = useRef(0);

  const trigger = useCallback((originRect: DOMRect | null) => {
    setOrigin(originRect);
    setImages([]);
    setOpen(true);
    // Opening does not wait on the pages: the game starts with blank ones and
    // they arrive while the fly-in is still running.
    const run = ++runRef.current;
    const plan = planThumbnails(stubsRef.current);
    void renderPlan(plan, filesRef.current, (loaded) => {
      // A game closed and reopened mid-render must not be fed the old pages.
      if (runRef.current === run) setImages(loaded);
    });
  }, []);

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
