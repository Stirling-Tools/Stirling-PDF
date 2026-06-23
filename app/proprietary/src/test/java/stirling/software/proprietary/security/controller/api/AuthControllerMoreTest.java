package stirling.software.proprietary.security.controller.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
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
@DisplayName("AuthController - additional coverage")
class AuthControllerMoreTest {

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
                        applicationProperties,
                        new stirling.software.proprietary.service.AiUserDataService(null));
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    private UsernameAndPassMfa payload(String username, String password) {
        UsernameAndPassMfa p = new UsernameAndPassMfa();
        p.setUsername(username);
        p.setPassword(password);
        return p;
    }

    private User webUser() {
        User user = new User();
        user.setUsername("user@example.com");
        user.setEnabled(true);
        user.setAuthenticationType(AuthenticationType.WEB);
        Authority authority = new Authority();
        authority.setAuthority(Role.USER.getRoleId());
        user.addAuthorities(Set.of(authority));
        return user;
    }

    @Nested
    @DisplayName("login validation")
    class LoginValidation {

        @Test
        @DisplayName("rejects a blank username")
        void blankUsername() throws Exception {
            mockMvc.perform(
                            post("/api/v1/auth/login")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(objectMapper.writeValueAsString(payload("  ", "pw"))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("Username is required"));
        }

        @Test
        @DisplayName("rejects a missing password")
        void missingPassword() throws Exception {
            mockMvc.perform(
                            post("/api/v1/auth/login")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            objectMapper.writeValueAsString(
                                                    payload("user@example.com", ""))))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("Password is required"));
        }

        @Test
        @DisplayName("returns 401 for a disabled account")
        void disabledAccount() throws Exception {
            User user = webUser();
            user.setEnabled(false);
            when(userDetailsService.loadUserByUsername("user@example.com")).thenReturn(user);
            when(userService.isPasswordCorrect(user, "pw")).thenReturn(true);

            mockMvc.perform(
                            post("/api/v1/auth/login")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            objectMapper.writeValueAsString(
                                                    payload("user@example.com", "pw"))))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error").value("User account is disabled"));
        }

        @Test
        @DisplayName("maps an unknown user to a generic 401 and records the failure")
        void unknownUser() throws Exception {
            when(userDetailsService.loadUserByUsername("user@example.com"))
                    .thenThrow(new UsernameNotFoundException("nope"));

            mockMvc.perform(
                            post("/api/v1/auth/login")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            objectMapper.writeValueAsString(
                                                    payload("user@example.com", "pw"))))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error").value("Invalid username or password"));

            verify(loginAttemptService).loginFailed("user@example.com");
        }
    }

    @Nested
    @DisplayName("login MFA")
    class LoginMfa {

        @Test
        @DisplayName("returns 500 when MFA is enabled but no secret is stored")
        void mfaNoSecret() throws Exception {
            User user = webUser();
            UsernameAndPassMfa p = payload("user@example.com", "pw");
            p.setMfaCode("123456");
            when(userDetailsService.loadUserByUsername("user@example.com")).thenReturn(user);
            when(userService.isPasswordCorrect(user, "pw")).thenReturn(true);
            when(mfaService.isMfaEnabled(user)).thenReturn(true);
            when(mfaService.getSecret(user)).thenReturn("");

            mockMvc.perform(
                            post("/api/v1/auth/login")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(objectMapper.writeValueAsString(p)))
                    .andExpect(status().isInternalServerError())
                    .andExpect(jsonPath("$.error").value("MFA configuration error"));
        }

        @Test
        @DisplayName("returns 401 for an invalid MFA code")
        void mfaInvalidCode() throws Exception {
            User user = webUser();
            UsernameAndPassMfa p = payload("user@example.com", "pw");
            p.setMfaCode("000000");
            when(userDetailsService.loadUserByUsername("user@example.com")).thenReturn(user);
            when(userService.isPasswordCorrect(user, "pw")).thenReturn(true);
            when(mfaService.isMfaEnabled(user)).thenReturn(true);
            when(mfaService.getSecret(user)).thenReturn("SECRET");
            when(totpService.getValidTimeStep("SECRET", "000000")).thenReturn(null);

            mockMvc.perform(
                            post("/api/v1/auth/login")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(objectMapper.writeValueAsString(p)))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error").value("invalid_mfa_code"));

            verify(loginAttemptService).loginFailed("user@example.com");
        }

        @Test
        @DisplayName("returns 401 when a replayed MFA code is detected")
        void mfaReplay() throws Exception {
            User user = webUser();
            UsernameAndPassMfa p = payload("user@example.com", "pw");
            p.setMfaCode("123456");
            when(userDetailsService.loadUserByUsername("user@example.com")).thenReturn(user);
            when(userService.isPasswordCorrect(user, "pw")).thenReturn(true);
            when(mfaService.isMfaEnabled(user)).thenReturn(true);
            when(mfaService.getSecret(user)).thenReturn("SECRET");
            when(totpService.getValidTimeStep("SECRET", "123456")).thenReturn(9L);
            when(mfaService.markTotpStepUsed(user, 9L)).thenReturn(false);

            mockMvc.perform(
                            post("/api/v1/auth/login")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(objectMapper.writeValueAsString(p)))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error").value("invalid_mfa_code"));
        }
    }

    @Nested
    @DisplayName("logout")
    class Logout {

        @Test
        @DisplayName("clears context and returns a success message")
        void logoutSucceeds() throws Exception {
            // Null username makes the async purge a no-op, avoiding the stubbed-out engine client.
            when(jwtService.extractUsernameFromRequestAllowExpired(any())).thenReturn(null);

            mockMvc.perform(post("/api/v1/auth/logout"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.message").value("Logged out successfully"));
        }
    }

    @Nested
    @DisplayName("refresh")
    class Refresh {

        @Test
        @DisplayName("returns 401 when the subject claim is missing")
        void missingSubject() throws Exception {
            when(jwtService.extractToken(any())).thenReturn("old");
            Map<String, Object> claims = new HashMap<>();
            claims.put("exp", new Date(System.currentTimeMillis() + 60_000));
            when(jwtService.extractClaimsAllowExpired("old")).thenReturn(claims);

            mockMvc.perform(post("/api/v1/auth/refresh"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error").value("Token refresh failed"));

            verify(userDetailsService, never()).loadUserByUsername(any());
        }
    }

    @Nested
    @DisplayName("admin MFA disable")
    class AdminMfaDisable {

        @Test
        @DisplayName("returns 404 when the target user is unknown")
        void userNotFound() throws Exception {
            when(userService.findByUsernameIgnoreCaseWithSettings("ghost"))
                    .thenReturn(Optional.empty());

            mockMvc.perform(post("/api/v1/auth/mfa/disable/admin/ghost"))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error").value("User not found"));
        }

        @Test
        @DisplayName("disables MFA for an enabled user")
        void disablesEnabled() throws Exception {
            User user = webUser();
            when(userService.findByUsernameIgnoreCaseWithSettings("user@example.com"))
                    .thenReturn(Optional.of(user));
            when(mfaService.isMfaEnabled(user)).thenReturn(true);

            mockMvc.perform(post("/api/v1/auth/mfa/disable/admin/user@example.com"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.enabled").value(false));

            verify(mfaService).disableMfa(user);
        }
    }
}
