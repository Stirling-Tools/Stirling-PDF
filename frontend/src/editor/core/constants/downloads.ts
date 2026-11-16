// Centralized download URLs for Stirling PDF desktop installers
export const DOWNLOAD_URLS = {
  WINDOWS: "https://files.stirlingpdf.com/win-installer.exe",
  WINDOWS_ARM64: "https://files.stirlingpdf.com/win-arm64-installer.exe",
  MAC: "https://files.stirlingpdf.com/mac-installer.dmg",
  LINUX_DEB: "https://files.stirlingpdf.com/linux-installer.deb",
  LINUX_RPM: "https://files.stirlingpdf.com/linux-installer.rpm",
  LINUX_APPIMAGE: "https://files.stirlingpdf.com/linux-installer.AppImage",
  LINUX_DOCS: "https://docs.stirlingpdf.com/Installation/Unix%20Installation/",
} as const;

export const DOWNLOAD_BASE_URL = "https://files.stirlingpdf.com/";
