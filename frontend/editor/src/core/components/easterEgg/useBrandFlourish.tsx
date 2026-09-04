import { Suspense, lazy, useCallback, useState, type ReactNode } from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";

// Its own chunk: nothing here is fetched unless somebody actually finds it.
const Paperjam = lazy(
  () => import("@app/components/easterEgg/paperjam/Paperjam"),
);

export interface BrandFlourish {
  /**
   * Undefined where an admin has turned the hidden features off, so the
   * caller's trigger has nothing to call and no gate of its own to remember.
   */
  trigger?: (originRect: DOMRect | null) => void;
  overlay: ReactNode;
}

/**
 * Owns Paperjam's lifetime on the app side of the quick-nav seam. The trigger
 * lives out in the nav rail, which renders above the app's providers and so
 * cannot read app config itself; handing the rail an action that simply does
 * not exist when `enableEasterEggs` is false keeps the whole switch here.
 */
export function useBrandFlourish(): BrandFlourish {
  const { config } = useAppConfig();
  const enabled = config?.enableEasterEggs === true;
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  const [open, setOpen] = useState(false);

  const trigger = useCallback((originRect: DOMRect | null) => {
    setOrigin(originRect);
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return {
    trigger: enabled ? trigger : undefined,
    overlay:
      enabled && open ? (
        <Suspense fallback={null}>
          <Paperjam originRect={origin} onClose={close} />
        </Suspense>
      ) : null,
  };
}
