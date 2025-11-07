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

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
};

type GoogleTokenClient = {
  callback: (response: GoogleTokenResponse) => void;
  requestAccessToken: (options?: { prompt?: string }) => void;
};

type PickerResponseObject = google.picker.ResponseObject;

interface PickerDocument {
  name?: string;
  mimeType?: string;
  lastModified?: number;
  [key: string]: unknown;
}

type DriveFileResponse = {
  body: string;
};

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
  private tokenClient: GoogleTokenClient | null = null;
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
    }) as GoogleTokenClient;

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

      this.tokenClient.callback = (response: GoogleTokenResponse) => {
        if (typeof response.error === 'string') {
          reject(new Error(response.error));
          return;
        }
        if (!response.access_token) {
          reject(new Error('No access token in response'));
          return;
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
        .setCallback((data: PickerResponseObject) => {
          void this.pickerCallback(data, resolve, reject);
        });

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
    data: PickerResponseObject,
    resolve: (files: File[]) => void,
    reject: (error: Error) => void
  ): Promise<void> {
    if (data.action === window.google.picker.Action.PICKED) {
      try {
        const documentKey = window.google.picker.Response.DOCUMENTS;
        const responseData = data as unknown as Record<string, unknown>;
        const documents = responseData[documentKey];
        if (!Array.isArray(documents)) {
          reject(new Error('Picker response missing documents'));
          return;
        }

        const files = await Promise.all(
          (documents as PickerDocument[]).map(async (pickedFile) => {
            const record = pickedFile as PickerDocument;
            const fileIdValue = record[window.google.picker.Document.ID];
            if (typeof fileIdValue !== 'string') {
              throw new Error('Invalid Google Drive file identifier');
            }

            const res = await window.gapi.client.drive.files.get({
              fileId: fileIdValue,
              alt: 'media',
            });
            const driveResponse = res as DriveFileResponse;
            if (typeof driveResponse.body !== 'string') {
              throw new Error('Unexpected Google Drive file response');
            }

            // Convert response body to File object
            const buffer = new Uint8Array(driveResponse.body.length);
            for (let i = 0; i < driveResponse.body.length; i += 1) {
              buffer[i] = driveResponse.body.charCodeAt(i);
            }

            const nameValue = record.name;
            const mimeTypeValue = record.mimeType;
            const lastModifiedValue = record.lastModified;

            return new File(
              [buffer],
              typeof nameValue === 'string' ? nameValue : 'drive-file',
              {
                type: typeof mimeTypeValue === 'string' ? mimeTypeValue : 'application/octet-stream',
                lastModified: typeof lastModifiedValue === 'number' ? lastModifiedValue : Date.now(),
              }
            );
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
