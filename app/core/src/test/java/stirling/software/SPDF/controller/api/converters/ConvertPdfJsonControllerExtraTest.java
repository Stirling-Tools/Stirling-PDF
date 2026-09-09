package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import stirling.software.SPDF.service.PdfJsonConversionService;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.util.TempFileManager;

/**
 * Coverage for the remaining {@link ConvertPdfJsonController} diagnostic helpers and the job-access
 * guard on the GET endpoints. The conversion service boundary is mocked so nothing is rendered.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("ConvertPdfJsonController remaining branch coverage")
class ConvertPdfJsonControllerExtraTest {

    @Mock private PdfJsonConversionService pdfJsonConversionService;
    @Mock private TempFileManager tempFileManager;
    @Mock private JobOwnershipService jobOwnershipService;

    @InjectMocks private ConvertPdfJsonController controller;

    @BeforeEach
    void setUp() throws Exception {
        Field f = ConvertPdfJsonController.class.getDeclaredField("jobOwnershipService");
        f.setAccessible(true);
        f.set(controller, jobOwnershipService);
    }

    private Object invoke(String name, Class<?>[] sig, Object... args) throws Exception {
        Method m = ConvertPdfJsonController.class.getDeclaredMethod(name, sig);
        m.setAccessible(true);
        return m.invoke(controller, args);
    }

    @Nested
    @DisplayName("looksLikeBase64")
    class LooksLikeBase64 {

        private boolean looksLikeBase64(String value) throws Exception {
            return (boolean) invoke("looksLikeBase64", new Class<?>[] {String.class}, value);
        }

        @Test
        @DisplayName("short strings are never treated as base64")
        void shortNotBase64() throws Exception {
            assertThat(looksLikeBase64("short")).isFalse();
        }

        @Test
        @DisplayName("a long base64-like string is detected")
        void longBase64Detected() throws Exception {
            String b64 = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVowMTIzNDU2Nzg5";
            assertThat(looksLikeBase64(b64)).isTrue();
        }

        @Test
        @DisplayName("a long natural-language string is not base64")
        void longProseNotBase64() throws Exception {
            String prose = "this is a long sentence with spaces and punctuation, not base64!!";
            assertThat(looksLikeBase64(prose)).isFalse();
        }
    }

    @Nested
    @DisplayName("truncateForLog")
    class TruncateForLog {

        private String truncate(String value) throws Exception {
            return (String) invoke("truncateForLog", new Class<?>[] {String.class}, value);
        }

        @Test
        @DisplayName("short values are returned with whitespace normalised")
        void shortNormalised() throws Exception {
            assertThat(truncate("a\tb\nc")).isEqualTo("a b c");
        }

        @Test
        @DisplayName("long values are truncated with an ellipsis suffix")
        void longTruncated() throws Exception {
            String value = "x".repeat(100);
            String result = truncate(value);
            assertThat(result).endsWith("...");
            assertThat(result).hasSize(67); // 64 chars + "..."
        }
    }

    @Nested
    @DisplayName("debug/repeat-scan flag readers")
    class FlagReaders {

        private boolean dumpEnabled() throws Exception {
            return (boolean) invoke("isPdfJsonDebugDumpEnabled", new Class<?>[] {});
        }

        private boolean repeatScanEnabled() throws Exception {
            return (boolean) invoke("isPdfJsonRepeatScanEnabled", new Class<?>[] {});
        }

        @Test
        @DisplayName("dump flag reflects the system property")
        void dumpFlagFromProperty() throws Exception {
            String prev = System.getProperty("spdf.pdfjson.dump");
            try {
                System.clearProperty("spdf.pdfjson.dump");
                assertThat(dumpEnabled()).isFalse();
                System.setProperty("spdf.pdfjson.dump", "true");
                assertThat(dumpEnabled()).isTrue();
            } finally {
                restore("spdf.pdfjson.dump", prev);
            }
        }

        @Test
        @DisplayName("repeat-scan flag reflects the system property")
        void repeatScanFromProperty() throws Exception {
            String prev = System.getProperty("spdf.pdfjson.repeatScan");
            try {
                System.clearProperty("spdf.pdfjson.repeatScan");
                assertThat(repeatScanEnabled()).isFalse();
                System.setProperty("spdf.pdfjson.repeatScan", "true");
                assertThat(repeatScanEnabled()).isTrue();
            } finally {
                restore("spdf.pdfjson.repeatScan", prev);
            }
        }

        private void restore(String key, String prev) {
            if (prev == null) {
                System.clearProperty(key);
            } else {
                System.setProperty(key, prev);
            }
        }
    }

    @Nested
    @DisplayName("logJsonResponse")
    class LogJsonResponse {

        @Test
        @DisplayName("a null path is logged without throwing")
        void nullPathHandled() throws Exception {
            // exercises the early null-path guard branch
            invoke(
                    "logJsonResponse",
                    new Class<?>[] {String.class, java.nio.file.Path.class},
                    "x",
                    null);
        }

        @Test
        @DisplayName("happy path with no debug flags returns without reading the file")
        void noFlagsNoRead() throws Exception {
            String dumpPrev = System.getProperty("spdf.pdfjson.dump");
            String scanPrev = System.getProperty("spdf.pdfjson.repeatScan");
            try {
                System.clearProperty("spdf.pdfjson.dump");
                System.clearProperty("spdf.pdfjson.repeatScan");
                // a non-existent path must not be read because all flags are off
                java.nio.file.Path missing = java.nio.file.Path.of("does-not-exist-123.json");
                invoke(
                        "logJsonResponse",
                        new Class<?>[] {String.class, java.nio.file.Path.class},
                        "label",
                        missing);
            } finally {
                if (dumpPrev != null) System.setProperty("spdf.pdfjson.dump", dumpPrev);
                if (scanPrev != null) System.setProperty("spdf.pdfjson.repeatScan", scanPrev);
            }
        }
    }

    @Nested
    @DisplayName("GET endpoint job-access guard")
    class JobAccessGuard {

        @Test
        @DisplayName("extractSinglePage rejects an unauthorized job before doing work")
        void singlePageRejected() {
            doThrow(new SecurityException("denied"))
                    .when(jobOwnershipService)
                    .validateJobAccess("bad");

            assertThrows(SecurityException.class, () -> controller.extractSinglePage("bad", 1));
            verifyNoConversion();
        }

        @Test
        @DisplayName("extractPageFonts rejects an unauthorized job before doing work")
        void pageFontsRejected() {
            doThrow(new SecurityException("denied"))
                    .when(jobOwnershipService)
                    .validateJobAccess("bad");

            assertThrows(SecurityException.class, () -> controller.extractPageFonts("bad", 2));
            verifyNoConversion();
        }

        @Test
        @DisplayName("exportPartialPdf rejects an unauthorized job before doing work")
        void exportPartialRejected() {
            when(jobOwnershipService.validateJobAccess(anyString()))
                    .thenThrow(new SecurityException("denied"));

            assertThrows(
                    SecurityException.class,
                    () ->
                            controller.exportPartialPdf(
                                    "bad",
                                    new stirling.software.SPDF.model.json.PdfJsonDocument(),
                                    "out.pdf"));
        }

        private void verifyNoConversion() {
            try {
                verify(pdfJsonConversionService, never())
                        .extractSinglePage(
                                anyString(),
                                org.mockito.ArgumentMatchers.anyInt(),
                                org.mockito.ArgumentMatchers.any());
                verify(pdfJsonConversionService, never())
                        .extractPageFonts(
                                anyString(),
                                org.mockito.ArgumentMatchers.anyInt(),
                                org.mockito.ArgumentMatchers.any());
            } catch (Exception e) {
                throw new AssertionError(e);
            }
        }
    }
}
