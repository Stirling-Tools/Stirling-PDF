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