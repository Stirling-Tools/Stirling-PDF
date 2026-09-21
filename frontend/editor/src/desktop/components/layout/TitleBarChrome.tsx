import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  TitleBarStripContext,
  type TitleBarStripSlots,
} from "@app/contexts/TitleBarStripContext";
import { TitleBarStrip } from "@app/components/layout/TitleBarStrip";
import styles from "@app/components/layout/TitleBarStrip.module.css";

/**
 * Desktop app frame: the window title-bar strip as a full-width row above the
 * rail + app, and the portal slots the app fills.
 */
export function TitleBarChrome({ children }: { children: ReactNode }) {
  const [viewsSlot, setViewsSlot] = useState<HTMLElement | null>(null);
  const [searchSlot, setSearchSlot] = useState<HTMLElement | null>(null);
  const [globalsSlot, setGlobalsSlot] = useState<HTMLElement | null>(null);

  const value = useMemo<TitleBarStripSlots>(
    () => ({ enabled: true, viewsSlot, searchSlot, globalsSlot }),
    [viewsSlot, searchSlot, globalsSlot],
  );

  const setViews = useCallback((el: HTMLDivElement | null) => {
    setViewsSlot(el);
  }, []);
  const setSearch = useCallback((el: HTMLDivElement | null) => {
    setSearchSlot(el);
  }, []);
  const setGlobals = useCallback((el: HTMLDivElement | null) => {
    setGlobalsSlot(el);
  }, []);

  return (
    <TitleBarStripContext.Provider value={value}>
      <div className={styles.column}>
        <TitleBarStrip>
          <div ref={setViews} className={styles.slot} />
          <div ref={setSearch} className={styles.searchSlot} />
          <div ref={setGlobals} className={styles.slot} />
        </TitleBarStrip>
        {children}
      </div>
    </TitleBarStripContext.Provider>
  );
}
