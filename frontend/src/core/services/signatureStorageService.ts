import apiClient from '@app/services/apiClient';
import type { SavedSignature } from '@app/hooks/tools/sign/useSavedSignatures';

export type StorageType = 'backend' | 'localStorage';

interface SignatureStorageCapabilities {
  supportsBackend: boolean;
  storageType: StorageType;
}

/**
 * Service to handle signature storage with adaptive backend/localStorage fallback
 */
class SignatureStorageService {
  private capabilities: SignatureStorageCapabilities | null = null;
  private detectionPromise: Promise<SignatureStorageCapabilities> | null = null;
  private blobUrls: Set<string> = new Set();

  /**
   * Detect if backend supports signature storage API
   */
  async detectCapabilities(): Promise<SignatureStorageCapabilities> {
    // Return cached result if already detected
    if (this.capabilities) {
      return this.capabilities;
    }

    // Return in-flight detection if already running
    if (this.detectionPromise) {
      return this.detectionPromise;
    }

    // Start new detection
    this.detectionPromise = this._performDetection();
    this.capabilities = await this.detectionPromise;
    this.detectionPromise = null;

    return this.capabilities;
  }

  private async _performDetection(): Promise<SignatureStorageCapabilities> {
    try {
      // Probe the proprietary signatures endpoint (requires authentication)
      await apiClient.get('/api/v1/proprietary/signatures', {
        timeout: 3000,
      });

      // 200 = Backend available and accessible (authenticated)
      console.log('[SignatureStorage] Backend signature API detected and accessible (authenticated)');
      return {
        supportsBackend: true,
        storageType: 'backend',
      };
    } catch (error: any) {
      // Check if it's an HTTP error with status code
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        // Backend exists but needs auth - gracefully fall back to localStorage
        console.log('[SignatureStorage] Backend signature API requires authentication, using localStorage');
      } else if (error?.response?.status === 404) {
        // Endpoint doesn't exist (not running proprietary mode)
        console.log('[SignatureStorage] Backend signature API not available (not in proprietary mode), using localStorage');
      } else {
        // Network error, timeout, or other error
        console.log('[SignatureStorage] Backend signature API not available, using localStorage');
      }

      return {
        supportsBackend: false,
        storageType: 'localStorage',
      };
    }
  }

  /**
   * Get current storage type
   */
  async getStorageType(): Promise<StorageType> {
    const capabilities = await this.detectCapabilities();
    return capabilities.storageType;
  }

  /**
   * Load all signatures
   */
  async loadSignatures(): Promise<SavedSignature[]> {
    // Clean up old blob URLs before loading new ones
    this.cleanup();

    const capabilities = await this.detectCapabilities();

    if (capabilities.supportsBackend) {
      return this._loadFromBackend();
    } else {
      return this._loadFromLocalStorage();
    }
  }

  /**
   * Save a signature
   */
  async saveSignature(signature: SavedSignature): Promise<void> {
    const capabilities = await this.detectCapabilities();

    if (capabilities.supportsBackend && signature.scope !== 'localStorage') {
      await this._saveToBackend(signature);
    } else {
      // Force scope to localStorage for browser storage
      signature.scope = 'localStorage';
      this._saveToLocalStorage(signature);
    }
  }

  /**
   * Delete a signature
   */
  async deleteSignature(id: string): Promise<void> {
    const capabilities = await this.detectCapabilities();

    if (capabilities.supportsBackend) {
      await this._deleteFromBackend(id);
    } else {
      this._deleteFromLocalStorage(id);
    }
  }

  /**
   * Update signature label
   */
  async updateSignatureLabel(id: string, label: string): Promise<void> {
    const capabilities = await this.detectCapabilities();

    if (capabilities.supportsBackend) {
      await this._updateLabelInBackend(id, label);
    } else {
      this._updateLabelInLocalStorage(id, label);
    }
  }

  // Backend methods
  private async _loadFromBackend(): Promise<SavedSignature[]> {
    try {
      const response = await apiClient.get<SavedSignature[]>('/api/v1/proprietary/signatures');
      const signatures = response.data;

      // Fetch image data for each signature and convert to data URLs
      const signaturePromises = signatures.map(async (sig) => {
        if (sig.dataUrl && sig.dataUrl.startsWith('/api/v1/general/signatures/')) {
          try {
            // Fetch image via apiClient (unified endpoint works for both authenticated and unauthenticated)
            const imageResponse = await apiClient.get<ArrayBuffer>(sig.dataUrl, {
              responseType: 'arraybuffer',
            });

            // Convert to data URL (base64) for both display and use
            const blob = new Blob([imageResponse.data], {
              type: imageResponse.headers['content-type'] || 'image/png',
            });

            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });

            // Use data URL for everything - more reliable than blob URLs
            return { ...sig, dataUrl };
          } catch (error) {
            console.error(`[SignatureStorage] Failed to load image for ${sig.id}:`, error);
            return sig; // Return original if image fetch fails
          }
        }
        return sig;
      });

      return await Promise.all(signaturePromises);
    } catch (error) {
      console.error('[SignatureStorage] Failed to load from backend:', error);
      return [];
    }
  }

  private async _saveToBackend(signature: SavedSignature): Promise<void> {
    await apiClient.post('/api/v1/proprietary/signatures', signature);
  }

  private async _deleteFromBackend(id: string): Promise<void> {
    await apiClient.delete(`/api/v1/proprietary/signatures/${id}`);
  }

  private async _updateLabelInBackend(id: string, label: string): Promise<void> {
    await apiClient.post(`/api/v1/proprietary/signatures/${id}/label`, { label });
  }

  // LocalStorage methods
  private readonly STORAGE_KEY = 'stirling:saved-signatures:v1';

  private _loadFromLocalStorage(): SavedSignature[] {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return [];
      const signatures = JSON.parse(raw);
      // Ensure all localStorage signatures have the correct scope
      return signatures.map((sig: SavedSignature) => ({
        ...sig,
        scope: 'localStorage' as const,
      }));
    } catch {
      return [];
    }
  }

  private _saveToLocalStorage(signature: SavedSignature): void {
    const signatures = this._loadFromLocalStorage();
    const index = signatures.findIndex(s => s.id === signature.id);

    if (index >= 0) {
      signatures[index] = signature;
    } else {
      signatures.unshift(signature);
    }

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(signatures));
  }

  private _deleteFromLocalStorage(id: string): void {
    const signatures = this._loadFromLocalStorage();
    const filtered = signatures.filter(s => s.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
  }

  private _updateLabelInLocalStorage(id: string, label: string): void {
    const signatures = this._loadFromLocalStorage();
    const signature = signatures.find(s => s.id === id);
    if (signature) {
      signature.label = label;
      signature.updatedAt = Date.now();
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(signatures));
    }
  }

  /**
   * Migrate signatures from localStorage to backend
   */
  async migrateToBackend(): Promise<{ migrated: number; failed: number }> {
    const capabilities = await this.detectCapabilities();

    if (!capabilities.supportsBackend) {
      return { migrated: 0, failed: 0 };
    }

    const localSignatures = this._loadFromLocalStorage();
    if (localSignatures.length === 0) {
      return { migrated: 0, failed: 0 };
    }

    let migrated = 0;
    let failed = 0;

    for (const signature of localSignatures) {
      try {
        await this._saveToBackend(signature);
        migrated++;
      } catch (error) {
        console.error(`[SignatureStorage] Failed to migrate signature ${signature.id}:`, error);
        failed++;
      }
    }

    // Clear localStorage after successful migration
    if (migrated > 0 && failed === 0) {
      localStorage.removeItem(this.STORAGE_KEY);
      console.log(`[SignatureStorage] Successfully migrated ${migrated} signatures to backend`);
    }

    return { migrated, failed };
  }

  /**
   * Clean up blob URLs to prevent memory leaks
   */
  cleanup(): void {
    this.blobUrls.forEach(url => {
      URL.revokeObjectURL(url);
    });
    this.blobUrls.clear();
  }
}

export const signatureStorageService = new SignatureStorageService();
