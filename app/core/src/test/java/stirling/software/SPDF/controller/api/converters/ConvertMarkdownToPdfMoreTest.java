package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.commonmark.node.Node;
import org.commonmark.parser.Parser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.api.GeneralFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.CustomHtmlSanitizer;
import stirling.software.common.util.FileToPdf;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

/**
 * Additional coverage for {@link ConvertMarkdownToPdf}. Real commonmark parsing is exercised; the
 * external WeasyPrint boundary ({@link FileToPdf#convertHtmlToPdf}) and the response writer are
 * mocked so no external tool is launched. The ZIP branch uses a real in-memory ZIP archive.
 */
@ExtendWith(MockitoExtension.class)
class ConvertMarkdownToPdfMoreTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private RuntimePathConfig runtimePathConfig;
    @Mock private TempFileManager tempFileManager;
    @Mock private CustomHtmlSanitizer customHtmlSanitizer;

    @InjectMocks private ConvertMarkdownToPdf controller;

    @BeforeEach
    void setUp() throws Exception {
        lenient().when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");
        lenient()
                .when(pdfDocumentFactory.createNewBytesBasedOnOldDocument(any(byte[].class)))
                .thenAnswer(inv -> inv.getArgument(0));
        // A real managed temp file so Files.write succeeds before the (mocked) response build.
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("md-test", inv.<String>getArgument(0))
                                            .toFile();
                            f.deleteOnExit();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
        // A real temp directory backing the ZIP-extraction branch.
        lenient()
                .when(tempFileManager.createTempDirectory())
                .thenAnswer(inv -> Files.createTempDirectory("md-zip-test"));
    }

    private static ResponseEntity<Resource> cannedResponse() {
        return ResponseEntity.ok(new ByteArrayResource("pdf".getBytes()));
    }

    private GeneralFile generalFileOf(String name, String contentType, byte[] bytes) {
        GeneralFile gf = new GeneralFile();
        gf.setFileInput(new MockMultipartFile("fileInput", name, contentType, bytes));
        return gf;
    }

    @Nested
    @DisplayName("plain markdown branch")
    class PlainMarkdown {

        @Test
        @DisplayName("converts a markdown file with a GFM table to PDF")
        void markdownWithTable() throws Exception {
            String md = "# Title\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\nSome **bold** body text.\n";
            GeneralFile gf = generalFileOf("doc.md", "text/markdown", md.getBytes());

            try (MockedStatic<FileToPdf> ftp = Mockito.mockStatic(FileToPdf.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                ArgumentCaptor<byte[]> htmlBytes = ArgumentCaptor.forClass(byte[].class);
                ftp.when(
                                () ->
                                        FileToPdf.convertHtmlToPdf(
                                                eq("/usr/bin/weasyprint"),
                                                isNull(),
                                                htmlBytes.capture(),
                                                eq("converted.html"),
                                                eq(tempFileManager),
                                                eq(customHtmlSanitizer)))
                        .thenReturn("pdf".getBytes());
                wr.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(cannedResponse());

                ResponseEntity<Resource> response = controller.markdownToPdf(gf);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                String html = new String(htmlBytes.getValue(), StandardCharsets.UTF_8);
                // commonmark + tables extension produced a styled table and a heading.
                assertThat(html).contains("table table-striped");
                assertThat(html).contains("<h1>");
            }
        }

        @Test
        @DisplayName("propagates a WeasyPrint conversion failure")
        void weasyPrintFailurePropagates() throws Exception {
            GeneralFile gf = generalFileOf("doc.md", "text/markdown", "# Hi".getBytes());

            try (MockedStatic<FileToPdf> ftp = Mockito.mockStatic(FileToPdf.class)) {
                ftp.when(
                                () ->
                                        FileToPdf.convertHtmlToPdf(
                                                anyString(),
                                                isNull(),
                                                any(byte[].class),
                                                anyString(),
                                                any(TempFileManager.class),
                                                any(CustomHtmlSanitizer.class)))
                        .thenThrow(new java.io.IOException("weasyprint failed"));

                assertThatThrownBy(() -> controller.markdownToPdf(gf))
                        .isInstanceOf(java.io.IOException.class);
            }
        }
    }

    @Nested
    @DisplayName("zip markdown branch")
    class ZipMarkdown {

        private byte[] zipWith(Map<String, byte[]> entries) throws Exception {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            try (ZipOutputStream zos = new ZipOutputStream(baos)) {
                for (Map.Entry<String, byte[]> e : entries.entrySet()) {
                    zos.putNextEntry(new ZipEntry(e.getKey()));
                    zos.write(e.getValue());
                    zos.closeEntry();
                }
            }
            return baos.toByteArray();
        }

        @Test
        @DisplayName("extracts markdown plus an image and converts via the zip path")
        void zipWithImageConverts() throws Exception {
            Map<String, byte[]> entries = new HashMap<>();
            entries.put("index.md", "# Zip Doc\n\n![img](pic.png)\n".getBytes());
            entries.put("pic.png", new byte[] {(byte) 0x89, 'P', 'N', 'G'});
            byte[] zip = zipWith(entries);

            GeneralFile gf = generalFileOf("bundle.zip", "application/zip", zip);

            try (MockedStatic<FileToPdf> ftp = Mockito.mockStatic(FileToPdf.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {
                ftp.when(
                                () ->
                                        FileToPdf.convertHtmlToPdf(
                                                eq("/usr/bin/weasyprint"),
                                                isNull(),
                                                any(byte[].class),
                                                eq("package.zip"),
                                                eq(tempFileManager),
                                                eq(customHtmlSanitizer)))
                        .thenReturn("pdf".getBytes());
                wr.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(cannedResponse());

                ResponseEntity<Resource> response = controller.markdownToPdf(gf);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                ftp.verify(
                        () ->
                                FileToPdf.convertHtmlToPdf(
                                        anyString(),
                                        isNull(),
                                        any(byte[].class),
                                        eq("package.zip"),
                                        any(TempFileManager.class),
                                        any(CustomHtmlSanitizer.class)));
            }
        }

        @Test
        @DisplayName("throws when the zip contains no markdown file")
        void zipWithoutMarkdownThrows() throws Exception {
            Map<String, byte[]> entries = new HashMap<>();
            entries.put("readme.txt", "not markdown".getBytes());
            byte[] zip = zipWith(entries);

            GeneralFile gf = generalFileOf("bundle.zip", "application/zip", zip);

            assertThatThrownBy(() -> controller.markdownToPdf(gf))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Nested
    @DisplayName("input validation")
    class Validation {

        @Test
        @DisplayName("throws when fileInput is null")
        void nullFileInput() {
            GeneralFile gf = new GeneralFile();
            gf.setFileInput(null);

            assertThatThrownBy(() -> controller.markdownToPdf(gf))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("throws for a non-markdown, non-zip extension")
        void wrongExtension() {
            GeneralFile gf = generalFileOf("notes.txt", "text/plain", "hello".getBytes());

            assertThatThrownBy(() -> controller.markdownToPdf(gf))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    @DisplayName("TableAttributeProvider adds the table class only to table blocks")
    void tableAttributeProviderBehaviour() {
        Parser parser = Parser.builder().build();
        Node paragraph = parser.parse("plain paragraph");
        TableAttributeProvider provider = new TableAttributeProvider();

        Map<String, String> attrs = new HashMap<>();
        // A non-table node leaves the attribute map untouched.
        provider.setAttributes(paragraph.getFirstChild(), "p", attrs);
        assertThat(attrs).doesNotContainKey("class");
    }
}
