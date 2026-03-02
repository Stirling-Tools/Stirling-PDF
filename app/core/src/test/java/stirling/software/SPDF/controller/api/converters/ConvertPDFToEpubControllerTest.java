package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.converters.ConvertPdfToEpubRequest;
import stirling.software.SPDF.model.api.converters.ConvertPdfToEpubRequest.OutputFormat;
import stirling.software.SPDF.model.api.converters.ConvertPdfToEpubRequest.TargetDevice;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.ProcessExecutor.Processes;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class ConvertPDFToEpubControllerTest {

    private static final MediaType EPUB_MEDIA_TYPE = MediaType.valueOf("application/epub+zip");

    @Mock private TempFileManager tempFileManager;
    @Mock private EndpointConfiguration endpointConfiguration;

    @InjectMocks private ConvertPDFToEpubController controller;

    @Test
    void convertPdfToEpub_buildsGoldenCommandAndCleansUp() throws Exception {
        when(endpointConfiguration.isGroupEnabled("Calibre")).thenReturn(true);

        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "novel.pdf", "application/pdf", "content".getBytes());

        ConvertPdfToEpubRequest request = new ConvertPdfToEpubRequest();
        request.setFileInput(pdfFile);

        Path workingDir = Files.createTempDirectory("pdf-epub-test-");
        when(tempFileManager.createTempDirectory()).thenReturn(workingDir);

        AtomicReference<Path> deletedDir = new AtomicReference<>();
        doAnswer(
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
                MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {

            ProcessExecutor executor = mock(ProcessExecutor.class);
            pe.when(() -> ProcessExecutor.getInstance(Processes.CALIBRE)).thenReturn(executor);

            ProcessExecutorResult execResult = mock(ProcessExecutorResult.class);
            when(execResult.getRc()).thenReturn(0);

            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<String>> commandCaptor = ArgumentCaptor.forClass(List.class);
            Path expectedInput = workingDir.resolve("novel.pdf");
            Path expectedOutput = workingDir.resolve("novel.epub");

            when(executor.runCommandWithOutputHandling(
                            commandCaptor.capture(), eq(workingDir.toFile())))
                    .thenAnswer(
                            invocation -> {
                                Files.writeString(expectedOutput, "epub");
                                return execResult;
                            });

            gu.when(() -> GeneralUtils.generateFilename("novel.pdf", "_convertedToEPUB.epub"))
                    .thenReturn("novel_convertedToEPUB.epub");
            ResponseEntity<byte[]> response = controller.convertPdfToEpub(request);

            List<String> command = commandCaptor.getValue();
            assertEquals(13, command.size());
            assertEquals("ebook-convert", command.get(0));
            assertEquals(expectedInput.toString(), command.get(1));
            assertEquals(expectedOutput.toString(), command.get(2));
            assertTrue(command.contains("--pdf-engine"));
            assertTrue(command.contains("pdftohtml"));
            assertTrue(command.contains("--enable-heuristics"));
            assertTrue(command.contains("--insert-blank-line"));
            assertTrue(command.contains("--filter-css"));
            assertTrue(
                    command.contains(
                            "font-family,color,background-color,margin-left,margin-right"));
            assertTrue(command.contains("--chapter"));
            assertTrue(command.stream().anyMatch(arg -> arg.contains("Chapter\\s+")));
            assertTrue(command.contains("--output-profile"));
            assertTrue(command.contains(TargetDevice.TABLET_PHONE_IMAGES.getCalibreProfile()));

            assertEquals(EPUB_MEDIA_TYPE, response.getHeaders().getContentType());
            assertEquals(
                    "novel_convertedToEPUB.epub",
                    response.getHeaders().getContentDisposition().getFilename());
            assertEquals("epub", new String(response.getBody(), StandardCharsets.UTF_8));

            verify(tempFileManager).deleteTempDirectory(workingDir);
            assertEquals(workingDir, deletedDir.get());
        } finally {
            deleteIfExists(workingDir);
        }
    }

    @Test
    void convertPdfToEpub_respectsOptions() throws Exception {
        when(endpointConfiguration.isGroupEnabled("Calibre")).thenReturn(true);

        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "story.pdf", "application/pdf", "content".getBytes());

        ConvertPdfToEpubRequest request = new ConvertPdfToEpubRequest();
        request.setFileInput(pdfFile);
        request.setDetectChapters(false);
        request.setTargetDevice(TargetDevice.KINDLE_EINK_TEXT);

        Path workingDir = Files.createTempDirectory("pdf-epub-options-test-");
        when(tempFileManager.createTempDirectory()).thenReturn(workingDir);

        doAnswer(
                        invocation -> {
                            Path dir = invocation.getArgument(0);
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
                MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {

            ProcessExecutor executor = mock(ProcessExecutor.class);
            pe.when(() -> ProcessExecutor.getInstance(Processes.CALIBRE)).thenReturn(executor);

            ProcessExecutorResult execResult = mock(ProcessExecutorResult.class);
            when(execResult.getRc()).thenReturn(0);

            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<String>> commandCaptor = ArgumentCaptor.forClass(List.class);
            Path expectedOutput = workingDir.resolve("story.epub");

            when(executor.runCommandWithOutputHandling(
                            commandCaptor.capture(), eq(workingDir.toFile())))
                    .thenAnswer(
                            invocation -> {
                                Files.writeString(expectedOutput, "epub");
                                return execResult;
                            });

            gu.when(() -> GeneralUtils.generateFilename("story.pdf", "_convertedToEPUB.epub"))
                    .thenReturn("story_convertedToEPUB.epub");
            ResponseEntity<byte[]> response = controller.convertPdfToEpub(request);

            List<String> command = commandCaptor.getValue();
            assertTrue(command.stream().noneMatch(arg -> "--chapter".equals(arg)));
            assertTrue(command.contains("--output-profile"));
            assertTrue(command.contains(TargetDevice.KINDLE_EINK_TEXT.getCalibreProfile()));
            assertTrue(command.contains("--pdf-engine"));
            assertTrue(command.contains("pdftohtml"));
            assertTrue(command.contains("--filter-css"));
            assertTrue(
                    command.contains(
                            "font-family,color,background-color,margin-left,margin-right"));
            assertTrue(command.size() >= 11);

            assertEquals(EPUB_MEDIA_TYPE, response.getHeaders().getContentType());
            assertEquals(
                    "story_convertedToEPUB.epub",
                    response.getHeaders().getContentDisposition().getFilename());
            assertEquals("epub", new String(response.getBody(), StandardCharsets.UTF_8));
        } finally {
            deleteIfExists(workingDir);
        }
    }

    @Test
    void convertPdfToAzw3_buildsCorrectCommandAndOutput() throws Exception {
        when(endpointConfiguration.isGroupEnabled("Calibre")).thenReturn(true);

        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "book.pdf", "application/pdf", "content".getBytes());

        ConvertPdfToEpubRequest request = new ConvertPdfToEpubRequest();
        request.setFileInput(pdfFile);
        request.setOutputFormat(OutputFormat.AZW3);
        request.setDetectChapters(false);
        request.setTargetDevice(TargetDevice.KINDLE_EINK_TEXT);

        Path workingDir = Files.createTempDirectory("pdf-azw3-test-");
        when(tempFileManager.createTempDirectory()).thenReturn(workingDir);

        doAnswer(
                        invocation -> {
                            Path dir = invocation.getArgument(0);
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
                MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {

            ProcessExecutor executor = mock(ProcessExecutor.class);
            pe.when(() -> ProcessExecutor.getInstance(Processes.CALIBRE)).thenReturn(executor);

            ProcessExecutorResult execResult = mock(ProcessExecutorResult.class);
            when(execResult.getRc()).thenReturn(0);

            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<String>> commandCaptor = ArgumentCaptor.forClass(List.class);
            Path expectedInput = workingDir.resolve("book.pdf");
            Path expectedOutput = workingDir.resolve("book.azw3");

            when(executor.runCommandWithOutputHandling(
                            commandCaptor.capture(), eq(workingDir.toFile())))
                    .thenAnswer(
                            invocation -> {
                                Files.writeString(expectedOutput, "azw3");
                                return execResult;
                            });

            gu.when(() -> GeneralUtils.generateFilename("book.pdf", "_convertedToAZW3.azw3"))
                    .thenReturn("book_convertedToAZW3.azw3");
            ResponseEntity<byte[]> response = controller.convertPdfToEpub(request);

            List<String> command = commandCaptor.getValue();
            assertEquals("ebook-convert", command.get(0));
            assertEquals(expectedInput.toString(), command.get(1));
            assertEquals(expectedOutput.toString(), command.get(2));
            assertTrue(command.contains("--pdf-engine"));
            assertTrue(command.contains("pdftohtml"));
            assertTrue(command.contains("--enable-heuristics"));
            assertTrue(command.contains("--insert-blank-line"));
            assertTrue(command.contains("--filter-css"));
            assertTrue(command.stream().noneMatch(arg -> "--chapter".equals(arg)));
            assertTrue(command.contains("--output-profile"));
            assertTrue(command.contains(TargetDevice.KINDLE_EINK_TEXT.getCalibreProfile()));

            assertEquals(
                    MediaType.valueOf("application/vnd.amazon.ebook"),
                    response.getHeaders().getContentType());
            assertEquals(
                    "book_convertedToAZW3.azw3",
                    response.getHeaders().getContentDisposition().getFilename());
            assertEquals("azw3", new String(response.getBody(), StandardCharsets.UTF_8));

            verify(tempFileManager).deleteTempDirectory(workingDir);
        } finally {
            deleteIfExists(workingDir);
        }
    }

    private void deleteIfExists(Path directory) throws IOException {
        if (directory == null || !Files.exists(directory)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(directory)) {
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
