package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

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
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.ZipSecurity;

import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;

/**
 * Tests for PDFToFile utility class. This includes both invalid content type cases and positive
 * test cases that mock external process execution.
 */
@ExtendWith(MockitoExtension.class)
class PDFToFileTest {

    @TempDir Path tempDir;

    private PDFToFile pdfToFile;

    @Mock private ProcessExecutor mockProcessExecutor;
    @Mock private ProcessExecutorResult mockExecutorResult;

    @BeforeEach
    void setUp() {
        pdfToFile = new PDFToFile();
    }

    @Test
    void testProcessPdfToMarkdown_InvalidContentType() throws IOException, InterruptedException {
        // Prepare
        MultipartFile nonPdfFile =
                new MockMultipartFile(
                        "file", "test.txt", "text/plain", "This is not a PDF".getBytes());

        // Execute
        ResponseEntity<byte[]> response = pdfToFile.processPdfToMarkdown(nonPdfFile);

        // Verify
        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void testProcessPdfToHtml_InvalidContentType() throws IOException, InterruptedException {
        // Prepare
        MultipartFile nonPdfFile =
                new MockMultipartFile(
                        "file", "test.txt", "text/plain", "This is not a PDF".getBytes());

        // Execute
        ResponseEntity<byte[]> response = pdfToFile.processPdfToHtml(nonPdfFile);

        // Verify
        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void testProcessPdfToOfficeFormat_InvalidContentType()
            throws IOException, InterruptedException {
        // Prepare
        MultipartFile nonPdfFile =
                new MockMultipartFile(
                        "file", "test.txt", "text/plain", "This is not a PDF".getBytes());

        // Execute
        ResponseEntity<byte[]> response =
                pdfToFile.processPdfToOfficeFormat(nonPdfFile, "docx", "draw_pdf_import");

        // Verify
        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void testProcessPdfToOfficeFormat_InvalidOutputFormat()
            throws IOException, InterruptedException {
        // Prepare
        MultipartFile pdfFile =
                new MockMultipartFile(
                        "file", "test.pdf", "application/pdf", "Fake PDF content".getBytes());

        // Execute with invalid format
        ResponseEntity<byte[]> response =
                pdfToFile.processPdfToOfficeFormat(pdfFile, "invalid_format", "draw_pdf_import");

        // Verify
        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void testProcessPdfToMarkdown_SingleOutputFile() throws IOException, InterruptedException {
        // Setup mock objects and temp files
        try (MockedStatic<ProcessExecutor> mockedStaticProcessExecutor =
                mockStatic(ProcessExecutor.class)) {
            // Create a mock PDF file
            MultipartFile pdfFile =
                    new MockMultipartFile(
                            "file", "test.pdf", "application/pdf", "Fake PDF content".getBytes());

            // Create a mock HTML output file
            Path htmlOutputFile = tempDir.resolve("test.html");
            Files.write(
                    htmlOutputFile,
                    "<html><body><h1>Test</h1><p>This is a test.</p></body></html>".getBytes());

            // Setup ProcessExecutor mock
            mockedStaticProcessExecutor
                    .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.PDFTOHTML))
                    .thenReturn(mockProcessExecutor);

            when(mockProcessExecutor.runCommandWithOutputHandling(any(List.class), any(File.class)))
                    .thenAnswer(
                            invocation -> {
                                // When command is executed, simulate creation of output files
                                File outputDir = invocation.getArgument(1);

                                // Copy the mock HTML file to the output directory
                                Files.copy(
                                        htmlOutputFile, Path.of(outputDir.getPath(), "test.html"));

                                return mockExecutorResult;
                            });

            // Execute the method
            ResponseEntity<byte[]> response = pdfToFile.processPdfToMarkdown(pdfFile);

            // Verify
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            assertTrue(response.getBody().length > 0);
            assertTrue(
                    response.getHeaders().getContentDisposition().toString().contains("test.md"));
        }
    }

    @Test
    void testProcessPdfToMarkdown_MultipleOutputFiles() throws IOException, InterruptedException {
        // Setup mock objects and temp files
        try (MockedStatic<ProcessExecutor> mockedStaticProcessExecutor =
                mockStatic(ProcessExecutor.class)) {
            // Create a mock PDF file
            MultipartFile pdfFile =
                    new MockMultipartFile(
                            "file",
                            "multipage.pdf",
                            "application/pdf",
                            "Fake PDF content".getBytes());

            // Setup ProcessExecutor mock
            mockedStaticProcessExecutor
                    .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.PDFTOHTML))
                    .thenReturn(mockProcessExecutor);

            when(mockProcessExecutor.runCommandWithOutputHandling(any(List.class), any(File.class)))
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
            ResponseEntity<byte[]> response = pdfToFile.processPdfToMarkdown(pdfFile);

            // Verify
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            assertTrue(response.getBody().length > 0);

            // Verify content disposition indicates a zip file
            assertTrue(
                    response.getHeaders()
                            .getContentDisposition()
                            .toString()
                            .contains("ToMarkdown.zip"));

            // Verify the content by unzipping it
            try (ZipInputStream zipStream =
                    ZipSecurity.createHardenedInputStream(
                            new java.io.ByteArrayInputStream(response.getBody()))) {
                ZipEntry entry;
                boolean foundMdFiles = false;
                boolean foundImage = false;

                while ((entry = zipStream.getNextEntry()) != null) {
                    if (entry.getName().endsWith(".md")) {
                        foundMdFiles = true;
                    } else if (entry.getName().endsWith(".png")) {
                        foundImage = true;
                    }
                    zipStream.closeEntry();
                }

                assertTrue(foundMdFiles, "ZIP should contain Markdown files");
                assertTrue(foundImage, "ZIP should contain image files");
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
                    new MockMultipartFile(
                            "file", "test.pdf", "application/pdf", "Fake PDF content".getBytes());

            // Setup ProcessExecutor mock
            mockedStaticProcessExecutor
                    .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.PDFTOHTML))
                    .thenReturn(mockProcessExecutor);

            when(mockProcessExecutor.runCommandWithOutputHandling(any(List.class), any(File.class)))
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
            ResponseEntity<byte[]> response = pdfToFile.processPdfToHtml(pdfFile);

            // Verify
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            assertTrue(response.getBody().length > 0);

            // Verify content disposition indicates a zip file
            assertTrue(
                    response.getHeaders()
                            .getContentDisposition()
                            .toString()
                            .contains("testToHtml.zip"));

            // Verify the content by unzipping it
            try (ZipInputStream zipStream =
                    ZipSecurity.createHardenedInputStream(
                            new java.io.ByteArrayInputStream(response.getBody()))) {
                ZipEntry entry;
                boolean foundMainHtml = false;
                boolean foundIndexHtml = false;
                boolean foundImage = false;

                while ((entry = zipStream.getNextEntry()) != null) {
                    if ("test.html".equals(entry.getName())) {
                        foundMainHtml = true;
                    } else if ("test_ind.html".equals(entry.getName())) {
                        foundIndexHtml = true;
                    } else if ("test_img.png".equals(entry.getName())) {
                        foundImage = true;
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
                    new MockMultipartFile(
                            "file",
                            "document.pdf",
                            "application/pdf",
                            "Fake PDF content".getBytes());

            // Setup ProcessExecutor mock
            mockedStaticProcessExecutor
                    .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE))
                    .thenReturn(mockProcessExecutor);

            when(mockProcessExecutor.runCommandWithOutputHandling(
                            argThat(
                                    args ->
                                            args.contains("--convert-to")
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
                                Files.write(
                                        Path.of(outDir, "document.docx"),
                                        "Fake DOCX content".getBytes());

                                return mockExecutorResult;
                            });

            // Execute the method with docx format
            ResponseEntity<byte[]> response =
                    pdfToFile.processPdfToOfficeFormat(pdfFile, "docx", "draw_pdf_import");

            // Verify
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            assertTrue(response.getBody().length > 0);

            // Verify content disposition has correct filename
            assertTrue(
                    response.getHeaders()
                            .getContentDisposition()
                            .toString()
                            .contains("document.docx"));
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
                    new MockMultipartFile(
                            "file",
                            "document.pdf",
                            "application/pdf",
                            "Fake PDF content".getBytes());

            // Setup ProcessExecutor mock
            mockedStaticProcessExecutor
                    .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE))
                    .thenReturn(mockProcessExecutor);

            when(mockProcessExecutor.runCommandWithOutputHandling(
                            argThat(args -> args.contains("--convert-to") && args.contains("odp"))))
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
            ResponseEntity<byte[]> response =
                    pdfToFile.processPdfToOfficeFormat(pdfFile, "odp", "draw_pdf_import");

            // Verify
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            assertTrue(response.getBody().length > 0);

            // Verify content disposition for zip file
            assertTrue(
                    response.getHeaders()
                            .getContentDisposition()
                            .toString()
                            .contains("documentToodp.zip"));

            // Verify the content by unzipping it
            try (ZipInputStream zipStream =
                    ZipSecurity.createHardenedInputStream(
                            new java.io.ByteArrayInputStream(response.getBody()))) {
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
                    new MockMultipartFile(
                            "file",
                            "document.pdf",
                            "application/pdf",
                            "Fake PDF content".getBytes());

            // Setup ProcessExecutor mock
            mockedStaticProcessExecutor
                    .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE))
                    .thenReturn(mockProcessExecutor);

