package stirling.software.proprietary.security.controller.api;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.fasterxml.jackson.databind.ObjectMapper;

import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.MfaService;
import stirling.software.proprietary.security.service.TotpService;
import stirling.software.proprietary.security.service.UserService;

@ExtendWith(MockitoExtension.class)
class AuthControllerMfaTest {

    private static final String USERNAME = "user@example.com";

    private final ObjectMapper objectMapper = new ObjectMapper();

    private MockMvc mockMvc;
    private Authentication authentication;
    private User user;

    @Mock private UserService userService;
    @Mock private JwtServiceInterface jwtService;
    @Mock private CustomUserDetailsService userDetailsService;
    @Mock private LoginAttemptService loginAttemptService;
    @Mock private MfaService mfaService;
    @Mock private TotpService totpService;

    @InjectMocks private AuthController authController;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(authController).build();
        authentication = new UsernamePasswordAuthenticationToken(USERNAME, "password", List.of());
        user = new User();
        user.setUsername(USERNAME);
        user.setAuthenticationType(AuthenticationType.WEB);
    }

    @Test
    void setupMfaRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/v1/auth/mfa/setup"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().json("{\"error\":\"Not authenticated\"}"));
    }

    @Test
    void setupMfaReturnsSecretAndUri() throws Exception {
        when(userService.findByUsernameIgnoreCaseWithSettings(USERNAME))
                .thenReturn(Optional.of(user));
        when(mfaService.isMfaEnabled(user)).thenReturn(false);
        when(totpService.generateSecret()).thenReturn("SECRET");
        when(totpService.buildOtpAuthUri(USERNAME, "SECRET")).thenReturn("otpauth://test");

        mockMvc.perform(get("/api/v1/auth/mfa/setup").principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.secret").value("SECRET"))
                .andExpect(jsonPath("$.otpauthUri").value("otpauth://test"));

        verify(mfaService).setSecret(user, "SECRET");
    }

    @Test
    void setupMfaReturnsConflictWhenAlreadyEnabled() throws Exception {
        when(userService.findByUsernameIgnoreCaseWithSettings(USERNAME))
                .thenReturn(Optional.of(user));
        when(mfaService.isMfaEnabled(user)).thenReturn(true);

        mockMvc.perform(get("/api/v1/auth/mfa/setup").principal(authentication))
                .andExpect(status().isConflict())
                .andExpect(content().json("{\"error\":\"MFA already enabled\"}"));

        verify(totpService, never()).generateSecret();
    }

    @Test
    void setupMfaRejectsNonWebAuthenticationType() throws Exception {
        user.setAuthenticationType(AuthenticationType.OAUTH2);
        when(userService.findByUsernameIgnoreCaseWithSettings(USERNAME))
                .thenReturn(Optional.of(user));

        mockMvc.perform(get("/api/v1/auth/mfa/setup").principal(authentication))
                .andExpect(status().isForbidden())
                .andExpect(
                        content()
                                .json(
                                        "{\"error\":\"MFA settings are only available for web accounts\"}"));
    }

    @Test
    void enableMfaRejectsMissingCode() throws Exception {
        when(userService.findByUsernameIgnoreCaseWithSettings(USERNAME))
                .thenReturn(Optional.of(user));
        when(mfaService.getSecret(user)).thenReturn("SECRET");

        mockMvc.perform(
                        post("/api/v1/auth/mfa/enable")
                                .principal(authentication)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().json("{\"error\":\"MFA code is required\"}"));
    }

    @Test
    void enableMfaCompletesWorkflow() throws Exception {
        when(userService.findByUsernameIgnoreCaseWithSettings(USERNAME))
                .thenReturn(Optional.of(user));
        when(mfaService.getSecret(user)).thenReturn("SECRET");
        when(totpService.getValidTimeStep("SECRET", "123456")).thenReturn(42L);
        when(mfaService.isTotpStepUsable(user, 42L)).thenReturn(true);

        mockMvc.perform(
                        post("/api/v1/auth/mfa/enable")
                                .principal(authentication)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(Map.of("code", "123456"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true));

        verify(mfaService).enableMfa(user);
        verify(mfaService).markTotpStepUsed(user, 42L);
        verify(mfaService).setMfaRequired(user, false);
    }

    @Test
    void disableMfaCompletesWorkflow() throws Exception {
        when(userService.findByUsernameIgnoreCaseWithSettings(USERNAME))
                .thenReturn(Optional.of(user));
        when(mfaService.isMfaEnabled(user)).thenReturn(true);
        when(mfaService.getSecret(user)).thenReturn("SECRET");
        when(totpService.getValidTimeStep("SECRET", "654321")).thenReturn(7L);
        when(mfaService.isTotpStepUsable(user, 7L)).thenReturn(true);

        mockMvc.perform(
                        post("/api/v1/auth/mfa/disable")
                                .principal(authentication)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(Map.of("code", "654321"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false));

        verify(mfaService).disableMfa(user);
        verify(mfaService).markTotpStepUsed(user, 7L);
    }

    @Test
    void disableMfaReturnsDisabledWhenNotEnabled() throws Exception {
        when(userService.findByUsernameIgnoreCaseWithSettings(USERNAME))
                .thenReturn(Optional.of(user));
        when(mfaService.isMfaEnabled(user)).thenReturn(false);

        mockMvc.perform(
                        post("/api/v1/auth/mfa/disable")
                                .principal(authentication)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(Map.of("code", "654321"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false));

        verify(mfaService, never()).getSecret(user);
        verifyNoInteractions(totpService);
    }

    @Test
    void cancelMfaSetupClearsPendingSecret() throws Exception {
        when(userService.findByUsernameIgnoreCaseWithSettings(USERNAME))
                .thenReturn(Optional.of(user));

        mockMvc.perform(post("/api/v1/auth/mfa/setup/cancel").principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cleared").value(true));

        verify(mfaService).clearPendingSecret(user);
    }

    @Test
    void cancelMfaSetupReturnsConflictWhenEnabled() throws Exception {
        when(userService.findByUsernameIgnoreCaseWithSettings(USERNAME))
                .thenReturn(Optional.of(user));
        when(mfaService.isMfaEnabled(user)).thenReturn(true);

        mockMvc.perform(post("/api/v1/auth/mfa/setup/cancel").principal(authentication))
                .andExpect(status().isConflict())
                .andExpect(content().json("{\"error\":\"MFA already enabled\"}"));

        verify(mfaService, never()).clearPendingSecret(user);
    }
}
