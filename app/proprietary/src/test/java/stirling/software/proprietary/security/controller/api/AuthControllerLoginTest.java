package stirling.software.proprietary.security.controller.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

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

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
class AuthControllerLoginTest {

    private final ObjectMapper objectMapper = JsonMapper.builder().build();

    private MockMvc mockMvc;
    private ApplicationProperties.Security securityProperties;

    @Mock private UserService userService;
    @Mock private JwtServiceInterface jwtService;
    @Mock private CustomUserDetailsService userDetailsService;
    @Mock private LoginAttemptService loginAttemptService;
    @Mock private MfaService mfaService;
    @Mock private TotpService totpService;
    @Mock private RefreshRateLimitService refreshRateLimitService;

    @BeforeEach
    void setUp() {
        securityProperties = new ApplicationProperties.Security();
        securityProperties.setLoginMethod("all");
        securityProperties.getJwt().setTokenExpiryMinutes(60);
        securityProperties.getJwt().setRefreshGraceMinutes(5);

        ApplicationProperties applicationProperties = new ApplicationProperties();
        applicationProperties.setSecurity(securityProperties);

        AuthController controller =
                new AuthController(
                        userService,
                        jwtService,
                        userDetailsService,
                        loginAttemptService,
                        mfaService,
                        totpService,
                        refreshRateLimitService,
                        securityProperties,
                        applicationProperties);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    void loginRejectsWhenUserPassDisabled() throws Exception {
        securityProperties.setLoginMethod(
                ApplicationProperties.Security.LoginMethods.OAUTH2.toString());
        UsernameAndPassMfa payload = buildPayload(null);

        mockMvc.perform(
                        post("/api/v1/auth/login")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isForbidden())
                .andExpect(
                        jsonPath("$.error")
                                .value(
                                        "Username/password authentication is not enabled. Please use the configured authentication method."));

        verify(userDetailsService, never()).loadUserByUsername(any());
    }

    @Test
    void loginBlockedAccountReturnsUnauthorized() throws Exception {
        UsernameAndPassMfa payload = buildPayload(null);
        when(loginAttemptService.isBlocked("user@example.com")).thenReturn(true);

        mockMvc.perform(
                        post("/api/v1/auth/login")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isUnauthorized())
                .andExpect(
                        jsonPath("$.error")
                                .value("Account is locked due to too many failed attempts"));

        verify(loginAttemptService, never()).loginSucceeded(any());
    }

    @Test
    void loginRequiresMfaCodeWhenEnabled() throws Exception {
        UsernameAndPassMfa payload = buildPayload(null);
        User user = buildUser();
        when(userDetailsService.loadUserByUsername("user@example.com")).thenReturn(user);
        when(userService.isPasswordCorrect(user, "pw")).thenReturn(true);
        when(mfaService.isMfaEnabled(user)).thenReturn(true);

        mockMvc.perform(
                        post("/api/v1/auth/login")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("mfa_required"));

        verify(loginAttemptService, never()).loginSucceeded(any());
    }

    @Test
    void loginFailsWhenPasswordIncorrect() throws Exception {
        UsernameAndPassMfa payload = buildPayload(null);
        User user = buildUser();
        when(userDetailsService.loadUserByUsername("user@example.com")).thenReturn(user);
        when(userService.isPasswordCorrect(user, "pw")).thenReturn(false);

        mockMvc.perform(
                        post("/api/v1/auth/login")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Invalid credentials"));

        verify(loginAttemptService).loginFailed("user@example.com");
    }

    @Test
    void loginSucceedsAndGeneratesToken() throws Exception {
        UsernameAndPassMfa payload = buildPayload(null);
        User user = buildUser();
        when(userDetailsService.loadUserByUsername("user@example.com")).thenReturn(user);
        when(userService.isPasswordCorrect(user, "pw")).thenReturn(true);
        when(mfaService.isMfaEnabled(user)).thenReturn(false);
        when(jwtService.generateToken(eq("user@example.com"), any(Map.class)))
                .thenReturn("token-123");

        mockMvc.perform(
                        post("/api/v1/auth/login")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.session.access_token").value("token-123"))
                .andExpect(jsonPath("$.user.username").value("user@example.com"));

        verify(loginAttemptService).loginSucceeded("user@example.com");
    }

    @Test
    void refreshReturnsUnauthorizedWhenTokenMissing() throws Exception {
        when(jwtService.extractToken(any())).thenReturn(null);
        mockMvc.perform(post("/api/v1/auth/refresh"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("No token found"));
    }

    @Test
    void refreshReturnsNewTokenWhenValid() throws Exception {
        User user = buildUser();
        when(jwtService.extractToken(any())).thenReturn("old");
        Map<String, Object> claims = new HashMap<>();
        claims.put("sub", "user@example.com");
        claims.put("exp", new Date(System.currentTimeMillis() + 60_000));
        when(jwtService.extractClaimsAllowExpired("old")).thenReturn(claims);
        // Rate limiting is not checked for valid tokens, so no stub needed
        when(userDetailsService.loadUserByUsername("user@example.com")).thenReturn(user);
        when(jwtService.generateToken(eq("user@example.com"), any(Map.class)))
                .thenReturn("new-token");

        mockMvc.perform(post("/api/v1/auth/refresh"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user").exists())
                .andExpect(jsonPath("$.session.access_token").value("new-token"))
                .andExpect(
                        jsonPath("$.session.expires_in")
                                .value(3600)); // 60 minutes * 60 = 3600 seconds

        // clearRefreshAttempts is intentionally not called - tokens expire naturally after grace
        // period
    }

    @Test
    void refreshRejectsTokenExpiredBeyondGrace() throws Exception {
        when(jwtService.extractToken(any())).thenReturn("old");
        Map<String, Object> claims = new HashMap<>();
        claims.put("sub", "user@example.com");
        claims.put(
                "exp",
                new Date(
                        System.currentTimeMillis()
                                - (10 * 60_000))); // 10 minutes ago, beyond 5 minute grace
        when(jwtService.extractClaimsAllowExpired("old")).thenReturn(claims);

        mockMvc.perform(post("/api/v1/auth/refresh"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Token refresh failed"));

        verify(userDetailsService, never()).loadUserByUsername(any());
        verify(refreshRateLimitService, never()).isRefreshAllowed(any(), any(Long.class));
    }

    @Test
    void refreshAcceptsTokenExpiredWithinGrace() throws Exception {
        User user = buildUser();
        when(jwtService.extractToken(any())).thenReturn("old");
        Map<String, Object> claims = new HashMap<>();
        claims.put("sub", "user@example.com");
        claims.put(
                "exp",
                new Date(
                        System.currentTimeMillis()
                                - 60_000)); // 1 minute ago, within 5 minute grace
        when(jwtService.extractClaimsAllowExpired("old")).thenReturn(claims);
        when(refreshRateLimitService.isRefreshAllowed(any(), any(Long.class))).thenReturn(true);
        when(userDetailsService.loadUserByUsername("user@example.com")).thenReturn(user);
        when(jwtService.generateToken(eq("user@example.com"), any(Map.class)))
                .thenReturn("new-token");

        mockMvc.perform(post("/api/v1/auth/refresh"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.session.access_token").value("new-token"));

        // clearRefreshAttempts is intentionally not called - tokens expire naturally after grace
        // period
    }

    @Test
    void refreshRejectsWhenRateLimitExceeded() throws Exception {
        when(jwtService.extractToken(any())).thenReturn("old");
        Map<String, Object> claims = new HashMap<>();
        claims.put("sub", "user@example.com");
        claims.put("exp", new Date(System.currentTimeMillis() - 60_000)); // 1 minute ago
        when(jwtService.extractClaimsAllowExpired("old")).thenReturn(claims);
        when(refreshRateLimitService.isRefreshAllowed(any(), any(Long.class))).thenReturn(false);

        mockMvc.perform(post("/api/v1/auth/refresh"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("Too many refresh attempts"))
                .andExpect(jsonPath("$.max_attempts").exists());

        verify(userDetailsService, never()).loadUserByUsername(any());
        verify(refreshRateLimitService, never()).clearRefreshAttempts(any());
    }

    @Test
    void getCurrentUserReturnsUnauthorizedWhenAnonymous() throws Exception {
        SecurityContextHolder.clearContext();

        mockMvc.perform(get("/api/v1/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Not authenticated"));
    }

    @Test
    void getCurrentUserReturnsUserDetails() throws Exception {
        User user = buildUser();
        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());
        SecurityContextHolder.getContext().setAuthentication(authentication);

        mockMvc.perform(get("/api/v1/auth/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.username").value("user@example.com"))
                .andExpect(
                        jsonPath("$.user.authenticationType")
                                .value(AuthenticationType.WEB.name().toLowerCase()));

        SecurityContextHolder.clearContext();
    }

    private User buildUser() {
        User user = new User();
        user.setUsername("user@example.com");
        user.setEnabled(true);
        user.setAuthenticationType(AuthenticationType.WEB);

        Authority authority = new Authority();
        authority.setAuthority(Role.USER.getRoleId());
        user.addAuthorities(Set.of(authority));
        return user;
    }

    private UsernameAndPassMfa buildPayload(String mfaCode) {
        UsernameAndPassMfa payload = new UsernameAndPassMfa();
        payload.setUsername("user@example.com");
        payload.setPassword("pw");
        payload.setMfaCode(mfaCode);
        return payload;
    }
}
