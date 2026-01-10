import { isTauri } from '@tauri-apps/api/core';

type OpenExternalOptions = {
  target?: string;
  features?: string;
};

export const openExternalUrl = async (url: string, options: OpenExternalOptions = {}): Promise<boolean> => {
  if (typeof window === 'undefined') {
    return false;
  }

  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
    return true;
  }

  const target = options.target ?? '_blank';
  const features = options.features ?? 'noopener,noreferrer';
  const opened = window.open(url, target, features);
  return Boolean(opened);
};
