import { invoke } from "@tauri-apps/api/core";

const DISMISSED_KEY = "stirlingpdf_default_app_prompt_dismissed";
const DISMISSED_AT_KEY = "stirlingpdf_default_app_prompt_dismissed_at";
const MONTHLY_REMINDER_SHOWN_KEY = "stirlingpdf_default_app_prompt_monthly_reminder_shown";
const NEVER_REMIND_KEY = "stirlingpdf_default_app_prompt_never_remind";
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

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
      const result = await invoke<boolean>("is_default_pdf_handler");
      return result;
    } catch (error) {
      console.error("[DefaultApp] Failed to check default handler:", error);
      return false;
    }
  },

  /**
   * Set or prompt to set Stirling PDF as default PDF handler
   * Returns a status string indicating what happened
   */
  async setAsDefaultPdfHandler(): Promise<"set_successfully" | "opened_dialog" | "error"> {
    try {
      const result = await invoke<string>("set_as_default_pdf_handler");
      return result as "set_successfully" | "opened_dialog";
    } catch (error) {
      console.error("[DefaultApp] Failed to set default handler:", error);
      return "error";
    }
  },

  /**
   * Check if user has dismissed the default app prompt (machine-specific)
   */
  hasUserDismissedPrompt(): boolean {
    try {
      const dismissed = localStorage.getItem(DISMISSED_KEY);
      return dismissed === "true";
    } catch {
      return false;
    }
  },

  /**
   * Mark that user has dismissed the default app prompt (machine-specific)
   */
  setPromptDismissed(dismissed: boolean): void {
    try {
      localStorage.setItem(DISMISSED_KEY, dismissed ? "true" : "false");
    } catch (error) {
      console.error("[DefaultApp] Failed to save prompt preference:", error);
    }
  },

  hasNeverRemindPreference(): boolean {
    try {
      return localStorage.getItem(NEVER_REMIND_KEY) === "true";
    } catch {
      return false;
    }
  },

  hasMonthlyReminderBeenShown(): boolean {
    try {
      return localStorage.getItem(MONTHLY_REMINDER_SHOWN_KEY) === "true";
    } catch {
      return false;
    }
  },

  getLastDismissedAt(): number | null {
    try {
      const raw = localStorage.getItem(DISMISSED_AT_KEY);
      if (!raw) {
        return null;
      }
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },

  dismissPromptTemporarily(): void {
    try {
      const now = Date.now();
      const lastDismissedAt = this.getLastDismissedAt();
      const monthlyReminderShown = this.hasMonthlyReminderBeenShown();

      this.setPromptDismissed(true);
      localStorage.setItem(DISMISSED_AT_KEY, now.toString());

      if (lastDismissedAt !== null && !monthlyReminderShown && now - lastDismissedAt >= ONE_MONTH_MS) {
        localStorage.setItem(MONTHLY_REMINDER_SHOWN_KEY, "true");
      }
    } catch (error) {
      console.error("[DefaultApp] Failed to dismiss prompt:", error);
    }
  },

  dismissPromptPermanently(): void {
    try {
      this.dismissPromptTemporarily();
      localStorage.setItem(NEVER_REMIND_KEY, "true");
    } catch (error) {
      console.error("[DefaultApp] Failed to permanently dismiss prompt:", error);
    }
  },

  resetPromptPreferences(): void {
    try {
      localStorage.removeItem(DISMISSED_KEY);
      localStorage.removeItem(DISMISSED_AT_KEY);
      localStorage.removeItem(MONTHLY_REMINDER_SHOWN_KEY);
      localStorage.removeItem(NEVER_REMIND_KEY);
    } catch (error) {
      console.error("[DefaultApp] Failed to reset prompt preferences:", error);
    }
  },

  isPromptSuppressed(): boolean {
    return this.hasNeverRemindPreference() || this.hasUserDismissedPrompt();
  },

  /**
   * Check if we should show the default app prompt.
   * Flow:
   * - Always hidden when default handler is already set
   * - Hidden permanently when user chose "Don't remind me again"
   * - After first dismiss, hidden for 30 days
   * - After 30 days, shown once more
   * - After that second dismiss, hidden unless user re-enables in settings
   */
  async shouldShowPrompt(): Promise<boolean> {
    const isDefault = await this.isDefaultPdfHandler();
    if (isDefault) {
      return false;
    }

    if (this.hasNeverRemindPreference()) {
      return false;
    }

    if (!this.hasUserDismissedPrompt()) {
      return true;
    }

    if (this.hasMonthlyReminderBeenShown()) {
      return false;
    }

    const lastDismissedAt = this.getLastDismissedAt();
    if (lastDismissedAt === null) {
      return true;
    }

    return Date.now() - lastDismissedAt >= ONE_MONTH_MS;
  },
};
