package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PdfErrorUtilsTest {

    @ParameterizedTest
    @ValueSource(
            strings = {
                "Missing root object specification",
                "Header doesn't contain versioninfo",
                "Expected trailer",
                "Invalid PDF",
                "Corrupted",
                "damaged",
                "Unknown dir object",
                "Can't dereference COSObject",
                "parseCOSString string should start with",
                "ICCBased colorspace array must have a stream",
                "1-based index not found",
                "Invalid dictionary, found:",
                "AES initialization vector not fully read",
                "BadPaddingException",
                "Given final block not properly padded",
                "End-of-File, expected line"
            })
    void isCorruptedPdfError_ioException_corruptionIndicators_returnsTrue(String message) {
        IOException e = new IOException(message);
        assertTrue(PdfErrorUtils.isCorruptedPdfError(e));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "Missing root object specification in the file",
                "Header doesn't contain versioninfo xyz",
                "Some prefix Corrupted suffix"
            })
    void isCorruptedPdfError_ioException_messagesContainingIndicators_returnsTrue(String message) {
        IOException e = new IOException(message);
        assertTrue(PdfErrorUtils.isCorruptedPdfError(e));
    }

    @Test
    void isCorruptedPdfError_ioException_normalError_returnsFalse() {
        IOException e = new IOException("File not found");
        assertFalse(PdfErrorUtils.isCorruptedPdfError(e));
    }

    @Test
    void isCorruptedPdfError_ioException_nullMessage_returnsFalse() {
        IOException e = new IOException((String) null);
        assertFalse(PdfErrorUtils.isCorruptedPdfError(e));
    }

    @Test
    void isCorruptedPdfError_genericException_corruptionMessage_returnsTrue() {
        Exception e = new RuntimeException("Invalid PDF structure");
        assertTrue(PdfErrorUtils.isCorruptedPdfError(e));
    }

    @Test
    void isCorruptedPdfError_genericException_normalMessage_returnsFalse() {
        Exception e = new RuntimeException("Something went wrong");
        assertFalse(PdfErrorUtils.isCorruptedPdfError(e));
    }

    @Test
    void isCorruptedPdfError_genericException_nullMessage_returnsFalse() {
        Exception e = new RuntimeException((String) null);
        assertFalse(PdfErrorUtils.isCorruptedPdfError(e));
    }

    @Test
    void isCorruptedPdfError_ioException_emptyMessage_returnsFalse() {
        IOException e = new IOException("");
        assertFalse(PdfErrorUtils.isCorruptedPdfError(e));
    }
}
