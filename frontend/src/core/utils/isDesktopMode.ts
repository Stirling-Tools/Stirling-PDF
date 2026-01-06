export const isDesktopMode = (): boolean =>
  import.meta.env.MODE === 'desktop'
  || import.meta.env.VITE_DESKTOP === 'true'
  || import.meta.env.STIRLING_DESKTOP === 'true';
