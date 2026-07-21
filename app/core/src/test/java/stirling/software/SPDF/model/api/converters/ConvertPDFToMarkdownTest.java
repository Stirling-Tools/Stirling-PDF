package stirling.software.SPDF.model.api.converters;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.mockito.MockedConstruction;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import stirling.software.common.pdf.PdfMarkdownConverter;
import stirling.software.common.util.TempFile;
import stirling.software.jpdfium.PdfDocument;

class ConvertPDFToMarkdownTest {

    private MockMvc mockMvc() {
        return MockMvcBuilders.standaloneSetup(new ConvertPDFToMarkdown(null))
                .setControllerAdvice(new GlobalErrorHandler())
                .build();
    }

    @RestControllerAdvice
    static class GlobalErrorHandler {
        @ExceptionHandler(Exception.class)
        ResponseEntity<Resource> handle(Exception ex) {
            String message = ex.getMessage();
            byte[] body = message != null ? message.getBytes(StandardCharsets.UTF_8) : new byte[0];
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new ByteArrayResource(body));
        }
    }

    @Test
    void pdfToMarkdownReturnsMarkdownBytes() throws Exception {
        byte[] md = "# heading\n\ncontent\n".getBytes(StandardCharsets.UTF_8);
        String expectedMd = "# heading\n\ncontent\n";

        File tmpFile = File.createTempFile("test", ".pdf");
        tmpFile.deleteOnExit();

        try (MockedConstruction<TempFile> tempMock =
                        Mockito.mockConstruction(
                                TempFile.class,
                                (mock, ctx) -> {
                                    when(mock.getFile()).thenReturn(tmpFile);
                                    when(mock.getPath()).thenReturn(tmpFile.toPath());
                                });
                MockedStatic<PdfDocument> docStatic = Mockito.mockStatic(PdfDocument.class);
                MockedConstruction<PdfMarkdownConverter> converterMock =
                        Mockito.mockConstruction(
                                PdfMarkdownConverter.class,
                                (mock, ctx) -> when(mock.convert(any())).thenReturn(expectedMd))) {

            PdfDocument mockDoc = Mockito.mock(PdfDocument.class);
            docStatic.when(() -> PdfDocument.open(any(Path.class))).thenReturn(mockDoc);

            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", "input.pdf", "application/pdf", new byte[] {1, 2, 3});

            mockMvc()
                    .perform(multipart("/api/v1/convert/pdf/markdown").file(file))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Content-Type", "text/markdown"))
                    .andExpect(content().bytes(md));
        }
    }

    @Test
    void pdfToMarkdownWhenServiceThrowsReturns500() throws Exception {
        File tmpFile = File.createTempFile("test", ".pdf");
        tmpFile.deleteOnExit();

        try (MockedConstruction<TempFile> tempMock =
                        Mockito.mockConstruction(
                                TempFile.class,
                                (mock, ctx) -> {
                                    when(mock.getFile()).thenReturn(tmpFile);
                                    when(mock.getPath()).thenReturn(tmpFile.toPath());
                                });
                MockedStatic<PdfDocument> docStatic = Mockito.mockStatic(PdfDocument.class);
                MockedConstruction<PdfMarkdownConverter> converterMock =
                        Mockito.mockConstruction(
                                PdfMarkdownConverter.class,
                                (mock, ctx) ->
                                        when(mock.convert(any()))
                                                .thenThrow(new RuntimeException("boom")))) {

            PdfDocument mockDoc = Mockito.mock(PdfDocument.class);
            docStatic.when(() -> PdfDocument.open(any(Path.class))).thenReturn(mockDoc);

            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", "x.pdf", "application/pdf", new byte[] {0x01});

            mockMvc()
                    .perform(multipart("/api/v1/convert/pdf/markdown").file(file))
                    .andExpect(status().isInternalServerError());
        }
    }
}
