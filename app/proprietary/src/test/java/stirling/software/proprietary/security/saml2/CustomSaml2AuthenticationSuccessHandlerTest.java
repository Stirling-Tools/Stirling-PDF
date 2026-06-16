package stirling.software.proprietary.security.saml2;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.savedrequest.SavedRequest;

import jakarta.servlet.http.Cookie;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.UserLicenseSettingsService;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("CustomSaml2AuthenticationSuccessHandler")
class CustomSaml2AuthenticationSuccessHandlerTest {

    private static final String SAVED_REQUEST_ATTR = "SPRING_SECURITY_SAVED_REQUEST";
    private static final String SPA_REDIRECT_COOKIE = "stirling_redirect_path";
    private static final String FRONTEND = "https://frontend.example.com";

    @Mock private LoginAttemptService loginAttemptService;
    @Mock private UserService userService;
    @Mock private JwtServiceInterface jwtService;
    @Mock private UserLicenseSettingsService licenseSettingsService;

    private ApplicationProperties.Security.SAML2 saml2Properties;
    private ApplicationProperties applicationProperties;

    private CustomSaml2AuthenticationSuccessHandler handler;

    private MockHttpServletRequest request;
    private MockHttpServletResponse response;

    @BeforeEach
    void setUp() {
        saml2Properties = new ApplicationProperties.Security.SAML2();
        saml2Properties.setAutoCreateUser(true);
        saml2Properties.setBlockRegistration(false);

        // Real ApplicationProperties so getSystem()/getSecurity()/getJwt() chains resolve.
        applicationProperties = new ApplicationProperties();
        // Configure a frontend URL so redirect origins are deterministic (no header guessing).
        applicationProperties.getSystem().setFrontendUrl(FRONTEND);

        handler =
                new CustomSaml2AuthenticationSuccessHandler(
                        loginAttemptService,
                        saml2Properties,
                        userService,
                        jwtService,
                        licenseSettingsService,
                        applicationProperties);

        request = new MockHttpServletRequest();
        response = new MockHttpServletResponse();
    }

    // ---- Helpers -------------------------------------------------------------

    private Authentication saml2Auth(String username) {
        CustomSaml2AuthenticatedPrincipal principal =
                new CustomSaml2AuthenticatedPrincipal(
                        username, Map.of(), "nameid-" + username, List.of("idx"));
        Authentication authentication = org.mockito.Mockito.mock(Authentication.class);
        when(authentication.getPrincipal()).thenReturn(principal);
        return authentication;
    }

    private User userNamed(String username) {
        User user = new User();
        user.setUsername(username);
        return user;
    }

    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("Non-SAML2 principal")
    class NonSaml2Principal {

        @Test
        @DisplayName("delegates to parent handler and never touches services")
        void delegatesToParent() throws Exception {
            Authentication authentication = org.mockito.Mockito.mock(Authentication.class);
            when(authentication.getPrincipal()).thenReturn("just-a-string-principal");

            handler.onAuthenticationSuccess(request, response, authentication);

            // Parent SimpleUrl handler redirects to the default target URL "/".
            assertEquals("/", response.getRedirectedUrl());
            verifyNoInteractions(
                    userService, loginAttemptService, jwtService, licenseSettingsService);
        }
    }

    @Nested
    @DisplayName("SAML eligibility gating")
    class EligibilityGating {

        @Test
        @DisplayName("existing ineligible user is redirected to logout?saml2RequiresLicense=true")
        void existingUserNotEligible() throws Exception {
            String username = "alice";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(true);
            when(userService.findByUsernameIgnoreCase(username))
                    .thenReturn(Optional.of(userNamed(username)));
            when(licenseSettingsService.isSamlEligible(any(User.class))).thenReturn(false);

            handler.onAuthenticationSuccess(request, response, saml2Auth(username));

            assertEquals(
                    FRONTEND + "/logout?saml2RequiresLicense=true", response.getRedirectedUrl());
            verify(userService, never())
                    .processSSOPostLogin(any(), any(), any(), anyBoolean(), any());
        }

