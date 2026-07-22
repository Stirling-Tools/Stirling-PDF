package stirling.software.proprietary.security.filter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import jakarta.servlet.FilterChain;

class ParticipantRequestSecurityFilterTest {

    private static final String VALIDATE_PATH = "/api/v1/workflow/participant/validate-certificate";

    private final ParticipantRequestSecurityFilter filter = new ParticipantRequestSecurityFilter();

    @Test
    void oversizedUpload_isRejectedBeforeFilterChain() throws Exception {
        MockHttpServletRequest request = multipartRequest(VALIDATE_PATH);
        request.setContent(
                new byte
                        [(int) ParticipantRequestSecurityFilter.MAX_MULTIPART_REQUEST_SIZE_BYTES
                                + 1]);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = org.mockito.Mockito.mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(413);
        verify(chain, never()).doFilter(request, response);
    }

    @Test
    void uploadWithoutContentLength_isRejectedBeforeFilterChain() throws Exception {
        MockHttpServletRequest request = multipartRequest(VALIDATE_PATH);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = org.mockito.Mockito.mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(411);
        verify(chain, never()).doFilter(request, response);
    }

    @Test
    void boundedUpload_reachesFilterChain() throws Exception {
        MockHttpServletRequest request = multipartRequest(VALIDATE_PATH);
        request.setContent(new byte[1024]);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = org.mockito.Mockito.mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
    }

    @Test
    void authenticatedCertificateValidation_isLimitedBeforeFilterChain() throws Exception {
        MockHttpServletRequest request =
                multipartRequest("/api/v1/security/cert-sign/validate-certificate");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = org.mockito.Mockito.mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(411);
        verify(chain, never()).doFilter(request, response);
    }

    @Test
    void authenticatedSignRequest_isLimitedBeforeFilterChain() throws Exception {
        MockHttpServletRequest request =
                multipartRequest("/api/v1/security/cert-sign/sign-requests/session-1/sign");
        request.setContent(
                new byte
                        [(int) ParticipantRequestSecurityFilter.MAX_MULTIPART_REQUEST_SIZE_BYTES
                                + 1]);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = org.mockito.Mockito.mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(413);
        verify(chain, never()).doFilter(request, response);
    }

    @Test
    void encodedParticipantUpload_isStillLimited() throws Exception {
        MockHttpServletRequest request =
                multipartRequest("/api/v1/workflow/participant/validate-certificat%65");
        request.setContent(
                new byte
                        [(int) ParticipantRequestSecurityFilter.MAX_MULTIPART_REQUEST_SIZE_BYTES
                                + 1]);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = org.mockito.Mockito.mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(413);
        verify(chain, never()).doFilter(request, response);
    }

    @Test
    void oversizedMobileUpload_isRejectedBeforeMultipartParsing() throws Exception {
        MockHttpServletRequest request =
                multipartRequest("/api/v1/mobile-scanner/upload/session-1");
        request.setContentLengthLong(
                ParticipantRequestSecurityFilter.MAX_MOBILE_UPLOAD_REQUEST_SIZE_BYTES + 1);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = org.mockito.Mockito.mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(413);
        verify(chain, never()).doFilter(request, response);
    }

    @Test
    void rateLimit_isAppliedBeforeParticipantRequestHandling() throws Exception {
        FilterChain chain = org.mockito.Mockito.mock(FilterChain.class);

        for (int requestNumber = 1; requestNumber <= 21; requestNumber++) {
            MockHttpServletRequest request =
                    new MockHttpServletRequest("GET", "/api/v1/workflow/participant/details");
            request.setRemoteAddr("192.0.2.10");
            MockHttpServletResponse response = new MockHttpServletResponse();

            filter.doFilter(request, response, chain);

            if (requestNumber == 21) {
                assertThat(response.getStatus()).isEqualTo(429);
                assertThat(response.getHeader("Retry-After")).isEqualTo("60");
            }
        }
    }

    private MockHttpServletRequest multipartRequest(String path) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", path);
        request.setContentType("multipart/form-data; boundary=test");
        request.setRemoteAddr("192.0.2.1");
        return request;
    }
}
