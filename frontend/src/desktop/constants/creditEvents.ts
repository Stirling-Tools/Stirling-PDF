/**
 * Credit event constants for desktop credit system
 * Used for communication between credit monitoring, UI, and operations
 */

export const CREDIT_EVENTS = {
  EXHAUSTED: 'credits:exhausted',
  LOW: 'credits:low',
  INSUFFICIENT: 'credits:insufficient',
  REFRESH_NEEDED: 'credits:refresh-needed',
} as const;

export type CreditEventType = typeof CREDIT_EVENTS[keyof typeof CREDIT_EVENTS];
