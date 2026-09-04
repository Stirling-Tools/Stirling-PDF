import {
  Provider,
  useAllProviders,
} from "@app/components/shared/config/configSections/providerDefinitions";
import type {
  ConnectionsSettingsData,
  GoogleDriveSettings,
  OAuth2ClientSettings,
  OAuth2GenericSettings,
  ProviderSettings,
} from "@app/components/shared/config/configSections/security/securitySettingsTypes";

// Shared by the linked and unlinked cards, and by the page, which needs the
// counts to decide whether either section renders at all.

export function isProviderConfigured(
  settings: ConnectionsSettingsData,
  provider: Provider,
): boolean {
  if (provider.id === "saml2") {
    return settings?.saml2?.enabled === true;
  }

  if (provider.id === "smtp") {
    return settings?.mail?.enabled === true;
  }

  if (provider.id === "telegram") {
    return settings?.telegram?.enabled === true;
  }

  if (provider.id === "googledrive") {
    return settings?.googleDriveEnabled === true;
  }

  if (provider.id === "oauth2-generic") {
    return settings?.oauth2?.enabled === true;
  }

  // Check if specific OAuth2 provider is configured (has clientId)
  const providerSettings = settings?.oauth2?.client?.[provider.id];
  return !!providerSettings?.clientId;
}

export function getProviderSettings(
  settings: ConnectionsSettingsData,
  provider: Provider,
): ProviderSettings {
  if (provider.id === "saml2") {
    return settings?.saml2 || {};
  }

  if (provider.id === "smtp") {
    return settings?.mail || {};
  }

  if (provider.id === "telegram") {
    return settings?.telegram || {};
  }

  if (provider.id === "googledrive") {
    const gd: GoogleDriveSettings = {
      enabled: settings?.googleDriveEnabled,
      clientId: settings?.googleDriveClientId,
      apiKey: settings?.googleDriveApiKey,
      appId: settings?.googleDriveAppId,
    };
    return gd;
  }

  if (provider.id === "oauth2-generic") {
    const generic: OAuth2GenericSettings = {
      enabled: settings?.oauth2?.enabled,
      provider: settings?.oauth2?.provider,
      issuer: settings?.oauth2?.issuer,
      clientId: settings?.oauth2?.clientId,
      clientSecret: settings?.oauth2?.clientSecret,
      scopes: settings?.oauth2?.scopes,
      useAsUsername: settings?.oauth2?.useAsUsername,
      autoCreateUser: settings?.oauth2?.autoCreateUser,
      blockRegistration: settings?.oauth2?.blockRegistration,
    };
    return generic;
  }

  // Specific OAuth2 provider settings
  return settings?.oauth2?.client?.[provider.id] || {};
}

export function updateProviderSettings(
  settings: ConnectionsSettingsData,
  setSettings: (next: ConnectionsSettingsData) => void,
  provider: Provider,
  updatedSettings: Record<string, unknown>,
) {
  if (provider.id === "smtp") {
    setSettings({ ...settings, mail: updatedSettings });
  } else if (provider.id === "telegram") {
    setSettings({
      ...settings,
      telegram: updatedSettings,
    });
  } else if (provider.id === "googledrive") {
    const gd = updatedSettings as GoogleDriveSettings;
    setSettings({
      ...settings,
      googleDriveEnabled: gd.enabled,
      googleDriveClientId: gd.clientId,
      googleDriveApiKey: gd.apiKey,
      googleDriveAppId: gd.appId,
    });
  } else if (provider.id === "saml2") {
    setSettings({ ...settings, saml2: updatedSettings });
  } else if (provider.id === "oauth2-generic") {
    const generic = updatedSettings as OAuth2GenericSettings;
    setSettings({ ...settings, oauth2: { ...settings.oauth2, ...generic } });
  } else {
    // Specific OAuth2 provider
    const clientSettings = updatedSettings as OAuth2ClientSettings;
    setSettings({
      ...settings,
      oauth2: {
        ...settings.oauth2,
        client: {
          ...settings.oauth2?.client,
          [provider.id]: clientSettings,
        },
      },
    });
  }
}

export function useConnectionProviders(settings: ConnectionsSettingsData): {
  linkedProviders: Provider[];
  availableProviders: Provider[];
} {
  const allProviders = useAllProviders();
  const linkedProviders = allProviders.filter((p) =>
    isProviderConfigured(settings, p),
  );
  const availableProviders = allProviders.filter(
    (p) => !isProviderConfigured(settings, p),
  );
  return { linkedProviders, availableProviders };
}
