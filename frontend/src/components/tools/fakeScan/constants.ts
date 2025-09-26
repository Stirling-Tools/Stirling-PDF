import { TFunction } from 'i18next';

export const getQualityOptions = (t: TFunction) => [
  { value: 'low', label: t('scannerEffect.quality.low', 'Low') },
  { value: 'medium', label: t('scannerEffect.quality.medium', 'Medium') },
  { value: 'high', label: t('scannerEffect.quality.high', 'High') },
];

export const getRotationOptions = (t: TFunction) => [
  { value: 'none', label: t('scannerEffect.rotation.none', 'None') },
  { value: 'slight', label: t('scannerEffect.rotation.slight', 'Slight') },
  { value: 'moderate', label: t('scannerEffect.rotation.moderate', 'Moderate') },
  { value: 'severe', label: t('scannerEffect.rotation.severe', 'Severe') },
];

export const getColorspaceOptions = (t: TFunction) => [
  { value: 'grayscale', label: t('scannerEffect.colorspace.grayscale', 'Grayscale') },
  { value: 'color', label: t('scannerEffect.colorspace.color', 'Color') },
];


