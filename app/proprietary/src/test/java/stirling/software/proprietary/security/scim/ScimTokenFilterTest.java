package stirling.software.proprietary.security.scim;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.common.model.ApplicationProperties;

class ScimTokenFilterTest {

    private static final String TOKEN = "x".repeat(ScimTokenFilter.MIN_TOKEN_LENGTH);

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private MockHttpServletResponse run(String token, String header, String path) throws Exception {
        ApplicationProperties.Security security = new ApplicationProperties.Security();
        security.setScimToken(token);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        request.setServletPath(path);
        if (header != null) request.addHeader("Authorization", header);
        MockHttpServletResponse response = new MockHttpServletResponse();
        new ScimTokenFilter(security).doFilter(request, response, new MockFilterChain());
        return response;
    }

    @Test
    void validTokenAuthenticatesAsScimClient() throws Exception {
        assertEquals(200, run(TOKEN, "Bearer " + TOKEN, "/api/v1/scim/v2/Users").getStatus());
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        assertEquals(ScimTokenFilter.ScimClient.SCIM, auth.getPrincipal());
        assertTrue(auth.isAuthenticated());
    }

    @Test
    void wrongOrMissingTokenIsRejected() throws Exception {
        assertEquals(401, run(TOKEN, "Bearer wrong", "/api/v1/scim/v2/Users").getStatus());
        assertEquals(401, run(TOKEN, null, "/api/v1/scim/v2/Users").getStatus());
        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    void blankConfiguredTokenDisablesScim() throws Exception {
        MockHttpServletResponse response = run("", "Bearer ", "/api/v1/scim/v2/Users");
        assertEquals(401, response.getStatus());
        assertTrue(response.getContentAsString().contains("Invalid SCIM token"));
    }

    @Test
    void tokenShorterThan32CharactersIsRefused() throws Exception {
        assertEquals(
                401, run("short-token", "Bearer short-token", "/api/v1/scim/v2/Users").getStatus());
    }

    @Test
    void otherPathsAreUntouched() throws Exception {
        assertEquals(200, run(TOKEN, "Bearer " + TOKEN, "/api/v1/user/me").getStatus());
        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }
}