        @Test
        @DisplayName("new (non-existing) user with no enterprise license is blocked")
        void newUserNotEligible() throws Exception {
            String username = "bob";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(false);
            when(licenseSettingsService.isSamlEligible(null)).thenReturn(false);

            handler.onAuthenticationSuccess(request, response, saml2Auth(username));

            assertEquals(
                    FRONTEND + "/logout?saml2RequiresLicense=true", response.getRedirectedUrl());
            verify(userService, never())
                    .processSSOPostLogin(any(), any(), any(), anyBoolean(), any());
        }

        @Test
        @DisplayName("existing user present but eligible proceeds past the license gate")
        void existingUserEligibleProceeds() throws Exception {
            String username = "carol";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(true);
            when(userService.findByUsernameIgnoreCase(username))
                    .thenReturn(Optional.of(userNamed(username)));
            when(licenseSettingsService.isSamlEligible(any(User.class))).thenReturn(true);
            // existing SSO user, v1 mode (jwt disabled) -> redirect to contextPath + "/"
            when(userService.isSsoAuthenticationTypeByUsername(username)).thenReturn(true);
            when(jwtService.isJwtEnabled()).thenReturn(false);

            handler.onAuthenticationSuccess(request, response, saml2Auth(username));

            // Not blocked by the license gate (would otherwise be logout?saml2RequiresLicense).
            assertEquals("/", response.getRedirectedUrl());
        }

        @Test
        @DisplayName(
                "existing username with a null user record skips the per-user eligibility block")
        void existingUserNullRecordSkipsBlock() throws Exception {
            String username = "ghost";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(true);
            // userExists true but lookup returns empty -> user == null branch, no block
            when(userService.findByUsernameIgnoreCase(username)).thenReturn(Optional.empty());
            when(jwtService.isJwtEnabled()).thenReturn(false);

            handler.onAuthenticationSuccess(request, response, saml2Auth(username));

            // Falls through; existing user with no password / not blocked -> v1 home redirect.
            assertEquals("/", response.getRedirectedUrl());
            // isSamlEligible(user) must not be consulted when the record is null.
            verify(licenseSettingsService, never()).isSamlEligible(any(User.class));
        }
    }

    @Nested
    @DisplayName("Saved request redirect")
    class SavedRequestRedirect {

        @Test
        @DisplayName("valid non-static saved request delegates to parent and redirects there")
        void savedRequestRedirectsToOriginalDestination() throws Exception {
            String username = "dave";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(false);
            when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);

            SavedRequest savedRequest = org.mockito.Mockito.mock(SavedRequest.class);
            when(savedRequest.getRedirectUrl()).thenReturn("https://app.example.com/dashboard");
            request.getSession().setAttribute(SAVED_REQUEST_ATTR, savedRequest);

            handler.onAuthenticationSuccess(request, response, saml2Auth(username));

            assertEquals("https://app.example.com/dashboard", response.getRedirectedUrl());
            // We took the saved-request branch, so SSO post-login is never invoked.
            verify(userService, never())
                    .processSSOPostLogin(any(), any(), any(), anyBoolean(), any());
        }

