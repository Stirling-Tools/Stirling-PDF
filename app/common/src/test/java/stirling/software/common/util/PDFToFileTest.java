package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;

import io.github.pixee.security.ZipSecurity;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.StreamingOutput;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.ByteArrayMultipartFile;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;

/**
 * Tests for PDFToFile utility class. This includes both invalid content type cases and positive
 * test cases that mock external process execution.
 *
 * <p>MIGRATION (Spring -> JAX-RS): production now returns {@link Response} (body is a {@link
 * StreamingOutput} for the file-backed responses) instead of {@code ResponseEntity<Resource>}, and
 * accepts the {@code stirling.software.common.model.MultipartFile} shim. Assertions updated to the
 * JAX-RS status/header/body API.
 */
@ExtendWith(MockitoExtension.class)
class PDFToFileTest {

    private static final String APPLICATION_PDF = "application/pdf";
    private static final String TEXT_PLAIN = "text/plain";

    @TempDir Path tempDir;

    private PDFToFile pdfToFile;

    @Mock private ProcessExecutor mockProcessExecutor;
    @Mock private ProcessExecutorResult mockExecutorResult;
    @Mock private TempFileManager mockTempFileManager;
    @Mock private RuntimePathConfig mockRuntimePathConfig;

    @BeforeEach
    void setUp() throws IOException {
        // Mock the TempFileManager to return real temp files
        lenient()
                .when(mockTempFileManager.createTempFile(anyString()))
                .thenAnswer(
                        invocation ->
                                Files.createTempFile("test", invocation.getArgument(0)).toFile());
        lenient()
                .when(mockTempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        invocation -> {
                            File f =
                                    Files.createTempFile("test", invocation.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = org.mockito.Mockito.mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            lenient().when(tf.getAbsolutePath()).thenReturn(f.getAbsolutePath());
                            return tf;
                        });
        lenient()
                .when(mockTempFileManager.createTempDirectory())
                .thenAnswer(invocation -> Files.createTempDirectory("test"));

        lenient().when(mockRuntimePathConfig.getSOfficePath()).thenReturn("/usr/bin/soffice");

        pdfToFile = new PDFToFile(mockTempFileManager, mockRuntimePathConfig);
    }

    private static byte[] drain(Response response) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        Object entity = response.getEntity();
        if (entity instanceof StreamingOutput streaming) {
            streaming.write(baos);
        } else if (entity instanceof byte[] bytes) {
            baos.write(bytes);
        } else {
            throw new IllegalStateException(
                    "Unexpected response entity type: "
                            + (entity == null ? "null" : entity.getClass().getName()));
        }
        return baos.toByteArray();
    }

    private static String contentDisposition(Response response) {
        return response.getHeaderString("Content-Disposition");
    }

    @Test
    void testProcessPdfToMarkdown_InvalidContentType() throws IOException, InterruptedException {
        // Prepare
        MultipartFile nonPdfFile =
                new ByteArrayMultipartFile(
                        "file", "test.txt", TEXT_PLAIN, "This is not a PDF".getBytes());

        // Execute
        Response response = pdfToFile.processPdfToMarkdown(nonPdfFile);

        // Verify
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
    }

    @Test
    void testProcessPdfToHtml_InvalidContentType() throws IOException, InterruptedException {
        // Prepare
        MultipartFile nonPdfFile =
                new ByteArrayMultipartFile(
                        "file", "test.txt", TEXT_PLAIN, "This is not a PDF".getBytes());

        // Execute
        Response response = pdfToFile.processPdfToHtml(nonPdfFile);

        // Verify
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
    }

    @Test
    void testProcessPdfToOfficeFormat_InvalidContentType()
            throws IOException, InterruptedException {
        // Prepare
        MultipartFile nonPdfFile =
                new ByteArrayMultipartFile(
                        "file", "test.txt", TEXT_PLAIN, "This is not a PDF".getBytes());

        // Execute
        Response response =
                pdfToFile.processPdfToOfficeFormat(nonPdfFile, "docx", "draw_pdf_import");

        // Verify
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
    }

