package stirling.software.common.util;

import java.io.IOException;

import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;

/**
 * Utility class for detecting and handling PDF-related errors.
 */
public class PdfErrorUtils {
    
    /**
     * Checks if an IOException indicates a corrupted PDF file.
     * 
     * @param e the IOException to check
     * @return true if the error indicates PDF corruption, false otherwise
     */
    public static boolean isCorruptedPdfError(IOException e) {
        String message = e.getMessage();
        if (message == null) return false;
        
        // Check for common corruption indicators
        return message.contains("Missing root object specification") ||
               message.contains("Header doesn't contain versioninfo") ||
               message.contains("Expected trailer") ||
               message.contains("Invalid PDF") ||
               message.contains("Corrupted") ||
               message.contains("damaged") ||
               message.contains("Unknown dir object") ||
               message.contains("Can't dereference COSObject") ||
               message.contains("AES initialization vector not fully read") ||
               message.contains("BadPaddingException") ||
               message.contains("Given final block not properly padded");
    }
    
    /**
     * Creates a user-friendly error message for corrupted PDF files using i18n.
     * 
     * @param messageSource the Spring MessageSource for i18n
     * @return a user-friendly error message
     * @deprecated Use ExceptionUtils.createPdfCorruptedException() instead
     */
    @Deprecated
    public static String getCorruptedPdfMessage(MessageSource messageSource) {
        return I18nUtils.getMessage("error.pdfCorrupted", 
            "PDF file appears to be corrupted or damaged. Please try using the 'Repair PDF' feature first to fix the file before proceeding with this operation.");
    }
    
    /**
     * Creates a user-friendly error message for corrupted PDF files with context using i18n.
     * 
     * @param messageSource the Spring MessageSource for i18n
     * @param context additional context about where the error occurred (e.g., "during merge", "during processing")
     * @return a user-friendly error message
     * @deprecated Use ExceptionUtils.createPdfCorruptedException(context, cause) instead
     */
    @Deprecated
    public static String getCorruptedPdfMessage(MessageSource messageSource, String context) {
        if (context != null && !context.isEmpty()) {
            return I18nUtils.getMessage("error.pdfCorruptedDuring", 
                "Error {0}: PDF file appears to be corrupted or damaged. Please try using the 'Repair PDF' feature first to fix the file before proceeding with this operation.",
                context);
        }
        return getCorruptedPdfMessage(messageSource);
    }
    
    /**
     * Creates a user-friendly error message for multiple corrupted PDF files (e.g., during merge) using i18n.
     * 
     * @param messageSource the Spring MessageSource for i18n
     * @return a user-friendly error message for multiple file operations
     * @deprecated Use ExceptionUtils.createMultiplePdfCorruptedException() instead
     */
    @Deprecated
    public static String getCorruptedPdfMessageForMultipleFiles(MessageSource messageSource) {
        return I18nUtils.getMessage("error.pdfCorruptedMultiple",
            "One or more PDF files appear to be corrupted or damaged. Please try using the 'Repair PDF' feature on each file first before attempting to merge them.");
    }
    
    // Fallback methods for backwards compatibility (when MessageSource is not available)
    /**
     * Creates a user-friendly error message for corrupted PDF files (fallback).
     * 
     * @param context additional context about where the error occurred
     * @return a user-friendly error message
     */
    public static String getCorruptedPdfMessage(String context) {
        String baseMessage = "PDF file appears to be corrupted or damaged. " +
            "Please try using the 'Repair PDF' feature first to fix the file before proceeding with this operation.";
            
        if (context != null && !context.isEmpty()) {
            return "Error " + context + ": " + baseMessage;
        }
        return baseMessage;
    }
    
    /**
     * Creates a user-friendly error message for multiple corrupted PDF files (fallback).
     * 
     * @return a user-friendly error message for multiple file operations
     */
    public static String getCorruptedPdfMessageForMultipleFiles() {
        return "One or more PDF files appear to be corrupted or damaged. " +
            "Please try using the 'Repair PDF' feature on each file first before attempting to merge them.";
    }
}