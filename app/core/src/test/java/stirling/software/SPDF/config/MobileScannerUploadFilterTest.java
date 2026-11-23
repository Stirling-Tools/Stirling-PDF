package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import jakarta.servlet.FilterChain;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.MobileScannerService;

class MobileScannerUploadFilterTest {

    private static final long ROOM = 10L * 1024 * 1024;
    private static final long OVERHEAD = 1024 * 1024;

    private final MobileScannerService service = mock(MobileScannerService.class);
    private final ApplicationProperties properties = new ApplicationProperties();
    private final FilterChain chain = mock(FilterChain.class);
    private final MobileScannerUploadFilter filter =
            new MobileScannerUploadFilter(service, properties);

    @BeforeEach
    void setUp() {
        properties.getSystem().setEnableMobileScanner(true);
        when(service.remainingSessionBytes(any())).thenReturn(-1L);
        when(service.remainingSessionBytes("live")).thenReturn(ROOM);
    }

    @Test
    void passesUploadToLiveSessionWithinLimit() throws Exception {
        MockHttpServletResponse response = run(upload("live", 1024));

        assertEquals(200, response.getStatus());
        verify(chain).doFilter(any(), any());
    }

    @Test
    void rejectsUnknownSessionBeforeReadingBody() throws Exception {
        MockHttpServletResponse response = run(upload("unknown", 1024));

        assertEquals(400, response.getStatus());
        verify(chain, never()).doFilter(any(), any());
    }

    @Test
    void rejectsBodyLargerThanTheSessionsRemainingRoom() throws Exception {
        MockHttpServletResponse response = run(upload("live", ROOM + OVERHEAD + 1));

        assertEquals(413, response.getStatus());
        verify(chain, never()).doFilter(any(), any());
    }

    @Test
    void allowsMultipartOverheadOnTopOfTheRemainingRoom() throws Exception {
        assertEquals(200, run(upload("live", ROOM + OVERHEAD)).getStatus());
    }

    @Test
    void rejectsBodyWithoutContentLength() throws Exception {
        MockHttpServletResponse response = run(upload("live", -1));

        assertEquals(411, response.getStatus());
        verify(chain, never()).doFilter(any(), any());
    }

    @Test
    void handlesContextPath() throws Exception {
        MockHttpServletRequest request = upload("unknown", 1024);
        request.setContextPath("/app");
        request.setRequestURI("/app/api/v1/mobile-scanner/upload/unknown");

        assertEquals(400, run(request).getStatus());
    }

    @Test
    void ignoresOtherRequests() throws Exception {
        MockHttpServletRequest get =
                new MockHttpServletRequest("GET", "/api/v1/mobile-scanner/upload/unknown");
        MockHttpServletRequest other =
                new MockHttpServletRequest("POST", "/api/v1/mobile-scanner/create-session/x");

        assertEquals(200, run(get).getStatus());
        assertEquals(200, run(other).getStatus());
    }

    @Test
    void leavesDisabledFeatureToTheController() throws Exception {
        properties.getSystem().setEnableMobileScanner(false);
        properties.getSystem().setEnableMobileSignature(false);

        assertEquals(200, run(upload("unknown", 1024)).getStatus());
        verify(chain).doFilter(any(), any());
    }

    private static MockHttpServletRequest upload(String sessionId, long contentLength) {
        // The mock derives its length from its content, so large bodies are only declared.
        return new MockHttpServletRequest("POST", "/api/v1/mobile-scanner/upload/" + sessionId) {
            @Override
            public long getContentLengthLong() {
                return contentLength;
            }
        };
    }

    private MockHttpServletResponse run(MockHttpServletRequest request) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, chain);
        return response;
    }
}
