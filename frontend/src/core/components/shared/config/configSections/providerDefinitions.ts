import { useTranslation } from "react-i18next";

export type ProviderType = "oauth2" | "saml2" | "telegram" | "googledrive";

export interface ProviderField {
  key: string;
  type: "text" | "password" | "switch" | "textarea" | "number" | "tags";
  label: string;
  description: string;
  placeholder?: string;
  defaultValue?: any;
}

export interface Provider {
  id: string;
  name: string;
  icon: string;
  type: ProviderType;
  scope: string; // Summary of what this provider does
  businessTier?: boolean; // Enterprise only
  documentationUrl?: string; // Optional link to documentation
  fields: ProviderField[];
}

const useGoogleProvider = (): Provider => {
  const { t } = useTranslation();

  return {
    id: "google",
    name: "Google",
    icon: "/Login/google.svg",
    type: "oauth2",
    scope: t("provider.oauth2.google.scope", "Sign-in authentication"),
    documentationUrl:
      "https://docs.stirlingpdf.com/Configuration/OAuth%20SSO%20Configuration",
    fields: [
      {
        key: "clientId",
        type: "text",
        label: t("provider.oauth2.google.clientId.label", "Client ID"),
        description: t(
          "provider.oauth2.google.clientId.description",
          "The OAuth2 client ID from Google Cloud Console",
        ),
        placeholder: "your-client-id.apps.googleusercontent.com",
      },
      {
        key: "clientSecret",
        type: "password",
        label: t("provider.oauth2.google.clientSecret.label", "Client Secret"),
        description: t(
          "provider.oauth2.google.clientSecret.description",
          "The OAuth2 client secret from Google Cloud Console",
        ),
      },
      {
        key: "scopes",
        type: "text",
        label: t("provider.oauth2.google.scopes.label", "Scopes"),
        description: t(
          "provider.oauth2.google.scopes.description",
          "Comma-separated OAuth2 scopes",
        ),
        defaultValue: "email, profile",
      },
      {
        key: "useAsUsername",
        type: "text",
        label: t(
          "provider.oauth2.google.useAsUsername.label",
          "Use as Username",
        ),
        description: t(
          "provider.oauth2.google.useAsUsername.description",
          "Field to use as username (email, name, given_name, family_name)",
        ),
        defaultValue: "email",
      },
    ],
  };
};

const useGitHubProvider = (): Provider => {
  const { t } = useTranslation();

  return {
    id: "github",
    name: "GitHub",
    icon: "/Login/github.svg",
    type: "oauth2",
    scope: t("provider.oauth2.github.scope", "Sign-in authentication"),
    documentationUrl:
      "https://docs.stirlingpdf.com/Configuration/OAuth%20SSO%20Configuration",
    fields: [
      {
        key: "clientId",
        type: "text",
        label: t("provider.oauth2.github.clientId.label", "Client ID"),
        description: t(
          "provider.oauth2.github.clientId.description",
          "The OAuth2 client ID from GitHub Developer Settings",
        ),
      },
      {
        key: "clientSecret",
        type: "password",
        label: t("provider.oauth2.github.clientSecret.label", "Client Secret"),
        description: t(
          "provider.oauth2.github.clientSecret.description",
          "The OAuth2 client secret from GitHub Developer Settings",
        ),
      },
      {
        key: "scopes",
        type: "text",
        label: t("provider.oauth2.github.scopes.label", "Scopes"),
        description: t(
          "provider.oauth2.github.scopes.description",
          "Comma-separated OAuth2 scopes",
        ),
        defaultValue: "read:user",
      },
      {
        key: "useAsUsername",
        type: "text",
        label: t(
          "provider.oauth2.github.useAsUsername.label",
          "Use as Username",
        ),
        description: t(
          "provider.oauth2.github.useAsUsername.description",
          "Field to use as username (email, login, name)",
        ),
        defaultValue: "login",
      },
    ],
  };
};

