package stirling.software.SPDF.model.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.MockedConstruction;
import org.mockito.Mockito;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.util.PDFToFile;

class ConvertPDFToMarkdownTest {

    private MockMvc mockMvc() {
        return MockMvcBuilders.standaloneSetup(new ConvertPDFToMarkdown(null))
                .setControllerAdvice(new GlobalErrorHandler())
                .build();
    }

    @RestControllerAdvice
    static class GlobalErrorHandler {
        @ExceptionHandler(Exception.class)
        ResponseEntity<byte[]> handle(Exception ex) {
            String message = ex.getMessage();
            byte[] body = message != null ? message.getBytes(StandardCharsets.UTF_8) : new byte[0];
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }

    @Test
    void pdfToMarkdownReturnsMarkdownBytes() throws Exception {
        byte[] md = "# heading\n\ncontent\n".getBytes(StandardCharsets.UTF_8);

        try (MockedConstruction<PDFToFile> construction =
                Mockito.mockConstruction(
                        PDFToFile.class,
                        (mock, ctx) -> {
                            when(mock.processPdfToMarkdown(any(MultipartFile.class)))
                                    .thenAnswer(
                                            inv ->
                                                    ResponseEntity.ok()
                                                            .header("Content-Type", "text/markdown")
                                                            .body(md));
                        })) {

            MockMvc mvc = mockMvc();

            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", // must match the field name in PDFFile
                            "input.pdf",
                            "application/pdf",
                            new byte[] {1, 2, 3});

            mvc.perform(multipart("/api/v1/convert/pdf/markdown").file(file))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Content-Type", "text/markdown"))
                    .andExpect(content().bytes(md));

            // Verify that exactly one instance was created
            assert construction.constructed().size() == 1;

            // And that the uploaded file was passed to processPdfToMarkdown()
            PDFToFile created = construction.constructed().get(0);
            ArgumentCaptor<MultipartFile> captor = ArgumentCaptor.forClass(MultipartFile.class);
            verify(created, times(1)).processPdfToMarkdown(captor.capture());
            MultipartFile passed = captor.getValue();

            // Minimal plausibility checks
            assertEquals("input.pdf", passed.getOriginalFilename());
            assertEquals("application/pdf", passed.getContentType());
        }
    }

    @Test
    void pdfToMarkdownWhenServiceThrowsReturns500() throws Exception {
        try (MockedConstruction<PDFToFile> ignored =
                Mockito.mockConstruction(
                        PDFToFile.class,
                        (mock, ctx) -> {
                            when(mock.processPdfToMarkdown(any(MultipartFile.class)))
                                    .thenThrow(new RuntimeException("boom"));
                        })) {

            MockMvc mvc = mockMvc();

            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", "x.pdf", "application/pdf", new byte[] {0x01});

            mvc.perform(multipart("/api/v1/convert/pdf/markdown").file(file))
                    .andExpect(status().isInternalServerError());
        }
    }
}
