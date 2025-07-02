package stirling.software.common.util;

import java.io.IOException;

/** Utility class for detecting and handling PDF-related errors. */
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
        return message.contains("Missing root object specification")
                || message.contains("Header doesn't contain versioninfo")
                || message.contains("Expected trailer")
                || message.contains("Invalid PDF")
                || message.contains("Corrupted")
                || message.contains("damaged")
                || message.contains("Unknown dir object")
                || message.contains("Can't dereference COSObject")
                || message.contains("AES initialization vector not fully read")
                || message.contains("BadPaddingException")
                || message.contains("Given final block not properly padded");
    }
}
