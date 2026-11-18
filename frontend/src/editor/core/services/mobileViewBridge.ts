export type MobileView = "tools" | "workbench";

type MobileViewSwitcher = (view: MobileView) => void;

let switcher: MobileViewSwitcher | null = null;

/**
 * Lets a tool move the mobile shell between the tool panel and the workbench.
 * The slider state lives in HomePage; tools only need to request a side.
 */
export function registerMobileViewSwitcher(
  next: MobileViewSwitcher | null,
): () => void {
  switcher = next;
  return () => {
    if (switcher === next) switcher = null;
  };
}

export function requestMobileView(view: MobileView): void {
  switcher?.(view);
}
