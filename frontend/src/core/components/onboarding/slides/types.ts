import { ReactNode } from 'react';

export interface AnimatedCircleConfig {
  size: number;
  color: string;
  opacity?: number;
  blur?: number;
  position: 'bottom-left' | 'top-right';
  amplitude?: number;
  duration?: number;
  delay?: number;
  offsetX?: number;
  offsetY?: number;
}

export interface AnimatedSlideBackgroundProps {
  gradientStops: [string, string];
  circles: AnimatedCircleConfig[];
}

export interface SlideConfig {
  key: string;
  title: ReactNode;
  body: ReactNode;
  background: AnimatedSlideBackgroundProps;
  downloadUrl?: string;
}

export interface LicenseNotice {
  totalUsers: number | null;
  freeTierLimit: number;
  isOverLimit: boolean;
  requiresLicense: boolean;
}
