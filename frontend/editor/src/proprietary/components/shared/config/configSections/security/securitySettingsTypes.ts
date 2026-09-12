// The four drafts the merged page edits. They are four different backend
// sections, so they stay four shapes even though one footer now saves them.

export interface SecuritySettingsData {
  enableLogin?: boolean;
  loginMethod?: string;
  loginAttemptCount?: number;
  loginResetTimeMinutes?: number;
  xFrameOptions?: string;
  jwt?: {
    enableKeyCleanup?: boolean;
    tokenExpiryMinutes?: number;
    desktopTokenExpiryMinutes?: number;
    allowedClockSkewSeconds?: number;
    refreshGraceMinutes?: number;
    secureCookie?: boolean;
  };
  audit?: {
    enabled?: boolean;
    level?: number;
    retentionDays?: number;
    captureFileHash?: boolean;
    capturePdfAuthor?: boolean;
    captureOperationResults?: boolean;
  };
  html?: {
    urlSecurity?: {
      enabled?: boolean;
      level?: string;
      allowedDomains?: string[];
      blockedDomains?: string[];
      internalTlds?: string[];
      blockPrivateNetworks?: boolean;
      blockLocalhost?: boolean;
      blockLinkLocal?: boolean;
      blockCloudMetadata?: boolean;
    };
  };
}

export interface PrivacySettingsData {
  enableAnalytics?: boolean;
  googleVisibility?: boolean;
  metricsEnabled?: boolean;
}

export interface LegalSettingsData {
  termsAndConditions?: string;
  privacyPolicy?: string;
  accessibilityStatement?: string;
  cookiePolicy?: string;
  impressum?: string;
  loginAgreement?: {
    enabled?: boolean;
    showInAnonymousMode?: boolean;
    fallbackText?: string;
  };
}

export interface FeedbackFlags {
  noValidDocument?: boolean;
  errorProcessing?: boolean;
  errorMessage?: boolean;
}

export interface FeedbackSettings {
  general?: { enabled?: boolean };
  channel?: FeedbackFlags;
  user?: FeedbackFlags;
}

export interface TelegramSettingsData {
  enabled?: boolean;
  botToken?: string;
  botUsername?: string;
  pipelineInboxFolder?: string;
  customFolderSuffix?: boolean;
  enableAllowUserIDs?: boolean;
  allowUserIDs?: number[];
  enableAllowChannelIDs?: boolean;
  allowChannelIDs?: number[];
  processingTimeoutSeconds?: number;
  pollingIntervalMillis?: number;
  feedback?: FeedbackSettings;
}

export interface MailSettings {
  enabled?: boolean;
  enableInvites?: boolean;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  from?: string;
}

export interface GoogleDriveSettings {
  enabled?: boolean;
  clientId?: string;
  apiKey?: string;
  appId?: string;
}

export interface OAuth2GenericSettings {
  enabled?: boolean;
  provider?: string;
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string;
  useAsUsername?: string;
  autoCreateUser?: boolean;
  blockRegistration?: boolean;
}

export interface Saml2Settings {
  enabled?: boolean;
  provider?: string;
  registrationId?: string;
  idpMetadataUri?: string;
  idpSingleLoginUrl?: string;
  idpSingleLogoutUrl?: string;
  idpIssuer?: string;
  idpCert?: string;
  privateKey?: string;
  spCert?: string;
  autoCreateUser?: boolean;
  blockRegistration?: boolean;
}

export interface OAuth2ClientSettings {
  clientId?: string;
  clientSecret?: string;
  scopes?: string;
  useAsUsername?: string;
  issuer?: string;
}

export type ProviderSettings =
  | MailSettings
  | TelegramSettingsData
  | GoogleDriveSettings
  | OAuth2GenericSettings
  | Saml2Settings
  | OAuth2ClientSettings;

export interface ConnectionsSettingsData {
  oauth2?: {
    enabled?: boolean;
    issuer?: string;
    clientId?: string;
    clientSecret?: string;
    provider?: string;
    autoCreateUser?: boolean;
    blockRegistration?: boolean;
    useAsUsername?: string;
    scopes?: string;
    client?: Record<string, OAuth2ClientSettings>;
  };
  saml2?: Saml2Settings;
  mail?: MailSettings;
  telegram?: TelegramSettingsData;
  ssoAutoLogin?: boolean;
  enableMobileScanner?: boolean;
  mobileScannerConvertToPdf?: boolean;
  mobileScannerImageResolution?: string;
  mobileScannerPageFormat?: string;
  mobileScannerStretchToFit?: boolean;
  googleDriveEnabled?: boolean;
  googleDriveClientId?: string;
  googleDriveApiKey?: string;
  googleDriveAppId?: string;
}