            when(mockProcessExecutor.runCommandWithOutputHandling(
                            argThat(
                                    args ->
                                            args.contains("--convert-to")
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
                                Files.write(
                                        Path.of(outDir, "document.txt"),
                                        "Extracted text content".getBytes());

                                return mockExecutorResult;
                            });

            // Execute the method with text format
            ResponseEntity<byte[]> response =
                    pdfToFile.processPdfToOfficeFormat(pdfFile, "txt:Text", "draw_pdf_import");

            // Verify
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            assertTrue(response.getBody().length > 0);

            // Verify content disposition has txt extension
            assertTrue(
                    response.getHeaders()
                            .getContentDisposition()
                            .toString()
                            .contains("document.txt"));
        }
    }

    @Test
    void testProcessPdfToOfficeFormat_NoFilename() throws IOException, InterruptedException {
        // Setup mock objects and temp files
        try (MockedStatic<ProcessExecutor> mockedStaticProcessExecutor =
                mockStatic(ProcessExecutor.class)) {
            // Create a mock PDF file with no filename
            MultipartFile pdfFile =
                    new MockMultipartFile(
                            "file", "", "application/pdf", "Fake PDF content".getBytes());

            // Setup ProcessExecutor mock
            mockedStaticProcessExecutor
                    .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE))
                    .thenReturn(mockProcessExecutor);

            when(mockProcessExecutor.runCommandWithOutputHandling(any(List.class)))
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
                                Files.write(
                                        Path.of(outDir, "output.docx"),
                                        "Fake DOCX content".getBytes());

                                return mockExecutorResult;
                            });

            // Execute the method
            ResponseEntity<byte[]> response =
                    pdfToFile.processPdfToOfficeFormat(pdfFile, "docx", "draw_pdf_import");

            // Verify
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            assertTrue(response.getBody().length > 0);

            // Verify content disposition contains output.docx
            assertTrue(
                    response.getHeaders()
                            .getContentDisposition()
                            .toString()
                            .contains("output.docx"));
        }
    }
}
