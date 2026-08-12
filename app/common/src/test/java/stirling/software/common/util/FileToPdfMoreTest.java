package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.api.converters.HTMLToPdfRequest;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;

/**
 * Gap-filling tests for {@link FileToPdf#convertHtmlToPdf}. The WeasyPrint process is fully mocked
 * via {@link MockedStatic} so the command-building, sanitization and ZIP repacking paths run
 * without launching any external tool.
 */
class FileToPdfMoreTest {

    private TempFileManager tempFileManager;
    private CustomHtmlSanitizer sanitizer;

    @TempDir Path tempDir;

    @BeforeEach
    void setUp() {
        ApplicationProperties props = new ApplicationProperties();
        props.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        props.getSystem().getTempFileManagement().setPrefix("test-htmlpdf-");
        tempFileManager = new TempFileManager(new TempFileRegistry(), props);

        sanitizer = mock(CustomHtmlSanitizer.class);
        // Identity sanitize so content is preserved for assertions.
        when(sanitizer.sanitize(Mockito.anyString()))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    /** Build a real ZIP byte[] from name->content pairs. */
    private static byte[] buildZip(String[] names, String[] contents) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            for (int i = 0; i < names.length; i++) {
                zos.putNextEntry(new ZipEntry(names[i]));
                zos.write(contents[i].getBytes(StandardCharsets.UTF_8));
                zos.closeEntry();
            }
        }
        return baos.toByteArray();
    }

    /** mockStatic helper returning a captor of the command list passed to the executor. */
    private ProcessExecutorResult successResult() {
        ProcessExecutorResult result = mock(ProcessExecutorResult.class);
        when(result.getRc()).thenReturn(0);
        return result;
    }

    @Nested
    @DisplayName("convertHtmlToPdf - HTML input")
    class HtmlInputTests {

        @Test
        @SuppressWarnings("unchecked")
        @DisplayName("builds the WeasyPrint command and returns the output bytes")
        void htmlHappyPath() throws Exception {
            ProcessExecutor executor = mock(ProcessExecutor.class);
            ArgumentCaptor<List<String>> commandCaptor = ArgumentCaptor.forClass(List.class);
            Mockito.doReturn(successResult())
                    .when(executor)
                    .runCommandWithOutputHandling(commandCaptor.capture());

            try (MockedStatic<ProcessExecutor> mocked = Mockito.mockStatic(ProcessExecutor.class)) {
                mocked.when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.WEASYPRINT))
                        .thenReturn(executor);

                byte[] result =
                        FileToPdf.convertHtmlToPdf(
                                "/usr/bin/weasyprint",
                                new HTMLToPdfRequest(),
                                "<html><body>hi</body></html>".getBytes(StandardCharsets.UTF_8),
                                "page.html",
                                tempFileManager,
                                sanitizer);

                assertThat(result).isNotNull();
                List<String> command = commandCaptor.getValue();
                assertThat(command.get(0)).isEqualTo("/usr/bin/weasyprint");
                assertThat(command).contains("--pdf-forms", "-e", "utf-8");
            }
        }

        @Test
        @DisplayName("the HTML body is passed through the sanitizer before writing")
        void htmlIsSanitized() throws Exception {
            ProcessExecutor executor = mock(ProcessExecutor.class);
            Mockito.doReturn(successResult())
                    .when(executor)
                    .runCommandWithOutputHandling(anyList());

            try (MockedStatic<ProcessExecutor> mocked = Mockito.mockStatic(ProcessExecutor.class)) {
                mocked.when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.WEASYPRINT))
                        .thenReturn(executor);

                FileToPdf.convertHtmlToPdf(
                        "weasyprint",
                        new HTMLToPdfRequest(),
                        "<b>x</b>".getBytes(StandardCharsets.UTF_8),
                        "doc.HTML",
                        tempFileManager,
                        sanitizer);

                Mockito.verify(sanitizer).sanitize("<b>x</b>");
            }
        }
    }

    @Nested
    @DisplayName("convertHtmlToPdf - ZIP input")
    class ZipInputTests {

        @Test
        @DisplayName("html entries inside the ZIP are sanitized and repacked")
        void zipHtmlEntriesSanitized() throws Exception {
            byte[] zip =
                    buildZip(
                            new String[] {"index.html", "asset.css"},
                            new String[] {"<p>body</p>", "p{color:red}"});

            ProcessExecutor executor = mock(ProcessExecutor.class);
            Mockito.doReturn(successResult())
                    .when(executor)
                    .runCommandWithOutputHandling(anyList());

            try (MockedStatic<ProcessExecutor> mocked = Mockito.mockStatic(ProcessExecutor.class)) {
                mocked.when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.WEASYPRINT))
                        .thenReturn(executor);

                byte[] result =
                        FileToPdf.convertHtmlToPdf(
                                "weasyprint",
                                new HTMLToPdfRequest(),
                                zip,
                                "bundle.zip",
                                tempFileManager,
                                sanitizer);

                assertThat(result).isNotNull();
                // Only the .html entry should be sanitized, not the .css.
                Mockito.verify(sanitizer).sanitize("<p>body</p>");
                Mockito.verify(sanitizer, Mockito.never()).sanitize("p{color:red}");
            }
        }

        @Test
        @DisplayName("non-html entries inside the ZIP are copied through unchanged")
        void zipNonHtmlCopied() throws Exception {
            byte[] zip = buildZip(new String[] {"data.txt"}, new String[] {"plain text content"});

            ProcessExecutor executor = mock(ProcessExecutor.class);
            Mockito.doReturn(successResult())
                    .when(executor)
                    .runCommandWithOutputHandling(anyList());

            try (MockedStatic<ProcessExecutor> mocked = Mockito.mockStatic(ProcessExecutor.class)) {
                mocked.when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.WEASYPRINT))
                        .thenReturn(executor);

                // Drop the identity-stub invocation recorded during setUp.
                Mockito.clearInvocations(sanitizer);

                byte[] result =
                        FileToPdf.convertHtmlToPdf(
                                "weasyprint",
                                new HTMLToPdfRequest(),
                                zip,
                                "bundle.zip",
                                tempFileManager,
                                sanitizer);

                assertThat(result).isNotNull();
                Mockito.verifyNoInteractions(sanitizer);
            }
        }
    }

    @Nested
    @DisplayName("convertHtmlToPdf - invalid input")
    class InvalidInputTests {

        @Test
        @DisplayName("an unsupported extension throws before any process is started")
        void unsupportedExtension() {
            assertThatThrownBy(
                            () ->
                                    FileToPdf.convertHtmlToPdf(
                                            "weasyprint",
                                            new HTMLToPdfRequest(),
                                            "data".getBytes(StandardCharsets.UTF_8),
                                            "document.txt",
                                            tempFileManager,
                                            sanitizer))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Nested
    @DisplayName("sanitizeZipFilename additional branches")
    class SanitizeZipFilenameTests {

        @Test
        @DisplayName("a bare relative name is returned unchanged")
        void plainName() {
            assertThat(FileToPdf.sanitizeZipFilename("file.html")).isEqualTo("file.html");
        }

        @Test
        @DisplayName("only the .. sequences are stripped, the rest of the path survives")
        void stripsTraversalKeepsTail() {
            String result = FileToPdf.sanitizeZipFilename("a/../b/c.html");
            assertThat(result).doesNotContain("..").endsWith("c.html");
        }
    }

    @Nested
    @DisplayName("repacked ZIP integrity")
    class RepackedZipTests {

        @Test
        @DisplayName("the temp input zip handed to weasyprint still contains the html entry")
        void repackedZipContainsEntry() throws Exception {
            byte[] zip = buildZip(new String[] {"a.html"}, new String[] {"<i>hi</i>"});

            // Inspect the repacked zip from inside the command answer, while the temp file is
            // still on disk (it is auto-deleted once convertHtmlToPdf returns).
            List<String> entryNames = new java.util.ArrayList<>();
            ProcessExecutor executor = mock(ProcessExecutor.class);
            Mockito.doAnswer(
                            invocation -> {
                                List<String> command = invocation.getArgument(0);
                                Path inputZip = Path.of(command.get(command.size() - 2));
                                try (ZipInputStream zis =
                                        new ZipInputStream(
                                                java.nio.file.Files.newInputStream(inputZip))) {
                                    ZipEntry entry;
                                    while ((entry = zis.getNextEntry()) != null) {
                                        entryNames.add(entry.getName());
                                    }
                                }
                                return successResult();
                            })
                    .when(executor)
                    .runCommandWithOutputHandling(anyList());

            try (MockedStatic<ProcessExecutor> mocked = Mockito.mockStatic(ProcessExecutor.class)) {
                mocked.when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.WEASYPRINT))
                        .thenReturn(executor);

                FileToPdf.convertHtmlToPdf(
                        "weasyprint",
                        new HTMLToPdfRequest(),
                        zip,
                        "bundle.zip",
                        tempFileManager,
                        sanitizer);

                assertThat(entryNames).anyMatch(name -> name.endsWith("a.html"));
            }
        }
    }
}
