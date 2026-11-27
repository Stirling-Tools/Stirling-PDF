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
                "database connection damaged",
                "Corrupted database",
                "Failed to decrypt backup",
                "authentication service: password is incorrect"
            })
    void unrelatedFailuresHaveNoPdfContext(String message) {
        IOException failure = new IOException("job failed", new IOException(message));
        assertFalse(PdfErrorUtils.hasPdfContext(failure));
        assertFalse(PdfErrorUtils.isCorruptedPdfError(failure));
    }

    @Test
    void pdfContextRecognizesTypedCauseWithoutMessage() {
        assertTrue(
                PdfErrorUtils.hasPdfContext(
                        new IOException(
                                "job failed",
                                org.mockito.Mockito.mock(
                                        org.apache.pdfbox.pdmodel.encryption
                                                .InvalidPasswordException.class))));
    }

    @Test
    void pdfContextHandlesNullAndCycles() {
        assertFalse(PdfErrorUtils.hasPdfContext(null));
        IOException first = new IOException("first");
        IOException second = new IOException("second", first);
        first.initCause(second);
        assertFalse(PdfErrorUtils.hasPdfContext(first));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "Missing root object specification",
                "Header doesn't contain versioninfo",
                "Expected trailer",
                "Invalid PDF",
                "Unknown dir object",
                "Can't dereference COSObject",
                "parseCOSString string should start with",
                "ICCBased colorspace array must have a stream",
                "1-based index not found",
                "Invalid dictionary, found:",
                "End-of-File, expected line"
            })
    void isCorruptedPdfError_ioException_corruptionIndicators_returnsTrue(String message) {
        IOException e = new IOException(message);
        assertTrue(PdfErrorUtils.isCorruptedPdfError(e));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "AES initialization vector not fully read",
                "BadPaddingException",
                "Given final block not properly padded"
            })
    void isCorruptedPdfError_decryptionFailures_returnsFalse(String message) {
        // Matched by ExceptionUtils#isEncryptionError instead. Claiming them here too let
        // whichever check ran first decide the kind, and corruption ran first.
        assertFalse(PdfErrorUtils.isCorruptedPdfError(new IOException(message)));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "Missing root object specification in the file",
                "Header doesn't contain versioninfo xyz"
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

    @Test
    void isCorruptedPdfError_findsCauseBehindFixedWrapperMessage() {
        IOException wrapped =
                new IOException(
                        "JPDFium merge failed", new RuntimeException("Invalid/corrupt PDF"));
        assertTrue(PdfErrorUtils.isCorruptedPdfError(wrapped));
    }

    @Test
    void isCorruptedPdfError_recognisesJpdfiumCorruptWording() {
        assertTrue(PdfErrorUtils.isCorruptedPdfError(new IOException("Invalid/corrupt PDF")));
    }

    @Test
    void isCorruptedPdfError_unrelatedCauseChainStaysFalse() {
        IOException wrapped =
                new IOException("JPDFium merge failed", new RuntimeException("disk full"));
        assertFalse(PdfErrorUtils.isCorruptedPdfError(wrapped));
    }

    @Test
    void isCorruptedPdfError_cyclicCauseChainDoesNotSpin() {
        IOException first = new IOException("nothing to see");
        IOException second = new IOException("nor here", first);
        first.initCause(second);
        assertFalse(PdfErrorUtils.isCorruptedPdfError(first));
    }
}