const useKeycloakProvider = (): Provider => {
  const { t } = useTranslation();

  return {
    id: "keycloak",
    name: "Keycloak",
    icon: "key-rounded",
    type: "oauth2",
    scope: t("provider.oauth2.keycloak.scope", "SSO"),
    businessTier: false,
    documentationUrl:
      "https://docs.stirlingpdf.com/Configuration/OAuth%20SSO%20Configuration",
    fields: [
      {
        key: "issuer",
        type: "text",
        label: t("provider.oauth2.keycloak.issuer.label", "Issuer URL"),
        description: t(
          "provider.oauth2.keycloak.issuer.description",
          "URL of the Keycloak realm's OpenID Connect Discovery endpoint",
        ),
        placeholder: "https://keycloak.example.com/realms/myrealm",
      },
      {
        key: "clientId",
        type: "text",
        label: t("provider.oauth2.keycloak.clientId.label", "Client ID"),
        description: t(
          "provider.oauth2.keycloak.clientId.description",
          "The OAuth2 client ID from Keycloak",
        ),
      },
      {
        key: "clientSecret",
        type: "password",
        label: t(
          "provider.oauth2.keycloak.clientSecret.label",
          "Client Secret",
        ),
        description: t(
          "provider.oauth2.keycloak.clientSecret.description",
          "The OAuth2 client secret from Keycloak",
        ),
      },
      {
        key: "scopes",
        type: "text",
        label: t("provider.oauth2.keycloak.scopes.label", "Scopes"),
        description: t(
          "provider.oauth2.keycloak.scopes.description",
          "Comma-separated OAuth2 scopes",
        ),
        defaultValue: "openid, profile, email",
      },
      {
        key: "useAsUsername",
        type: "text",
        label: t(
          "provider.oauth2.keycloak.useAsUsername.label",
          "Use as Username",
        ),
        description: t(
          "provider.oauth2.keycloak.useAsUsername.description",
          "Field to use as username (email, name, given_name, family_name, preferred_username)",
        ),
        defaultValue: "preferred_username",
      },
    ],
  };
};

const useGenericOAuth2Provider = (): Provider => {
  const { t } = useTranslation();

  return {
    id: "oauth2-generic",
    name: t("provider.oauth2.generic.name", "Generic OAuth2"),
    icon: "link-rounded",
    type: "oauth2",
    scope: t("provider.oauth2.generic.scope", "SSO"),
    businessTier: false,
    documentationUrl:
      "https://docs.stirlingpdf.com/Configuration/OAuth%20SSO%20Configuration",
    fields: [
      {
        key: "enabled",
        type: "switch",
        label: t(
          "provider.oauth2.generic.enabled.label",
          "Enable Generic OAuth2",
        ),
        description: t(
          "provider.oauth2.generic.enabled.description",
          "Enable authentication using a custom OAuth2 provider",
        ),
        defaultValue: false,
      },
      {
        key: "provider",
        type: "text",
        label: t("provider.oauth2.generic.provider.label", "Provider Name"),
        description: t(
          "provider.oauth2.generic.provider.description",
          "The name of your OAuth2 provider (e.g., Azure AD, Okta)",
        ),
        placeholder: "azure-ad",
      },
      {
        key: "issuer",
        type: "text",
        label: t("provider.oauth2.generic.issuer.label", "Issuer URL"),
        description: t(
          "provider.oauth2.generic.issuer.description",
          "Provider that supports OpenID Connect Discovery (/.well-known/openid-configuration)",
        ),
        placeholder: "https://login.microsoftonline.com/{tenant-id}/v2.0",
      },
      {
        key: "clientId",
        type: "text",
        label: t("provider.oauth2.generic.clientId.label", "Client ID"),
        description: t(
          "provider.oauth2.generic.clientId.description",
          "The OAuth2 client ID from your provider",
        ),
      },
      {
        key: "clientSecret",
        type: "password",
        label: t("provider.oauth2.generic.clientSecret.label", "Client Secret"),
        description: t(
          "provider.oauth2.generic.clientSecret.description",
          "The OAuth2 client secret from your provider",
        ),
      },
      {
        key: "scopes",
        type: "text",
        label: t("provider.oauth2.generic.scopes.label", "Scopes"),
        description: t(
          "provider.oauth2.generic.scopes.description",
          "Comma-separated OAuth2 scopes",
        ),
        defaultValue: "openid, profile, email",
      },
      {
        key: "useAsUsername",
        type: "text",
        label: t(
          "provider.oauth2.generic.useAsUsername.label",
          "Use as Username",
        ),
        description: t(
          "provider.oauth2.generic.useAsUsername.description",
          "Field to use as username",
        ),
        defaultValue: "email",
      },
      {
        key: "autoCreateUser",
        type: "switch",
        label: t(
          "provider.oauth2.generic.autoCreateUser.label",
          "Auto Create Users",
        ),
        description: t(
          "provider.oauth2.generic.autoCreateUser.description",
          "Automatically create user accounts on first OAuth2 login",
        ),
        defaultValue: true,
      },
      {
        key: "blockRegistration",
        type: "switch",
        label: t(
          "provider.oauth2.generic.blockRegistration.label",
          "Block Registration",
        ),
        description: t(
          "provider.oauth2.generic.blockRegistration.description",
          "Prevent new user registration via OAuth2",
        ),
        defaultValue: false,
      },
    ],
  };
};

