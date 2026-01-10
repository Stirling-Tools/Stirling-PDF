import { useTranslation } from 'react-i18next';

export type ProviderType = 'oauth2' | 'saml2' | 'telegram';

export interface ProviderField {
  key: string;
  type: 'text' | 'password' | 'switch' | 'textarea' | 'number' | 'tags';
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
  fields: ProviderField[];
}

export const OAUTH2_PROVIDERS: Provider[] = [
  {
    id: 'google',
    name: 'Google',
    icon: '/Login/google.svg',
    type: 'oauth2',
    scope: 'Sign-in authentication',
    fields: [
      {
        key: 'clientId',
        type: 'text',
        label: 'Client ID',
        description: 'The OAuth2 client ID from Google Cloud Console',
        placeholder: 'your-client-id.apps.googleusercontent.com',
      },
      {
        key: 'clientSecret',
        type: 'password',
        label: 'Client Secret',
        description: 'The OAuth2 client secret from Google Cloud Console',
      },
      {
        key: 'scopes',
        type: 'text',
        label: 'Scopes',
        description: 'Comma-separated OAuth2 scopes',
        defaultValue: 'email, profile',
      },
      {
        key: 'useAsUsername',
        type: 'text',
        label: 'Use as Username',
        description: 'Field to use as username (email, name, given_name, family_name)',
        defaultValue: 'email',
      },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: '/Login/github.svg',
    type: 'oauth2',
    scope: 'Sign-in authentication',
    fields: [
      {
        key: 'clientId',
        type: 'text',
        label: 'Client ID',
        description: 'The OAuth2 client ID from GitHub Developer Settings',
      },
      {
        key: 'clientSecret',
        type: 'password',
        label: 'Client Secret',
        description: 'The OAuth2 client secret from GitHub Developer Settings',
      },
      {
        key: 'scopes',
        type: 'text',
        label: 'Scopes',
        description: 'Comma-separated OAuth2 scopes',
        defaultValue: 'read:user',
      },
      {
        key: 'useAsUsername',
        type: 'text',
        label: 'Use as Username',
        description: 'Field to use as username (email, login, name)',
        defaultValue: 'login',
      },
    ],
  },
  {
    id: 'keycloak',
    name: 'Keycloak',
    icon: 'key-rounded',
    type: 'oauth2',
    scope: 'SSO',
    businessTier: false, // Server tier - OAuth2/OIDC SSO
    fields: [
      {
        key: 'issuer',
        type: 'text',
        label: 'Issuer URL',
        description: "URL of the Keycloak realm's OpenID Connect Discovery endpoint",
        placeholder: 'https://keycloak.example.com/realms/myrealm',
      },
      {
        key: 'clientId',
        type: 'text',
        label: 'Client ID',
        description: 'The OAuth2 client ID from Keycloak',
      },
      {
        key: 'clientSecret',
        type: 'password',
        label: 'Client Secret',
        description: 'The OAuth2 client secret from Keycloak',
      },
      {
        key: 'scopes',
        type: 'text',
        label: 'Scopes',
        description: 'Comma-separated OAuth2 scopes',
        defaultValue: 'openid, profile, email',
      },
      {
        key: 'useAsUsername',
        type: 'text',
        label: 'Use as Username',
        description: 'Field to use as username (email, name, given_name, family_name, preferred_username)',
        defaultValue: 'preferred_username',
      },
    ],
  },
];

export const GENERIC_OAUTH2_PROVIDER: Provider = {
  id: 'oauth2-generic',
  name: 'Generic OAuth2',
  icon: 'link-rounded',
  type: 'oauth2',
  scope: 'SSO',
  businessTier: false, // Server tier - OAuth2/OIDC SSO
  fields: [
    {
      key: 'enabled',
      type: 'switch',
      label: 'Enable Generic OAuth2',
      description: 'Enable authentication using a custom OAuth2 provider',
      defaultValue: false,
    },
    {
      key: 'provider',
      type: 'text',
      label: 'Provider Name',
      description: 'The name of your OAuth2 provider (e.g., Azure AD, Okta)',
      placeholder: 'azure-ad',
    },
    {
      key: 'issuer',
      type: 'text',
      label: 'Issuer URL',
      description: 'Provider that supports OpenID Connect Discovery (/.well-known/openid-configuration)',
      placeholder: 'https://login.microsoftonline.com/{tenant-id}/v2.0',
    },
    {
      key: 'clientId',
      type: 'text',
      label: 'Client ID',
      description: 'The OAuth2 client ID from your provider',
    },
    {
      key: 'clientSecret',
      type: 'password',
      label: 'Client Secret',
      description: 'The OAuth2 client secret from your provider',
    },
    {
      key: 'scopes',
      type: 'text',
      label: 'Scopes',
      description: 'Comma-separated OAuth2 scopes',
      defaultValue: 'openid, profile, email',
    },
    {
      key: 'useAsUsername',
      type: 'text',
      label: 'Use as Username',
      description: 'Field to use as username',
      defaultValue: 'email',
    },
    {
      key: 'autoCreateUser',
      type: 'switch',
      label: 'Auto Create Users',
      description: 'Automatically create user accounts on first OAuth2 login',
      defaultValue: true,
    },
    {
      key: 'blockRegistration',
      type: 'switch',
      label: 'Block Registration',
      description: 'Prevent new user registration via OAuth2',
      defaultValue: false,
    },
  ],
};

export const SMTP_PROVIDER: Provider = {
  id: 'smtp',
  name: 'SMTP Mail',
  icon: 'mail-rounded',
  type: 'oauth2', // Using oauth2 as the base type, but it's really just a generic provider
  scope: 'Email Notifications',
  fields: [
    {
      key: 'enabled',
      type: 'switch',
      label: 'Enable Mail',
      description: 'Enable email notifications and SMTP functionality',
      defaultValue: false,
    },
    {
      key: 'host',
      type: 'text',
      label: 'SMTP Host',
      description: 'The hostname or IP address of your SMTP server',
      placeholder: 'smtp.example.com',
    },
    {
      key: 'port',
      type: 'number',
      label: 'SMTP Port',
      description: 'The port number for SMTP connection (typically 25, 465, or 587)',
      placeholder: '587',
      defaultValue: '587',
    },
    {
      key: 'username',
      type: 'text',
      label: 'SMTP Username',
      description: 'Username for SMTP authentication',
    },
    {
      key: 'password',
      type: 'password',
      label: 'SMTP Password',
      description: 'Password for SMTP authentication',
    },
    {
      key: 'from',
      type: 'text',
      label: 'From Address',
      description: 'The email address to use as the sender',
      placeholder: 'noreply@example.com',
    },
  ],
};
const useTelegramProvider = (): Provider => {
  const { t } = useTranslation();

  return {
    id: 'telegram',
    name: t('admin.settings.telegram.title', 'Telegram Bot'),
    icon: 'send-rounded',
    type: 'telegram',
    scope: t(
      'admin.settings.telegram.description',
      'Configure Telegram bot connectivity, access controls, and feedback behavior.'
    ),
    fields: [
      {
        key: 'enabled',
        type: 'switch',
        label: t('admin.settings.telegram.enabled.label', 'Enable Telegram Bot'),
        description: t(
          'admin.settings.telegram.enabled.description',
          'Allow users to interact with Stirling PDF through your configured Telegram bot.'
        ),
        defaultValue: false,
      },
      {
        key: 'botUsername',
        type: 'text',
        label: t('admin.settings.telegram.botUsername.label', 'Bot Username'),
        description: t(
          'admin.settings.telegram.botUsername.description',
          'The public username of your Telegram bot.'
        ),
        placeholder: 'my_pdf_bot',
      },
      {
        key: 'botToken',
        type: 'password',
        label: t('admin.settings.telegram.botToken.label', 'Bot Token'),
        description: t(
          'admin.settings.telegram.botToken.description',
          'API token provided by BotFather for your Telegram bot.'
        ),
        placeholder: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      },
      {
        key: 'pipelineInboxFolder',
        type: 'text',
        label: t('admin.settings.telegram.pipelineInboxFolder.label', 'Inbox Folder'),
        description: t(
          'admin.settings.telegram.pipelineInboxFolder.description',
          'Folder under the pipeline directory where incoming Telegram files are stored.'
        ),
        placeholder: 'telegram',
      },
      {
        key: 'customFolderSuffix',
        type: 'switch',
        label: t('admin.settings.telegram.customFolderSuffix.label', 'Use Custom Folder Suffix'),
        description: t(
          'admin.settings.telegram.customFolderSuffix.description',
          'Append the chat ID to incoming file folders to isolate uploads per chat.'
        ),
        defaultValue: false,
      },
      {
        key: 'enableAllowUserIDs',
        type: 'switch',
        label: t('admin.settings.telegram.enableAllowUserIDs.label', 'Allow Specific User IDs'),
        description: t(
          'admin.settings.telegram.enableAllowUserIDs.description',
          'When enabled, only listed user IDs can use the bot.'
        ),
        defaultValue: false,
      },
      {
        key: 'allowUserIDs',
        type: 'tags',
        label: t('admin.settings.telegram.allowUserIDs.label', 'Allowed User IDs'),
        description: t(
          'admin.settings.telegram.allowUserIDs.description',
          'Enter Telegram user IDs allowed to interact with the bot.'
        ),
        placeholder: t('admin.settings.telegram.allowUserIDs.placeholder', 'Add user ID and press enter'),
        defaultValue: [],
      },
      {
        key: 'enableAllowChannelIDs',
        type: 'switch',
        label: t('admin.settings.telegram.enableAllowChannelIDs.label', 'Allow Specific Channel IDs'),
        description: t(
          'admin.settings.telegram.enableAllowChannelIDs.description',
          'When enabled, only listed channel IDs can use the bot.'
        ),
        defaultValue: false,
      },
      {
        key: 'allowChannelIDs',
        type: 'tags',
        label: t('admin.settings.telegram.allowChannelIDs.label', 'Allowed Channel IDs'),
        description: t(
          'admin.settings.telegram.allowChannelIDs.description',
          'Enter Telegram channel IDs allowed to interact with the bot.'
        ),
        placeholder: t('admin.settings.telegram.allowChannelIDs.placeholder', 'Add channel ID and press enter'),
        defaultValue: [],
      },
      {
        key: 'processingTimeoutSeconds',
        type: 'number',
        label: t(
          'admin.settings.telegram.processingTimeoutSeconds.label',
          'Processing Timeout (seconds)'
        ),
        description: t(
          'admin.settings.telegram.processingTimeoutSeconds.description',
          'Maximum time to wait for a processing job before reporting an error.'
        ),
        defaultValue: 180,
      },
      {
        key: 'pollingIntervalMillis',
        type: 'number',
        label: t('admin.settings.telegram.pollingIntervalMillis.label', 'Polling Interval (ms)'),
        description: t(
          'admin.settings.telegram.pollingIntervalMillis.description',
          'Interval between checks for new Telegram updates.'
        ),
        defaultValue: 2000,
      },
      {
        key: 'feedback.general.enabled',
        type: 'switch',
        label: t('admin.settings.telegram.feedback.general.enabled.label', 'Enable Feedback'),
        description: t(
          'admin.settings.telegram.feedback.general.enabled.description',
          'Control whether the bot sends feedback messages at all.'
        ),
        defaultValue: true,
      },
      {
        key: 'feedback.channel.noValidDocument',
        type: 'switch',
        label: t(
          'admin.settings.telegram.feedback.channel.noValidDocument.label',
          'Show "No valid document" (Channel)'
        ),
        description: t(
          'admin.settings.telegram.feedback.channel.noValidDocument.description',
          'Suppress the no valid document response for channel uploads.'
        ),
        defaultValue: false,
      },
      {
        key: 'feedback.channel.errorProcessing',
        type: 'switch',
        label: t(
          'admin.settings.telegram.feedback.channel.errorProcessing.label',
          'Show processing errors (Channel)'
        ),
        description: t(
          'admin.settings.telegram.feedback.channel.errorProcessing.description',
          'Send processing error messages to channels.'
        ),
        defaultValue: false,
      },
      {
        key: 'feedback.channel.errorMessage',
        type: 'switch',
        label: t(
          'admin.settings.telegram.feedback.channel.errorMessage.label',
          'Show error messages (Channel)'
        ),
        description: t(
          'admin.settings.telegram.feedback.channel.errorMessage.description',
          'Show detailed error messages for channels.'
        ),
        defaultValue: false,
      },
      {
        key: 'feedback.user.noValidDocument',
        type: 'switch',
        label: t('admin.settings.telegram.feedback.user.noValidDocument.label', 'Show "No valid document" (User)'),
        description: t(
          'admin.settings.telegram.feedback.user.noValidDocument.description',
          'Suppress the no valid document response for user uploads.'
        ),
        defaultValue: false,
      },
      {
        key: 'feedback.user.errorProcessing',
        type: 'switch',
        label: t('admin.settings.telegram.feedback.user.errorProcessing.label', 'Show processing errors (User)'),
        description: t(
          'admin.settings.telegram.feedback.user.errorProcessing.description',
          'Send processing error messages to users.'
        ),
        defaultValue: false,
      },
      {
        key: 'feedback.user.errorMessage',
        type: 'switch',
        label: t('admin.settings.telegram.feedback.user.errorMessage.label', 'Show error messages (User)'),
        description: t(
          'admin.settings.telegram.feedback.user.errorMessage.description',
          'Show detailed error messages for users.'
        ),
        defaultValue: false,
      },
    ],
  };
};

export const SAML2_PROVIDER: Provider = {
  id: 'saml2',
  name: 'SAML2',
  icon: 'verified-user-rounded',
  type: 'saml2',
  scope: 'SSO (SAML)',
  businessTier: true, // Enterprise tier - SAML only
  fields: [
    {
      key: 'enabled',
      type: 'switch',
      label: 'Enable SAML2',
      description: 'Enable SAML2 authentication (Enterprise only)',
      defaultValue: false,
    },
    {
      key: 'provider',
      type: 'text',
      label: 'Provider Name',
      description: 'The name of your SAML2 provider',
    },
    {
      key: 'registrationId',
      type: 'text',
      label: 'Registration ID',
      description: 'The name of your Service Provider (SP) app name',
      defaultValue: 'stirling',
    },
    {
      key: 'idpMetadataUri',
      type: 'text',
      label: 'IDP Metadata URI',
      description: 'The URI for your provider\'s metadata',
      placeholder: 'https://dev-XXXXXXXX.okta.com/app/externalKey/sso/saml/metadata',
    },
    {
      key: 'idpSingleLoginUrl',
      type: 'text',
      label: 'IDP Single Login URL',
      description: 'The URL for initiating SSO',
      placeholder: 'https://dev-XXXXXXXX.okta.com/app/dev-XXXXXXXX_stirlingpdf_1/externalKey/sso/saml',
    },
    {
      key: 'idpSingleLogoutUrl',
      type: 'text',
      label: 'IDP Single Logout URL',
      description: 'The URL for initiating SLO',
      placeholder: 'https://dev-XXXXXXXX.okta.com/app/dev-XXXXXXXX_stirlingpdf_1/externalKey/slo/saml',
    },
    {
      key: 'idpIssuer',
      type: 'text',
      label: 'IDP Issuer',
      description: 'The ID of your provider',
    },
    {
      key: 'idpCert',
      type: 'text',
      label: 'IDP Certificate',
      description: 'The certificate path (e.g., classpath:okta.cert)',
      placeholder: 'classpath:okta.cert',
    },
    {
      key: 'privateKey',
      type: 'text',
      label: 'Private Key',
      description: 'Your private key path',
      placeholder: 'classpath:saml-private-key.key',
    },
    {
      key: 'spCert',
      type: 'text',
      label: 'SP Certificate',
      description: 'Your signing certificate path',
      placeholder: 'classpath:saml-public-cert.crt',
    },
    {
      key: 'autoCreateUser',
      type: 'switch',
      label: 'Auto Create Users',
      description: 'Automatically create user accounts on first SAML2 login',
      defaultValue: true,
    },
    {
      key: 'blockRegistration',
      type: 'switch',
      label: 'Block Registration',
      description: 'Prevent new user registration via SAML2',
      defaultValue: false,
    },
  ],
};

export const useAllProviders = (): Provider[] => {
  const telegramProvider = useTelegramProvider();

  return [
    ...OAUTH2_PROVIDERS,
    GENERIC_OAUTH2_PROVIDER,
    SAML2_PROVIDER,
    SMTP_PROVIDER,
    telegramProvider,
  ];
};
