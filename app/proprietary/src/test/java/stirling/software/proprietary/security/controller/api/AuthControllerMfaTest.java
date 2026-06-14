package stirling.software.proprietary.security.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.security.Principal;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import io.quarkus.security.identity.SecurityIdentity;

import jakarta.ws.rs.core.Response;

import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.api.user.MfaCodeRequest;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.MfaService;
import stirling.software.proprietary.security.service.TotpService;
import stirling.software.proprietary.security.service.UserService;

/**
 * Migration (Spring MockMvc -> direct JAX-RS calls): {@code AuthController} MFA endpoints now
 * return {@code jakarta.ws.rs.core.Response} and read the caller from the injected Quarkus {@code
 * SecurityIdentity} (was a Spring {@code Authentication}/{@code Principal} via {@code
 * .principal()}). The enable/disable endpoints bind a typed {@code MfaCodeRequest} body (was a JSON
 * string). The controller has no constructor (field injection only), so the collaborators and the
 * {@code SecurityIdentity} are assigned directly. Anonymous access is simulated with {@code
 * isAnonymous()==true}.
 */
@ExtendWith(MockitoExtension.class)
class AuthControllerMfaTest {

    private static final String USERNAME = "user@example.com";

    @Mock private UserService userService;
    @Mock private JwtServiceInterface jwtService;
    @Mock private CustomUserDetailsService userDetailsService;
    @Mock private LoginAttemptService loginAttemptService;
    @Mock private MfaService mfaService;
    @Mock private TotpService totpService;
    @Mock private SecurityIdentity securityIdentity;

    private AuthController authController;
    private User user;

    @BeforeEach
    void setUp() {
        authController = new AuthController();
        // @Inject fields are not populated without a CDI container; wire them directly.
        authController.userService = userService;
        authController.jwtService = jwtService;
        authController.userDetailsService = userDetailsService;
        authController.loginAttemptService = loginAttemptService;
        authController.mfaService = mfaService;
        authController.totpService = totpService;
        authController.securityIdentity = securityIdentity;

        user = new User();
        user.setUsername(USERNAME);
        user.setAuthenticationType(AuthenticationType.WEB);
    }

