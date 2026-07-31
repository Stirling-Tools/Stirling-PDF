/** View-toggle modes; tuple keeps the union and iterator in sync. */
export const FILES_PAGE_VIEW_MODES = ["grid", "list"] as const;
export type FilesPageViewMode = (typeof FILES_PAGE_VIEW_MODES)[number];