        @Test
        @DisplayName("static-resource saved request is ignored and normal SSO flow continues")
        void staticSavedRequestIsIgnored() throws Exception {
            String username = "erin";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(false);
            when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(jwtService.isJwtEnabled()).thenReturn(false);

            SavedRequest savedRequest = org.mockito.Mockito.mock(SavedRequest.class);
            // A static asset URL -> isStaticResource true -> branch ignored.
            when(savedRequest.getRedirectUrl()).thenReturn("https://app.example.com/css/app.css");
            request.getSession().setAttribute(SAVED_REQUEST_ATTR, savedRequest);

            handler.onAuthenticationSuccess(request, response, saml2Auth(username));

            // Normal new-user SSO flow ran (v1) -> redirect to home, post-login invoked.
            assertEquals("/", response.getRedirectedUrl());
            verify(userService)
                    .processSSOPostLogin(
                            eq(username),
                            any(),
                            eq("saml2"),
                            eq(true),
                            eq(AuthenticationType.SAML2));
        }
    }

    @Nested
    @DisplayName("Account locking")
    class AccountLocking {

        @Test
        @DisplayName("blocked user throws LockedException and clears saved request")
        void blockedUserThrowsLockedException() throws Exception {
            String username = "frank";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(false);
            when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
            when(loginAttemptService.isBlocked(username)).thenReturn(true);
            // Static saved request -> not redirected, so the else branch (lock check) runs.
            SavedRequest savedRequest = org.mockito.Mockito.mock(SavedRequest.class);
            when(savedRequest.getRedirectUrl()).thenReturn("https://app.example.com/css/app.css");
            request.getSession().setAttribute(SAVED_REQUEST_ATTR, savedRequest);

            LockedException ex =
                    assertThrows(
                            LockedException.class,
                            () ->
                                    handler.onAuthenticationSuccess(
                                            request, response, saml2Auth(username)));

            assertTrue(ex.getMessage().contains("locked"));
            // Saved request attribute is removed when locked.
            assertNull(request.getSession(false).getAttribute(SAVED_REQUEST_ATTR));
            verify(userService, never())
                    .processSSOPostLogin(any(), any(), any(), anyBoolean(), any());
        }

        @Test
        @DisplayName("blocked user with no session still throws and does not NPE")
        void blockedUserNoSession() {
            String username = "grace";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(false);
            when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
            when(loginAttemptService.isBlocked(username)).thenReturn(true);
            // No session created -> request.getSession(false) is null.

            assertThrows(
                    LockedException.class,
                    () -> handler.onAuthenticationSuccess(request, response, saml2Auth(username)));
        }
    }

    @Nested
    @DisplayName("Existing local user collision")
    class ExistingLocalUserCollision {

        @Test
        @DisplayName(
                "existing user with password and not SSO is redirected to logout (oAuth2 error)")
        void existingPasswordUserRedirectedToLogout() throws Exception {
            String username = "heidi";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(true);
            when(userService.findByUsernameIgnoreCase(username))
                    .thenReturn(Optional.of(userNamed(username)));
            when(licenseSettingsService.isSamlEligible(any(User.class))).thenReturn(true);
            when(userService.hasPassword(username)).thenReturn(true);
            when(userService.isSsoAuthenticationTypeByUsername(username)).thenReturn(false);
            saml2Properties.setAutoCreateUser(true);

            handler.onAuthenticationSuccess(request, response, saml2Auth(username));

            assertEquals(
                    FRONTEND + "/logout?oAuth2AuthenticationErrorWeb=true",
                    response.getRedirectedUrl());
            verify(userService, never())
                    .processSSOPostLogin(any(), any(), any(), anyBoolean(), any());
        }

        @Test
        @DisplayName("existing password+nonSSO user NOT redirected when autoCreateUser disabled")
        void existingPasswordUserNotRedirectedWhenAutoCreateDisabled() throws Exception {
            String username = "ivan";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(true);
            when(userService.findByUsernameIgnoreCase(username))
                    .thenReturn(Optional.of(userNamed(username)));
            when(licenseSettingsService.isSamlEligible(any(User.class))).thenReturn(true);
            when(userService.hasPassword(username)).thenReturn(true);
            when(userService.isSsoAuthenticationTypeByUsername(username)).thenReturn(false);
            when(jwtService.isJwtEnabled()).thenReturn(false);
            saml2Properties.setAutoCreateUser(false);

            handler.onAuthenticationSuccess(request, response, saml2Auth(username));

            // The collision redirect is gated on autoCreateUser==true, so we fall through.
            assertEquals("/", response.getRedirectedUrl());
        }
    }

    @Nested
    @DisplayName("Registration blocking and limits (new users)")
    class RegistrationAndLimits {

        @Test
        @DisplayName("new user blocked when blockRegistration is true")
        void newUserBlockedByBlockRegistration() throws Exception {
            String username = "judy";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(false);
            when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
            saml2Properties.setAutoCreateUser(true);
            saml2Properties.setBlockRegistration(true);

            handler.onAuthenticationSuccess(request, response, saml2Auth(username));

            assertEquals(
                    FRONTEND + "/login?errorOAuth=oAuth2AdminBlockedUser",
                    response.getRedirectedUrl());
            verify(userService, never())
                    .processSSOPostLogin(any(), any(), any(), anyBoolean(), any());
        }

        @Test
        @DisplayName("new user blocked when autoCreateUser is false")
        void newUserBlockedByAutoCreateDisabled() throws Exception {
            String username = "ken";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(false);
            when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
            saml2Properties.setAutoCreateUser(false);
            saml2Properties.setBlockRegistration(false);

            handler.onAuthenticationSuccess(request, response, saml2Auth(username));

            assertEquals(
                    FRONTEND + "/login?errorOAuth=oAuth2AdminBlockedUser",
                    response.getRedirectedUrl());
            verify(userService, never())
                    .processSSOPostLogin(any(), any(), any(), anyBoolean(), any());
        }

        @Test
        @DisplayName("new user blocked when user limit would be exceeded")
        void newUserBlockedByUserLimit() throws Exception {
            String username = "leo";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(false);
            when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(true);
            saml2Properties.setAutoCreateUser(true);
            saml2Properties.setBlockRegistration(false);

            handler.onAuthenticationSuccess(request, response, saml2Auth(username));

            assertEquals(FRONTEND + "/logout?maxUsersReached=true", response.getRedirectedUrl());
            verify(userService, never())
                    .processSSOPostLogin(any(), any(), any(), anyBoolean(), any());
        }
    }

    @Nested
    @DisplayName("Successful SSO post-login")
    class SuccessfulPostLogin {

        @Test
        @DisplayName("v1 (JWT disabled): processes login then redirects to contextPath home")
        void v1RedirectsToHome() throws Exception {
            String username = "mallory";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(false);
            when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(jwtService.isJwtEnabled()).thenReturn(false);

            handler.onAuthenticationSuccess(request, response, saml2Auth(username));

            verify(userService)
                    .processSSOPostLogin(
                            eq(username),
                            eq("nameid-" + username),
                            eq("saml2"),
                            eq(true),
                            eq(AuthenticationType.SAML2));
            assertEquals("/", response.getRedirectedUrl());
            verify(jwtService, never()).generateToken(any(Authentication.class), any());
        }

        @Test
        @DisplayName(
                "v2 web (JWT enabled): issues web token and redirects with access_token fragment")
        void v2WebIssuesTokenAndRedirects() throws Exception {
            String username = "niaj";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(false);
            when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(jwtService.isJwtEnabled()).thenReturn(true);
            when(jwtService.generateToken(any(Authentication.class), any())).thenReturn("WEB.JWT");

            handler.onAuthenticationSuccess(request, response, saml2Auth(username));

            String redirect = response.getRedirectedUrl();
            assertNotNull(redirect);
            // No SPA cookie + not Tauri -> default callback path on configured frontend origin.
            assertEquals(FRONTEND + "/auth/callback#access_token=WEB.JWT", redirect);
            // Redirect cookie is cleared.
            assertTrue(
                    response.getHeaders("Set-Cookie").stream()
                            .anyMatch(h -> h.startsWith(SPA_REDIRECT_COOKIE + "=")));
            verify(jwtService, never()).generateToken(any(String.class), any(), anyInt());
        }

        @Test
        @DisplayName("v2 web: honours stirling_redirect_path cookie for the callback path")
        void v2WebHonoursRedirectCookie() throws Exception {
            String username = "olivia";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(false);
            when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(jwtService.isJwtEnabled()).thenReturn(true);
            when(jwtService.generateToken(any(Authentication.class), any())).thenReturn("TOK");
            request.setCookies(new Cookie(SPA_REDIRECT_COOKIE, "/tools/merge"));

            handler.onAuthenticationSuccess(request, response, saml2Auth(username));

            assertEquals(FRONTEND + "/tools/merge#access_token=TOK", response.getRedirectedUrl());
        }

        @Test
        @DisplayName("v2 web: ignores a redirect cookie that does not start with '/'")
        void v2WebIgnoresNonAbsoluteCookie() throws Exception {
            String username = "peggy";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(false);
            when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(jwtService.isJwtEnabled()).thenReturn(true);
            when(jwtService.generateToken(any(Authentication.class), any())).thenReturn("TOK");
            request.setCookies(new Cookie(SPA_REDIRECT_COOKIE, "evil.com/path"));

            handler.onAuthenticationSuccess(request, response, saml2Auth(username));

            // Non-absolute path is rejected -> default callback path used.
            assertEquals(FRONTEND + "/auth/callback#access_token=TOK", response.getRedirectedUrl());
        }

        @Test
        @DisplayName("v2 desktop (Tauri UA): issues long-lived desktop token with custom expiry")
        void v2DesktopIssuesDesktopToken() throws Exception {
            String username = "quinn";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(false);
            when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(jwtService.isJwtEnabled()).thenReturn(true);
            when(jwtService.generateToken(eq(username), any(), anyInt())).thenReturn("DESKTOP.JWT");
            request.addHeader("User-Agent", "StirlingPDF-Desktop Tauri/2.0");

            handler.onAuthenticationSuccess(request, response, saml2Auth(username));

            // Desktop path uses the username+expiry overload, not the authentication overload.
            verify(jwtService).generateToken(eq(username), any(), anyInt());
            verify(jwtService, never()).generateToken(any(Authentication.class), any());
            assertEquals(
                    FRONTEND + "/auth/callback#access_token=DESKTOP.JWT",
                    response.getRedirectedUrl());
        }

        @Test
        @DisplayName("v2: Tauri RelayState routes to the Tauri callback path and appends nonce")
        void v2TauriRelayStateUsesTauriCallbackAndNonce() throws Exception {
            String username = "rupert";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(false);
            when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            when(jwtService.isJwtEnabled()).thenReturn(true);
            when(jwtService.generateToken(any(Authentication.class), any())).thenReturn("TOK");
            request.setParameter("RelayState", "tauri:abc123");

            handler.onAuthenticationSuccess(request, response, saml2Auth(username));

            String redirect = response.getRedirectedUrl();
            assertNotNull(redirect);
            assertTrue(redirect.contains("#access_token=TOK"), redirect);
            // Nonce extracted from RelayState is appended (URL-encoded).
            assertTrue(redirect.endsWith("&nonce=abc123"), redirect);
        }
    }

    @Nested
    @DisplayName("Failure handling during post-login")
    class PostLoginFailures {

        @Test
        @DisplayName(
                "IllegalArgumentException from processSSOPostLogin -> logout?invalidUsername=true")
        void processSSOPostLoginThrowsRedirectsToInvalidUsername() throws Exception {
            String username = "sybil";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(false);
            when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            org.mockito.Mockito.doThrow(new IllegalArgumentException("bad name"))
                    .when(userService)
                    .processSSOPostLogin(any(), any(), any(), anyBoolean(), any());

            handler.onAuthenticationSuccess(request, response, saml2Auth(username));

            // contextPath is empty for MockHttpServletRequest, so just the relative logout URL.
            assertEquals("/logout?invalidUsername=true", response.getRedirectedUrl());
            // JWT generation is never reached because the exception is thrown first.
            verify(jwtService, never()).isJwtEnabled();
        }

        @Test
        @DisplayName("SQLException from processSSOPostLogin -> logout?invalidUsername=true")
        void processSSOPostLoginThrowsSqlException() throws Exception {
            String username = "trent";
            when(userService.usernameExistsIgnoreCase(username)).thenReturn(false);
            when(licenseSettingsService.isSamlEligible(null)).thenReturn(true);
            when(licenseSettingsService.wouldExceedLimit(1)).thenReturn(false);
            org.mockito.Mockito.doThrow(new java.sql.SQLException("db down"))
                    .when(userService)
                    .processSSOPostLogin(any(), any(), any(), anyBoolean(), any());

            handler.onAuthenticationSuccess(request, response, saml2Auth(username));

            assertEquals("/logout?invalidUsername=true", response.getRedirectedUrl());
        }
    }
}
