package stirling.software.proprietary.security.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.security.Principal;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import io.quarkus.security.identity.SecurityIdentity;
import io.vertx.core.http.HttpServerRequest;

import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.api.user.UsernameAndPassMfa;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.MfaService;
import stirling.software.proprietary.security.service.RefreshRateLimitService;
import stirling.software.proprietary.security.service.TotpService;
import stirling.software.proprietary.security.service.UserService;

/**
 * Migration (Spring MockMvc -> direct JAX-RS calls): {@code AuthController} now returns {@code
 * jakarta.ws.rs.core.Response}. {@code /login} binds a typed {@code UsernameAndPassMfa} body plus
 * the Vert.x {@code HttpServerRequest} and JAX-RS {@code HttpHeaders} (for IP / User-Agent); {@code
 * /refresh} reads the bearer token from the {@code Authorization} header via {@code HttpHeaders}
 * (replacing {@code jwtService.extractToken(HttpServletRequest)}); and {@code /me} reads the caller
 * from the injected Quarkus {@code SecurityIdentity} (replacing {@code SecurityContextHolder}). The
 * controller has no constructor (field injection only), so the collaborators and config are
 * assigned directly. {@code applicationProperties.setSecurity(securityProperties)} keeps the same
 * Jwt config visible through both injection points.
 */
@ExtendWith(MockitoExtension.class)
class AuthControllerLoginTest {

    private static final String USERNAME = "user@example.com";

    @Mock private UserService userService;
    @Mock private JwtServiceInterface jwtService;
    @Mock private CustomUserDetailsService userDetailsService;
    @Mock private LoginAttemptService loginAttemptService;
    @Mock private MfaService mfaService;
    @Mock private TotpService totpService;
    @Mock private RefreshRateLimitService refreshRateLimitService;
    @Mock private SecurityIdentity securityIdentity;

    private ApplicationProperties.Security securityProperties;
    private AuthController controller;

    @BeforeEach
    void setUp() {
        securityProperties = new ApplicationProperties.Security();
        securityProperties.setLoginMethod("all");
        securityProperties.getJwt().setTokenExpiryMinutes(60);
        securityProperties.getJwt().setRefreshGraceMinutes(5);

        ApplicationProperties applicationProperties = new ApplicationProperties();
        applicationProperties.setSecurity(securityProperties);

        controller = new AuthController();
        // @Inject fields are not populated without a CDI container; wire them directly.
        controller.userService = userService;
        controller.jwtService = jwtService;
        controller.userDetailsService = userDetailsService;
        controller.loginAttemptService = loginAttemptService;
        controller.mfaService = mfaService;
        controller.totpService = totpService;
        controller.refreshRateLimitService = refreshRateLimitService;
        controller.securityProperties = securityProperties;
        controller.applicationProperties = applicationProperties;
        controller.securityIdentity = securityIdentity;
    }

    /** Vert.x request whose remote address is unknown (controller treats this as a null IP). */
    private HttpServerRequest webRequest() {
        HttpServerRequest request = mock(HttpServerRequest.class);
        lenient().when(request.remoteAddress()).thenReturn(null);
        return request;
    }

