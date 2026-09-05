/**
 * The settings shapes the merged System page edits, one per admin section it
 * still saves: general, ui, endpoints, storage, policies and mcp.
 *
 * `features` is not among them. Its query key was "features" but it GET the
 * system section and wrote only system.serverCertificate.*, so it folds into
 * the general draft as `serverCertificate` - one hook and one GET fewer.
 */

export interface GeneralSettingsData {
  ui: {
    appNameNavbar?: string;
    languages?: string[];
    logoStyle?: "modern" | "classic";
    hideDisabledTools?: {
      googleDrive?: boolean;
      mobileQRScanner?: boolean;
    };
  };
  system: {
    defaultLocale?: string;
    showUpdate?: boolean;
    showUpdateOnlyAdmin?: boolean;
    customHTMLFiles?: boolean;
    fileUploadLimit?: string;
    frontendUrl?: string;
  };
  serverCertificate?: {
    enabled?: boolean;
    organizationName?: string;
    validity?: number;
    regenerateOnStartup?: boolean;
  };
  customPaths?: {
    pipeline?: {
      pipelineDir?: string;
      watchedFoldersDir?: string;
      watchedFoldersDirs?: string[];
      finishedFoldersDir?: string;
    };
    operations?: {
      weasyprint?: string;
      unoconvert?: string;
    };
  };
  customMetadata?: {
    autoUpdateMetadata?: boolean;
    author?: string;
    creator?: string;
    producer?: string;
  };
}

/** The `ui` section's user-preference defaults, saved on their own key. */
export interface UiDefaultsSettingsData {
  defaultHideUnavailableTools?: boolean;
  defaultHideUnavailableConversions?: boolean;
}

export interface EndpointsSettingsData {
  toRemove?: string[];
  groupsToRemove?: string[];
}

export interface StorageSharingSettingsData {
  enabled?: boolean;
  sharing?: {
    enabled?: boolean;
    linkEnabled?: boolean;
    emailEnabled?: boolean;
  };
  signing?: {
    enabled?: boolean;
  };
  system?: {
    frontendUrl?: string;
  };
  mail?: {
    enabled?: boolean;
  };
}

/** Folder roots live in the `policies` section, not a folderAccess one. */
export interface FolderAccessSettingsData {
  allowedFolderRoots?: string[];
}

export interface ImpliedFolderRoot {
  path: string;
  reason: string;
}

export interface McpAuthData {
  mode?: string;
  issuerUri?: string;
  jwksUri?: string;
  resourceId?: string;
  acceptedAudiences?: string[];
  usernameClaim?: string;
  requireExistingAccount?: boolean;
}

export interface McpSettingsData {
  enabled?: boolean;
  scopesEnabled?: boolean;
  allowedOperations?: string[];
  blockedOperations?: string[];
  auth?: McpAuthData;
}
