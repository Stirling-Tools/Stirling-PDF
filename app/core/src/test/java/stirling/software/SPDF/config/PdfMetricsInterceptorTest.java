package stirling.software.SPDF.config;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import jakarta.servlet.http.HttpServletResponse;

import stirling.software.SPDF.service.PdfMetricsService;

class PdfMetricsInterceptorTest {

    private PdfMetricsService service;
    private PdfMetricsInterceptor interceptor;

    @BeforeEach
    void setUp() {
        service = mock(PdfMetricsService.class);
        when(service.isEnabled()).thenReturn(true);
        interceptor = new PdfMetricsInterceptor(service);
    }

    private MultipartHttpServletRequest editRequest(int fileParts, String... headers) {
        MultipartHttpServletRequest request = mock(MultipartHttpServletRequest.class);
        when(request.getMethod()).thenReturn("POST");
        when(request.getServletPath()).thenReturn("/api/v1/general/rotate-pdf");
        for (int i = 0; i + 1 < headers.length; i += 2) {
            when(request.getHeader(headers[i])).thenReturn(headers[i + 1]);
        }
        MultiValueMap<String, MultipartFile> files = new LinkedMultiValueMap<>();
        for (int i = 0; i < fileParts; i++) {
            files.add("fileInput", mock(MultipartFile.class));
        }
        when(request.getMultiFileMap()).thenReturn(files);
        return request;
    }

    private HttpServletResponse response(int status, String contentType) {
        HttpServletResponse response = mock(HttpServletResponse.class);
        when(response.getStatus()).thenReturn(status);
        when(response.getContentType()).thenReturn(contentType);
        return response;
    }

    @Test
    void apiRequestIsCounted() {
        interceptor.afterCompletion(editRequest(1), response(200, "application/pdf"), null, null);
        verify(service).recordOperation(1);
    }

    @Test
    void countsEveryFilePartUnderOneFieldName() {
        interceptor.afterCompletion(editRequest(3), response(200, "application/pdf"), null, null);
        verify(service).recordOperation(3);
    }

    @Test
    void countsRegardlessOfResponseType() {
        interceptor.afterCompletion(editRequest(1), response(200, "application/json"), null, null);
        verify(service).recordOperation(1);
    }

    @Test
    void editorRequestWithBrowserIdIsNotCounted() {
        interceptor.afterCompletion(
                editRequest(1, "X-Browser-Id", "abc-123"),
                response(200, "application/pdf"),
                null,
                null);
        verify(service, never()).recordOperation(anyInt());
    }

    @Test
    void editorJwtWithoutBrowserIdIsNotCounted() {
        interceptor.afterCompletion(
                editRequest(1, "Authorization", "Bearer eyJhbG.eyJzdWI.sig"),
                response(200, "application/pdf"),
                null,
                null);
        verify(service, never()).recordOperation(anyInt());
    }

    @Test
    void bearerApiKeyIsCounted() {
        interceptor.afterCompletion(
                editRequest(1, "Authorization", "Bearer sk-not-a-jwt-key"),
                response(200, "application/pdf"),
                null,
                null);
        verify(service).recordOperation(1);
    }

    @Test
    void errorResponseIsNotCounted() {
        interceptor.afterCompletion(editRequest(1), response(500, "application/pdf"), null, null);
        verify(service, never()).recordOperation(anyInt());
    }
}
