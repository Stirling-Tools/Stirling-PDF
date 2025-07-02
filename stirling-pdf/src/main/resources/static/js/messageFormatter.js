/**
 * Utility for formatting internationalized messages with placeholder replacement.
 * Supports the {0}, {1}, {2}... placeholder format used by Java MessageFormat.
 */
window.MessageFormatter = (function() {
  'use strict';

  /**
   * Format a message template by replacing {0}, {1}, etc. placeholders with provided arguments.
   * 
   * @param {string} template - The message template with {0}, {1}, etc. placeholders
   * @param {Array|string} args - Arguments to replace placeholders with. Can be array or individual arguments
   * @returns {string} The formatted message with placeholders replaced
   * 
   * @example
   * formatMessage("Hello {0}, you have {1} messages", ["John", 5])
   * // Returns: "Hello John, you have 5 messages"
   * 
   * formatMessage("Error {0}: {1}", "404", "Not Found") 
   * // Returns: "Error 404: Not Found"
   */
  function formatMessage(template, ...args) {
    if (!template || typeof template !== 'string') {
      return template || '';
    }

    // Handle case where first argument is an array
    const argumentArray = Array.isArray(args[0]) ? args[0] : args;
    
    // Replace {0}, {1}, {2}, etc. with corresponding arguments
    return template.replace(/\{(\d+)\}/g, function(match, index) {
      const argIndex = parseInt(index, 10);
      return argumentArray[argIndex] !== undefined && argumentArray[argIndex] !== null 
        ? String(argumentArray[argIndex]) 
        : match; // Keep original placeholder if no argument provided
    });
  }

  /**
   * Translate and format an error message using the global translation object.
   * Falls back to the provided fallback message if translation not found.
   * 
   * @param {string} translationKey - The translation key (e.g., "error.dpiExceedsLimit")
   * @param {Array} translationArgs - Arguments for placeholder replacement
   * @param {string} fallbackMessage - Fallback message if translation not found
   * @returns {string} The translated and formatted message
   */
  function translateAndFormat(translationKey, translationArgs, fallbackMessage) {
    if (!window.stirlingPDF || !window.stirlingPDF.translations) {
      return fallbackMessage || translationKey;
    }

    const template = window.stirlingPDF.translations[translationKey];
    if (!template) {
      return fallbackMessage || translationKey;
    }

    return formatMessage(template, translationArgs || []);
  }

  // Public API
  return {
    format: formatMessage,
    translate: translateAndFormat
  };
})();