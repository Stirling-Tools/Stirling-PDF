package stirling.software.SPDF.model.api.converters;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.service.OfficeConversionService;
import stirling.software.officeconvert.OfficeConvert;

class ConvertPDFToMarkdownTest {

    private final OfficeConversionService office = mock(OfficeConversionService.class);

    private MockMvc mockMvc() {
        when(office.settings()).thenReturn(OfficeConvert.Settings.defaults());
        return MockMvcBuilders.standaloneSetup(new ConvertPDFToMarkdown(office))
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

    private static MockMultipartFile pdf() {
        return new MockMultipartFile(
                "fileInput", "input.pdf", "application/pdf", new byte[] {1, 2, 3});
    }

    @Test
    void pdfToMarkdownReturnsMarkdownBytes() throws Exception {
        byte[] md = "# heading\n\ncontent\n".getBytes(StandardCharsets.UTF_8);
        MockMvc mvc = mockMvc();
        when(office.convert(
                        any(MultipartFile.class),
                        eq("md"),
                        eq(MediaType.valueOf("text/markdown")),
                        any()))
                .thenReturn(
                        ResponseEntity.ok()
                                .contentType(MediaType.valueOf("text/markdown"))
                                .body(new ByteArrayResource(md)));

        mvc.perform(multipart("/api/v1/convert/pdf/markdown").file(pdf()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "text/markdown"))
                .andExpect(content().bytes(md));
    }

    @Test
    void pdfToMarkdownWhenConverterThrowsReturns500() throws Exception {
        MockMvc mvc = mockMvc();
        when(office.convert(any(MultipartFile.class), any(), any(), any()))
                .thenThrow(new IOException("boom"));

        mvc.perform(multipart("/api/v1/convert/pdf/markdown").file(pdf()))
                .andExpect(status().isInternalServerError());
    }
}
