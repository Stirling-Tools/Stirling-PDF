import type { LogoVariant } from '@app/services/preferencesService';

export const LOGO_FOLDER_BY_VARIANT: Record<LogoVariant, string> = {
  modern: 'modern-logo',
  classic: 'classic-logo',
};

export const ensureLogoVariant = (value?: string | null): LogoVariant => {
  return value === 'classic' ? 'classic' : 'modern';
};

export const getLogoFolder = (variant?: LogoVariant | null): string => {
  return LOGO_FOLDER_BY_VARIANT[ensureLogoVariant(variant)];
};

