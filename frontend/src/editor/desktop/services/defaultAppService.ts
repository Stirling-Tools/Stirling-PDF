import { invoke } from "@tauri-apps/api/core";

/** Service for managing default PDF handler settings */
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
  async setAsDefaultPdfHandler(): Promise<
    "set_successfully" | "opened_dialog" | "error"
  > {
    try {
      const result = await invoke<string>("set_as_default_pdf_handler");
      return result as "set_successfully" | "opened_dialog";
    } catch (error) {
      console.error("[DefaultApp] Failed to set default handler:", error);
      return "error";
    }
  },
};
