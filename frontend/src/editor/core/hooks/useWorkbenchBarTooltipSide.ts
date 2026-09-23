import { SidebarRefs } from "@app/types/sidebar";

export function useWorkbenchBarTooltipSide(
  _sidebarRefs?: SidebarRefs,
  defaultOffset: number = 16,
): { position: "left" | "right" | "bottom"; offset: number } {
  return { position: "bottom", offset: defaultOffset };
}