const useSMTPProvider = (): Provider => {
  const { t } = useTranslation();

  return {
    id: "smtp",
    name: t("provider.smtp.name", "SMTP Mail"),
    icon: "mail-rounded",
    type: "oauth2",
    scope: t("provider.smtp.scope", "Email Notifications"),
    documentationUrl:
      "https://docs.stirlingpdf.com/Configuration/System%20and%20Security/#email-configuration",
    fields: [
      {
        key: "enabled",
        type: "switch",
        label: t("provider.smtp.enabled.label", "Enable Mail"),
        description: t(
          "provider.smtp.enabled.description",
          "Enable email notifications and SMTP functionality",
        ),
        defaultValue: false,
      },
      {
        key: "host",
        type: "text",
        label: t("provider.smtp.host.label", "SMTP Host"),
        description: t(
          "provider.smtp.host.description",
          "The hostname or IP address of your SMTP server",
        ),
        placeholder: "smtp.example.com",
      },
      {
        key: "port",
        type: "number",
        label: t("provider.smtp.port.label", "SMTP Port"),
        description: t(
          "provider.smtp.port.description",
          "The port number for SMTP connection (typically 25, 465, or 587)",
        ),
        placeholder: "587",
        defaultValue: "587",
      },
      {
        key: "username",
        type: "text",
        label: t("provider.smtp.username.label", "SMTP Username"),
        description: t(
          "provider.smtp.username.description",
          "Username for SMTP authentication",
        ),
      },
      {
        key: "password",
        type: "password",
        label: t("provider.smtp.password.label", "SMTP Password"),
        description: t(
          "provider.smtp.password.description",
          "Password for SMTP authentication",
        ),
      },
      {
        key: "from",
        type: "text",
        label: t("provider.smtp.from.label", "From Address"),
        description: t(
          "provider.smtp.from.description",
          "The email address to use as the sender",
        ),
        placeholder: "noreply@example.com",
      },
    ],
  };
};
const useTelegramProvider = (): Provider => {
  const { t } = useTranslation();

  return {
    id: "telegram",
    name: t("admin.settings.telegram.title", "Telegram Bot"),
    icon: "send-rounded",
    type: "telegram",
    scope: t(
      "admin.settings.telegram.description",
      "Configure Telegram bot connectivity, access controls, and feedback behavior.",
    ),
    fields: [
      {
        key: "enabled",
        type: "switch",
        label: t(
          "admin.settings.telegram.enabled.label",
          "Enable Telegram Bot",
        ),
        description: t(
          "admin.settings.telegram.enabled.description",
          "Allow users to interact with Stirling PDF through your configured Telegram bot.",
        ),
        defaultValue: false,
      },
      {
        key: "botUsername",
        type: "text",
        label: t("admin.settings.telegram.botUsername.label", "Bot Username"),
        description: t(
          "admin.settings.telegram.botUsername.description",
          "The public username of your Telegram bot.",
        ),
        placeholder: "my_pdf_bot",
      },
      {
        key: "botToken",
        type: "password",
        label: t("admin.settings.telegram.botToken.label", "Bot Token"),
        description: t(
          "admin.settings.telegram.botToken.description",
          "API token provided by BotFather for your Telegram bot.",
        ),
        placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
      },
      {
        key: "pipelineInboxFolder",
        type: "text",
        label: t(
          "admin.settings.telegram.pipelineInboxFolder.label",
          "Inbox Folder",
        ),
        description: t(
          "admin.settings.telegram.pipelineInboxFolder.description",
          "Folder under the pipeline directory where incoming Telegram files are stored.",
        ),
        placeholder: "telegram",
      },
      {
        key: "customFolderSuffix",
        type: "switch",
        label: t(
          "admin.settings.telegram.customFolderSuffix.label",
          "Use Custom Folder Suffix",
        ),
        description: t(
          "admin.settings.telegram.customFolderSuffix.description",
          "Append the chat ID to incoming file folders to isolate uploads per chat.",
        ),
        defaultValue: false,
      },
      {
        key: "enableAllowUserIDs",
        type: "switch",
        label: t(
          "admin.settings.telegram.enableAllowUserIDs.label",
          "Allow Specific User IDs",
        ),
        description: t(
          "admin.settings.telegram.enableAllowUserIDs.description",
          "When enabled, only listed user IDs can use the bot.",
        ),
        defaultValue: false,
      },
      {
        key: "allowUserIDs",
        type: "tags",
        label: t(
          "admin.settings.telegram.allowUserIDs.label",
          "Allowed User IDs",
        ),
        description: t(
          "admin.settings.telegram.allowUserIDs.description",
          "Enter Telegram user IDs allowed to interact with the bot.",
        ),
        placeholder: t(
          "admin.settings.telegram.allowUserIDs.placeholder",
          "Add user ID and press enter",
        ),
        defaultValue: [],
      },
      {
        key: "enableAllowChannelIDs",
        type: "switch",
        label: t(
          "admin.settings.telegram.enableAllowChannelIDs.label",
          "Allow Specific Channel IDs",
        ),
        description: t(
          "admin.settings.telegram.enableAllowChannelIDs.description",
          "When enabled, only listed channel IDs can use the bot.",
        ),
        defaultValue: false,
      },
      {
        key: "allowChannelIDs",
        type: "tags",
        label: t(
          "admin.settings.telegram.allowChannelIDs.label",
          "Allowed Channel IDs",
        ),
        description: t(
          "admin.settings.telegram.allowChannelIDs.description",
          "Enter Telegram channel IDs allowed to interact with the bot.",
        ),
        placeholder: t(
          "admin.settings.telegram.allowChannelIDs.placeholder",
          "Add channel ID and press enter",
        ),
        defaultValue: [],
      },
      {
        key: "processingTimeoutSeconds",
        type: "number",
        label: t(
          "admin.settings.telegram.processingTimeoutSeconds.label",
          "Processing Timeout (seconds)",
        ),
        description: t(
          "admin.settings.telegram.processingTimeoutSeconds.description",
          "Maximum time to wait for a processing job before reporting an error.",
        ),
        defaultValue: 180,
      },
      {
        key: "pollingIntervalMillis",
        type: "number",
        label: t(
          "admin.settings.telegram.pollingIntervalMillis.label",
          "Polling Interval (ms)",
        ),
        description: t(
          "admin.settings.telegram.pollingIntervalMillis.description",
          "Interval between checks for new Telegram updates.",
        ),
        defaultValue: 2000,
      },
      {
        key: "feedback.general.enabled",
        type: "switch",
        label: t(
          "admin.settings.telegram.feedback.general.enabled.label",
          "Enable Feedback",
        ),
        description: t(
          "admin.settings.telegram.feedback.general.enabled.description",
          "Control whether the bot sends feedback messages at all.",
        ),
        defaultValue: true,
      },
      {
        key: "feedback.channel.noValidDocument",
        type: "switch",
        label: t(
          "admin.settings.telegram.feedback.channel.noValidDocument.label",
          'Show "No valid document" (Channel)',
        ),
        description: t(
          "admin.settings.telegram.feedback.channel.noValidDocument.description",
          "Suppress the no valid document response for channel uploads.",
        ),
        defaultValue: false,
      },
      {
        key: "feedback.channel.errorProcessing",
        type: "switch",
        label: t(
          "admin.settings.telegram.feedback.channel.errorProcessing.label",
          "Show processing errors (Channel)",
        ),
        description: t(
          "admin.settings.telegram.feedback.channel.errorProcessing.description",
          "Send processing error messages to channels.",
        ),
        defaultValue: false,
      },
      {
        key: "feedback.channel.errorMessage",
        type: "switch",
        label: t(
          "admin.settings.telegram.feedback.channel.errorMessage.label",
          "Show error messages (Channel)",
        ),
        description: t(
          "admin.settings.telegram.feedback.channel.errorMessage.description",
          "Show detailed error messages for channels.",
        ),
        defaultValue: false,
      },
      {
        key: "feedback.user.noValidDocument",
        type: "switch",
        label: t(
          "admin.settings.telegram.feedback.user.noValidDocument.label",
          'Show "No valid document" (User)',
        ),
        description: t(
          "admin.settings.telegram.feedback.user.noValidDocument.description",
          "Suppress the no valid document response for user uploads.",
        ),
        defaultValue: false,
      },
      {
        key: "feedback.user.errorProcessing",
        type: "switch",
        label: t(
          "admin.settings.telegram.feedback.user.errorProcessing.label",
          "Show processing errors (User)",
        ),
        description: t(
          "admin.settings.telegram.feedback.user.errorProcessing.description",
          "Send processing error messages to users.",
        ),
        defaultValue: false,
      },
      {
        key: "feedback.user.errorMessage",
        type: "switch",
        label: t(
          "admin.settings.telegram.feedback.user.errorMessage.label",
          "Show error messages (User)",
        ),
        description: t(
          "admin.settings.telegram.feedback.user.errorMessage.description",
          "Show detailed error messages for users.",
        ),
        defaultValue: false,
      },
    ],
  };
};

