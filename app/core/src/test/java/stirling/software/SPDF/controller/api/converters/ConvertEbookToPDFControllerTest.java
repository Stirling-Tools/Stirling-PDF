package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.BeforeEach;
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
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.converters.ConvertEbookToPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.ProcessExecutor.Processes;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class ConvertEbookToPDFControllerTest {
    private static ResponseEntity<Resource> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(new ByteArrayResource(bytes));
    }

    private static byte[] drainBody(ResponseEntity<Resource> response) throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        try (java.io.InputStream __in = response.getBody().getInputStream()) {
            __in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private EndpointConfiguration endpointConfiguration;

    @InjectMocks private ConvertEbookToPDFController controller;

    @BeforeEach
    void setUp() throws Exception {
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
    }

    @Test
    void convertEbookToPdf_buildsCalibreCommandAndCleansUp() throws Exception {
        when(endpointConfiguration.isGroupEnabled("Calibre")).thenReturn(true);

        MockMultipartFile ebookFile =
                new MockMultipartFile(
                        "fileInput", "ebook.epub", "application/epub+zip", "content".getBytes());

        ConvertEbookToPdfRequest request = new ConvertEbookToPdfRequest();
        request.setFileInput(ebookFile);
        request.setEmbedAllFonts(true);
        request.setIncludeTableOfContents(true);
        request.setIncludePageNumbers(true);

        Path workingDir = Files.createTempDirectory("ebook-convert-test-");
        when(tempFileManager.createTempDirectory()).thenReturn(workingDir);

        AtomicReference<Path> deletedDir = new AtomicReference<>();
        Mockito.doAnswer(
                        invocation -> {
                            Path dir = invocation.getArgument(0);
                            deletedDir.set(dir);
                            if (Files.exists(dir)) {
                                try (Stream<Path> paths = Files.walk(dir)) {
                                    paths.sorted(Comparator.reverseOrder())
                                            .forEach(
                                                    path -> {
                                                        try {
                                                            Files.deleteIfExists(path);
                                                        } catch (IOException ignored) {
                                                        }
                                                    });
                                }
                            }
                            return null;
                        })
                .when(tempFileManager)
                .deleteTempDirectory(any(Path.class));

        PDDocument mockDocument = Mockito.mock(PDDocument.class);
        when(pdfDocumentFactory.load(any(File.class))).thenReturn(mockDocument);

        try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class);
                MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {

            ProcessExecutor executor = Mockito.mock(ProcessExecutor.class);
            pe.when(() -> ProcessExecutor.getInstance(Processes.CALIBRE)).thenReturn(executor);

            ProcessExecutorResult execResult = Mockito.mock(ProcessExecutorResult.class);
            when(execResult.getRc()).thenReturn(0);

            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<String>> commandCaptor = ArgumentCaptor.forClass(List.class);
            Path expectedInput = workingDir.resolve("ebook.epub");
            Path expectedOutput = workingDir.resolve("ebook.pdf");
            when(executor.runCommandWithOutputHandling(
                            commandCaptor.capture(), eq(workingDir.toFile())))
                    .thenAnswer(
                            invocation -> {
                                Files.writeString(expectedOutput, "pdf");
                                return execResult;
                            });

            ResponseEntity<Resource> expectedResponse = streamingOk("result".getBytes());
            wr.when(() -> WebResponseUtils.pdfFileToWebResponse(any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);
            gu.when(() -> GeneralUtils.generateFilename("ebook.epub", "_convertedToPDF.pdf"))
                    .thenReturn("ebook_convertedToPDF.pdf");

            ResponseEntity<Resource> response = controller.convertEbookToPdf(request);

            assertSame(expectedResponse, response);

            List<String> command = commandCaptor.getValue();
            assertEquals(6, command.size());
            assertEquals("ebook-convert", command.get(0));
            assertEquals(expectedInput.toString(), command.get(1));
            assertEquals(expectedOutput.toString(), command.get(2));
            assertEquals("--embed-all-fonts", command.get(3));
            assertEquals("--pdf-add-toc", command.get(4));
            assertEquals("--pdf-page-numbers", command.get(5));

            assertFalse(Files.exists(expectedInput));
            assertFalse(Files.exists(expectedOutput));
            assertEquals(workingDir, deletedDir.get());
            Mockito.verify(tempFileManager).deleteTempDirectory(workingDir);
        }

        if (Files.exists(workingDir)) {
            try (Stream<Path> paths = Files.walk(workingDir)) {
                paths.sorted(Comparator.reverseOrder())
                        .forEach(
                                path -> {
                                    try {
                                        Files.deleteIfExists(path);
                                    } catch (IOException ignored) {
                                    }
                                });
            }
        }
    }

    @Test
    void convertEbookToPdf_withUnsupportedExtensionThrows() {
        when(endpointConfiguration.isGroupEnabled("Calibre")).thenReturn(true);

        MockMultipartFile unsupported =
                new MockMultipartFile(
                        "fileInput", "ebook.exe", "application/octet-stream", new byte[] {1, 2, 3});

        ConvertEbookToPdfRequest request = new ConvertEbookToPdfRequest();
        request.setFileInput(unsupported);

        assertThrows(IllegalArgumentException.class, () -> controller.convertEbookToPdf(request));
    }

    @Test
    void convertEbookToPdf_withOptimizeForEbookUsesGhostscript() throws Exception {
        when(endpointConfiguration.isGroupEnabled("Calibre")).thenReturn(true);
        when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);

        MockMultipartFile ebookFile =
                new MockMultipartFile(
                        "fileInput", "ebook.epub", "application/epub+zip", "content".getBytes());

        ConvertEbookToPdfRequest request = new ConvertEbookToPdfRequest();
        request.setFileInput(ebookFile);
        request.setOptimizeForEbook(true);

        Path workingDir = Files.createTempDirectory("ebook-convert-opt-test-");
        when(tempFileManager.createTempDirectory()).thenReturn(workingDir);

        AtomicReference<Path> deletedDir = new AtomicReference<>();
        Mockito.doAnswer(
                        invocation -> {
                            Path dir = invocation.getArgument(0);
                            deletedDir.set(dir);
                            if (Files.exists(dir)) {
                                try (Stream<Path> paths = Files.walk(dir)) {
                                    paths.sorted(Comparator.reverseOrder())
                                            .forEach(
                                                    path -> {
                                                        try {
                                                            Files.deleteIfExists(path);
                                                        } catch (IOException ignored) {
                                                        }
                                                    });
                                }
                            }
                            return null;
                        })
                .when(tempFileManager)
                .deleteTempDirectory(any(Path.class));

        try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class)) {

            ProcessExecutor executor = Mockito.mock(ProcessExecutor.class);
            pe.when(() -> ProcessExecutor.getInstance(Processes.CALIBRE)).thenReturn(executor);

            ProcessExecutorResult execResult = Mockito.mock(ProcessExecutorResult.class);
            when(execResult.getRc()).thenReturn(0);

            Path expectedInput = workingDir.resolve("ebook.epub");
            Path expectedOutput = workingDir.resolve("ebook.pdf");
            when(executor.runCommandWithOutputHandling(any(List.class), eq(workingDir.toFile())))
                    .thenAnswer(
                            invocation -> {
                                Files.writeString(expectedOutput, "pdf");
                                return execResult;
                            });

            gu.when(() -> GeneralUtils.generateFilename("ebook.epub", "_convertedToPDF.pdf"))
                    .thenReturn("ebook_convertedToPDF.pdf");
            byte[] optimizedBytes = "optimized".getBytes(StandardCharsets.UTF_8);
            gu.when(() -> GeneralUtils.optimizePdfWithGhostscript(Mockito.any(byte[].class)))
                    .thenReturn(optimizedBytes);

            ResponseEntity<Resource> expectedResponse = streamingOk(optimizedBytes);
            wr.when(() -> WebResponseUtils.pdfFileToWebResponse(any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            ResponseEntity<Resource> response = controller.convertEbookToPdf(request);

            assertSame(expectedResponse, response);
            gu.verify(() -> GeneralUtils.optimizePdfWithGhostscript(Mockito.any(byte[].class)));
            Mockito.verifyNoInteractions(pdfDocumentFactory);
            Mockito.verify(tempFileManager).deleteTempDirectory(workingDir);
            assertEquals(workingDir, deletedDir.get());
            assertFalse(Files.exists(expectedInput));
            assertFalse(Files.exists(expectedOutput));
        }

        if (Files.exists(workingDir)) {
            try (Stream<Path> paths = Files.walk(workingDir)) {
                paths.sorted(Comparator.reverseOrder())
                        .forEach(
                                path -> {
                                    try {
                                        Files.deleteIfExists(path);
                                    } catch (IOException ignored) {
                                    }
                                });
            }
        }
    }
}
