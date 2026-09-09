package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.common.util.ExceptionUtils.CbrFormatException;
import stirling.software.common.util.ExceptionUtils.CbzFormatException;
import stirling.software.common.util.ExceptionUtils.ErrorCode;
import stirling.software.common.util.ExceptionUtils.FfmpegRequiredException;
import stirling.software.common.util.ExceptionUtils.GhostscriptException;

/**
 * Remaining-gap tests for {@link ExceptionUtils} not already covered by ExceptionUtilsTest /
 * ExceptionUtilsGapTest: the two-argument Ghostscript factory, the cause-bearing exception
 * constructors, and the EPS-multipage Ghostscript diagnostic branch.
 */
class ExceptionUtilsExtraTest {

    @Nested
    @DisplayName("createGhostscriptCompressionException(processOutput, cause)")
    class TwoArgGhostscriptTests {

        @Test
        @DisplayName("both output and cause provided yields a coded exception with the cause")
        void outputAndCause() {
            Exception cause = new RuntimeException("boom");
            GhostscriptException ex =
                    ExceptionUtils.createGhostscriptCompressionException(
                            "Some informational chatter", cause);
            assertSame(cause, ex.getCause());
            assertEquals(ErrorCode.GHOSTSCRIPT_COMPRESSION.getCode(), ex.getErrorCode());
        }

        @Test
        @DisplayName("EPS-multipage marker is recognized as a page-drawing error")
        void epsMultipageMarker() {
            String output = "Page 1\nEPS files may not contain multiple pages";
            GhostscriptException ex = ExceptionUtils.createGhostscriptCompressionException(output);
            assertEquals(ErrorCode.GHOSTSCRIPT_PAGE_DRAWING.getCode(), ex.getErrorCode());
            assertNotNull(ex.getMessage());
        }

        @Test
        @DisplayName("single-string overload with informational output uses compression code")
        void singleStringInformational() {
            GhostscriptException ex =
                    ExceptionUtils.createGhostscriptCompressionException("just chatter");
            assertEquals(ErrorCode.GHOSTSCRIPT_COMPRESSION.getCode(), ex.getErrorCode());
            // The fallback informative line is appended to the base message.
            assertTrue(ex.getMessage().contains("chatter"));
        }
    }

    @Nested
    @DisplayName("cause-bearing exception constructors")
    class CauseConstructorTests {

        @Test
        @DisplayName("CbrFormatException(message, cause, code) retains cause and code")
        void cbrWithCause() {
            Exception cause = new IllegalStateException("rar");
            CbrFormatException ex = new CbrFormatException("bad cbr", cause, "E010");
            assertSame(cause, ex.getCause());
            assertEquals("E010", ex.getErrorCode());
            assertEquals("bad cbr", ex.getMessage());
        }

        @Test
        @DisplayName("CbzFormatException(message, code) leaves cause null")
        void cbzNoCause() {
            CbzFormatException ex = new CbzFormatException("bad cbz", "E015");
            assertEquals("E015", ex.getErrorCode());
            assertEquals("bad cbz", ex.getMessage());
        }

        @Test
        @DisplayName("FfmpegRequiredException(message, cause, code) retains the cause")
        void ffmpegWithCause() {
            Exception cause = new RuntimeException("no ffmpeg");
            FfmpegRequiredException ex =
                    new FfmpegRequiredException("ffmpeg missing", cause, "E063");
            assertSame(cause, ex.getCause());
            assertEquals("E063", ex.getErrorCode());
        }
    }
}