    /** Make {@code securityIdentity} report an authenticated principal named {@link #USERNAME}. */
    private void authenticated() {
        Principal principal = mock(Principal.class);
        lenient().when(principal.getName()).thenReturn(USERNAME);
        lenient().when(securityIdentity.isAnonymous()).thenReturn(false);
        lenient().when(securityIdentity.getPrincipal()).thenReturn(principal);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> body(Response response) {
        return (Map<String, Object>) response.getEntity();
    }

    private static MfaCodeRequest code(String value) {
        MfaCodeRequest request = new MfaCodeRequest();
        request.setCode(value);
        return request;
    }

    @Test
    void setupMfaRequiresAuthentication() {
        when(securityIdentity.isAnonymous()).thenReturn(true);

        Response response = authController.setupMfa();

        assertEquals(Response.Status.UNAUTHORIZED.getStatusCode(), response.getStatus());
        assertEquals("Not authenticated", body(response).get("error"));
    }

    @Test
    void setupMfaReturnsSecretAndUri() throws Exception {
        authenticated();
        when(userService.findByUsernameIgnoreCaseWithSettings(USERNAME))
                .thenReturn(Optional.of(user));
        when(mfaService.isMfaEnabled(user)).thenReturn(false);
        when(totpService.generateSecret()).thenReturn("SECRET");
        when(totpService.buildOtpAuthUri(USERNAME, "SECRET")).thenReturn("otpauth://test");

        Response response = authController.setupMfa();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals("SECRET", body(response).get("secret"));
        assertEquals("otpauth://test", body(response).get("otpauthUri"));

        verify(mfaService).setSecret(user, "SECRET");
    }

    @Test
    void setupMfaReturnsConflictWhenAlreadyEnabled() {
        authenticated();
        when(userService.findByUsernameIgnoreCaseWithSettings(USERNAME))
                .thenReturn(Optional.of(user));
        when(mfaService.isMfaEnabled(user)).thenReturn(true);

        Response response = authController.setupMfa();

        assertEquals(Response.Status.CONFLICT.getStatusCode(), response.getStatus());
        assertEquals("MFA already enabled", body(response).get("error"));

        verify(totpService, never()).generateSecret();
    }

    @Test
    void setupMfaRejectsNonWebAuthenticationType() {
        user.setAuthenticationType(AuthenticationType.OAUTH2);
        authenticated();
        when(userService.findByUsernameIgnoreCaseWithSettings(USERNAME))
                .thenReturn(Optional.of(user));

        Response response = authController.setupMfa();

        assertEquals(Response.Status.FORBIDDEN.getStatusCode(), response.getStatus());
        assertEquals(
                "MFA settings are only available for web accounts", body(response).get("error"));
    }

    @Test
    void enableMfaRejectsMissingCode() {
        authenticated();
        when(userService.findByUsernameIgnoreCaseWithSettings(USERNAME))
                .thenReturn(Optional.of(user));
        when(mfaService.getSecret(user)).thenReturn("SECRET");

        Response response = authController.enableMfa(code(null));

        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
        assertEquals("MFA code is required", body(response).get("error"));
    }

    @Test
    void enableMfaCompletesWorkflow() throws Exception {
        authenticated();
        when(userService.findByUsernameIgnoreCaseWithSettings(USERNAME))
                .thenReturn(Optional.of(user));
        when(mfaService.getSecret(user)).thenReturn("SECRET");
        when(totpService.getValidTimeStep("SECRET", "123456")).thenReturn(42L);
        when(mfaService.isTotpStepUsable(user, 42L)).thenReturn(true);

        Response response = authController.enableMfa(code("123456"));

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals(true, body(response).get("enabled"));

        verify(mfaService).enableMfa(user);
        verify(mfaService).markTotpStepUsed(user, 42L);
        verify(mfaService).setMfaRequired(user, false);
    }

    @Test
    void disableMfaCompletesWorkflow() throws Exception {
        authenticated();
        when(userService.findByUsernameIgnoreCaseWithSettings(USERNAME))
                .thenReturn(Optional.of(user));
        when(mfaService.isMfaEnabled(user)).thenReturn(true);
        when(mfaService.getSecret(user)).thenReturn("SECRET");
        when(totpService.getValidTimeStep("SECRET", "654321")).thenReturn(7L);
        when(mfaService.isTotpStepUsable(user, 7L)).thenReturn(true);

        Response response = authController.disableMfa(code("654321"));

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals(false, body(response).get("enabled"));

        verify(mfaService).disableMfa(user);
        verify(mfaService).markTotpStepUsed(user, 7L);
    }

    @Test
    void disableMfaReturnsDisabledWhenNotEnabled() {
        authenticated();
        when(userService.findByUsernameIgnoreCaseWithSettings(USERNAME))
                .thenReturn(Optional.of(user));
        when(mfaService.isMfaEnabled(user)).thenReturn(false);

        Response response = authController.disableMfa(code("654321"));

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals(false, body(response).get("enabled"));

        verify(mfaService, never()).getSecret(user);
        verifyNoInteractions(totpService);
    }

    @Test
    void cancelMfaSetupClearsPendingSecret() throws Exception {
        authenticated();
        when(userService.findByUsernameIgnoreCaseWithSettings(USERNAME))
                .thenReturn(Optional.of(user));

        Response response = authController.cancelMfaSetup();

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals(true, body(response).get("cleared"));

        verify(mfaService).clearPendingSecret(user);
    }

    @Test
    void cancelMfaSetupReturnsConflictWhenEnabled() throws Exception {
        authenticated();
        when(userService.findByUsernameIgnoreCaseWithSettings(USERNAME))
                .thenReturn(Optional.of(user));
        when(mfaService.isMfaEnabled(user)).thenReturn(true);

        Response response = authController.cancelMfaSetup();

        assertEquals(Response.Status.CONFLICT.getStatusCode(), response.getStatus());
        assertEquals("MFA already enabled", body(response).get("error"));

        verify(mfaService, never()).clearPendingSecret(user);
    }
}
