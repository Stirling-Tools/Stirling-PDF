import apiClient from "@app/services/apiClient";
import type {
  ConnectionsSettingsData,
  LegalSettingsData,
  PrivacySettingsData,
  SecuritySettingsData,
} from "@app/components/shared/config/configSections/security/securitySettingsTypes";

// The fetch/save transformers for the merged page's four sub-fetches, kept out
// of the page file so it reads as hooks, one draft, one save.

interface SettingsSaveResult {
  sectionData: Record<string, unknown>;
  deltaSettings: Record<string, unknown>;
}

export async function fetchSecuritySettings(): Promise<
  SecuritySettingsData & { _pending?: Record<string, unknown> }
> {
  const [securityResponse, premiumResponse, systemResponse] = await Promise.all(
    [
      apiClient.get("/api/v1/admin/settings/section/security"),
      apiClient.get("/api/v1/admin/settings/section/premium"),
      apiClient.get("/api/v1/admin/settings/section/system"),
    ],
  );

  const securityData = securityResponse.data || {};
  const premiumData = premiumResponse.data || {};
  const systemData = systemResponse.data || {};

  const { _pending: securityPending, ...securityActive } = securityData;
  const { _pending: premiumPending, ...premiumActive } = premiumData;
  const { _pending: systemPending, ...systemActive } = systemData;

  const combined: SecuritySettingsData & {
    _pending?: Record<string, unknown>;
  } = {
    ...securityActive,
  };

  // Only add audit if it exists (don't create defaults)
  if (premiumActive.enterpriseFeatures?.audit) {
    combined.audit = premiumActive.enterpriseFeatures.audit;
  }

  // Only add html if it exists (don't create defaults)
  if (systemActive.html) {
    combined.html = systemActive.html;
  }

  // Merge all _pending blocks
  const mergedPending: Record<string, unknown> = {};
  if (securityPending) {
    Object.assign(mergedPending, securityPending);
  }
  if (premiumPending?.enterpriseFeatures?.audit) {
    mergedPending.audit = premiumPending.enterpriseFeatures.audit;
  }
  if (systemPending?.html) {
    mergedPending.html = systemPending.html;
  }

  if (Object.keys(mergedPending).length > 0) {
    combined._pending = mergedPending;
  }

  return combined;
}

export function saveSecuritySettings(
  settings: SecuritySettingsData,
): SettingsSaveResult {
  const { audit, html, ...securitySettings } = settings;

  const deltaSettings: Record<string, unknown> = {
    // Security settings
    "security.enableLogin": securitySettings.enableLogin,
    "security.loginMethod": securitySettings.loginMethod,
    "security.loginAttemptCount": securitySettings.loginAttemptCount,
    "security.loginResetTimeMinutes": securitySettings.loginResetTimeMinutes,
    "security.xFrameOptions": securitySettings.xFrameOptions,
    // JWT settings
    "security.jwt.enableKeyCleanup": securitySettings.jwt?.enableKeyCleanup,
    "security.jwt.tokenExpiryMinutes": securitySettings.jwt?.tokenExpiryMinutes,
    "security.jwt.desktopTokenExpiryMinutes":
      securitySettings.jwt?.desktopTokenExpiryMinutes,
    "security.jwt.allowedClockSkewSeconds":
      securitySettings.jwt?.allowedClockSkewSeconds,
    "security.jwt.refreshGraceMinutes":
      securitySettings.jwt?.refreshGraceMinutes,
    "security.jwt.secureCookie": securitySettings.jwt?.secureCookie,
    // Premium audit settings
    "premium.enterpriseFeatures.audit.enabled": audit?.enabled,
    "premium.enterpriseFeatures.audit.level": audit?.level,
    "premium.enterpriseFeatures.audit.retentionDays": audit?.retentionDays,
    "premium.enterpriseFeatures.audit.captureFileHash": audit?.captureFileHash,
    "premium.enterpriseFeatures.audit.capturePdfAuthor":
      audit?.capturePdfAuthor,
    "premium.enterpriseFeatures.audit.captureOperationResults":
      audit?.captureOperationResults,
  };

  // System HTML settings
  if (html?.urlSecurity) {
    deltaSettings["system.html.urlSecurity.enabled"] = html.urlSecurity.enabled;
    deltaSettings["system.html.urlSecurity.level"] = html.urlSecurity.level;
    deltaSettings["system.html.urlSecurity.allowedDomains"] =
      html.urlSecurity.allowedDomains;
    deltaSettings["system.html.urlSecurity.blockedDomains"] =
      html.urlSecurity.blockedDomains;
    deltaSettings["system.html.urlSecurity.internalTlds"] =
      html.urlSecurity.internalTlds;
    deltaSettings["system.html.urlSecurity.blockPrivateNetworks"] =
      html.urlSecurity.blockPrivateNetworks;
    deltaSettings["system.html.urlSecurity.blockLocalhost"] =
      html.urlSecurity.blockLocalhost;
    deltaSettings["system.html.urlSecurity.blockLinkLocal"] =
      html.urlSecurity.blockLinkLocal;
    deltaSettings["system.html.urlSecurity.blockCloudMetadata"] =
      html.urlSecurity.blockCloudMetadata;
  }

  return {
    sectionData: {},
    deltaSettings,
  };
}