    @Test
    void testProcessPdfToOfficeFormat_InvalidOutputFormat()
            throws IOException, InterruptedException {
        // Prepare
        MultipartFile pdfFile =
                new ByteArrayMultipartFile(
                        "file", "test.pdf", APPLICATION_PDF, "Fake PDF content".getBytes());

        // Execute with invalid format
        Response response =
                pdfToFile.processPdfToOfficeFormat(pdfFile, "invalid_format", "draw_pdf_import");

        // Verify
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
    }

    @Test
    void testProcessPdfToMarkdown_SingleOutputFile() throws IOException, InterruptedException {
        // Setup mock objects and temp files
        try (MockedStatic<ProcessExecutor> mockedStaticProcessExecutor =
                mockStatic(ProcessExecutor.class)) {
            // Create a mock PDF file
            MultipartFile pdfFile =
                    new ByteArrayMultipartFile(
                            "file", "test.pdf", APPLICATION_PDF, "Fake PDF content".getBytes());

            // Create a mock HTML output file with image references
            Path htmlOutputFile = tempDir.resolve("test.html");
            Files.write(
                    htmlOutputFile,
                    "<html><body><h1>Test</h1><p>This is a test.</p><img src=\"image1.png\" /></body></html>"
                            .getBytes());

            // Setup ProcessExecutor mock
            mockedStaticProcessExecutor
                    .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.PDFTOHTML))
                    .thenReturn(mockProcessExecutor);

            when(mockProcessExecutor.runCommandWithOutputHandling(anyList(), any(File.class)))
                    .thenAnswer(
                            invocation -> {
                                // When command is executed, simulate creation of output files
                                File outputDir = invocation.getArgument(1);

                                // Copy the mock HTML file to the output directory
                                Files.copy(
                                        htmlOutputFile, Path.of(outputDir.getPath(), "test.html"));

                                // Create a mock image file
                                Files.write(
                                        Path.of(outputDir.getPath(), "image1.png"),
                                        "Fake image data".getBytes());

                                return mockExecutorResult;
                            });

            // Execute the method
            Response response = pdfToFile.processPdfToMarkdown(pdfFile);

            // Verify - should now return a ZIP file instead of plain markdown
            assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
            byte[] bodyBytes = drain(response);
            assertNotNull(bodyBytes);
            assertTrue(bodyBytes.length > 0);

            // Verify content disposition indicates a ZIP file
            assertTrue(contentDisposition(response).contains("ToMarkdown.zip"));

