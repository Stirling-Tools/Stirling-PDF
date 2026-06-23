package stirling.software.saas.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.model.SupabaseUser;
import stirling.software.saas.model.exception.UserNotFoundException;
import stirling.software.saas.service.SaasTeamService;
import stirling.software.saas.service.SupabaseUserService;

/**
 * Additional branch coverage for {@link SupabaseAuthenticationFilter}: public-auth and
 * already-authenticated short-circuits, shouldNotFilter, anonymous user creation and upgrade, amr
 * mapping, and the error paths in getOrCreateUser / createUser.
 */
@ExtendWith(MockitoExtension.class)
class SupabaseAuthenticationFilterMoreTest {

    @Mock private TeamService teamService;
    @Mock private UserService userService;
    @Mock private SupabaseUserService supabaseUserService;
    @Mock private SaasTeamService saasTeamService;
    @Mock private JwtDecoder jwtDecoder;

    private SupabaseAuthenticationFilter filter;
    private MockHttpServletRequest request;
    private MockHttpServletResponse response;
    private MockFilterChain chain;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.clearContext();
        filter =
                new SupabaseAuthenticationFilter(
                        teamService, userService, supabaseUserService, saasTeamService, jwtDecoder);
        request = new MockHttpServletRequest();
        response = new MockHttpServletResponse();
        chain = new MockFilterChain();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    // -------- helpers --------

    private User newUser(String username) {
        User u = new User();
        u.setUsername(username);
        u.setRoleName("ROLE_USER");
        u.setAuthorities(new HashSet<>());
        return u;
    }

    private SupabaseUser supabaseUser(UUID id, String email, boolean anonymous) {
        SupabaseUser u = new SupabaseUser();
        u.setId(id);
        u.setEmail(email);
        u.setAnonymous(anonymous);
        return u;
    }

