package stirling.software.proprietary.security.filter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionInformation;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.security.session.SessionPersistentRegistry;

@ExtendWith(MockitoExtension.class)
@DisplayName("UserAuthenticationFilter")
class UserAuthenticationFilterTest {

    @Mock private UserService userService;
    @Mock private SessionPersistentRegistry sessionPersistentRegistry;

    private ApplicationProperties.Security securityProp;
    private MockHttpServletRequest request;
    private MockHttpServletResponse response;
    private MockFilterChain filterChain;

    @BeforeEach
    void setUp() {
        securityProp = new ApplicationProperties.Security();
        request = new MockHttpServletRequest();
        response = new MockHttpServletResponse();
        filterChain = new MockFilterChain();
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private UserAuthenticationFilter filter(boolean loginEnabled) {
        return new UserAuthenticationFilter(
                securityProp, userService, sessionPersistentRegistry, loginEnabled);
    }

    private static User enabledUser(String username) {
        User user = new User();
        user.setUsername(username);
        user.setEnabled(true);
        return user;
    }

    @Nested
    @DisplayName("login disabled")
    class LoginDisabled {

        @Test
        @DisplayName("passes through without any authentication checks")
        void passesThroughWhenLoginDisabled() throws Exception {
            request.setRequestURI("/api/v1/anything");

            filter(false).doFilter(request, response, filterChain);

            assertThat(filterChain.getRequest()).isSameAs(request);
            verifyNoInteractions(userService);
            verifyNoInteractions(sessionPersistentRegistry);
        }
    }

    @Nested
    @DisplayName("API key authentication")
    class ApiKey {

        @Test
        @DisplayName("authenticates a request carrying a valid X-API-KEY")
        void validApiKeyAuthenticates() throws Exception {
            request.setRequestURI("/api/v1/some/protected");
            request.addHeader("X-API-KEY", "good-key");
            User user = enabledUser("api-user");
            user.addAuthority(
                    new stirling.software.proprietary.security.model.Authority("ROLE_USER", user));
            when(userService.getUserByApiKey("good-key")).thenReturn(Optional.of(user));
            when(userService.usernameExistsIgnoreCase("api-user")).thenReturn(true);
            when(userService.isUserDisabled("api-user")).thenReturn(false);
            when(sessionPersistentRegistry.getAllSessions(any(), anyBoolean()))
                    .thenReturn(List.of());

            filter(true).doFilter(request, response, filterChain);

            assertThat(SecurityContextHolder.getContext().getAuthentication())
                    .isInstanceOf(ApiKeyAuthenticationToken.class);
            assertThat(filterChain.getRequest()).isSameAs(request);
        }

        @Test
        @DisplayName("rejects an unknown X-API-KEY with 401")
        void invalidApiKeyRejected() throws Exception {
            request.setRequestURI("/api/v1/some/protected");
            request.addHeader("X-API-KEY", "bad-key");
            when(userService.getUserByApiKey("bad-key")).thenReturn(Optional.empty());

            filter(true).doFilter(request, response, filterChain);

            assertThat(response.getStatus()).isEqualTo(401);
            assertThat(response.getContentAsString()).contains("Invalid API Key");
            assertThat(filterChain.getRequest()).isNull();
        }
    }

    @Nested
    @DisplayName("unauthenticated requests")
    class Unauthenticated {

        @Test
        @DisplayName("allows a public auth endpoint through")
        void publicEndpointPassesThrough() throws Exception {
            request.setRequestURI("/api/v1/auth/login");

            filter(true).doFilter(request, response, filterChain);

            assertThat(filterChain.getRequest()).isSameAs(request);
            assertThat(response.getStatus()).isEqualTo(200);
        }

        @Test
        @DisplayName("returns 401 JSON for a protected endpoint with no credentials")
        void protectedEndpointReturns401() throws Exception {
            request.setRequestURI("/api/v1/some/protected");

            filter(true).doFilter(request, response, filterChain);

            assertThat(response.getStatus()).isEqualTo(401);
            assertThat(response.getContentType()).contains("application/json");
            assertThat(response.getContentAsString()).contains("Authentication required");
            assertThat(filterChain.getRequest()).isNull();
        }
    }

    @Nested
    @DisplayName("authenticated requests")
    class Authenticated {

        @Test
        @DisplayName("passes through an enabled, existing user")
        void enabledExistingUserPasses() throws Exception {
            request.setRequestURI("/api/v1/some/protected");
            User user = enabledUser("alice");
            setAuthentication(user, "alice");
            when(userService.usernameExistsIgnoreCase("alice")).thenReturn(true);
            when(userService.isUserDisabled("alice")).thenReturn(false);
            when(sessionPersistentRegistry.getAllSessions(any(), anyBoolean()))
                    .thenReturn(List.of());

            filter(true).doFilter(request, response, filterChain);

            assertThat(filterChain.getRequest()).isSameAs(request);
            assertThat(response.getStatus()).isEqualTo(200);
        }

        @Test
        @DisplayName("returns 401 and clears context when user no longer exists")
        void nonExistentUserReturns401() throws Exception {
            request.setRequestURI("/api/v1/some/protected");
            User user = enabledUser("ghost");
            setAuthentication(user, "ghost");
            when(userService.usernameExistsIgnoreCase("ghost")).thenReturn(false);
            when(userService.isUserDisabled("ghost")).thenReturn(false);
            SessionInformation sessionInfo =
                    new SessionInformation(user, "sess-1", new java.util.Date());
            when(sessionPersistentRegistry.getAllSessions(any(), anyBoolean()))
                    .thenReturn(List.of(sessionInfo));

            filter(true).doFilter(request, response, filterChain);

            assertThat(response.getStatus()).isEqualTo(401);
            assertThat(response.getContentAsString()).contains("Invalid credentials");
            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
            verify(sessionPersistentRegistry).expireSession("sess-1");
        }

        @Test
        @DisplayName("returns 403 and clears context when user is disabled")
        void disabledUserReturns403() throws Exception {
            request.setRequestURI("/api/v1/some/protected");
            User user = enabledUser("blocked");
            setAuthentication(user, "blocked");
            when(userService.usernameExistsIgnoreCase("blocked")).thenReturn(true);
            when(userService.isUserDisabled("blocked")).thenReturn(true);
            when(sessionPersistentRegistry.getAllSessions(any(), anyBoolean()))
                    .thenReturn(List.of());

            filter(true).doFilter(request, response, filterChain);

            assertThat(response.getStatus()).isEqualTo(403);
            assertThat(response.getContentAsString()).contains("User account is disabled");
            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        }

        private void setAuthentication(User principal, String name) {
            UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken(
                            principal, null, List.of(new SimpleGrantedAuthority("ROLE_USER")));
            SecurityContextHolder.getContext().setAuthentication(auth);
        }
    }

    @Nested
    @DisplayName("shouldNotFilter")
    class ShouldNotFilter {

        @Test
        @DisplayName("skips static resources on GET")
        void skipsStaticResourceOnGet() {
            request.setMethod("GET");
            request.setRequestURI("/favicon.ico");

            assertThat(filter(true).shouldNotFilter(request)).isTrue();
        }

        @Test
        @DisplayName("skips configured public API endpoints")
        void skipsPublicApiEndpoint() {
            request.setMethod("POST");
            request.setRequestURI("/api/v1/auth/login");

            assertThat(filter(true).shouldNotFilter(request)).isTrue();
        }

        @Test
        @DisplayName("does not skip an arbitrary protected API endpoint")
        void doesNotSkipProtectedEndpoint() {
            request.setMethod("POST");
            request.setRequestURI("/api/v1/user/admin/saveUser");

            assertThat(filter(true).shouldNotFilter(request)).isFalse();
        }
    }
}
