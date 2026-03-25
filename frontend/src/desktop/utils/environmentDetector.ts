import { isTauri } from '@tauri-apps/api/core';

// Desktop-specific implementation using Tauri runtime detection
export function isDesktop(): boolean {
  return isTauri();
}