    /** Full-claims JWT for a non-anonymous user with the given provider. */
    private Jwt fullJwt(UUID supabaseId, String email, boolean anonymous, String provider) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("iss", "https://example.supabase.co/auth/v1");
        claims.put("sub", supabaseId.toString());
        claims.put("aud", List.of("authenticated"));
        claims.put("exp", Instant.now().plusSeconds(3600).getEpochSecond());
        claims.put("iat", Instant.now().getEpochSecond());
        claims.put("role", "authenticated");
        claims.put("aal", "aal1");
        claims.put("session_id", "sess-" + supabaseId);
        claims.put("is_anonymous", anonymous);
        if (!anonymous) {
            claims.put("email", email);
            if (provider != null) {
                claims.put("app_metadata", Map.of("provider", provider));
            }
        }
        return new Jwt(
                "token",
                Instant.now(),
                Instant.now().plusSeconds(3600),
                Map.of("alg", "HS256"),
                claims);
    }

    private void bearer(String token) {
        request.setRequestURI("/api/v1/something");
        request.setMethod("POST");
        request.addHeader("Authorization", "Bearer " + token);
    }

    @Nested
    @DisplayName("doFilterInternal short-circuits")
    class ShortCircuits {

        @Test
        @DisplayName("public auth endpoint passes through without decoding")
        void publicAuthEndpointPassesThrough() throws Exception {
            request.setRequestURI("/api/v1/auth/login");
            request.setMethod("POST");
            request.addHeader("Authorization", "Bearer whatever");

            filter.doFilter(request, response, chain);

            assertThat(chain.getRequest()).isSameAs(request);
            verify(jwtDecoder, never()).decode(any());
            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        }

        @Test
        @DisplayName("already-authenticated context passes through without decoding")
        void alreadyAuthenticatedPassesThrough() throws Exception {
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken("someone", null, List.of()));
            request.setRequestURI("/api/v1/something");
            request.setMethod("POST");
            request.addHeader("Authorization", "Bearer whatever");

            filter.doFilter(request, response, chain);

            assertThat(chain.getRequest()).isSameAs(request);
            verify(jwtDecoder, never()).decode(any());
        }

        @Test
        @DisplayName("null Authorization header with no api key passes through")
        void nullAuthHeaderPassesThrough() throws Exception {
            request.setRequestURI("/api/v1/something");
            request.setMethod("POST");

            filter.doFilter(request, response, chain);

            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
            verify(jwtDecoder, never()).decode(any());
        }

        @Test
        @DisplayName("non-Bearer Authorization header is ignored by JWT path")
        void nonBearerHeaderIgnored() throws Exception {
            request.setRequestURI("/api/v1/something");
            request.setMethod("POST");
            request.addHeader("Authorization", "Basic dXNlcjpwYXNz");

            filter.doFilter(request, response, chain);

            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
            verify(jwtDecoder, never()).decode(any());
        }
    }

    @Nested
    @DisplayName("shouldNotFilter")
    class ShouldNotFilter {

        @Test
        @DisplayName("GET static resource is skipped")
        void getStaticResourceSkipped() {
            request.setMethod("GET");
            request.setRequestURI("/css/app.css");
            assertThat(filter.shouldNotFilter(request)).isTrue();
        }

        @Test
        @DisplayName("GET frontend route is skipped")
        void getFrontendRouteSkipped() {
            request.setMethod("GET");
            request.setRequestURI("/dashboard");
            assertThat(filter.shouldNotFilter(request)).isTrue();
        }

        @Test
        @DisplayName("public auth endpoint is skipped regardless of method")
        void publicAuthEndpointSkipped() {
            request.setMethod("POST");
            request.setRequestURI("/api/v1/auth/login");
            assertThat(filter.shouldNotFilter(request)).isTrue();
        }

        @Test
        @DisplayName("POST to a protected api endpoint is filtered")
        void postProtectedEndpointFiltered() {
            request.setMethod("POST");
            request.setRequestURI("/api/v1/something");
            assertThat(filter.shouldNotFilter(request)).isFalse();
        }
    }

    @Nested
    @DisplayName("apiKeyAuthenticated already-authenticated branch")
    class ApiKeyShortCircuit {

        @Test
        @DisplayName("returns true and skips lookup when an api key sets an authenticated context")
        void apiKeyValidStillAuthenticates() throws Exception {
            User user = newUser("alice");
            when(userService.getUserByApiKey("k1")).thenReturn(Optional.of(user));

            request.setRequestURI("/api/v1/something");
            request.setMethod("POST");
            request.addHeader("X-API-KEY", "k1");

            filter.doFilter(request, response, chain);

            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
            verify(userService).trackApiKeyFirstUse(user);
            verify(jwtDecoder, never()).decode(any());
        }
    }

    @Nested
    @DisplayName("anonymous user flows")
    class AnonymousFlows {

        @Test
        @DisplayName("new anonymous user is created with the anon_ email and LIMITED_API_USER role")
        void newAnonymousUserCreated() throws Exception {
            UUID supabaseId = UUID.randomUUID();
            Jwt jwt = fullJwt(supabaseId, null, true, null);
            when(jwtDecoder.decode("tok")).thenReturn(jwt);
            when(supabaseUserService.getUser(supabaseId))
                    .thenReturn(supabaseUser(supabaseId, null, true));
            when(userService.findBySupabaseId(supabaseId)).thenReturn(Optional.empty());
            when(userService.saveUser(any(User.class)))
                    .thenAnswer(
                            inv -> {
                                User u = inv.getArgument(0);
                                assertThat(u.getUsername())
                                        .startsWith(SupabaseAuthenticationFilter.ANON_PREFIX);
                                assertThat(u.getAuthenticationType())
                                        .isEqualToIgnoringCase(AuthenticationType.ANONYMOUS.name());
                                return u;
                            });

            bearer("tok");
            filter.doFilter(request, response, chain);

            verify(userService, times(1)).saveUser(any(User.class));
            // Anonymous mirror row created with null email and anon flag true.
            verify(supabaseUserService).createSupabaseUser(supabaseId, null, true);
            assertThat(SecurityContextHolder.getContext().getAuthentication())
                    .isInstanceOf(EnhancedJwtAuthenticationToken.class);
            // Anonymous sessions keep the raw Jwt principal, not a User.
            assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal())
                    .isSameAs(jwt);
        }

        @Test
        @DisplayName("anonymous local user is upgraded once the Supabase row is non-anonymous")
        void anonymousUserUpgradedToWeb() throws Exception {
            UUID supabaseId = UUID.randomUUID();
            // amr password -> WEB upgrade type.
            Jwt jwt = withAmr(fullJwt(supabaseId, "real@example.com", false, "email"), "password");
            when(jwtDecoder.decode("tok")).thenReturn(jwt);
            when(supabaseUserService.getUser(supabaseId))
                    .thenReturn(supabaseUser(supabaseId, "real@example.com", false));

            User local = newUser("anon_old");
            local.setSupabaseId(supabaseId);
            local.setAuthenticationType(AuthenticationType.ANONYMOUS);
            when(userService.findBySupabaseId(supabaseId)).thenReturn(Optional.of(local));
            when(userService.saveUser(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
            when(saasTeamService.ensurePersonalTeam(any(User.class))).thenReturn(new Team());

            bearer("tok");
            filter.doFilter(request, response, chain);

            verify(userService).saveUser(any(User.class));
            verify(saasTeamService).ensurePersonalTeam(any(User.class));
            assertThat(local.getEmail()).isEqualTo("real@example.com");
            assertThat(local.getUsername()).isEqualTo("real@example.com");
            assertThat(local.getAuthenticationType())
                    .isEqualToIgnoringCase(AuthenticationType.WEB.name());
        }

        @Test
        @DisplayName("oauth amr upgrades anonymous user to OAUTH2")
        void anonymousUpgradeOauthAmr() throws Exception {
            UUID supabaseId = UUID.randomUUID();
            Jwt jwt = withAmr(fullJwt(supabaseId, "oauth@example.com", false, "google"), "oauth");
            when(jwtDecoder.decode("tok")).thenReturn(jwt);
            when(supabaseUserService.getUser(supabaseId))
                    .thenReturn(supabaseUser(supabaseId, "oauth@example.com", false));

            User local = newUser("anon_old");
            local.setSupabaseId(supabaseId);
            local.setAuthenticationType(AuthenticationType.ANONYMOUS);
            when(userService.findBySupabaseId(supabaseId)).thenReturn(Optional.of(local));
            when(userService.saveUser(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
            when(saasTeamService.ensurePersonalTeam(any(User.class))).thenReturn(new Team());

            bearer("tok");
            filter.doFilter(request, response, chain);

            assertThat(local.getAuthenticationType())
                    .isEqualToIgnoringCase(AuthenticationType.OAUTH2.name());
        }

        @Test
        @DisplayName("email collision while upgrading anonymous user yields 401")
        void anonymousUpgradeEmailCollision() throws Exception {
            UUID supabaseId = UUID.randomUUID();
            Jwt jwt = fullJwt(supabaseId, "dupe@example.com", false, "email");
            when(jwtDecoder.decode("tok")).thenReturn(jwt);
            when(supabaseUserService.getUser(supabaseId))
                    .thenReturn(supabaseUser(supabaseId, "dupe@example.com", false));

            User local = newUser("anon_old");
            local.setSupabaseId(supabaseId);
            local.setAuthenticationType(AuthenticationType.ANONYMOUS);
            when(userService.findBySupabaseId(supabaseId)).thenReturn(Optional.of(local));
            when(userService.saveUser(any(User.class)))
                    .thenThrow(new DataIntegrityViolationException("email exists"));

            bearer("tok");
            filter.doFilter(request, response, chain);

            assertThat(response.getStatus()).isEqualTo(401);
            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        }

        private Jwt withAmr(Jwt base, String method) {
            Map<String, Object> claims = new HashMap<>(base.getClaims());
            claims.put("amr", List.of(Map.of("method", method, "timestamp", 1L)));
            return new Jwt(
                    base.getTokenValue(),
                    base.getIssuedAt(),
                    base.getExpiresAt(),
                    base.getHeaders(),
                    claims);
        }
    }

    @Nested
    @DisplayName("getOrCreateUser error paths")
    class GetOrCreateErrors {

        @Test
        @DisplayName("UserNotFoundException from the mirror lookup yields 401")
        void userNotFoundYields401() throws Exception {
            UUID supabaseId = UUID.randomUUID();
            Jwt jwt = fullJwt(supabaseId, "ghost@example.com", false, "email");
            when(jwtDecoder.decode("tok")).thenReturn(jwt);
            when(supabaseUserService.getUser(supabaseId))
                    .thenThrow(new UserNotFoundException("missing"));

            bearer("tok");
            filter.doFilter(request, response, chain);

            assertThat(response.getStatus()).isEqualTo(401);
            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        }

        @Test
        @DisplayName("unexpected runtime error is wrapped as an auth failure (401)")
        void unexpectedErrorYields401() throws Exception {
            UUID supabaseId = UUID.randomUUID();
            Jwt jwt = fullJwt(supabaseId, "boom@example.com", false, "email");
            when(jwtDecoder.decode("tok")).thenReturn(jwt);
            when(supabaseUserService.getUser(supabaseId))
                    .thenThrow(new IllegalStateException("db down"));

            bearer("tok");
            filter.doFilter(request, response, chain);

            assertThat(response.getStatus()).isEqualTo(401);
            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        }

        @Test
        @DisplayName("non-UUID subject propagates IllegalArgumentException from UUID.fromString")
        void nonUuidSubjectThrows() throws Exception {
            Map<String, Object> claims = new HashMap<>();
            claims.put("iss", "https://example.supabase.co/auth/v1");
            claims.put("sub", "not-a-uuid");
            claims.put("aud", List.of("authenticated"));
            claims.put("exp", Instant.now().plusSeconds(3600).getEpochSecond());
            claims.put("iat", Instant.now().getEpochSecond());
            claims.put("role", "authenticated");
            claims.put("aal", "aal1");
            claims.put("session_id", "sess");
            claims.put("is_anonymous", false);
            claims.put("email", "x@example.com");
            claims.put("app_metadata", Map.of("provider", "email"));
            Jwt jwt =
                    new Jwt(
                            "tok",
                            Instant.now(),
                            Instant.now().plusSeconds(3600),
                            Map.of("alg", "HS256"),
                            claims);
            when(jwtDecoder.decode("tok")).thenReturn(jwt);

            bearer("tok");
            // UUID.fromString on a malformed subject is not caught by the JwtException handler.
            assertThatThrownBy(() -> filter.doFilter(request, response, chain))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Invalid UUID string");
        }
    }

    @Nested
    @DisplayName("createUser validation and race handling")
    class CreateUserPaths {

        @Test
        @DisplayName("missing provider for a non-anonymous user yields 401")
        void missingProviderYields401() throws Exception {
            UUID supabaseId = UUID.randomUUID();
            // provider null -> no app_metadata claim at all.
            Jwt jwt = fullJwt(supabaseId, "noprov@example.com", false, null);
            when(jwtDecoder.decode("tok")).thenReturn(jwt);
            when(supabaseUserService.getUser(supabaseId))
                    .thenReturn(supabaseUser(supabaseId, "noprov@example.com", false));
            when(userService.findBySupabaseId(supabaseId)).thenReturn(Optional.empty());

            bearer("tok");
            filter.doFilter(request, response, chain);

            assertThat(response.getStatus()).isEqualTo(401);
            verify(userService, never()).saveUser(any());
        }

        @Test
        @DisplayName("createSupabaseUser DataIntegrityViolation is swallowed; user still created")
        void createSupabaseUserConflictIgnored() throws Exception {
            UUID supabaseId = UUID.randomUUID();
            Jwt jwt = fullJwt(supabaseId, "race@example.com", false, "email");
            when(jwtDecoder.decode("tok")).thenReturn(jwt);
            when(supabaseUserService.getUser(supabaseId))
                    .thenReturn(supabaseUser(supabaseId, "race@example.com", false));
            when(userService.findBySupabaseId(supabaseId)).thenReturn(Optional.empty());
            org.mockito.Mockito.doThrow(new DataIntegrityViolationException("dup"))
                    .when(supabaseUserService)
                    .createSupabaseUser(eq(supabaseId), any(), eq(false));
            when(userService.saveUser(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

            bearer("tok");
            filter.doFilter(request, response, chain);

            verify(userService, times(1)).saveUser(any(User.class));
            assertThat(SecurityContextHolder.getContext().getAuthentication())
                    .isInstanceOf(EnhancedJwtAuthenticationToken.class);
        }

        @Test
        @DisplayName("createSupabaseUser unexpected error yields 401")
        void createSupabaseUserUnexpectedErrorYields401() throws Exception {
            UUID supabaseId = UUID.randomUUID();
            Jwt jwt = fullJwt(supabaseId, "fail@example.com", false, "email");
            when(jwtDecoder.decode("tok")).thenReturn(jwt);
            when(supabaseUserService.getUser(supabaseId))
                    .thenReturn(supabaseUser(supabaseId, "fail@example.com", false));
            when(userService.findBySupabaseId(supabaseId)).thenReturn(Optional.empty());
            org.mockito.Mockito.doThrow(new IllegalStateException("mirror down"))
                    .when(supabaseUserService)
                    .createSupabaseUser(eq(supabaseId), any(), eq(false));

            bearer("tok");
            filter.doFilter(request, response, chain);

            assertThat(response.getStatus()).isEqualTo(401);
            verify(userService, never()).saveUser(any());
        }

        @Test
        @DisplayName("saveUser race: loser fetches the winning row instead of creating")
        void saveUserRaceFetchesWinner() throws Exception {
            UUID supabaseId = UUID.randomUUID();
            Jwt jwt = fullJwt(supabaseId, "winner@example.com", false, "email");
            when(jwtDecoder.decode("tok")).thenReturn(jwt);
            when(supabaseUserService.getUser(supabaseId))
                    .thenReturn(supabaseUser(supabaseId, "winner@example.com", false));

            User winner = newUser("winner@example.com");
            winner.setSupabaseId(supabaseId);
            when(userService.findBySupabaseId(supabaseId))
                    .thenReturn(Optional.empty())
                    .thenReturn(Optional.of(winner));
            when(userService.saveUser(any(User.class)))
                    .thenThrow(new DataIntegrityViolationException("dup user"));

            bearer("tok");
            filter.doFilter(request, response, chain);

            // Race loser does not run first-time init (ensurePersonalTeam).
            verify(saasTeamService, never()).ensurePersonalTeam(any());
            assertThat(SecurityContextHolder.getContext().getAuthentication())
                    .isInstanceOf(EnhancedJwtAuthenticationToken.class);
        }

        @Test
        @DisplayName("saveUser race with no winning row found yields 401")
        void saveUserRaceNoWinnerYields401() throws Exception {
            UUID supabaseId = UUID.randomUUID();
            Jwt jwt = fullJwt(supabaseId, "lost@example.com", false, "email");
            when(jwtDecoder.decode("tok")).thenReturn(jwt);
            when(supabaseUserService.getUser(supabaseId))
                    .thenReturn(supabaseUser(supabaseId, "lost@example.com", false));
            when(userService.findBySupabaseId(supabaseId)).thenReturn(Optional.empty());
            when(userService.saveUser(any(User.class)))
                    .thenThrow(new DataIntegrityViolationException("dup user"));

            bearer("tok");
            filter.doFilter(request, response, chain);

            assertThat(response.getStatus()).isEqualTo(401);
        }

        @Test
        @DisplayName("personal team creation failure for a new user is swallowed")
        void personalTeamFailureSwallowed() throws Exception {
            UUID supabaseId = UUID.randomUUID();
            Jwt jwt = fullJwt(supabaseId, "team@example.com", false, "email");
            when(jwtDecoder.decode("tok")).thenReturn(jwt);
            when(supabaseUserService.getUser(supabaseId))
                    .thenReturn(supabaseUser(supabaseId, "team@example.com", false));
            when(userService.findBySupabaseId(supabaseId)).thenReturn(Optional.empty());
            when(userService.saveUser(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
            when(saasTeamService.ensurePersonalTeam(any(User.class)))
                    .thenThrow(new IllegalStateException("team boom"));

            bearer("tok");
            filter.doFilter(request, response, chain);

            // Auth still succeeds even though team creation failed.
            assertThat(SecurityContextHolder.getContext().getAuthentication())
                    .isInstanceOf(EnhancedJwtAuthenticationToken.class);
            verify(userService, times(1)).saveUser(any(User.class));
        }
    }
}
