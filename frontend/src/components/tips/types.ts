export interface TooltipContent {
  header?: {
    title: string;
    logo?: string | React.ReactNode;
  };
  tips?: Array<{
    title?: string;
    description?: string;
    bullets?: string[];
    body?: React.ReactNode;
  }>;
  content?: React.ReactNode;
} 