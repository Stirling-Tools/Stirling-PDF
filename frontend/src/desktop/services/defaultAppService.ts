import { invoke } from '@tauri-apps/api/core';

/**
 * Service for managing default PDF handler settings
 * Note: Uses localStorage for machine-specific preferences (not synced to server)
 */
export const defaultAppService = {
  /**
   * Check if Stirling PDF is the default PDF handler
   */
  async isDefaultPdfHandler(): Promise<boolean> {
    try {
      const result = await invoke<boolean>('is_default_pdf_handler');
      return result;
    } catch (error) {
      console.error('[DefaultApp] Failed to check default handler:', error);
      return false;
    }
  },

  /**
   * Set or prompt to set Stirling PDF as default PDF handler
   * Returns a status string indicating what happened
   */
  async setAsDefaultPdfHandler(): Promise<'set_successfully' | 'opened_settings' | 'error'> {
    try {
      const result = await invoke<string>('set_as_default_pdf_handler');
      return result as 'set_successfully' | 'opened_settings';
    } catch (error) {
      console.error('[DefaultApp] Failed to set default handler:', error);
      return 'error';
    }
  },

  /**
   * Check if user has dismissed the default app prompt (machine-specific)
   */
  hasUserDismissedPrompt(): boolean {
    try {
      const dismissed = localStorage.getItem('stirlingpdf_default_app_prompt_dismissed');
      return dismissed === 'true';
    } catch {
      return false;
    }
  },

  /**
   * Mark that user has dismissed the default app prompt (machine-specific)
   */
  setPromptDismissed(dismissed: boolean): void {
    try {
      localStorage.setItem('stirlingpdf_default_app_prompt_dismissed', dismissed ? 'true' : 'false');
    } catch (error) {
      console.error('[DefaultApp] Failed to save prompt preference:', error);
    }
  },

  /**
   * Check if we should show the default app prompt
   * Returns true if: user hasn't dismissed it AND app is not default handler
   */
  async shouldShowPrompt(): Promise<boolean> {
    if (this.hasUserDismissedPrompt()) {
      return false;
    }

    const isDefault = await this.isDefaultPdfHandler();
    return !isDefault;
  },
};
