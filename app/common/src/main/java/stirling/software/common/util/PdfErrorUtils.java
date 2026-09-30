package stirling.software.common.util;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;

import stirling.software.jpdfium.exception.JPDFiumException;
import stirling.software.jpdfium.exception.PdfCorruptException;

/** Utility class for detecting and handling PDF-related errors. */
public class PdfErrorUtils {

    /** Bounds the cause walk so a self-referencing or cyclic chain cannot spin. */
    private static final int MAX_CAUSE_DEPTH = 10;

    /**
     * Requires a PDF-specific type or engine-message prefix before a global handler applies
     * classifiers intended for PDF operations. Generic crypto and storage errors are not evidence
     * that the submitted PDF is invalid.
     */
    public static boolean hasPdfContext(Throwable throwable) {
        Throwable current = throwable;
        for (int depth = 0; current != null && depth < MAX_CAUSE_DEPTH; depth++) {
            if (current instanceof JPDFiumException
                    || current instanceof InvalidPasswordException
                    || current instanceof ExceptionUtils.PdfPasswordException
                    || current instanceof ExceptionUtils.PdfEncryptionException
                    || current instanceof ExceptionUtils.PdfCorruptedException) {
                return true;
            }
            String message = current.getMessage();
            if (message != null
                    && (isCorruptedPdfError(message)
                            || message.startsWith("Cannot decrypt PDF")
                            || message.startsWith("PDF contains an encryption dictionary")
                            || message.startsWith("Password required/incorrect")
                            || message.startsWith("AES initialization vector not fully read"))) {
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
            if (current instanceof PdfCorruptException
                    || current instanceof ExceptionUtils.PdfCorruptedException
                    || isCorruptedPdfError(current.getMessage())) {
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

        return message.startsWith("Missing root object specification")
                || message.startsWith("Header doesn't contain versioninfo")
                || message.startsWith("Expected trailer")
                || message.startsWith("Invalid PDF")
                // JPDFium's wording for an unopenable document.
                || message.startsWith("Invalid/corrupt PDF")
                || message.startsWith("Unknown dir object")
                || message.startsWith("Can't dereference COSObject")
                || message.startsWith("parseCOSString string should start with")
                || message.startsWith("ICCBased colorspace array must have a stream")
                || message.startsWith("1-based index not found")
                || message.startsWith("Invalid dictionary, found:")
                || message.startsWith("End-of-File, expected line")
                || message.startsWith("Error: End-of-File, expected line");
    }
}
