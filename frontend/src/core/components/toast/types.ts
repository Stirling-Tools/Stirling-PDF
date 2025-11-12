import { ReactNode } from 'react';

export type ToastLocation = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'bottom-center';
export type ToastAlertType = 'success' | 'error' | 'warning' | 'neutral';

export interface ToastOptions {
  alertType?: ToastAlertType;
  title: string;
  body?: ReactNode;
  buttonText?: string;
  buttonCallback?: () => void;
  isPersistentPopup?: boolean;
  location?: ToastLocation;
  icon?: ReactNode;
  /** number 0-1 as fraction or 0-100 as percent */
  progressBarPercentage?: number;
  /** milliseconds to auto-close if not persistent */
  durationMs?: number;
  /** optional id to control/update later */
  id?: string;
  /** If true, show chevron and collapse/expand animation. Defaults to true. */
  expandable?: boolean;
}

export interface ToastInstance extends Omit<ToastOptions, 'id' | 'progressBarPercentage'> {
  id: string;
  alertType: ToastAlertType;
  isPersistentPopup: boolean;
  location: ToastLocation;
  durationMs: number;
  expandable: boolean;
  isExpanded: boolean;
  /** Number of coalesced duplicates */
  count?: number;
  /** internal progress normalized 0..100 */
  progress?: number;
  /** if progress completed, briefly show check icon */
  justCompleted: boolean;
  createdAt: number;
}

export interface ToastApi {
  show: (options: ToastOptions) => string;
  update: (id: string, options: Partial<ToastOptions>) => void;
  updateProgress: (id: string, progress: number) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}


