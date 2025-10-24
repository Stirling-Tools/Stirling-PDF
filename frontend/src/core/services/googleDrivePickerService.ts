/**
 * Google Drive Picker Service
 * Handles Google Drive file picker integration
 */

import { loadScript } from '@app/utils/scriptLoader';

const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
const SESSION_STORAGE_ID = 'googleDrivePickerAccessToken';

interface GoogleDriveConfig {
  clientId: string;
  apiKey: string;
  appId: string;
}

interface PickerOptions {
  multiple?: boolean;
  mimeTypes?: string | null;
}

// Expandable mime types for Google Picker
const expandableMimeTypes: Record<string, string[]> = {
  'image/*': ['image/jpeg', 'image/png', 'image/svg+xml'],
};

/**
 * Convert file input accept attribute to Google Picker mime types
 */
function fileInputToGooglePickerMimeTypes(accept?: string): string | null {
  if (!accept || accept === '' || accept.includes('*/*')) {
    // Setting null will accept all supported mimetypes
    return null;
  }

  const mimeTypes: string[] = [];
  accept.split(',').forEach((part) => {
    const trimmedPart = part.trim();
    if (!(trimmedPart in expandableMimeTypes)) {
      mimeTypes.push(trimmedPart);
      return;
    }

    expandableMimeTypes[trimmedPart].forEach((mimeType) => {
      mimeTypes.push(mimeType);
    });
  });

  return mimeTypes.join(',').replace(/\s+/g, '');
}

class GoogleDrivePickerService {
  private config: GoogleDriveConfig | null = null;
  private tokenClient: any = null;
  private accessToken: string | null = null;
  private gapiLoaded = false;
  private gisLoaded = false;

  constructor() {
    this.accessToken = sessionStorage.getItem(SESSION_STORAGE_ID);
  }

  /**
   * Initialize the service with credentials
   */
  async initialize(config: GoogleDriveConfig): Promise<void> {
    this.config = config;

    // Load Google APIs
    await Promise.all([
      this.loadGapi(),
      this.loadGis(),
    ]);
  }

  /**
   * Load Google API client
   */
  private async loadGapi(): Promise<void> {
    if (this.gapiLoaded) return;

    await loadScript({
      src: 'https://apis.google.com/js/api.js',
      id: 'gapi-script',
    });

    return new Promise((resolve) => {
      window.gapi.load('client:picker', async () => {
        await window.gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
        this.gapiLoaded = true;
        resolve();
      });
    });
  }

  /**
   * Load Google Identity Services
   */
  private async loadGis(): Promise<void> {
    if (this.gisLoaded) return;

    await loadScript({
      src: 'https://accounts.google.com/gsi/client',
      id: 'gis-script',
    });

    if (!this.config) {
      throw new Error('Google Drive config not initialized');
    }

    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: this.config.clientId,
      scope: SCOPES,
      callback: () => {}, // Will be overridden during picker creation
    });

    this.gisLoaded = true;
  }

  /**
   * Open the Google Drive picker
   */
  async openPicker(options: PickerOptions = {}): Promise<File[]> {
    if (!this.config) {
      throw new Error('Google Drive service not initialized');
    }

    // Request access token
    await this.requestAccessToken();

    // Create and show picker
    return this.createPicker(options);
  }

  /**
   * Request access token from Google
   */
  private requestAccessToken(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.tokenClient) {
        reject(new Error('Token client not initialized'));
        return;
      }

      this.tokenClient.callback = (response: any) => {
        if (response.error !== undefined) {
          reject(new Error(response.error));
          return;
        }
        if(response.access_token == null){
          reject(new Error("No acces token in response"));
        }

        this.accessToken = response.access_token;
        sessionStorage.setItem(SESSION_STORAGE_ID, this.accessToken ?? "");
        resolve();
      };

      this.tokenClient.requestAccessToken({
        prompt: this.accessToken === null ? 'consent' : '',
      });
    });
  }

  /**
   * Create and display the Google Picker
   */
  private createPicker(options: PickerOptions): Promise<File[]> {
    return new Promise((resolve, reject) => {
      if (!this.config || !this.accessToken) {
        reject(new Error('Not initialized or no access token'));
        return;
      }

      const mimeTypes = fileInputToGooglePickerMimeTypes(options.mimeTypes || undefined);

      const view1 = new window.google.picker.DocsView().setIncludeFolders(true);
      if (mimeTypes !== null) {
        view1.setMimeTypes(mimeTypes);
      }

      const view2 = new window.google.picker.DocsView()
        .setIncludeFolders(true)
        .setEnableDrives(true);
      if (mimeTypes !== null) {
        view2.setMimeTypes(mimeTypes);
      }

      const builder = new window.google.picker.PickerBuilder()
        .setDeveloperKey(this.config.apiKey)
        .setAppId(this.config.appId)
        .setOAuthToken(this.accessToken)
        .addView(view1)
        .addView(view2)
        .setCallback((data: any) => this.pickerCallback(data, resolve, reject));

      if (options.multiple) {
        builder.enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED);
      }

      const picker = builder.build();
      picker.setVisible(true);
    });
  }

  /**
   * Handle picker selection callback
   */
  private async pickerCallback(
    data: any,
    resolve: (files: File[]) => void,
    reject: (error: Error) => void
  ): Promise<void> {
    if (data.action === window.google.picker.Action.PICKED) {
      try {
        const files = await Promise.all(
          data[window.google.picker.Response.DOCUMENTS].map(async (pickedFile: any) => {
            const fileId = pickedFile[window.google.picker.Document.ID];
            const res = await window.gapi.client.drive.files.get({
              fileId: fileId,
              alt: 'media',
            });

            // Convert response body to File object
            const file = new File(
              [new Uint8Array(res.body.length).map((_: any, i: number) => res.body.charCodeAt(i))],
              pickedFile.name,
              {
                type: pickedFile.mimeType,
                lastModified: pickedFile.lastModified,
              }
            );
            return file;
          })
        );

        resolve(files);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Failed to download files'));
      }
    } else if (data.action === window.google.picker.Action.CANCEL) {
      resolve([]); // User cancelled, return empty array
    }
  }

  /**
   * Sign out and revoke access token
   */
  signOut(): void {
    if (this.accessToken) {
      sessionStorage.removeItem(SESSION_STORAGE_ID);
      window.google?.accounts.oauth2.revoke(this.accessToken, () => {});
      this.accessToken = null;
    }
  }
}

// Singleton instance
let serviceInstance: GoogleDrivePickerService | null = null;

/**
 * Get or create the Google Drive picker service instance
 */
export function getGoogleDrivePickerService(): GoogleDrivePickerService {
  if (!serviceInstance) {
    serviceInstance = new GoogleDrivePickerService();
  }
  return serviceInstance;
}

/**
 * Check if Google Drive credentials are configured
 */
export function isGoogleDriveConfigured(): boolean {
  const clientId = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID;
  const apiKey = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY;
  const appId = import.meta.env.VITE_GOOGLE_DRIVE_APP_ID;

  return !!(clientId && apiKey && appId);
}

/**
 * Get Google Drive configuration from environment variables
 */
export function getGoogleDriveConfig(): GoogleDriveConfig | null {
  if (!isGoogleDriveConfigured()) {
    return null;
  }

  return {
    clientId: import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID,
    apiKey: import.meta.env.VITE_GOOGLE_DRIVE_API_KEY,
    appId: import.meta.env.VITE_GOOGLE_DRIVE_APP_ID,
  };
}
