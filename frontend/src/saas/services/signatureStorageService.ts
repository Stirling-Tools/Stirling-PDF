import type { SavedSignature } from "@app/hooks/tools/sign/useSavedSignatures";

export type StorageType = "backend" | "localStorage";

interface SignatureStorageCapabilities {
  supportsBackend: boolean;
  storageType: StorageType;
}

/**
 * SaaS-specific signature storage service that always uses localStorage.
 *
 * In SaaS mode, the proprietary backend signature API is not available
 * (requires Spring Security JWT, not Supabase JWT), so we skip detection
 * and force localStorage-only mode to avoid unnecessary 401/403 errors.
 */
class SignatureStorageService {
  private capabilities: SignatureStorageCapabilities | null = null;
  private blobUrls: Set<string> = new Set();
  private readonly STORAGE_KEY = "stirling:saved-signatures:v1";

  /**
   * Detect capabilities - in SaaS mode, always returns localStorage
   */
  async detectCapabilities(): Promise<SignatureStorageCapabilities> {
    if (this.capabilities) {
      return this.capabilities;
    }

    // SaaS mode always uses localStorage (no backend signature API available)
    console.log(
      "[SignatureStorage] SaaS mode - using localStorage (backend not available)",
    );
    this.capabilities = {
      supportsBackend: false,
      storageType: "localStorage",
    };

    return this.capabilities;
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

    // Always use localStorage in SaaS mode
    return this._loadFromLocalStorage();
  }

  /**
   * Save a signature
   */
  async saveSignature(signature: SavedSignature): Promise<void> {
    // Force scope to localStorage for SaaS mode
    signature.scope = "localStorage";
    this._saveToLocalStorage(signature);
  }

  /**
   * Delete a signature
   */
  async deleteSignature(id: string): Promise<void> {
    this._deleteFromLocalStorage(id);
  }

  /**
   * Update signature label
   */
  async updateSignatureLabel(id: string, label: string): Promise<void> {
    this._updateLabelInLocalStorage(id, label);
  }

  // LocalStorage methods
  private _loadFromLocalStorage(): SavedSignature[] {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return [];
      const signatures = JSON.parse(raw);
      // Ensure all localStorage signatures have the correct scope
      return signatures.map((sig: SavedSignature) => ({
        ...sig,
        scope: "localStorage" as const,
      }));
    } catch {
      return [];
    }
  }

  private _saveToLocalStorage(signature: SavedSignature): void {
    const signatures = this._loadFromLocalStorage();
    const index = signatures.findIndex((s) => s.id === signature.id);

    if (index >= 0) {
      signatures[index] = signature;
    } else {
      signatures.unshift(signature);
    }

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(signatures));
  }

  private _deleteFromLocalStorage(id: string): void {
    const signatures = this._loadFromLocalStorage();
    const filtered = signatures.filter((s) => s.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
  }

  private _updateLabelInLocalStorage(id: string, label: string): void {
    const signatures = this._loadFromLocalStorage();
    const signature = signatures.find((s) => s.id === id);
    if (signature) {
      signature.label = label;
      signature.updatedAt = Date.now();
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(signatures));
    }
  }

  /**
   * Migrate signatures from localStorage to backend
   * In SaaS mode, this is a no-op since we don't support backend storage
   */
  async migrateToBackend(): Promise<{ migrated: number; failed: number }> {
    console.log("[SignatureStorage] Migration not supported in SaaS mode");
    return { migrated: 0, failed: 0 };
  }

  /**
   * Clean up blob URLs to prevent memory leaks
   */
  cleanup(): void {
    this.blobUrls.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    this.blobUrls.clear();
  }
}

export const signatureStorageService = new SignatureStorageService();
