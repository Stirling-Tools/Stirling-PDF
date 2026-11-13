import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

const ToolPanelFooterContext = createContext<HTMLElement | null>(null);

/** Supplies the element below the tool panel's scroll area that ToolPanelFooter renders into. */
export const ToolPanelFooterTarget = ToolPanelFooterContext.Provider;

/**
 * Pins its children to the bottom of the tool panel, outside the scrolling content, so they stay
 * put however tall the tool is. Renders in place where no panel footer is provided.
 */
export function ToolPanelFooter({ children }: { children: ReactNode }) {
  const target = useContext(ToolPanelFooterContext);
  return target ? createPortal(children, target) : <>{children}</>;
}