export async function fetchConnectionsSettings(): Promise<
  ConnectionsSettingsData & { _pending?: Record<string, unknown> }
> {
  // Fetch security settings (oauth2, saml2)
  const securityResponse = await apiClient.get(
    "/api/v1/admin/settings/section/security",
  );
  const securityData = securityResponse.data || {};

  // Fetch mail settings
  const mailResponse = await apiClient.get(
    "/api/v1/admin/settings/section/mail",
  );
  const mailData = mailResponse.data || {};

  // Fetch premium settings for SSO Auto Login
  const premiumResponse = await apiClient.get(
    "/api/v1/admin/settings/section/premium",
  );
  const premiumData = premiumResponse.data || {};

  // Fetch Telegram settings
  const telegramResponse = await apiClient.get(
    "/api/v1/admin/settings/section/telegram",
  );
  const telegramData = telegramResponse.data || {};

  // Fetch system settings for enableMobileScanner
  const systemResponse = await apiClient.get(
    "/api/v1/admin/settings/section/system",
  );
  const systemData = systemResponse.data || {};

  const result: ConnectionsSettingsData & {
    _pending?: Record<string, unknown>;
  } = {
    oauth2: securityData.oauth2 || {},
    saml2: securityData.saml2 || {},
    mail: mailData || {},
    telegram: telegramData || {},
    ssoAutoLogin: premiumData.proFeatures?.ssoAutoLogin || false,
    enableMobileScanner: systemData.enableMobileScanner || false,
    mobileScannerConvertToPdf:
      systemData.mobileScannerSettings?.convertToPdf !== false,
    mobileScannerImageResolution:
      systemData.mobileScannerSettings?.imageResolution || "full",
    mobileScannerPageFormat:
      systemData.mobileScannerSettings?.pageFormat || "A4",
    mobileScannerStretchToFit:
      systemData.mobileScannerSettings?.stretchToFit || false,
    googleDriveEnabled: premiumData.proFeatures?.googleDrive?.enabled || false,
    googleDriveClientId: premiumData.proFeatures?.googleDrive?.clientId || "",
    googleDriveApiKey: premiumData.proFeatures?.googleDrive?.apiKey || "",
    googleDriveAppId: premiumData.proFeatures?.googleDrive?.appId || "",
  };

  // Merge pending blocks from all endpoints
  const pendingBlock: Record<string, unknown> = {};
  if (securityData._pending?.oauth2) {
    pendingBlock.oauth2 = securityData._pending.oauth2;
  }
  if (securityData._pending?.saml2) {
    pendingBlock.saml2 = securityData._pending.saml2;
  }
  if (mailData._pending) {
    pendingBlock.mail = mailData._pending;
  }
  if (telegramData._pending) {
    pendingBlock.telegram = telegramData._pending;
  }
  if (premiumData._pending?.proFeatures?.ssoAutoLogin !== undefined) {
    pendingBlock.ssoAutoLogin = premiumData._pending.proFeatures.ssoAutoLogin;
  }
  if (systemData._pending?.enableMobileScanner !== undefined) {
    pendingBlock.enableMobileScanner = systemData._pending.enableMobileScanner;
  }
  if (systemData._pending?.mobileScannerSettings?.convertToPdf !== undefined) {
    pendingBlock.mobileScannerConvertToPdf =
      systemData._pending.mobileScannerSettings.convertToPdf;
  }
  if (
    systemData._pending?.mobileScannerSettings?.imageResolution !== undefined
  ) {
    pendingBlock.mobileScannerImageResolution =
      systemData._pending.mobileScannerSettings.imageResolution;
  }
  if (systemData._pending?.mobileScannerSettings?.pageFormat !== undefined) {
    pendingBlock.mobileScannerPageFormat =
      systemData._pending.mobileScannerSettings.pageFormat;
  }
  if (systemData._pending?.mobileScannerSettings?.stretchToFit !== undefined) {
    pendingBlock.mobileScannerStretchToFit =
      systemData._pending.mobileScannerSettings.stretchToFit;
  }
  if (premiumData._pending?.proFeatures?.googleDrive?.enabled !== undefined) {
    pendingBlock.googleDriveEnabled =
      premiumData._pending.proFeatures.googleDrive.enabled;
  }
  if (premiumData._pending?.proFeatures?.googleDrive?.clientId !== undefined) {
    pendingBlock.googleDriveClientId =
      premiumData._pending.proFeatures.googleDrive.clientId;
  }
  if (premiumData._pending?.proFeatures?.googleDrive?.apiKey !== undefined) {
    pendingBlock.googleDriveApiKey =
      premiumData._pending.proFeatures.googleDrive.apiKey;
  }
  if (premiumData._pending?.proFeatures?.googleDrive?.appId !== undefined) {
    pendingBlock.googleDriveAppId =
      premiumData._pending.proFeatures.googleDrive.appId;
  }

  if (Object.keys(pendingBlock).length > 0) {
    result._pending = pendingBlock;
  }

  return result;
}

