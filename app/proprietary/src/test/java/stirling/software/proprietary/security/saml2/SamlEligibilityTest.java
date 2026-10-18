package stirling.software.proprietary.security.saml2;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.savedrequest.SavedRequest;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.LoginAttemptService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.UserLicenseSettingsService;

class SamlEligibilityTest {
    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    @SuppressWarnings("unchecked")
    void verifiedIdentityDeterminesEligibilityAndDenialClearsTheSession(boolean grandfathered)
            throws Exception {
        User user = new User();
        user.setUsername("verified-user");
        user.setOauthGrandfathered(grandfathered);
        UserService users = mock(UserService.class);
        when(users.usernameExistsIgnoreCase("verified-user")).thenReturn(true);
        when(users.findByUsernameIgnoreCase("verified-user")).thenReturn(Optional.of(user));
        LicenseKeyChecker checker = mock(LicenseKeyChecker.class);
        when(checker.premiumTier()).thenReturn(License.NORMAL);
        ObjectProvider<LicenseKeyChecker> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(checker);
        ApplicationProperties properties = new ApplicationProperties();
        var eligibility = new UserLicenseSettingsService(null, users, properties, provider, null);
        var handler =
                new CustomSaml2AuthenticationSuccessHandler(
                        mock(LoginAttemptService.class),
                        properties.getSecurity().getSaml2(),
                        users,
                        mock(JwtServiceInterface.class),
                        eligibility,
                        properties);
        var principal =
                new CustomSaml2AuthenticatedPrincipal(
                        "verified-user", Map.of(), "name", List.of(), "signed-response");
        var authentication =
                UsernamePasswordAuthenticationToken.authenticated(principal, null, List.of());
        SecurityContextHolder.getContext().setAuthentication(authentication);
        var request = new MockHttpServletRequest();
        request.setParameter("username", "someone-grandfathered");
        var session = (MockHttpSession) request.getSession();
        SavedRequest saved = mock(SavedRequest.class);
        when(saved.getRedirectUrl()).thenReturn("http://localhost/protected");
        session.setAttribute("SPRING_SECURITY_SAVED_REQUEST", saved);
        var response = new MockHttpServletResponse();
        handler.onAuthenticationSuccess(request, response, authentication);
        if (grandfathered) {
            assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost/protected");
            assertThat(session.isInvalid()).isFalse();
        } else {
            assertThat(response.getRedirectedUrl()).contains("saml2RequiresLicense=true");
            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
            assertThat(session.isInvalid()).isTrue();
        }
        verify(users, never()).findByUsernameIgnoreCase("someone-grandfathered");
    }
}
