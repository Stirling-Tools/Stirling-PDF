export interface AppConfig {
  baseUrl?: string;
  contextPath?: string;
  serverPort?: number;
  frontendUrl?: string;
  appNameNavbar?: string;
  languages?: string[];
  defaultLocale?: string;
  logoStyle?: "modern" | "classic";
  enableLogin?: boolean;
  showSettingsWhenNoLogin?: boolean;
  enableEmailInvites?: boolean;
  enableOAuth?: boolean;
  enableSaml?: boolean;
  isAdmin?: boolean;
  shouldShowUpdate?: boolean;
  enableAlphaFunctionality?: boolean;
  enableAnalytics?: boolean | null;
  enablePosthog?: boolean | null;
  enableScarf?: boolean | null;
  enableDesktopInstallSlide?: boolean;
  enableOnboarding?: boolean;
  premiumEnabled?: boolean;
  premiumKey?: string;
  paygEnabled?: boolean;
  /**
   * Whether this instance can link a Stirling (SaaS) account. False means the account-link
   * endpoints are absent (404), which is indistinguishable from "not linked" on the client, so
   * anything that prompts to link must gate on this first.
   */
  accountLinkAvailable?: boolean;
  termsAndConditions?: string;
  privacyPolicy?: string;
  cookiePolicy?: string;
  impressum?: string;
  accessibilityStatement?: string;
  runningProOrHigher?: boolean;
  runningEE?: boolean;
  license?: string;
  SSOAutoLogin?: boolean;
  serverCertificateEnabled?: boolean;
  hardwareSigningAvailable?: boolean;
  enableMobileScanner?: boolean;
  enableMobileSignature?: boolean;
  mobileScannerConvertToPdf?: boolean;
  mobileScannerImageResolution?: string;
  mobileScannerPageFormat?: string;
  mobileScannerStretchToFit?: boolean;
  appVersion?: string;
  machineType?: string;
  activeSecurity?: boolean;
  dependenciesReady?: boolean;
  error?: string;
  isNewServer?: boolean;
  isNewUser?: boolean;
  defaultHideUnavailableTools?: boolean;
  defaultHideUnavailableConversions?: boolean;
  storageEnabled?: boolean;
  storageSharingEnabled?: boolean;
  storageShareLinksEnabled?: boolean;
  storageShareEmailEnabled?: boolean;
  storageGroupSigningEnabled?: boolean;
  hideDisabledToolsGoogleDrive?: boolean;
  hideDisabledToolsMobileQRScanner?: boolean;
  googleDriveEnabled?: boolean;
  googleDriveClientId?: string;
  googleDriveApiKey?: string;
  googleDriveAppId?: string;
  timestampDefaultTsaUrl?: string;
  timestampCustomTsaUrls?: string[];
  timestampTsaPresets?: { label: string; url: string }[];
  aiEngineEnabled?: boolean;
}

export type AppConfigBootstrapMode = "blocking" | "non-blocking";