const useSAML2Provider = (): Provider => {
  const { t } = useTranslation();

  return {
    id: "saml2",
    name: t("provider.saml2.name", "SAML2"),
    icon: "verified-user-rounded",
    type: "saml2",
    scope: t("provider.saml2.scope", "SSO (SAML)"),
    businessTier: true,
    documentationUrl:
      "https://docs.stirlingpdf.com/Configuration/SAML%20SSO%20Configuration/",
    fields: [
      {
        key: "enabled",
        type: "switch",
        label: t("provider.saml2.enabled.label", "Enable SAML2"),
        description: t(
          "provider.saml2.enabled.description",
          "Enable SAML2 authentication (Enterprise only)",
        ),
        defaultValue: false,
      },
      {
        key: "provider",
        type: "text",
        label: t("provider.saml2.provider.label", "Provider Name"),
        description: t(
          "provider.saml2.provider.description",
          "The name of your SAML2 provider",
        ),
      },
      {
        key: "registrationId",
        type: "text",
        label: t("provider.saml2.registrationId.label", "Registration ID"),
        description: t(
          "provider.saml2.registrationId.description",
          "The name of your Service Provider (SP) app name",
        ),
        defaultValue: "stirling",
      },
      {
        key: "idpMetadataUri",
        type: "text",
        label: t("provider.saml2.idpMetadataUri.label", "IDP Metadata URI"),
        description: t(
          "provider.saml2.idpMetadataUri.description",
          "The URI for your provider's metadata",
        ),
        placeholder:
          "https://dev-XXXXXXXX.okta.com/app/externalKey/sso/saml/metadata",
      },
      {
        key: "idpSingleLoginUrl",
        type: "text",
        label: t(
          "provider.saml2.idpSingleLoginUrl.label",
          "IDP Single Login URL",
        ),
        description: t(
          "provider.saml2.idpSingleLoginUrl.description",
          "The URL for initiating SSO",
        ),
        placeholder:
          "https://dev-XXXXXXXX.okta.com/app/dev-XXXXXXXX_stirlingpdf_1/externalKey/sso/saml",
      },
      {
        key: "idpSingleLogoutUrl",
        type: "text",
        label: t(
          "provider.saml2.idpSingleLogoutUrl.label",
          "IDP Single Logout URL",
        ),
        description: t(
          "provider.saml2.idpSingleLogoutUrl.description",
          "The URL for initiating SLO",
        ),
        placeholder:
          "https://dev-XXXXXXXX.okta.com/app/dev-XXXXXXXX_stirlingpdf_1/externalKey/slo/saml",
      },
      {
        key: "idpIssuer",
        type: "text",
        label: t("provider.saml2.idpIssuer.label", "IDP Issuer"),
        description: t(
          "provider.saml2.idpIssuer.description",
          "The ID of your provider",
        ),
      },
      {
        key: "idpCert",
        type: "text",
        label: t("provider.saml2.idpCert.label", "IDP Certificate"),
        description: t(
          "provider.saml2.idpCert.description",
          "The certificate path (e.g., classpath:okta.cert)",
        ),
        placeholder: "classpath:okta.cert",
      },
      {
        key: "privateKey",
        type: "text",
        label: t("provider.saml2.privateKey.label", "Private Key"),
        description: t(
          "provider.saml2.privateKey.description",
          "Your private key path",
        ),
        placeholder: "classpath:saml-private-key.key",
      },
      {
        key: "spCert",
        type: "text",
        label: t("provider.saml2.spCert.label", "SP Certificate"),
        description: t(
          "provider.saml2.spCert.description",
          "Your signing certificate path",
        ),
        placeholder: "classpath:saml-public-cert.crt",
      },
      {
        key: "autoCreateUser",
        type: "switch",
        label: t("provider.saml2.autoCreateUser.label", "Auto Create Users"),
        description: t(
          "provider.saml2.autoCreateUser.description",
          "Automatically create user accounts on first SAML2 login",
        ),
        defaultValue: true,
      },
      {
        key: "blockRegistration",
        type: "switch",
        label: t(
          "provider.saml2.blockRegistration.label",
          "Block Registration",
        ),
        description: t(
          "provider.saml2.blockRegistration.description",
          "Prevent new user registration via SAML2",
        ),
        defaultValue: false,
      },
    ],
  };
};

