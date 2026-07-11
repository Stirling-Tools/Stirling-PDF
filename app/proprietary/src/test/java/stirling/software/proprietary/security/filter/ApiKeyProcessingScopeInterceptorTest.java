package stirling.software.proprietary.security.filter;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.proprietary.security.model.ApiKeyAccess;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;

/**
 * The additive boundary the shared-key model rests on: a processing-only API key may reach the
 * file/PDF tool namespaces and nothing else.
 */
class ApiKeyProcessingScopeInterceptorTest {

    private final ApiKeyProcessingScopeInterceptor interceptor =
            new ApiKeyProcessingScopeInterceptor();

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void authenticateProcessingKey() {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new ApiKeyAuthenticationToken(
                                "user", "sk", List.of(), ApiKeyAccess.PROCESSING));
    }

    private boolean preHandle(String uri) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", uri);
        request.setRequestURI(uri);
        MockHttpServletResponse response = new MockHttpServletResponse();
        return interceptor.preHandle(request, response, new Object());
    }

    @Test
    void processingKeyAllowedOnToolEndpoints() throws Exception {
        authenticateProcessingKey();
        assertThat(preHandle("/api/v1/general/merge-pdfs")).isTrue();
        assertThat(preHandle("/api/v1/convert/pdf/img")).isTrue();
        assertThat(preHandle("/api/v1/security/add-password")).isTrue();
        assertThat(preHandle("/api/v1/misc/repair")).isTrue();
    }

    @Test
    void processingKeyBlockedOnManagementEndpoints() throws Exception {
        authenticateProcessingKey();
        MockHttpServletRequest request =
                new MockHttpServletRequest(
                        "POST", "/api/v1/proprietary/ui-data/infrastructure/api-keys");
        request.setRequestURI("/api/v1/proprietary/ui-data/infrastructure/api-keys");
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertThat(interceptor.preHandle(request, response, new Object())).isFalse();
        assertThat(response.getStatus()).isEqualTo(403);
    }

    @Test
    void processingKeyBlockedOnTeamAndAdminEndpoints() throws Exception {
        authenticateProcessingKey();
        assertThat(preHandle("/api/v1/team/invite")).isFalse();
        assertThat(preHandle("/api/v1/admin/settings")).isFalse();
        assertThat(preHandle("/api/v1/user/change-role")).isFalse();
    }

    @Test
    void prefixLookalikeIsNotTreatedAsATool() throws Exception {
        // "/api/v1/general-admin" must not slip through on a naive startsWith("/api/v1/general").
        authenticateProcessingKey();
        assertThat(preHandle("/api/v1/general-admin/backup")).isFalse();
    }

    @Test
    void contextPathIsStrippedBeforeMatching() throws Exception {
        authenticateProcessingKey();
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/stirling");
        request.setContextPath("/stirling");
        request.setRequestURI("/stirling/api/v1/general/merge-pdfs");
        MockHttpServletResponse response = new MockHttpServletResponse();
        assertThat(interceptor.preHandle(request, response, new Object())).isTrue();
    }

    @Test
    void fullAccessKeyIsUnrestricted() throws Exception {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new ApiKeyAuthenticationToken("user", "sk", List.of(), ApiKeyAccess.FULL));
        assertThat(preHandle("/api/v1/proprietary/ui-data/infrastructure/api-keys")).isTrue();
        assertThat(preHandle("/api/v1/admin/settings")).isTrue();
    }

    @Test
    void nonApiKeyAuthIsIgnored() throws Exception {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new UsernamePasswordAuthenticationToken(
                                "user", null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
        assertThat(preHandle("/api/v1/admin/settings")).isTrue();
    }

    @Test
    void unauthenticatedIsIgnored() throws Exception {
        assertThat(preHandle("/api/v1/admin/settings")).isTrue();
    }
}
