/**
 * Async translation utility with timeout and English fallback.
 * Fetches translations on-demand from API with brief loading state.
 */
window.MessageFormatter = (function() {
  'use strict';

  /**
   * Translate error message with async API call and fallback to English.
   * Shows brief loading, attempts translation, falls back to English on timeout/error.
   * 
   * @param {string} translationKey - The translation key
   * @param {Array} translationArgs - Arguments for message formatting  
   * @param {string} fallbackMessage - English fallback message
   * @param {number} timeout - Timeout in milliseconds (default: 500ms)
   * @returns {Promise<string>} - Translated message or English fallback
   */
  async function translateAsync(translationKey, translationArgs, fallbackMessage, timeout = 500) {
    if (!translationKey) {
      return fallbackMessage;
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const params = new URLSearchParams({ key: translationKey });
      if (translationArgs && translationArgs.length > 0) {
        params.append('args', translationArgs.join(','));
      }
      
      const response = await fetch(`${window.stirlingPDF.translationApiUrl}?${params}`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Translation API returned ${response.status}`);
      }
      
      return await response.text();
    } catch (error) {
      clearTimeout(timeoutId);
      console.debug('Translation failed, using English fallback:', error.message);
      return fallbackMessage;
    }
  }

  return { translateAsync };
})();