export function saveConnectionsSettings(
  currentSettings: ConnectionsSettingsData,
): SettingsSaveResult {
  const deltaSettings: Record<string, unknown> = {};

  // Build delta for oauth2 settings
  if (currentSettings.oauth2) {
    Object.keys(currentSettings.oauth2).forEach((key) => {
      if (key !== "client") {
        deltaSettings[`security.oauth2.${key}`] = (
          currentSettings.oauth2 as Record<string, unknown>
        )[key];
      }
    });

    // Build delta for specific OAuth2 providers
    const oauth2Client = currentSettings.oauth2.client;
    if (oauth2Client) {
      Object.keys(oauth2Client).forEach((providerId) => {
        const providerSettings = oauth2Client[providerId] as Record<
          string,
          unknown
        >;
        Object.keys(providerSettings).forEach((key) => {
          deltaSettings[`security.oauth2.client.${providerId}.${key}`] =
            providerSettings[key];
        });
      });
    }
  }

  // Build delta for saml2 settings
  if (currentSettings.saml2) {
    const saml2 = currentSettings.saml2 as Record<string, unknown>;
    Object.keys(saml2).forEach((key) => {
      deltaSettings[`security.saml2.${key}`] = saml2[key];
    });
  }

  // Mail settings
  if (currentSettings.mail) {
    const mail = currentSettings.mail as Record<string, unknown>;
    Object.keys(mail).forEach((key) => {
      deltaSettings[`mail.${key}`] = mail[key];
    });
  }

  // Telegram settings
  if (currentSettings.telegram) {
    const telegram = currentSettings.telegram as Record<string, unknown>;
    Object.keys(telegram).forEach((key) => {
      deltaSettings[`telegram.${key}`] = telegram[key];
    });
  }

  // SSO Auto Login
  if (currentSettings?.ssoAutoLogin !== undefined) {
    deltaSettings["premium.proFeatures.ssoAutoLogin"] =
      currentSettings.ssoAutoLogin;
  }

  // Mobile Scanner settings
  if (currentSettings?.enableMobileScanner !== undefined) {
    deltaSettings["system.enableMobileScanner"] =
      currentSettings.enableMobileScanner;
  }
  if (currentSettings?.mobileScannerConvertToPdf !== undefined) {
    deltaSettings["system.mobileScannerSettings.convertToPdf"] =
      currentSettings.mobileScannerConvertToPdf;
  }
  if (currentSettings?.mobileScannerImageResolution !== undefined) {
    deltaSettings["system.mobileScannerSettings.imageResolution"] =
      currentSettings.mobileScannerImageResolution;
  }
  if (currentSettings?.mobileScannerPageFormat !== undefined) {
    deltaSettings["system.mobileScannerSettings.pageFormat"] =
      currentSettings.mobileScannerPageFormat;
  }
  if (currentSettings?.mobileScannerStretchToFit !== undefined) {
    deltaSettings["system.mobileScannerSettings.stretchToFit"] =
      currentSettings.mobileScannerStretchToFit;
  }

  // Google Drive settings
  if (currentSettings?.googleDriveEnabled !== undefined) {
    deltaSettings["premium.proFeatures.googleDrive.enabled"] =
      currentSettings.googleDriveEnabled;
  }
  if (currentSettings?.googleDriveClientId !== undefined) {
    deltaSettings["premium.proFeatures.googleDrive.clientId"] =
      currentSettings.googleDriveClientId;
  }
  if (currentSettings?.googleDriveApiKey !== undefined) {
    deltaSettings["premium.proFeatures.googleDrive.apiKey"] =
      currentSettings.googleDriveApiKey;
  }
  if (currentSettings?.googleDriveAppId !== undefined) {
    deltaSettings["premium.proFeatures.googleDrive.appId"] =
      currentSettings.googleDriveAppId;
  }

  return {
    sectionData: {},
    deltaSettings,
  };
}