            // Verify the content by unzipping it
            try (ZipInputStream zipStream =
                    ZipSecurity.createHardenedInputStream(
                            new java.io.ByteArrayInputStream(bodyBytes))) {
                ZipEntry entry;
                boolean foundMdFile = false;
                boolean foundImageInFolder = false;
                String markdownContent = null;

                while ((entry = zipStream.getNextEntry()) != null) {
                    if (entry.getName().endsWith(".md")) {
                        foundMdFile = true;
                        // Read markdown content to verify image references
                        markdownContent =
                                new String(
                                        zipStream.readAllBytes(),
                                        java.nio.charset.StandardCharsets.UTF_8);
                    } else if (entry.getName().startsWith("images/")
                            && entry.getName().endsWith(".png")) {
                        foundImageInFolder = true;
                    }
                    zipStream.closeEntry();
                }

                assertTrue(foundMdFile, "ZIP should contain Markdown file");
                assertTrue(foundImageInFolder, "ZIP should contain image in images/ folder");
                assertNotNull(markdownContent, "Markdown content should be present");
                // Verify markdown references images with images/ prefix
                assertTrue(
                        markdownContent.contains("images/"),
                        "Markdown should reference images with images/ prefix");
            }
        }
    }

    @Test
    void testProcessPdfToMarkdown_MultipleOutputFiles() throws IOException, InterruptedException {
        // Setup mock objects and temp files
        try (MockedStatic<ProcessExecutor> mockedStaticProcessExecutor =
                mockStatic(ProcessExecutor.class)) {
            // Create a mock PDF file
            MultipartFile pdfFile =
                    new ByteArrayMultipartFile(
                            "file",
                            "multipage.pdf",
                            APPLICATION_PDF,
                            "Fake PDF content".getBytes());

            // Setup ProcessExecutor mock
            mockedStaticProcessExecutor
                    .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.PDFTOHTML))
                    .thenReturn(mockProcessExecutor);

            when(mockProcessExecutor.runCommandWithOutputHandling(anyList(), any(File.class)))
                    .thenAnswer(
                            invocation -> {
                                // When command is executed, simulate creation of output files
                                File outputDir = invocation.getArgument(1);

                                // Create multiple HTML files and an image
                                Files.write(
                                        Path.of(outputDir.getPath(), "multipage.html"),
                                        "<html><body><h1>Cover</h1></body></html>".getBytes());
                                Files.write(
                                        Path.of(outputDir.getPath(), "multipage-1.html"),
                                        "<html><body><h1>Page 1</h1></body></html>".getBytes());
                                Files.write(
                                        Path.of(outputDir.getPath(), "multipage-2.html"),
                                        "<html><body><h1>Page 2</h1></body></html>".getBytes());
                                Files.write(
                                        Path.of(outputDir.getPath(), "image1.png"),
                                        "Fake image data".getBytes());

                                return mockExecutorResult;
                            });

            // Execute the method
            Response response = pdfToFile.processPdfToMarkdown(pdfFile);

            // Verify
            assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
            byte[] bodyBytes = drain(response);
            assertNotNull(bodyBytes);
            assertTrue(bodyBytes.length > 0);

            // Verify content disposition indicates a zip file
            assertTrue(contentDisposition(response).contains("ToMarkdown.zip"));

            // Verify the content by unzipping it
            try (ZipInputStream zipStream =
                    ZipSecurity.createHardenedInputStream(
                            new java.io.ByteArrayInputStream(bodyBytes))) {
                ZipEntry entry;
                boolean foundMdFiles = false;
                boolean foundImage = false;

                while ((entry = zipStream.getNextEntry()) != null) {
                    if (entry.getName().endsWith(".md")) {
                        foundMdFiles = true;
                    } else if (entry.getName().startsWith("images/")
                            && entry.getName().endsWith(".png")) {
                        foundImage = true;
                    }
                    zipStream.closeEntry();
                }

                assertTrue(foundMdFiles, "ZIP should contain Markdown files");
                assertTrue(foundImage, "ZIP should contain image files in images/ folder");
            }
        }
    }

    @Test
    void testProcessPdfToHtml() throws IOException, InterruptedException {
        // Setup mock objects and temp files
        try (MockedStatic<ProcessExecutor> mockedStaticProcessExecutor =
                mockStatic(ProcessExecutor.class)) {
            // Create a mock PDF file
            MultipartFile pdfFile =
                    new ByteArrayMultipartFile(
                            "file", "test.pdf", APPLICATION_PDF, "Fake PDF content".getBytes());

            // Setup ProcessExecutor mock
            mockedStaticProcessExecutor
                    .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.PDFTOHTML))
                    .thenReturn(mockProcessExecutor);

            when(mockProcessExecutor.runCommandWithOutputHandling(anyList(), any(File.class)))
                    .thenAnswer(
                            invocation -> {
                                // When command is executed, simulate creation of output files
                                File outputDir = invocation.getArgument(1);

                                // Create HTML files and assets
                                Files.write(
                                        Path.of(outputDir.getPath(), "test.html"),
                                        "<html><frameset></frameset></html>".getBytes());
                                Files.write(
                                        Path.of(outputDir.getPath(), "test_ind.html"),
                                        "<html><body>Index</body></html>".getBytes());
                                Files.write(
                                        Path.of(outputDir.getPath(), "test_img.png"),
                                        "Fake image data".getBytes());

                                return mockExecutorResult;
                            });

            // Execute the method
            Response response = pdfToFile.processPdfToHtml(pdfFile);

            // Verify
            assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
            byte[] bodyBytes = drain(response);
            assertNotNull(bodyBytes);
            assertTrue(bodyBytes.length > 0);

            // Verify content disposition indicates a zip file
            assertTrue(contentDisposition(response).contains("testToHtml.zip"));

            // Verify the content by unzipping it
            try (ZipInputStream zipStream =
                    ZipSecurity.createHardenedInputStream(
                            new java.io.ByteArrayInputStream(bodyBytes))) {
                ZipEntry entry;
                boolean foundMainHtml = false;
                boolean foundIndexHtml = false;
                boolean foundImage = false;

                while ((entry = zipStream.getNextEntry()) != null) {
                    switch (entry.getName()) {
                        case "test.html" -> foundMainHtml = true;
                        case "test_ind.html" -> foundIndexHtml = true;
                        case "test_img.png" -> foundImage = true;
                    }
                    zipStream.closeEntry();
                }

                assertTrue(foundMainHtml, "ZIP should contain main HTML file");
                assertTrue(foundIndexHtml, "ZIP should contain index HTML file");
                assertTrue(foundImage, "ZIP should contain image files");
            }
        }
    }

    @Test
    void testProcessPdfToOfficeFormat_SingleOutputFile() throws IOException, InterruptedException {
        // Setup mock objects and temp files
        try (MockedStatic<ProcessExecutor> mockedStaticProcessExecutor =
                mockStatic(ProcessExecutor.class)) {
            // Create a mock PDF file
            MultipartFile pdfFile =
                    new ByteArrayMultipartFile(
                            "file", "document.pdf", APPLICATION_PDF, "Fake PDF content".getBytes());

            // Setup ProcessExecutor mock
            mockedStaticProcessExecutor
                    .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE))
                    .thenReturn(mockProcessExecutor);

            when(mockProcessExecutor.runCommandWithOutputHandling(
                            argThat(
                                    args ->
                                            args != null
                                                    && args.contains("--convert-to")
                                                    && args.contains("docx"))))
                    .thenAnswer(
                            invocation -> {
                                // When command is executed, find the output directory argument
                                List<String> args = invocation.getArgument(0);
                                String outDir = null;
                                for (int i = 0; i < args.size(); i++) {
                                    if ("--outdir".equals(args.get(i)) && i + 1 < args.size()) {
                                        outDir = args.get(i + 1);
                                        break;
                                    }
                                }

                                // Create output file
                                assertNotNull(outDir);
                                Files.write(
                                        Path.of(outDir, "document.docx"),
                                        "Fake DOCX content".getBytes());

                                return mockExecutorResult;
                            });

            // Execute the method with docx format
            Response response =
                    pdfToFile.processPdfToOfficeFormat(pdfFile, "docx", "draw_pdf_import");

            // Verify
            assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
            byte[] bodyBytes = drain(response);
            assertNotNull(bodyBytes);
            assertTrue(bodyBytes.length > 0);

            // Verify content disposition has correct filename
            assertTrue(contentDisposition(response).contains("document.docx"));
        }
    }

    @Test
    void testProcessPdfToOfficeFormat_MultipleOutputFiles()
            throws IOException, InterruptedException {
        // Setup mock objects and temp files
        try (MockedStatic<ProcessExecutor> mockedStaticProcessExecutor =
                mockStatic(ProcessExecutor.class)) {
            // Create a mock PDF file
            MultipartFile pdfFile =
                    new ByteArrayMultipartFile(
                            "file", "document.pdf", APPLICATION_PDF, "Fake PDF content".getBytes());

            // Setup ProcessExecutor mock
            mockedStaticProcessExecutor
                    .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE))
                    .thenReturn(mockProcessExecutor);

            when(mockProcessExecutor.runCommandWithOutputHandling(
                            argThat(
                                    args ->
                                            args != null
                                                    && args.contains("--convert-to")
                                                    && args.contains("odp"))))
                    .thenAnswer(
                            invocation -> {
                                // When command is executed, find the output directory argument
                                List<String> args = invocation.getArgument(0);
                                String outDir = null;
                                for (int i = 0; i < args.size(); i++) {
                                    if ("--outdir".equals(args.get(i)) && i + 1 < args.size()) {
                                        outDir = args.get(i + 1);
                                        break;
                                    }
                                }

                                // Create multiple output files (simulating a presentation with
                                // multiple files)
                                assertNotNull(outDir);
                                Files.write(
                                        Path.of(outDir, "document.odp"),
                                        "Fake ODP content".getBytes());
                                Files.write(
                                        Path.of(outDir, "document_media1.png"),
                                        "Image 1 content".getBytes());
                                Files.write(
                                        Path.of(outDir, "document_media2.png"),
                                        "Image 2 content".getBytes());

                                return mockExecutorResult;
                            });

            // Execute the method with ODP format
            Response response =
                    pdfToFile.processPdfToOfficeFormat(pdfFile, "odp", "draw_pdf_import");

            // Verify
            assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
            byte[] bodyBytes = drain(response);
            assertNotNull(bodyBytes);
            assertTrue(bodyBytes.length > 0);

            // Verify content disposition for zip file
            assertTrue(contentDisposition(response).contains("documentToodp.zip"));

            // Verify the content by unzipping it
            try (ZipInputStream zipStream =
                    ZipSecurity.createHardenedInputStream(
                            new java.io.ByteArrayInputStream(bodyBytes))) {
                ZipEntry entry;
                boolean foundMainFile = false;
                boolean foundMediaFiles = false;

                while ((entry = zipStream.getNextEntry()) != null) {
                    if ("document.odp".equals(entry.getName())) {
                        foundMainFile = true;
                    } else if (entry.getName().startsWith("document_media")) {
                        foundMediaFiles = true;
                    }
                    zipStream.closeEntry();
                }

                assertTrue(foundMainFile, "ZIP should contain main ODP file");
                assertTrue(foundMediaFiles, "ZIP should contain media files");
            }
        }
    }

    @Test
    void testProcessPdfToOfficeFormat_TextFormat() throws IOException, InterruptedException {
        // Setup mock objects and temp files
        try (MockedStatic<ProcessExecutor> mockedStaticProcessExecutor =
                mockStatic(ProcessExecutor.class)) {
            // Create a mock PDF file
            MultipartFile pdfFile =
                    new ByteArrayMultipartFile(
                            "file", "document.pdf", APPLICATION_PDF, "Fake PDF content".getBytes());

            // Setup ProcessExecutor mock
            mockedStaticProcessExecutor
                    .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE))
                    .thenReturn(mockProcessExecutor);

            when(mockProcessExecutor.runCommandWithOutputHandling(
                            argThat(
                                    args ->
                                            args != null
                                                    && args.contains("--convert-to")
                                                    && args.contains("txt:Text"))))
                    .thenAnswer(
                            invocation -> {
                                // When command is executed, find the output directory argument
                                List<String> args = invocation.getArgument(0);
                                String outDir = null;
                                for (int i = 0; i < args.size(); i++) {
                                    if ("--outdir".equals(args.get(i)) && i + 1 < args.size()) {
                                        outDir = args.get(i + 1);
                                        break;
                                    }
                                }

                                // Create text output file
                                assertNotNull(outDir);
                                Files.write(
                                        Path.of(outDir, "document.txt"),
                                        "Extracted text content".getBytes());

                                return mockExecutorResult;
                            });

            // Execute the method with text format
            Response response =
                    pdfToFile.processPdfToOfficeFormat(pdfFile, "txt:Text", "draw_pdf_import");

            // Verify
            assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
            byte[] bodyBytes = drain(response);
            assertNotNull(bodyBytes);
            assertTrue(bodyBytes.length > 0);

            // Verify content disposition has txt extension
            assertTrue(contentDisposition(response).contains("document.txt"));
        }
    }

    @Test
    void testProcessPdfToOfficeFormat_NoFilename() throws IOException, InterruptedException {
        // Setup mock objects and temp files
        try (MockedStatic<ProcessExecutor> mockedStaticProcessExecutor =
                mockStatic(ProcessExecutor.class)) {
            // Create a mock PDF file with no filename
            MultipartFile pdfFile =
                    new ByteArrayMultipartFile(
                            "file", "", APPLICATION_PDF, "Fake PDF content".getBytes());

            // Setup ProcessExecutor mock
            mockedStaticProcessExecutor
                    .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE))
                    .thenReturn(mockProcessExecutor);

            when(mockProcessExecutor.runCommandWithOutputHandling(anyList()))
                    .thenAnswer(
                            invocation -> {
                                // When command is executed, find the output directory argument
                                List<String> args = invocation.getArgument(0);
                                String outDir = null;
                                for (int i = 0; i < args.size(); i++) {
                                    if ("--outdir".equals(args.get(i)) && i + 1 < args.size()) {
                                        outDir = args.get(i + 1);
                                        break;
                                    }
                                }

                                // Create output file - uses default name
                                assertNotNull(outDir);
                                Files.write(
                                        Path.of(outDir, "output.docx"),
                                        "Fake DOCX content".getBytes());

                                return mockExecutorResult;
                            });

            // Execute the method
            Response response =
                    pdfToFile.processPdfToOfficeFormat(pdfFile, "docx", "draw_pdf_import");

            // Verify
            assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
            byte[] bodyBytes = drain(response);
            assertNotNull(bodyBytes);
            assertTrue(bodyBytes.length > 0);

            // Verify content disposition contains output.docx
            assertTrue(contentDisposition(response).contains("output.docx"));
        }
    }

    @Test
    void testProcessPdfToOfficeFormat_UsesUnoconvertWhenConfigured()
            throws IOException, InterruptedException {
        when(mockRuntimePathConfig.getUnoConvertPath()).thenReturn("/custom/unoconvert");
        PDFToFile pdfToFileWithUno = new PDFToFile(mockTempFileManager, mockRuntimePathConfig);

        try (MockedStatic<ProcessExecutor> mockedStaticProcessExecutor =
                mockStatic(ProcessExecutor.class)) {
            MultipartFile pdfFile =
                    new ByteArrayMultipartFile(
                            "file", "document.pdf", APPLICATION_PDF, "Fake PDF content".getBytes());

            mockedStaticProcessExecutor
                    .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE))
                    .thenReturn(mockProcessExecutor);

            when(mockProcessExecutor.runCommandWithOutputHandling(
                            argThat(args -> args != null && args.contains("/custom/unoconvert"))))
                    .thenAnswer(
                            invocation -> {
                                List<String> args = invocation.getArgument(0);
                                String outputPath = args.get(args.size() - 1);
                                Files.write(Path.of(outputPath), "Fake DOCX content".getBytes());
                                return mockExecutorResult;
                            });

            Response response =
                    pdfToFileWithUno.processPdfToOfficeFormat(pdfFile, "docx", "writer_pdf_import");

            assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
            byte[] bodyBytes = drain(response);
            assertNotNull(bodyBytes);
            assertTrue(bodyBytes.length > 0);
            assertTrue(contentDisposition(response).contains("document.docx"));
        }
    }

    @Test
    void testProcessPdfToOfficeFormat_FallsBackWhenUnoconvertFails()
            throws IOException, InterruptedException {
        when(mockRuntimePathConfig.getUnoConvertPath()).thenReturn("/custom/unoconvert");
        PDFToFile pdfToFileWithUno = new PDFToFile(mockTempFileManager, mockRuntimePathConfig);

        try (MockedStatic<ProcessExecutor> mockedStaticProcessExecutor =
                mockStatic(ProcessExecutor.class)) {
            MultipartFile pdfFile =
                    new ByteArrayMultipartFile(
                            "file", "document.pdf", APPLICATION_PDF, "Fake PDF content".getBytes());

            mockedStaticProcessExecutor
                    .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE))
                    .thenReturn(mockProcessExecutor);

            when(mockProcessExecutor.runCommandWithOutputHandling(
                            argThat(args -> args != null && args.contains("/custom/unoconvert"))))
                    .thenThrow(new IOException("Conversion failed"));

            when(mockProcessExecutor.runCommandWithOutputHandling(
                            argThat(
                                    args ->
                                            args != null
                                                    && args.stream()
                                                            .anyMatch(
                                                                    arg ->
                                                                            arg.contains(
                                                                                    "soffice")))))
                    .thenAnswer(
                            invocation -> {
                                List<String> args = invocation.getArgument(0);
                                String outDir = null;
                                for (int i = 0; i < args.size(); i++) {
                                    if ("--outdir".equals(args.get(i)) && i + 1 < args.size()) {
                                        outDir = args.get(i + 1);
                                        break;
                                    }
                                }
                                assertNotNull(outDir);
                                Files.write(
                                        Path.of(outDir, "document.docx"),
                                        "Fallback DOCX content".getBytes());
                                return mockExecutorResult;
                            });

            Response response =
                    pdfToFileWithUno.processPdfToOfficeFormat(pdfFile, "docx", "writer_pdf_import");

            assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
            byte[] bodyBytes = drain(response);
            assertNotNull(bodyBytes);
            assertTrue(bodyBytes.length > 0);
            assertTrue(contentDisposition(response).contains("document.docx"));
        }
    }
}
