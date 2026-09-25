package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class TextToOutlinesControllerTest {

    @TempDir Path tempDir;
    @Mock private TempFileManager tempFileManager;
    @Mock private EndpointConfiguration endpointConfiguration;
    @InjectMocks private TextToOutlinesController controller;

    @BeforeEach
    void setUp() throws IOException {
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            java.io.File f =
                                    Files.createTempFile("test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            lenient().when(tf.getAbsolutePath()).thenReturn(f.getAbsolutePath());
                            return tf;
                        });
    }

    private MockMultipartFile createPdfWithText() throws IOException {
        Path pdfPath = tempDir.resolve("text.pdf");
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream stream = new PDPageContentStream(doc, page)) {
                stream.beginText();
                stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                stream.newLineAtOffset(50, 700);
                stream.showText("outlines");
                stream.endText();
            }
            doc.save(pdfPath.toFile());
        }
        return new MockMultipartFile(
                "fileInput",
                "text.pdf",
                MediaType.APPLICATION_PDF_VALUE,
                Files.readAllBytes(pdfPath));
    }

    private PDFFile requestFor(MockMultipartFile file) {
        PDFFile request = new PDFFile();
        request.setFileInput(file);
        return request;
    }

    @Test
    @DisplayName("Throws ToolRequiredException when Ghostscript is disabled")
    void throwsWhenGhostscriptDisabled() throws IOException {
        when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(false);

        assertThrows(
                ExceptionUtils.ToolRequiredException.class,
                () -> controller.textToOutlines(requestFor(createPdfWithText())));
    }

    @Test
    @DisplayName("Invokes Ghostscript with -dNoOutputFonts")
    void invokesGhostscriptWithNoOutputFonts() throws Exception {
        when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);

        ProcessExecutor executor = mock(ProcessExecutor.class);
        ProcessExecutorResult result = mock(ProcessExecutorResult.class);
        when(result.getRc()).thenReturn(0);
        when(result.getMessages()).thenReturn("");

        try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
            pe.when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT))
                    .thenReturn(executor);
            when(executor.runCommandWithOutputHandling(any())).thenReturn(result);

            ResponseEntity<Resource> response =
                    controller.textToOutlines(requestFor(createPdfWithText()));

            assertEquals(200, response.getStatusCode().value());

            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<String>> captor = ArgumentCaptor.forClass(List.class);
            verify(executor).runCommandWithOutputHandling(captor.capture());
            List<String> command = captor.getValue();
            assertTrue(command.contains("-dNoOutputFonts"));
            assertTrue(command.contains("-sDEVICE=pdfwrite"));
        }
    }

    @Test
    @DisplayName("Ghostscript failure surfaces as an exception")
    void ghostscriptFailureSurfaces() throws Exception {
        when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);

        ProcessExecutor executor = mock(ProcessExecutor.class);
        ProcessExecutorResult result = mock(ProcessExecutorResult.class);
        when(result.getRc()).thenReturn(1);
        when(result.getMessages()).thenReturn("gs error");

        try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
            pe.when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT))
                    .thenReturn(executor);
            when(executor.runCommandWithOutputHandling(any())).thenReturn(result);

            assertThrows(
                    ExceptionUtils.GhostscriptException.class,
                    () -> controller.textToOutlines(requestFor(createPdfWithText())));
        }
    }
}