const useGoogleDriveProvider = (): Provider => {
  const { t } = useTranslation();

  return {
    id: "googledrive",
    name: t("provider.googledrive.name", "Google Drive"),
    icon: "/images/google-drive.svg",
    type: "googledrive",
    scope: t("provider.googledrive.scope", "File Import"),
    documentationUrl:
      "https://docs.stirlingpdf.com/Configuration/Google%20Drive%20File%20Picker/",
    fields: [
      {
        key: "enabled",
        type: "switch",
        label: t(
          "provider.googledrive.enabled.label",
          "Enable Google Drive File Picker",
        ),
        description: t(
          "provider.googledrive.enabled.description",
          "Allow users to import files directly from Google Drive",
        ),
        defaultValue: false,
      },
      {
        key: "clientId",
        type: "text",
        label: t("provider.googledrive.clientId.label", "Client ID"),
        description: t(
          "provider.googledrive.clientId.description",
          "Google OAuth 2.0 Client ID from Google Cloud Console",
        ),
        placeholder: "xxx.apps.googleusercontent.com",
      },
      {
        key: "apiKey",
        type: "text",
        label: t("provider.googledrive.apiKey.label", "API Key"),
        description: t(
          "provider.googledrive.apiKey.description",
          "Google API Key for Google Picker API from Google Cloud Console",
        ),
        placeholder: "AIza...",
      },
      {
        key: "appId",
        type: "text",
        label: t("provider.googledrive.appId.label", "App ID"),
        description: t(
          "provider.googledrive.appId.description",
          "Google Drive App ID from Google Cloud Console",
        ),
        placeholder: "xxxxxxxxxxxxx",
      },
    ],
  };
};

export const useAllProviders = (): Provider[] => {
  const googleProvider = useGoogleProvider();
  const gitHubProvider = useGitHubProvider();
  const keycloakProvider = useKeycloakProvider();
  const genericOAuth2Provider = useGenericOAuth2Provider();
  const smtpProvider = useSMTPProvider();
  const telegramProvider = useTelegramProvider();
  const saml2Provider = useSAML2Provider();
  const googleDriveProvider = useGoogleDriveProvider();

  return [
    googleProvider,
    gitHubProvider,
    keycloakProvider,
    genericOAuth2Provider,
    saml2Provider,
    smtpProvider,
    telegramProvider,
    googleDriveProvider,
  ];
};
