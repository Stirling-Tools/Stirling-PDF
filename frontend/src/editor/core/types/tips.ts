import type { ReactNode } from "react";

export interface TooltipTip {
  title?: string;
  /** Body copy. JSX is allowed; arbitrary HTML strings are not parsed. */
  description?: ReactNode;
  bullets?: ReactNode[];
  body?: ReactNode;
}

export interface TooltipContent {
  header?: {
    title: string;
  };
  tips?: TooltipTip[];
  content?: ReactNode;
}