    /** JAX-RS headers with no User-Agent and, optionally, a bearer Authorization header. */
    private HttpHeaders headers(String bearerToken) {
        HttpHeaders httpHeaders = mock(HttpHeaders.class);
        lenient().when(httpHeaders.getHeaderString("User-Agent")).thenReturn(null);
        lenient()
                .when(httpHeaders.getHeaderString(HttpHeaders.AUTHORIZATION))
                .thenReturn(bearerToken == null ? null : "Bearer " + bearerToken);
        return httpHeaders;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> body(Response response) {
        return (Map<String, Object>) response.getEntity();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> nested(Response response, String key) {
        return (Map<String, Object>) body(response).get(key);
    }

    @Test
    void loginRejectsWhenUserPassDisabled() {
        securityProperties.setLoginMethod(
                ApplicationProperties.Security.LoginMethods.OAUTH2.toString());
        UsernameAndPassMfa payload = buildPayload(null);

        Response response = controller.login(payload, webRequest(), headers(null));

        assertEquals(Response.Status.FORBIDDEN.getStatusCode(), response.getStatus());
        assertEquals(
                "Username/password authentication is not enabled. Please use the configured"
                        + " authentication method.",
                body(response).get("error"));

        verify(userDetailsService, never()).loadUserByUsername(any());
    }

    @Test
    void loginBlockedAccountReturnsUnauthorized() {
        UsernameAndPassMfa payload = buildPayload(null);
        when(loginAttemptService.isBlocked(USERNAME)).thenReturn(true);

        Response response = controller.login(payload, webRequest(), headers(null));

        assertEquals(Response.Status.UNAUTHORIZED.getStatusCode(), response.getStatus());
        assertEquals(
                "Account is locked due to too many failed attempts", body(response).get("error"));

        verify(loginAttemptService, never()).loginSucceeded(any());
    }

    @Test
    void loginRequiresMfaCodeWhenEnabled() {
        UsernameAndPassMfa payload = buildPayload(null);
        User user = buildUser();
        when(userDetailsService.loadUserByUsername(USERNAME)).thenReturn(user);
        when(userService.isPasswordCorrect(user, "pw")).thenReturn(true);
        when(mfaService.isMfaEnabled(user)).thenReturn(true);

        Response response = controller.login(payload, webRequest(), headers(null));

        assertEquals(Response.Status.UNAUTHORIZED.getStatusCode(), response.getStatus());
        assertEquals("mfa_required", body(response).get("error"));

        verify(loginAttemptService, never()).loginSucceeded(any());
    }

    @Test
    void loginFailsWhenPasswordIncorrect() {
        UsernameAndPassMfa payload = buildPayload(null);
        User user = buildUser();
        when(userDetailsService.loadUserByUsername(USERNAME)).thenReturn(user);
        when(userService.isPasswordCorrect(user, "pw")).thenReturn(false);

        Response response = controller.login(payload, webRequest(), headers(null));

        assertEquals(Response.Status.UNAUTHORIZED.getStatusCode(), response.getStatus());
        assertEquals("Invalid username or password", body(response).get("error"));

        verify(loginAttemptService).loginFailed(USERNAME);
    }

    @Test
    void loginSucceedsAndGeneratesToken() {
        UsernameAndPassMfa payload = buildPayload(null);
        User user = buildUser();
        when(userDetailsService.loadUserByUsername(USERNAME)).thenReturn(user);
        when(userService.isPasswordCorrect(user, "pw")).thenReturn(true);
        when(mfaService.isMfaEnabled(user)).thenReturn(false);
        when(jwtService.generateToken(eq(USERNAME), any(Map.class))).thenReturn("token-123");

        Response response = controller.login(payload, webRequest(), headers(null));

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals("token-123", nested(response, "session").get("access_token"));
        assertEquals(USERNAME, nested(response, "user").get("username"));

        verify(loginAttemptService).loginSucceeded(USERNAME);
    }

    @Test
    void refreshReturnsUnauthorizedWhenTokenMissing() {
        Response response = controller.refresh(headers(null));

        assertEquals(Response.Status.UNAUTHORIZED.getStatusCode(), response.getStatus());
        assertEquals("No token found", body(response).get("error"));
    }

    @Test
    void refreshReturnsNewTokenWhenValid() {
        User user = buildUser();
        Map<String, Object> claims = new HashMap<>();
        claims.put("sub", USERNAME);
        claims.put("exp", new Date(System.currentTimeMillis() + 60_000));
        when(jwtService.extractClaimsAllowExpired("old")).thenReturn(claims);
        // Rate limiting is not checked for valid tokens, so no stub needed
        when(userDetailsService.loadUserByUsername(USERNAME)).thenReturn(user);
        when(jwtService.generateToken(eq(USERNAME), any(Map.class))).thenReturn("new-token");

        Response response = controller.refresh(headers("old"));

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals(USERNAME, nested(response, "user").get("username"));
        assertEquals("new-token", nested(response, "session").get("access_token"));
        assertEquals(3600L, nested(response, "session").get("expires_in")); // 60 minutes * 60
    }

    @Test
    void refreshRejectsTokenExpiredBeyondGrace() {
        Map<String, Object> claims = new HashMap<>();
        claims.put("sub", USERNAME);
        // 10 minutes ago, beyond the 5 minute grace
        claims.put("exp", new Date(System.currentTimeMillis() - (10 * 60_000)));
        when(jwtService.extractClaimsAllowExpired("old")).thenReturn(claims);

        Response response = controller.refresh(headers("old"));

        assertEquals(Response.Status.UNAUTHORIZED.getStatusCode(), response.getStatus());
        assertEquals("Token refresh failed", body(response).get("error"));

        verify(userDetailsService, never()).loadUserByUsername(any());
        verify(refreshRateLimitService, never()).isRefreshAllowed(any(), any(Long.class));
    }

    @Test
    void refreshAcceptsTokenExpiredWithinGrace() {
        User user = buildUser();
        Map<String, Object> claims = new HashMap<>();
        claims.put("sub", USERNAME);
        // 1 minute ago, within the 5 minute grace
        claims.put("exp", new Date(System.currentTimeMillis() - 60_000));
        when(jwtService.extractClaimsAllowExpired("old")).thenReturn(claims);
        when(refreshRateLimitService.isRefreshAllowed(any(), any(Long.class))).thenReturn(true);
        when(userDetailsService.loadUserByUsername(USERNAME)).thenReturn(user);
        when(jwtService.generateToken(eq(USERNAME), any(Map.class))).thenReturn("new-token");

        Response response = controller.refresh(headers("old"));

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals("new-token", nested(response, "session").get("access_token"));
    }

    @Test
    void refreshRejectsWhenRateLimitExceeded() {
        Map<String, Object> claims = new HashMap<>();
        claims.put("sub", USERNAME);
        claims.put("exp", new Date(System.currentTimeMillis() - 60_000)); // 1 minute ago
        when(jwtService.extractClaimsAllowExpired("old")).thenReturn(claims);
        when(refreshRateLimitService.isRefreshAllowed(any(), any(Long.class))).thenReturn(false);

        Response response = controller.refresh(headers("old"));

        assertEquals(429, response.getStatus());
        assertEquals("Too many refresh attempts", body(response).get("error"));
        org.junit.jupiter.api.Assertions.assertNotNull(body(response).get("max_attempts"));

        verify(userDetailsService, never()).loadUserByUsername(any());
        verify(refreshRateLimitService, never()).clearRefreshAttempts(any());
    }

    @Test
    void getCurrentUserReturnsUnauthorizedWhenAnonymous() {
        when(securityIdentity.isAnonymous()).thenReturn(true);

        Response response = controller.getCurrentUser();

        assertEquals(Response.Status.UNAUTHORIZED.getStatusCode(), response.getStatus());
        assertEquals("Not authenticated", body(response).get("error"));
    }

    @Test
    void getCurrentUserReturnsUserDetails() {
        User user = buildUser();
        Principal principal = mock(Principal.class);
        when(principal.getName()).thenReturn(USERNAME);
        when(securityIdentity.isAnonymous()).thenReturn(false);
        when(securityIdentity.getPrincipal()).thenReturn(principal);
        when(userDetailsService.loadUserByUsername(USERNAME)).thenReturn(user);

        Response response = controller.getCurrentUser();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals(USERNAME, nested(response, "user").get("username"));
        assertEquals(
                AuthenticationType.WEB.name().toLowerCase(),
                nested(response, "user").get("authenticationType"));
    }

    private User buildUser() {
        User user = new User();
        user.setUsername(USERNAME);
        user.setEnabled(true);
        user.setAuthenticationType(AuthenticationType.WEB);

        Authority authority = new Authority();
        authority.setAuthority(Role.USER.getRoleId());
        user.addAuthorities(Set.of(authority));
        return user;
    }

    private UsernameAndPassMfa buildPayload(String mfaCode) {
        UsernameAndPassMfa payload = new UsernameAndPassMfa();
        payload.setUsername(USERNAME);
        payload.setPassword("pw");
        payload.setMfaCode(mfaCode);
        return payload;
    }
}
