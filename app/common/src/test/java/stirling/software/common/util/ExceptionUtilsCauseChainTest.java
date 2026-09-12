package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;

import org.junit.jupiter.api.Test;

import stirling.software.common.util.ExceptionUtils.PdfPasswordException;

/**
 * A controller that wraps a PDF failure in its own exception used to hide the real reason, because
 * classification only ever read the outermost message. These pin the cause-chain walk that fixes
 * it.
 */
class ExceptionUtilsCauseChainTest {

    @Test
    void isPasswordError_recognisesJpdfiumWording() {
        assertTrue(ExceptionUtils.isPasswordError(new IOException("Password required/incorrect")));
    }

    @Test
    void isPasswordError_findsCauseBehindFixedWrapperMessage() {
        IOException wrapped =
                new IOException(
                        "JPDFium merge failed",
                        new RuntimeException("Password required/incorrect - docOpen: /tmp/x"));
        assertTrue(ExceptionUtils.isPasswordError(wrapped));
    }

    @Test
    void isPasswordError_unrelatedCauseStaysFalse() {
        IOException wrapped =
                new IOException("JPDFium merge failed", new RuntimeException("disk full"));
        assertFalse(ExceptionUtils.isPasswordError(wrapped));
    }

    @Test
    void isEncryptionError_findsCauseBehindWrapper() {
        IOException wrapped =
                new IOException("merge failed", new RuntimeException("Failed to decrypt"));
        assertTrue(ExceptionUtils.isEncryptionError(wrapped));
    }

    @Test
    void isPasswordError_cyclicCauseChainDoesNotSpin() {
        IOException first = new IOException("nothing to see");
        IOException second = new IOException("nor here", first);
        first.initCause(second);
        assertFalse(ExceptionUtils.isPasswordError(first));
    }

    @Test
    void handlePdfException_mapsWrappedPasswordCauseAndKeepsTheFileName() {
        IOException wrapped =
                new IOException(
                        "JPDFium merge failed",
                        new RuntimeException("Password required/incorrect"));

        IOException handled = ExceptionUtils.handlePdfException(wrapped, "locked.pdf");

        assertInstanceOf(PdfPasswordException.class, handled);
        assertTrue(handled.getMessage().contains("locked.pdf"), handled.getMessage());
    }

    @Test
    void createPdfPasswordException_withoutContextOmitsTheParenthetical() {
        PdfPasswordException e =
                ExceptionUtils.createPdfPasswordException(new RuntimeException("boom"));
        assertFalse(e.getMessage().contains("("), e.getMessage());
    }
}
