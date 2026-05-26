// Centralized download URLs for Stirling PDF desktop installers.
// File names match the GitHub release artifacts so files.stirlingpdf.com can
// alias them 1:1.
export const DOWNLOAD_BASE_URL = "https://files.stirlingpdf.com/";

export const DESKTOP_INSTALLER_FILES = {
  // Universal Mac binary - works on both Intel and Apple silicon, so no arch
  // detection is needed on the client.
  MAC: "Stirling-PDF-macos-universal.dmg",
  WINDOWS: "Stirling-PDF-windows-x86_64.msi",
  LINUX_DEB: "Stirling-PDF-linux-x86_64.deb",
} as const;

export const DOWNLOAD_URLS = {
  WINDOWS: DOWNLOAD_BASE_URL + DESKTOP_INSTALLER_FILES.WINDOWS,
  MAC: DOWNLOAD_BASE_URL + DESKTOP_INSTALLER_FILES.MAC,
  LINUX_DOCS: "https://docs.stirlingpdf.com/Installation/Unix%20Installation/",
} as const;
