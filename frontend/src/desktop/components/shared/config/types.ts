import { VALID_NAV_KEYS as CORE_NAV_KEYS } from '@core/components/shared/config/types';

export const VALID_NAV_KEYS = [
  ...CORE_NAV_KEYS,
  'connectionMode',
  'planBilling',
] as const;

export type NavKey = typeof VALID_NAV_KEYS[number];
