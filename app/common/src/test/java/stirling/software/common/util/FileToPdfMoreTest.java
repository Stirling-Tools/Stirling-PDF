package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;
import java.util.zip.ZipEntry;
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
        @DisplayName("a ZIP with no HTML document is rejected before any process is started")
        void zipWithoutHtmlRejected() throws Exception {
            byte[] zip = buildZip(new String[] {"data.txt"}, new String[] {"plain text content"});

            try (MockedStatic<ProcessExecutor> mocked = Mockito.mockStatic(ProcessExecutor.class)) {
                assertThatThrownBy(
                                () ->
                                        FileToPdf.convertHtmlToPdf(
                                                "weasyprint",
                                                new HTMLToPdfRequest(),
                                                zip,
                                                "bundle.zip",
                                                tempFileManager,
                                                sanitizer))
                        .isInstanceOf(IllegalArgumentException.class);
                mocked.verifyNoInteractions();
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

    private CapturedRun run(byte[] input, String fileName) throws Exception {
        CapturedRun captured = new CapturedRun();
        ProcessExecutor executor = mock(ProcessExecutor.class);
        Mockito.doAnswer(
                        invocation -> {
                            List<String> command = invocation.getArgument(0);
                            captured.command = List.copyOf(command);
                            captured.html =
                                    Files.readString(Path.of(command.get(command.size() - 2)));
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
                    input,
                    fileName,
                    tempFileManager,
                    sanitizer);
        }
        return captured;
    }

    private static final class CapturedRun {
        List<String> command;
        String html;
    }

    @Nested
    @DisplayName("WeasyPrint input hardening")
    class WeasyPrintInputTests {

        @Test
        @DisplayName("sanitized HTML input may only fetch data: URIs")
        void htmlRestrictsProtocols() throws Exception {
            CapturedRun run = run("<p>x</p>".getBytes(StandardCharsets.UTF_8), "page.html");

            int flag = run.command.indexOf("--allowed-protocols");
            assertThat(flag).isPositive();
            assertThat(run.command.get(flag + 1)).isEqualTo("data");
        }

        @Test
        @DisplayName("unsanitized HTML input may fetch http(s) but never file:")
        void unsanitizedHtmlExcludesFileProtocol() throws Exception {
            when(sanitizer.isDisabled()).thenReturn(true);

            CapturedRun run = run("<p>x</p>".getBytes(StandardCharsets.UTF_8), "page.html");

            int flag = run.command.indexOf("--allowed-protocols");
            assertThat(run.command.get(flag + 1)).isEqualTo("data,http,https");
        }

        @Test
        @DisplayName("ZIP input hands WeasyPrint the main HTML document, never the archive")
        void zipPassesHtmlNotArchive() throws Exception {
            byte[] zip =
                    buildZip(
                            new String[] {"other.html", "index.html", "style.css"},
                            new String[] {"<p>other</p>", "<p>main</p>", "p{}"});

            CapturedRun run = run(zip, "bundle.zip");

            assertThat(run.command.get(run.command.size() - 2)).endsWith(".html");
            assertThat(run.command).contains("--allowed-protocols", "data");
            assertThat(run.html).isEqualTo("<p>main</p>");
        }

        @Test
        @DisplayName("markup in ZIP entry names never reaches the WeasyPrint input")
        void entryNamesNotParsedAsMarkup() throws Exception {
            String markupName = "<link rel=attachment href=\"file:/tmp/canary.txt\">";
            byte[] zip =
                    buildZip(
                            new String[] {"index.html", markupName},
                            new String[] {"<p>main</p>", "x"});

            CapturedRun run = run(zip, "bundle.zip");

            assertThat(run.html).isEqualTo("<p>main</p>");
        }

        @Test
        @DisplayName("relative images in the archive are inlined as data URIs")
        void relativeImagesInlined() throws Exception {
            byte[] zip =
                    buildZip(
                            new String[] {"site/index.html", "site/img/a b.png"},
                            new String[] {"<img src=\"img/a%20b.png\" />", "PNGDATA"});

            CapturedRun run = run(zip, "bundle.zip");

            String expected =
                    Base64.getEncoder().encodeToString("PNGDATA".getBytes(StandardCharsets.UTF_8));
            assertThat(run.html)
                    .isEqualTo("<img src=\"data:image/png;base64," + expected + "\" />");
        }

        @Test
        @DisplayName("archive images are inlined before sanitizing, so relative src survives it")
        void imagesInlinedBeforeSanitizing() throws Exception {
            byte[] zip =
                    buildZip(
                            new String[] {"index.html", "logo.png"},
                            new String[] {"<img src=logo.png>", "PNGDATA"});

            run(zip, "bundle.zip");

            String expected =
                    Base64.getEncoder().encodeToString("PNGDATA".getBytes(StandardCharsets.UTF_8));
            Mockito.verify(sanitizer)
                    .sanitize("<img src=\"data:image/png;base64," + expected + "\">");
        }

        @Test
        @DisplayName("image references outside the archive are left for WeasyPrint to refuse")
        void traversalImageNotInlined() throws Exception {
            String html = "<img src=\"../../tmp/canary.png\" />";
            byte[] zip = buildZip(new String[] {"index.html"}, new String[] {html});

            CapturedRun run = run(zip, "bundle.zip");

            assertThat(run.html).isEqualTo(html);
        }
    }

    @Nested
    @DisplayName("entry name helpers")
    class EntryNameHelperTests {

        @Test
        @DisplayName("markup characters are replaced in stored entry names")
        void markupCharactersReplaced() {
            assertThat(FileToPdf.sanitizeZipFilename("<link href=\"file:/x\">.png"))
                    .matches("[A-Za-z0-9._/-]+");
        }

        @Test
        @DisplayName("a root index.html is preferred, otherwise the shallowest HTML file")
        void selectsMainHtml() {
            assertThat(FileToPdf.selectMainHtml(List.of("b/x.html", "a.htm", "index.html")))
                    .isEqualTo("index.html");
            assertThat(FileToPdf.selectMainHtml(List.of("b/x.html", "z.html", "a.css")))
                    .isEqualTo("z.html");
            assertThat(FileToPdf.selectMainHtml(List.of("a.css"))).isNull();
        }

        @Test
        @DisplayName("paths that climb out of the archive normalize to null")
        void normalizeRejectsEscape() {
            assertThat(FileToPdf.normalizeEntryPath("a/./b/../c.png")).isEqualTo("a/c.png");
            assertThat(FileToPdf.normalizeEntryPath("../c.png")).isNull();
        }
    }
}
