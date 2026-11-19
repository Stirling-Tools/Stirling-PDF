export interface TooltipTip {
  title?: string;
  description?: string;
  bullets?: string[];
  body?: React.ReactNode;
}

export interface TooltipContent {
  header?: {
    title: string;
    logo?: string | React.ReactNode;
  };
  tips?: TooltipTip[];
  content?: React.ReactNode;
}

/**
 * Help behind a tool step's or tool title's (i), opened beside the sidebar. The
 * header is required: it is the panel's title bar, and without it the panel is a
 * bare list that does not say what it explains.
 */
export interface SidebarTooltipContent {
  header: {
    title: string;
    logo?: React.ReactNode;
  };
  tips?: TooltipTip[];
  content?: React.ReactNode;
}
