package stirling.software.common.util;

import java.io.IOException;

/** Utility class for detecting and handling PDF-related errors. */
public class PdfErrorUtils {

    /** Bounds the cause walk so a self-referencing or cyclic chain cannot spin. */
    private static final int MAX_CAUSE_DEPTH = 10;

    /**
     * Checks if an IOException indicates a corrupted PDF file. The whole cause chain is inspected,
     * so a wrapper carrying a fixed message does not hide the underlying reason.
     *
     * @param e the IOException to check
     * @return true if the error indicates PDF corruption, false otherwise
     */
    public static boolean isCorruptedPdfError(IOException e) {
        return hasCorruptionInChain(e);
    }

    /**
     * Checks if any Exception indicates a corrupted PDF file. The whole cause chain is inspected,
     * so a wrapper carrying a fixed message does not hide the underlying reason.
     *
     * @param e the Exception to check
     * @return true if the error indicates PDF corruption, false otherwise
     */
    public static boolean isCorruptedPdfError(Exception e) {
        return hasCorruptionInChain(e);
    }

    private static boolean hasCorruptionInChain(Throwable throwable) {
        Throwable current = throwable;
        for (int depth = 0; current != null && depth < MAX_CAUSE_DEPTH; depth++) {
            if (isCorruptedPdfError(current.getMessage())) {
                return true;
            }
            if (current.getCause() == current) {
                break;
            }
            current = current.getCause();
        }
        return false;
    }

    /**
     * Checks if an error message indicates a corrupted PDF file.
     *
     * @param message the error message to check
     * @return true if the message indicates PDF corruption, false otherwise
     */
    private static boolean isCorruptedPdfError(String message) {
        if (message == null) return false;

        // Check for common corruption indicators
        return message.contains("Missing root object specification")
                || message.contains("Header doesn't contain versioninfo")
                || message.contains("Expected trailer")
                || message.contains("Invalid PDF")
                // JPDFium's wording for an unopenable document.
                || message.contains("Invalid/corrupt PDF")
                || message.contains("Corrupted")
                || message.contains("damaged")
                || message.contains("Unknown dir object")
                || message.contains("Can't dereference COSObject")
                || message.contains("parseCOSString string should start with")
                || message.contains("ICCBased colorspace array must have a stream")
                || message.contains("1-based index not found")
                || message.contains("Invalid dictionary, found:")
                || message.contains("AES initialization vector not fully read")
                || message.contains("BadPaddingException")
                || message.contains("Given final block not properly padded")
                || message.contains("End-of-File, expected line");
    }
}
