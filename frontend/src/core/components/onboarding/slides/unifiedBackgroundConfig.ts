import { AnimatedCircleConfig } from '@app/types/types';

/**
 * Unified circle background configuration used across all onboarding slides.
 * Only gradient colors change between slides, creating smooth transitions.
 */
export const UNIFIED_CIRCLE_CONFIG: AnimatedCircleConfig[] = [
  {
    position: 'bottom-left',
    size: 270,
    color: 'rgba(255, 255, 255, 0.25)',
    opacity: 0.9,
    amplitude: 24,
    duration: 4.5,
    offsetX: 18,
    offsetY: 14,
  },
  {
    position: 'top-right',
    size: 300,
    color: 'rgba(255, 255, 255, 0.2)',
    opacity: 0.9,
    amplitude: 28,
    duration: 4.5,
    delay: 0.5,
    offsetX: 24,
    offsetY: 18,
  },
];

