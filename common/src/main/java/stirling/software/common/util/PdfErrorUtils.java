package stirling.software.common.util;

import java.io.IOException;

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
     * Creates a user-friendly error message for corrupted PDF files.
     * 
     * @param context additional context about where the error occurred (e.g., "during merge", "during processing")
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
     * Creates a user-friendly error message for multiple corrupted PDF files (e.g., during merge).
     * 
     * @return a user-friendly error message for multiple file operations
     */
    public static String getCorruptedPdfMessageForMultipleFiles() {
        return "One or more PDF files appear to be corrupted or damaged. " +
            "Please try using the 'Repair PDF' feature on each file first before attempting to merge them.";
    }
}