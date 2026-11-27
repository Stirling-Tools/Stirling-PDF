package stirling.software.proprietary.security.oauth2;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.InternalAuthenticationServiceException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;

import jakarta.servlet.http.Cookie;

import stirling.software.common.model.ApplicationProperties;

class CustomOAuth2AuthenticationFailureHandlerTest {

    @Test
    void redirectsToTauriCallbackWhenStateMarked() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("");
        request.setParameter("state", "tauri:abc");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler(new ApplicationProperties())
                .onAuthenticationFailure(
                        request,
                        response,
                        new OAuth2AuthenticationException(new OAuth2Error("access_denied")));

        assertEquals(
                "/auth/callback/tauri?state=tauri%3Aabc&errorOAuth=access_denied",
                response.getRedirectedUrl());
    }

    @Test
    void redirectsToDefaultCallbackWithoutTauriState() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler(new ApplicationProperties())
                .onAuthenticationFailure(
                        request,
                        response,
                        new OAuth2AuthenticationException(new OAuth2Error("access_denied")));

        assertEquals("/auth/callback?errorOAuth=access_denied", response.getRedirectedUrl());
    }

    @Test
    void errorReturnsToTheConfiguredPublicOrigin() throws Exception {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().getOauth2().setRedirectBaseUrl("https://pdf.example.com");
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler(properties)
                .onAuthenticationFailure(
                        request,
                        response,
                        new OAuth2AuthenticationException(
                                new OAuth2Error("invalid_token_response")));

        assertEquals(
                "https://pdf.example.com/auth/callback?errorOAuth=invalid_token_response",
                response.getRedirectedUrl());
    }

    @Test
    void spaCookiePathIsNotPrefixedWithTheContextPathAgain() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("/pdf");
        request.setCookies(new Cookie(TauriOAuthUtils.SPA_REDIRECT_COOKIE, "/pdf/auth/callback"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler(new ApplicationProperties())
                .onAuthenticationFailure(
                        request,
                        response,
                        new OAuth2AuthenticationException(new OAuth2Error("access_denied")));

        assertEquals("/pdf/auth/callback?errorOAuth=access_denied", response.getRedirectedUrl());
    }

    @Test
    void offSiteSpaCookiePathIsIgnored() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("");
        request.setCookies(new Cookie(TauriOAuthUtils.SPA_REDIRECT_COOKIE, "//evil.example"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler(new ApplicationProperties())
                .onAuthenticationFailure(
                        request,
                        response,
                        new OAuth2AuthenticationException(new OAuth2Error("access_denied")));

        assertEquals("/auth/callback?errorOAuth=access_denied", response.getRedirectedUrl());
    }

    @Test
    void unhandledExceptionReturnsAGenericErrorInsteadOfABare401() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler(new ApplicationProperties())
                .onAuthenticationFailure(
                        request, response, new InternalAuthenticationServiceException("boom"));

        assertEquals(
                "/auth/callback?errorOAuth=oauth2AuthenticationError", response.getRedirectedUrl());
    }

    private static CustomOAuth2AuthenticationFailureHandler handler(
            ApplicationProperties properties) {
        return new CustomOAuth2AuthenticationFailureHandler(properties);
    }
}
