package stirling.software.proprietary.security.filter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.saml2.CustomSaml2AuthenticatedPrincipal;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;

/**
 * Unit tests for {@link UserAuthenticationFilter}. Verifies the enterprise auth filter does NOT
 * fail open: unauthenticated, non-public requests must be denied with 401, while disabled/unknown
 * users are rejected and SSO registration blocking is enforced.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UserAuthenticationFilterTest {

    @Mock private UserService userService;
    @Mock private SessionPersistentRegistry sessionPersistentRegistry;
    @Mock private FilterChain filterChain;

    private ApplicationProperties.Security securityProp;
    private MockHttpServletRequest request;
    private MockHttpServletResponse response;

    private UserAuthenticationFilter newFilter(boolean loginEnabled) {
        return new UserAuthenticationFilter(
                securityProp, userService, sessionPersistentRegistry, loginEnabled);
    }

    private static stirling.software.proprietary.security.model.User apiUser(String apiKey) {
        stirling.software.proprietary.security.model.User user =
                new stirling.software.proprietary.security.model.User();
        user.setUsername("apiuser");
        user.setApiKey(apiKey);
        return user;
    }

    private void authenticateAs(Object principal) {
        UsernamePasswordAuthenticationToken token =
                new UsernamePasswordAuthenticationToken(
                        principal, "creds", List.of(new SimpleGrantedAuthority("ROLE_USER")));
        SecurityContextHolder.getContext().setAuthentication(token);
    }

    @BeforeEach
    void setUp() {
        securityProp = new ApplicationProperties.Security();
        request = new MockHttpServletRequest();
        response = new MockHttpServletResponse();
        request.setContextPath("");
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Nested
    @DisplayName("login disabled")
    class LoginDisabled {

        @Test
        @DisplayName("passes every request straight through without touching auth services")
        void passesThroughWhenLoginDisabled() throws ServletException, IOException {
            request.setRequestURI("/api/v1/some/protected/endpoint");
            UserAuthenticationFilter filter = newFilter(false);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain).doFilter(request, response);
            verifyNoInteractions(userService);
            verifyNoInteractions(sessionPersistentRegistry);
            assertEquals(HttpStatus.OK.value(), response.getStatus());
        }
    }

    @Nested
    @DisplayName("no authentication present")
    class NoAuthentication {

        @Test
        @DisplayName("denies protected request with 401 JSON (does NOT fail open)")
        void deniesProtectedRequestWhenNoAuth() throws ServletException, IOException {
            request.setRequestURI("/api/v1/general/merge-pdfs");
            UserAuthenticationFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain, never()).doFilter(request, response);
            assertEquals(HttpStatus.UNAUTHORIZED.value(), response.getStatus());
            assertEquals("application/json", response.getContentType());
            assertTrue(response.getContentAsString().contains("Unauthorized"));
            assertTrue(response.getContentAsString().contains("X-API-KEY"));
        }

        @Test
        @DisplayName("allows public auth endpoint (/login) through without authentication")
        void allowsPublicLoginEndpoint() throws ServletException, IOException {
            request.setRequestURI("/login");
            UserAuthenticationFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain).doFilter(request, response);
            assertEquals(HttpStatus.OK.value(), response.getStatus());
        }

        @Test
        @DisplayName("allows public auth endpoint (/api/v1/auth/login) through")
        void allowsPublicApiLoginEndpoint() throws ServletException, IOException {
            request.setRequestURI("/api/v1/auth/login");
            UserAuthenticationFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain).doFilter(request, response);
            assertEquals(HttpStatus.OK.value(), response.getStatus());
        }

        @Test
        @DisplayName("honours context path when matching public endpoints")
        void honoursContextPathForPublicEndpoint() throws ServletException, IOException {
            request.setContextPath("/stirling");
            request.setRequestURI("/stirling/login");
            UserAuthenticationFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain).doFilter(request, response);
        }
    }

    @Nested
    @DisplayName("API key authentication")
    class ApiKeyAuth {

        @Test
        @DisplayName("authenticates a valid API key and continues the chain")
        void validApiKeyAuthenticates() throws ServletException, IOException {
            request.setRequestURI("/api/v1/general/merge-pdfs");
            request.addHeader("X-API-KEY", "good-key");
            stirling.software.proprietary.security.model.User user = apiUser("good-key");
            when(userService.getUserByApiKey("good-key")).thenReturn(Optional.of(user));
            when(userService.usernameExistsIgnoreCase("apiuser")).thenReturn(true);
            when(userService.isUserDisabled("apiuser")).thenReturn(false);
            UserAuthenticationFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain).doFilter(request, response);
            assertNotNull(SecurityContextHolder.getContext().getAuthentication());
            assertTrue(SecurityContextHolder.getContext().getAuthentication().isAuthenticated());
        }

        @Test
        @DisplayName("rejects an unknown API key with 401 and stops the chain")
        void invalidApiKeyRejected() throws ServletException, IOException {
            request.setRequestURI("/api/v1/general/merge-pdfs");
            request.addHeader("X-API-KEY", "bad-key");
            when(userService.getUserByApiKey("bad-key")).thenReturn(Optional.empty());
            UserAuthenticationFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain, never()).doFilter(request, response);
            assertEquals(HttpStatus.UNAUTHORIZED.value(), response.getStatus());
            assertEquals("Invalid API Key.", response.getContentAsString());
        }

        @Test
        @DisplayName("blank API key is ignored and the request is denied as unauthenticated")
        void blankApiKeyIgnored() throws ServletException, IOException {
            request.setRequestURI("/api/v1/general/merge-pdfs");
            request.addHeader("X-API-KEY", "   ");
            UserAuthenticationFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(userService, never()).getUserByApiKey(anyString());
            verify(filterChain, never()).doFilter(request, response);
            assertEquals(HttpStatus.UNAUTHORIZED.value(), response.getStatus());
        }

        @Test
        @DisplayName("missing API key on protected route is denied (does NOT fail open)")
        void missingApiKeyDenied() throws ServletException, IOException {
            request.setRequestURI("/api/v1/general/merge-pdfs");
            UserAuthenticationFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(userService, never()).getUserByApiKey(anyString());
            verify(filterChain, never()).doFilter(request, response);
            assertEquals(HttpStatus.UNAUTHORIZED.value(), response.getStatus());
        }
    }

    @Nested
    @DisplayName("already-authenticated user (UserDetails / String principal)")
    class ExistingAuthentication {

        @Test
        @DisplayName("valid enabled UserDetails user passes through")
        void enabledUserDetailsPassesThrough() throws ServletException, IOException {
            request.setRequestURI("/api/v1/general/merge-pdfs");
            UserDetails principal =
                    new User("alice", "pw", List.of(new SimpleGrantedAuthority("ROLE_USER")));
            authenticateAs(principal);
            when(userService.usernameExistsIgnoreCase("alice")).thenReturn(true);
            when(userService.isUserDisabled("alice")).thenReturn(false);
            when(sessionPersistentRegistry.getAllSessions(any(), anyBoolean()))
                    .thenReturn(Collections.emptyList());
            UserAuthenticationFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain).doFilter(request, response);
            assertEquals(HttpStatus.OK.value(), response.getStatus());
            assertNotNull(SecurityContextHolder.getContext().getAuthentication());
        }

        @Test
        @DisplayName("string principal that exists and is enabled passes through")
        void enabledStringPrincipalPassesThrough() throws ServletException, IOException {
            request.setRequestURI("/api/v1/general/merge-pdfs");
            authenticateAs("bob");
            when(userService.usernameExistsIgnoreCase("bob")).thenReturn(true);
            when(userService.isUserDisabled("bob")).thenReturn(false);
            when(sessionPersistentRegistry.getAllSessions(any(), anyBoolean()))
                    .thenReturn(Collections.emptyList());
            UserAuthenticationFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain).doFilter(request, response);
            assertEquals(HttpStatus.OK.value(), response.getStatus());
        }

        @Test
        @DisplayName("non-existent non-SSO user gets 401 and context is cleared")
        void nonExistentUserRejected() throws ServletException, IOException {
            request.setRequestURI("/api/v1/general/merge-pdfs");
            authenticateAs("ghost");
            when(userService.usernameExistsIgnoreCase("ghost")).thenReturn(false);
            when(userService.isUserDisabled("ghost")).thenReturn(false);
            when(sessionPersistentRegistry.getAllSessions(any(), anyBoolean()))
                    .thenReturn(Collections.emptyList());
            UserAuthenticationFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain, never()).doFilter(request, response);
            assertEquals(HttpStatus.UNAUTHORIZED.value(), response.getStatus());
            assertEquals("application/json", response.getContentType());
            assertTrue(response.getContentAsString().contains("Invalid credentials"));
            assertNull(SecurityContextHolder.getContext().getAuthentication());
        }

        @Test
        @DisplayName("disabled user gets 403, context cleared, sessions expired")
        void disabledUserRejected() throws ServletException, IOException {
            request.setRequestURI("/api/v1/general/merge-pdfs");
            authenticateAs("dave");
            when(userService.usernameExistsIgnoreCase("dave")).thenReturn(true);
            when(userService.isUserDisabled("dave")).thenReturn(true);
            SessionInformation session =
                    new SessionInformation("dave", "sess-1", new java.util.Date());
            when(sessionPersistentRegistry.getAllSessions(any(), anyBoolean()))
                    .thenReturn(List.of(session));
            UserAuthenticationFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain, never()).doFilter(request, response);
            assertEquals(HttpStatus.FORBIDDEN.value(), response.getStatus());
            assertTrue(response.getContentAsString().contains("disabled"));
            assertTrue(session.isExpired());
            verify(sessionPersistentRegistry).expireSession("sess-1");
            assertNull(SecurityContextHolder.getContext().getAuthentication());
        }

        @Test
        @DisplayName("non-existent user expires any active sessions before denying")
        void nonExistentUserExpiresSessions() throws ServletException, IOException {
            request.setRequestURI("/api/v1/general/merge-pdfs");
            authenticateAs("ghost");
            when(userService.usernameExistsIgnoreCase("ghost")).thenReturn(false);
            when(userService.isUserDisabled("ghost")).thenReturn(false);
            SessionInformation session =
                    new SessionInformation("ghost", "sess-9", new java.util.Date());
            when(sessionPersistentRegistry.getAllSessions(any(), anyBoolean()))
                    .thenReturn(List.of(session));
            UserAuthenticationFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            assertTrue(session.isExpired());
            verify(sessionPersistentRegistry).expireSession("sess-9");
            assertEquals(HttpStatus.UNAUTHORIZED.value(), response.getStatus());
        }
    }

    @Nested
    @DisplayName("SSO principals (OAuth2 / SAML2)")
    class SsoAuthentication {

        @Test
        @DisplayName("non-existent SAML2 user is allowed through when registration not blocked")
        void samlUserAllowedWhenNotBlocked() throws ServletException, IOException {
            request.setRequestURI("/api/v1/general/merge-pdfs");
            CustomSaml2AuthenticatedPrincipal saml =
                    new CustomSaml2AuthenticatedPrincipal(
                            "sam@example.com", Map.of(), "sam@example.com", List.of("idx-1"));
            authenticateAs(saml);
            securityProp.getSaml2().setBlockRegistration(false);
            // user does not yet exist but SSO auto-provisioning is allowed
            when(userService.usernameExistsIgnoreCase("sam@example.com")).thenReturn(false);
            when(userService.isUserDisabled("sam@example.com")).thenReturn(false);
            when(sessionPersistentRegistry.getAllSessions(any(), anyBoolean()))
                    .thenReturn(Collections.emptyList());
            UserAuthenticationFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            // notSsoLogin is false, so the 401 "Invalid credentials" branch is skipped
            verify(filterChain).doFilter(request, response);
            assertEquals(HttpStatus.OK.value(), response.getStatus());
        }

        @Test
        @DisplayName("SAML2 registration blocked for a new user yields 403 and clears context")
        void samlBlockedRegistrationForbidden() throws ServletException, IOException {
            request.setRequestURI("/api/v1/general/merge-pdfs");
            CustomSaml2AuthenticatedPrincipal saml =
                    new CustomSaml2AuthenticatedPrincipal(
                            "newbie@example.com", Map.of(), "newbie@example.com", List.of("idx-2"));
            authenticateAs(saml);
            securityProp.getSaml2().setBlockRegistration(true);
            when(userService.usernameExistsIgnoreCase("newbie@example.com")).thenReturn(false);
            when(userService.isUserDisabled("newbie@example.com")).thenReturn(false);
            when(sessionPersistentRegistry.getAllSessions(any(), anyBoolean()))
                    .thenReturn(Collections.emptyList());
            UserAuthenticationFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain, never()).doFilter(request, response);
            assertEquals(HttpStatus.FORBIDDEN.value(), response.getStatus());
            assertTrue(response.getContentAsString().contains("blocked"));
            assertNull(SecurityContextHolder.getContext().getAuthentication());
        }

        @Test
        @DisplayName("existing SAML2 user passes through even when registration is blocked")
        void samlExistingUserAllowedWhenBlocked() throws ServletException, IOException {
            request.setRequestURI("/api/v1/general/merge-pdfs");
            CustomSaml2AuthenticatedPrincipal saml =
                    new CustomSaml2AuthenticatedPrincipal(
                            "known@example.com", Map.of(), "known@example.com", List.of("idx-3"));
            authenticateAs(saml);
            securityProp.getSaml2().setBlockRegistration(true);
            when(userService.usernameExistsIgnoreCase("known@example.com")).thenReturn(true);
            when(userService.isUserDisabled("known@example.com")).thenReturn(false);
            when(sessionPersistentRegistry.getAllSessions(any(), anyBoolean()))
                    .thenReturn(Collections.emptyList());
            UserAuthenticationFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain).doFilter(request, response);
            assertEquals(HttpStatus.OK.value(), response.getStatus());
        }
    }

    @Nested
    @DisplayName("shouldNotFilter routing")
    class ShouldNotFilter {

        private UserAuthenticationFilter filter() {
            return newFilter(true);
        }

        @Test
        @DisplayName("skips filtering for a GET static resource")
        void skipsStaticResourceGet() {
            request.setMethod("GET");
            request.setRequestURI("/css/app.css");

            assertTrue(filter().shouldNotFilter(request));
        }

        @Test
        @DisplayName("skips filtering for a GET frontend (SPA) route")
        void skipsFrontendRouteGet() {
            request.setMethod("GET");
            request.setRequestURI("/dashboard");

            assertTrue(filter().shouldNotFilter(request));
        }

        @Test
        @DisplayName("does NOT skip a POST to a static-looking path")
        void doesNotSkipPostStatic() {
            request.setMethod("POST");
            request.setRequestURI("/css/app.css");

            assertFalse(filter().shouldNotFilter(request));
        }

        @Test
        @DisplayName("skips filtering for the public status API endpoint")
        void skipsPublicStatusApi() {
            request.setMethod("GET");
            request.setRequestURI("/api/v1/info/status");

            assertTrue(filter().shouldNotFilter(request));
        }

        @Test
        @DisplayName("skips filtering for the public login API endpoint regardless of method")
        void skipsPublicLoginApi() {
            request.setMethod("POST");
            request.setRequestURI("/api/v1/auth/login");

            assertTrue(filter().shouldNotFilter(request));
        }

        @Test
        @DisplayName("does NOT skip filtering for a protected API endpoint")
        void doesNotSkipProtectedApi() {
            request.setMethod("POST");
            request.setRequestURI("/api/v1/general/merge-pdfs");

            assertFalse(filter().shouldNotFilter(request));
        }

        @Test
        @DisplayName("respects context path for public API patterns")
        void respectsContextPathForPublicApi() {
            request.setContextPath("/stirling");
            request.setMethod("GET");
            request.setRequestURI("/stirling/api/v1/info/status");

            assertTrue(filter().shouldNotFilter(request));
        }
    }

    @Nested
    @DisplayName("authentication present but flagged not-authenticated")
    class UnauthenticatedToken {

        @Test
        @DisplayName("an unauthenticated token still results in a 401 deny on protected route")
        void unauthenticatedTokenDenied() throws ServletException, IOException {
            request.setRequestURI("/api/v1/general/merge-pdfs");
            // token explicitly not authenticated, no API key header present
            UsernamePasswordAuthenticationToken token =
                    new UsernamePasswordAuthenticationToken("eve", "creds");
            token.setAuthenticated(false);
            SecurityContextHolder.getContext().setAuthentication(token);
            UserAuthenticationFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain, never()).doFilter(request, response);
            assertEquals(HttpStatus.UNAUTHORIZED.value(), response.getStatus());
            verify(userService, never()).usernameExistsIgnoreCase(anyString());
        }
    }
}
