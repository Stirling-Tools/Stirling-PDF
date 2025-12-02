package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PdfErrorUtilsTest {

    @Test
    @DisplayName("isCorruptedPdfError detects corruption indicators in IOException messages")
    void isCorruptedPdfErrorDetectsCorruptedIOException() {
        IOException ioException = new IOException("Missing root object specification in file");

        boolean result = PdfErrorUtils.isCorruptedPdfError(ioException);

        assertTrue(result, "Known corruption indicators should return true for IOException");
    }

    @Test
    @DisplayName("isCorruptedPdfError detects corruption indicators in general Exception messages")
    void isCorruptedPdfErrorDetectsCorruptedException() {
        Exception exception = new Exception("File processing failed because it is damaged");

        boolean result = PdfErrorUtils.isCorruptedPdfError(exception);

        assertTrue(result, "Known corruption indicators should return true for general Exception");
    }

    @Test
    @DisplayName("isCorruptedPdfError returns false when no indicator is present")
    void isCorruptedPdfErrorReturnsFalseForNonCorruptedMessage() {
        Exception exception = new Exception("File processing failed for another reason");

        boolean result = PdfErrorUtils.isCorruptedPdfError(exception);

        assertFalse(result, "Messages without indicators should not be considered corrupted");
    }

    @Test
    @DisplayName("isCorruptedPdfError returns false when the message is null")
    void isCorruptedPdfErrorHandlesNullMessage() {
        Exception exception = new Exception((String) null);

        boolean result = PdfErrorUtils.isCorruptedPdfError(exception);

        assertFalse(result, "Null messages should not be considered corrupted");
    }
}
