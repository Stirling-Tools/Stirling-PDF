package stirling.software.proprietary.security.oauth2;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.web.savedrequest.SavedRequest;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.accountlink.EntitlementCache;
import stirling.software.proprietary.model.UserLicenseSettings;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.repository.UserLicenseSettingsRepository;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.UserLicenseSettingsService;

@ExtendWith(MockitoExtension.class)
class CustomOAuth2AuthenticationSuccessHandlerTest {

    @Test
    void redirectsToTauriCallbackWhenStateMarked() throws Exception {
        LoginAttemptService loginAttemptService = mock(LoginAttemptService.class);
        UserService userService = mock(UserService.class);
        JwtServiceInterface jwtService = mock(JwtServiceInterface.class);
        UserLicenseSettingsService licenseSettingsService = mock(UserLicenseSettingsService.class);

        ApplicationProperties.Security.OAUTH2 oauth2Props =
                new ApplicationProperties.Security.OAUTH2();
        oauth2Props.setAutoCreateUser(true);
        oauth2Props.setBlockRegistration(false);

        ApplicationProperties applicationProperties = new ApplicationProperties();
        ApplicationProperties.Security securityProperties = new ApplicationProperties.Security();
        securityProperties.setOauth2(oauth2Props);
        applicationProperties.setSecurity(securityProperties);

        CustomOAuth2AuthenticationSuccessHandler handler =
                new CustomOAuth2AuthenticationSuccessHandler(
                        loginAttemptService,
                        oauth2Props,
                        userService,
                        jwtService,
                        licenseSettingsService,
                        applicationProperties);

        when(userService.usernameExistsIgnoreCase("user")).thenReturn(false);
        when(userService.isUserDisabled("user")).thenReturn(false);
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(jwtService.generateToken(
                        org.mockito.Mockito.any(
                                org.springframework.security.core.Authentication.class),
                        org.mockito.Mockito.anyMap()))
                .thenReturn("jwt");

        Map<String, Object> attributes = Map.of("sub", "provider-sub", "name", "user");
        DefaultOAuth2User oauthUser =
                new DefaultOAuth2User(
                        List.of(new SimpleGrantedAuthority("ROLE_USER")), attributes, "name");
        OAuth2AuthenticationToken authentication =
                new OAuth2AuthenticationToken(oauthUser, oauthUser.getAuthorities(), "google");

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("");
        request.setScheme("http");
        request.setServerName("localhost");
        request.setServerPort(8080);
        request.setParameter("state", "tauri:abc");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationSuccess(request, response, authentication);

        assertEquals(
                "http://localhost:8080/auth/callback/tauri#access_token=jwt",
                response.getRedirectedUrl());
    }

    @ParameterizedTest
    @CsvSource({
        "NORMAL, 4, false, false, true",
        "NORMAL, 5, false, false, false",
        "NORMAL, 5, false, true, false",
        "NORMAL, 5, true, false, true",
        "SERVER, 100, false, false, true",
        "SERVER, 100, true, false, true",
        "ENTERPRISE, 9, false, false, true",
        "ENTERPRISE, 10, false, false, false",
        "ENTERPRISE, 10, false, true, false",
        "ENTERPRISE, 10, true, false, true"
    })
    void oauthIsFreeAcrossLicensesButUserLimitsStillApply(
            License license,
            long userCount,
            boolean existingUser,
            boolean savedRequest,
            boolean allowed)
            throws Exception {
        LoginAttemptService loginAttemptService = mock(LoginAttemptService.class);
        UserService userService = mock(UserService.class);
        JwtServiceInterface jwtService = mock(JwtServiceInterface.class);
        UserLicenseSettingsRepository repository = mock(UserLicenseSettingsRepository.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<LicenseKeyChecker> checkerProvider = mock(ObjectProvider.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<EntitlementCache> entitlementProvider = mock(ObjectProvider.class);
        LicenseKeyChecker checker = mock(LicenseKeyChecker.class);
        ApplicationProperties properties = new ApplicationProperties();
        ApplicationProperties.Security.OAUTH2 oauth2 = properties.getSecurity().getOauth2();
        oauth2.setAutoCreateUser(true);
        oauth2.setBlockRegistration(false);

        UserLicenseSettingsService licenseSettingsService =
                new UserLicenseSettingsService(
                        repository, userService, properties, checkerProvider, entitlementProvider);
        when(userService.usernameExistsIgnoreCase("user")).thenReturn(existingUser);
        if (!existingUser) {
            UserLicenseSettings settings = new UserLicenseSettings();
            settings.setGrandfatheredUserCount(5);
            settings.setLicenseMaxUsers(license == License.ENTERPRISE ? 10 : 0);
            when(repository.findSettings()).thenReturn(Optional.of(settings));
            // Initialise the signed free-tier limit before simulating the current user count.
            licenseSettingsService.validateSettingsIntegrity();
            when(userService.getTotalUsersCount()).thenReturn(userCount);
            when(checkerProvider.getIfAvailable()).thenReturn(checker);
            when(checker.getLicenseKeyResult()).thenReturn(license);
        }

        CustomOAuth2AuthenticationSuccessHandler handler =
                new CustomOAuth2AuthenticationSuccessHandler(
                        loginAttemptService,
                        oauth2,
                        userService,
                        jwtService,
                        licenseSettingsService,
                        properties);
        DefaultOAuth2User principal =
                new DefaultOAuth2User(
                        List.of(new SimpleGrantedAuthority("ROLE_USER")),
                        Map.of("sub", "provider-sub", "name", "user"),
                        "name");
        OAuth2AuthenticationToken authentication =
                new OAuth2AuthenticationToken(principal, principal.getAuthorities(), "google");
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("/stirling");
        if (savedRequest) {
            request.getSession()
                    .setAttribute("SPRING_SECURITY_SAVED_REQUEST", mock(SavedRequest.class));
        }
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationSuccess(request, response, authentication);

        if (allowed) {
            assertEquals("/stirling/", response.getRedirectedUrl());
            verify(userService)
                    .processSSOPostLogin(
                            "user", "provider-sub", "google", true, AuthenticationType.OAUTH2);
        } else {
            assertEquals("/stirling/logout?maxUsersReached=true", response.getRedirectedUrl());
            verify(userService, never())
                    .processSSOPostLogin(
                            anyString(), anyString(), anyString(), anyBoolean(), any());
            verifyNoInteractions(jwtService);
        }
    }
}