export async function fetchPrivacySettings(): Promise<
  PrivacySettingsData & { _pending?: Record<string, unknown> }
> {
  const [metricsResponse, systemResponse] = await Promise.all([
    apiClient.get("/api/v1/admin/settings/section/metrics"),
    apiClient.get("/api/v1/admin/settings/section/system"),
  ]);

  const metrics = metricsResponse.data;
  const system = systemResponse.data;

  const result: PrivacySettingsData & {
    _pending?: Record<string, unknown>;
  } = {
    enableAnalytics: system.enableAnalytics || false,
    googleVisibility: system.googlevisibility || false,
    metricsEnabled: metrics.enabled || false,
  };

  // Merge pending blocks from both endpoints
  const pendingBlock: Record<string, unknown> = {};
  if (system._pending?.enableAnalytics !== undefined) {
    pendingBlock.enableAnalytics = system._pending.enableAnalytics;
  }
  if (system._pending?.googlevisibility !== undefined) {
    pendingBlock.googleVisibility = system._pending.googlevisibility;
  }
  if (metrics._pending?.enabled !== undefined) {
    pendingBlock.metricsEnabled = metrics._pending.enabled;
  }

  if (Object.keys(pendingBlock).length > 0) {
    result._pending = pendingBlock;
  }

  return result;
}

export function savePrivacySettings(
  settings: PrivacySettingsData,
): SettingsSaveResult {
  const deltaSettings = {
    "system.enableAnalytics": settings.enableAnalytics,
    "system.googlevisibility": settings.googleVisibility,
    "metrics.enabled": settings.metricsEnabled,
  };

  return {
    sectionData: {},
    deltaSettings,
  };
}

// loginAgreement goes through the flat endpoint: a partial nested object sent
// to the section endpoint replaces the node and drops fallbackText, unedited.
export function saveLegalSettings(
  current: LegalSettingsData,
): SettingsSaveResult {
  const { loginAgreement, ...flat } = current;
  const deltaSettings: Record<string, unknown> = {};
  if (loginAgreement) {
    deltaSettings["legal.loginAgreement.enabled"] =
      loginAgreement.enabled ?? false;
    deltaSettings["legal.loginAgreement.showInAnonymousMode"] =
      loginAgreement.showInAnonymousMode ?? true;
  }
  return { sectionData: flat, deltaSettings };
}
