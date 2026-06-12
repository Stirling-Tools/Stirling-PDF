package stirling.software.proprietary.security.oauth2;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;

@Disabled("TODO: Migration required - Spring Boot test framework not available in Quarkus")
class CustomOAuth2AuthenticationFailureHandlerTest {

    @Test
    void redirectsToTauriCallbackWhenStateMarked() throws Exception {
        CustomOAuth2AuthenticationFailureHandler handler =
                new CustomOAuth2AuthenticationFailureHandler();
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("");
        request.setParameter("state", "tauri:abc");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationFailure(
                request,
                response,
                new OAuth2AuthenticationException(new OAuth2Error("access_denied")));

        assertEquals(
                "/auth/callback/tauri?state=tauri%3Aabc&errorOAuth=access_denied",
                response.getRedirectedUrl());
    }

    @Test
    void redirectsToDefaultCallbackWithoutTauriState() throws Exception {
        CustomOAuth2AuthenticationFailureHandler handler =
                new CustomOAuth2AuthenticationFailureHandler();
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationFailure(
                request,
                response,
                new OAuth2AuthenticationException(new OAuth2Error("access_denied")));

        assertEquals("/auth/callback?errorOAuth=access_denied", response.getRedirectedUrl());
    }
}
