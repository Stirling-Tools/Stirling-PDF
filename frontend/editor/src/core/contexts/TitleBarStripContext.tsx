import { createContext, useContext } from "react";

/** Optional in-window title-bar strip. */
export interface TitleBarStripSlots {
  enabled: boolean;
  viewsSlot: HTMLElement | null;
  searchSlot: HTMLElement | null;
  globalsSlot: HTMLElement | null;
}

const DEFAULT: TitleBarStripSlots = {
  enabled: false,
  viewsSlot: null,
  searchSlot: null,
  globalsSlot: null,
};

export const TitleBarStripContext = createContext<TitleBarStripSlots>(DEFAULT);

export function useTitleBarStrip(): TitleBarStripSlots {
  return useContext(TitleBarStripContext);
}
