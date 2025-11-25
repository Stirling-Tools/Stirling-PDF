// Centralized download URLs for Stirling PDF desktop installers
export const DOWNLOAD_URLS = {
  WINDOWS: 'https://files.stirlingpdf.com/win-installer.exe',
  MAC_APPLE_SILICON: 'https://files.stirlingpdf.com/mac-installer.dmg',
  MAC_INTEL: 'https://files.stirlingpdf.com/mac-x86_64-installer.dmg',
  LINUX_DOCS: 'https://docs.stirlingpdf.com/Installation/Unix%20Installation/',
} as const;

export const DOWNLOAD_BASE_URL = 'https://files.stirlingpdf.com/';

