package stirling.software.saas.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
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
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.model.SupabaseUser;
import stirling.software.saas.service.SupabaseUserService;

/** Unit tests for the saas-mode JWT filter. */
@ExtendWith(MockitoExtension.class)
class SupabaseAuthenticationFilterTest {

    @Mock private TeamService teamService;
    @Mock private UserService userService;
    @Mock private SupabaseUserService supabaseUserService;
    @Mock private stirling.software.saas.service.SaasTeamService saasTeamService;
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

    @Test
    void staticResourcePassesThroughWithoutAuth() throws Exception {
        request.setRequestURI("/css/main.css");
        request.setMethod("GET");

        filter.doFilter(request, response, chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(chain.getRequest()).isSameAs(request);
        verify(jwtDecoder, never()).decode(any());
    }

    @Test
    void apiKeyHeaderPopulatesSecurityContext() throws Exception {
        User user = newUser("alice");
        user.setApiKey("api-key-123");
        when(userService.getUserByApiKey("api-key-123")).thenReturn(Optional.of(user));

        request.setRequestURI("/api/v1/something");
        request.setMethod("POST");
        request.addHeader("X-API-KEY", "api-key-123");

        filter.doFilter(request, response, chain);

        SecurityContext ctx = SecurityContextHolder.getContext();
        assertThat(ctx.getAuthentication())
                .isNotNull()
                .isInstanceOf(ApiKeyAuthenticationToken.class);
        assertThat(ctx.getAuthentication().isAuthenticated()).isTrue();
        verify(userService).trackApiKeyFirstUse(user);
    }

    @Test
    void invalidApiKeyTriggers401() throws Exception {
        when(userService.getUserByApiKey("nope")).thenReturn(Optional.empty());

        request.setRequestURI("/api/v1/something");
        request.setMethod("POST");
        request.addHeader("X-API-KEY", "nope");

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void validJwtForExistingUserSetsAuthentication() throws Exception {
        UUID supabaseId = UUID.randomUUID();
        Jwt jwt = jwtFor(supabaseId, "alice@example.com", false, "google");
        when(jwtDecoder.decode("token")).thenReturn(jwt);

        SupabaseUser supabaseUser = supabaseUserMatching(supabaseId, "alice@example.com", false);
        when(supabaseUserService.getUser(supabaseId)).thenReturn(supabaseUser);

        User existing = newUser("alice@example.com");
        existing.setSupabaseId(supabaseId);
        existing.setAuthenticationType(AuthenticationType.OAUTH2);
        when(userService.findBySupabaseId(supabaseId)).thenReturn(Optional.of(existing));

        request.setRequestURI("/api/v1/something");
        request.setMethod("POST");
        request.addHeader("Authorization", "Bearer token");

        filter.doFilter(request, response, chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication())
                .isInstanceOf(EnhancedJwtAuthenticationToken.class);
        EnhancedJwtAuthenticationToken auth =
                (EnhancedJwtAuthenticationToken)
                        SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth.getSupabaseId()).isEqualTo(supabaseId.toString());
        assertThat(auth.getEmail()).isEqualTo("alice@example.com");
        verify(userService, never()).saveUser(any());
    }

    @Test
    void validJwtForNewUserTriggersUserCreation() throws Exception {
        UUID supabaseId = UUID.randomUUID();
        Jwt jwt = jwtFor(supabaseId, "bob@example.com", false, "google");
        when(jwtDecoder.decode("token")).thenReturn(jwt);

        when(supabaseUserService.getUser(supabaseId))
                .thenReturn(supabaseUserMatching(supabaseId, "bob@example.com", false));
        when(userService.findBySupabaseId(supabaseId)).thenReturn(Optional.empty());
        when(userService.saveUser(any())).thenAnswer(inv -> inv.getArgument(0));

        request.setRequestURI("/api/v1/something");
        request.setMethod("POST");
        request.addHeader("Authorization", "Bearer token");

        filter.doFilter(request, response, chain);

        verify(userService, times(1)).saveUser(any(User.class));
        verify(supabaseUserService).createSupabaseUser(supabaseId, "bob@example.com", false);
        // New users get their own personal team, never the shared Default team.
        verify(saasTeamService).ensurePersonalTeam(any(User.class));
        verify(teamService, never()).getOrCreateDefaultTeam();
        assertThat(SecurityContextHolder.getContext().getAuthentication())
                .isInstanceOf(EnhancedJwtAuthenticationToken.class);
    }

    @Test
    void appleProviderClassifiedAsOauth2NotWeb() throws Exception {
        UUID supabaseId = UUID.randomUUID();
        Jwt jwt = jwtFor(supabaseId, "carol@example.com", false, "apple");
        when(jwtDecoder.decode("token")).thenReturn(jwt);

        when(supabaseUserService.getUser(supabaseId))
                .thenReturn(supabaseUserMatching(supabaseId, "carol@example.com", false));
        when(userService.findBySupabaseId(supabaseId)).thenReturn(Optional.empty());
        when(userService.saveUser(any(User.class)))
                .thenAnswer(
                        inv -> {
                            User u = inv.getArgument(0);
                            assertThat(u.getAuthenticationType())
                                    .as("Apple sign-in must be classified as OAUTH2, not WEB")
                                    .isEqualToIgnoringCase(AuthenticationType.OAUTH2.name());
                            return u;
                        });

        request.setRequestURI("/api/v1/something");
        request.setMethod("POST");
        request.addHeader("Authorization", "Bearer token");

        filter.doFilter(request, response, chain);

        verify(userService, times(1)).saveUser(any(User.class));
    }

    @Test
    void azureProviderClassifiedAsOauth2NotWeb() throws Exception {
        UUID supabaseId = UUID.randomUUID();
        Jwt jwt = jwtFor(supabaseId, "dave@example.com", false, "azure");
        when(jwtDecoder.decode("token")).thenReturn(jwt);

        when(supabaseUserService.getUser(supabaseId))
                .thenReturn(supabaseUserMatching(supabaseId, "dave@example.com", false));
        when(userService.findBySupabaseId(supabaseId)).thenReturn(Optional.empty());
        when(userService.saveUser(any(User.class)))
                .thenAnswer(
                        inv -> {
                            User u = inv.getArgument(0);
                            assertThat(u.getAuthenticationType())
                                    .as("Azure sign-in must be classified as OAUTH2, not WEB")
                                    .isEqualToIgnoringCase(AuthenticationType.OAUTH2.name());
                            return u;
                        });

        request.setRequestURI("/api/v1/something");
        request.setMethod("POST");
        request.addHeader("Authorization", "Bearer token");

        filter.doFilter(request, response, chain);

        verify(userService, times(1)).saveUser(any(User.class));
    }

    @Test
    void emailProviderClassifiedAsWeb() throws Exception {
        UUID supabaseId = UUID.randomUUID();
        Jwt jwt = jwtFor(supabaseId, "eve@example.com", false, "email");
        when(jwtDecoder.decode("token")).thenReturn(jwt);

        when(supabaseUserService.getUser(supabaseId))
                .thenReturn(supabaseUserMatching(supabaseId, "eve@example.com", false));
        when(userService.findBySupabaseId(supabaseId)).thenReturn(Optional.empty());
        when(userService.saveUser(any(User.class)))
                .thenAnswer(
                        inv -> {
                            User u = inv.getArgument(0);
                            assertThat(u.getAuthenticationType())
                                    .as("password/magic-link must be classified as WEB")
                                    .isEqualToIgnoringCase(AuthenticationType.WEB.name());
                            return u;
                        });

        request.setRequestURI("/api/v1/something");
        request.setMethod("POST");
        request.addHeader("Authorization", "Bearer token");

        filter.doFilter(request, response, chain);

        verify(userService, times(1)).saveUser(any(User.class));
    }

    @Test
    void jwtMissingRequiredClaimsTriggers401() throws Exception {
        UUID supabaseId = UUID.randomUUID();
        // Build a JWT with no email and no required claims set; should fail validation
        Map<String, Object> headers = Map.of("alg", "HS256");
        Map<String, Object> claims = Map.of("sub", supabaseId.toString());
        Jwt jwt = new Jwt("token", Instant.now(), Instant.now().plusSeconds(60), headers, claims);
        when(jwtDecoder.decode("token")).thenReturn(jwt);

        request.setRequestURI("/api/v1/something");
        request.setMethod("POST");
        request.addHeader("Authorization", "Bearer token");

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void malformedJwtTriggers401() throws Exception {
        when(jwtDecoder.decode("garbage")).thenThrow(new JwtException("not a valid token"));

        request.setRequestURI("/api/v1/something");
        request.setMethod("POST");
        request.addHeader("Authorization", "Bearer garbage");

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void noAuthHeaderAndNoApiKeyJustPassesThrough() throws Exception {
        request.setRequestURI("/api/v1/something");
        request.setMethod("POST");
        // no Authorization, no X-API-KEY

        filter.doFilter(request, response, chain);

        // The filter chain still runs (downstream auth-required check happens elsewhere).
        // The filter itself should not have set anything in the context.
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(chain.getRequest()).isSameAs(request);
        verify(jwtDecoder, never()).decode(any());
    }

    // -------- helpers --------

    private User newUser(String username) {
        User u = new User();
        u.setUsername(username);
        u.setRoleName("ROLE_USER");
        u.setAuthorities(new HashSet<>());
        return u;
    }

    private SupabaseUser supabaseUserMatching(UUID id, String email, boolean anonymous) {
        SupabaseUser u = new SupabaseUser();
        u.setId(id);
        u.setEmail(email);
        u.setAnonymous(anonymous);
        return u;
    }

    private Jwt jwtFor(UUID supabaseId, String email, boolean anonymous, String provider) {
        Map<String, Object> headers = Map.of("alg", "HS256");
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
            claims.put("app_metadata", Map.of("provider", provider));
        }
        return new Jwt("token", Instant.now(), Instant.now().plusSeconds(3600), headers, claims);
    }
}
