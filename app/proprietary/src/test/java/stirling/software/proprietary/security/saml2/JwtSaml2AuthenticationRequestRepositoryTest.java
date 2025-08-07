package stirling.software.proprietary.security.saml2;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.saml2.provider.service.authentication.Saml2PostAuthenticationRequest;
import org.springframework.security.saml2.provider.service.registration.AssertingPartyMetadata;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistration;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.proprietary.security.service.JwtServiceInterface;

@ExtendWith(MockitoExtension.class)
class JwtSaml2AuthenticationRequestRepositoryTest {

    private static final String SAML_REQUEST_TOKEN = "stirling_saml_request_token";

    private Map<String, String> tokenStore;

    @Mock private JwtServiceInterface jwtService;

    @Mock private RelyingPartyRegistrationRepository relyingPartyRegistrationRepository;

    private JwtSaml2AuthenticationRequestRepository jwtSaml2AuthenticationRequestRepository;

    @BeforeEach
    void setUp() {
        tokenStore = new ConcurrentHashMap<>();
        jwtSaml2AuthenticationRequestRepository =
                new JwtSaml2AuthenticationRequestRepository(
                        tokenStore, jwtService, relyingPartyRegistrationRepository);
    }

    @Test
    void saveAuthenticationRequest() {
        var authRequest = mock(Saml2PostAuthenticationRequest.class);
        var request = mock(MockHttpServletRequest.class);
        var response = mock(MockHttpServletResponse.class);
        String token = "testToken";
        String id = "testId";
        String relayState = "testRelayState";
        String authnRequestUri = "example.com/authnRequest";
        Map<String, Object> claims = Map.of();
        String samlRequest = "testSamlRequest";
        String relyingPartyRegistrationId = "stirling-pdf";

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(authRequest.getRelayState()).thenReturn(relayState);
        when(authRequest.getId()).thenReturn(id);
        when(authRequest.getAuthenticationRequestUri()).thenReturn(authnRequestUri);
        when(authRequest.getSamlRequest()).thenReturn(samlRequest);
        when(authRequest.getRelyingPartyRegistrationId()).thenReturn(relyingPartyRegistrationId);
        when(jwtService.generateToken(eq(""), anyMap())).thenReturn(token);

        jwtSaml2AuthenticationRequestRepository.saveAuthenticationRequest(
                authRequest, request, response);

        verify(request).setAttribute(SAML_REQUEST_TOKEN, relayState);
        verify(response).addHeader(SAML_REQUEST_TOKEN, relayState);
    }

    @Test
    void saveAuthenticationRequestWithNullRequest() {
        var request = mock(MockHttpServletRequest.class);
        var response = mock(MockHttpServletResponse.class);

        jwtSaml2AuthenticationRequestRepository.saveAuthenticationRequest(null, request, response);

        assertTrue(tokenStore.isEmpty());
    }

    @Test
    void loadAuthenticationRequest() {
        var request = mock(MockHttpServletRequest.class);
        var relyingPartyRegistration = mock(RelyingPartyRegistration.class);
        var assertingPartyMetadata = mock(AssertingPartyMetadata.class);
        String relayState = "testRelayState";
        String token = "testToken";
        Map<String, Object> claims =
                Map.of(
                        "id", "testId",
                        "relyingPartyRegistrationId", "stirling-pdf",
                        "authenticationRequestUri", "example.com/authnRequest",
                        "samlRequest", "testSamlRequest",
                        "relayState", relayState);

        when(request.getParameter("RelayState")).thenReturn(relayState);
        when(jwtService.extractClaims(token)).thenReturn(claims);
        when(relyingPartyRegistrationRepository.findByRegistrationId("stirling-pdf"))
                .thenReturn(relyingPartyRegistration);
        when(relyingPartyRegistration.getRegistrationId()).thenReturn("stirling-pdf");
        when(relyingPartyRegistration.getAssertingPartyMetadata())
                .thenReturn(assertingPartyMetadata);
        when(assertingPartyMetadata.getSingleSignOnServiceLocation())
                .thenReturn("https://example.com/sso");
        tokenStore.put(relayState, token);

        var result = jwtSaml2AuthenticationRequestRepository.loadAuthenticationRequest(request);

        assertNotNull(result);
        assertFalse(tokenStore.containsKey(relayState));
    }

    @ParameterizedTest
    @NullAndEmptySource
    void loadAuthenticationRequestWithInvalidRelayState(String relayState) {
        var request = mock(MockHttpServletRequest.class);
        when(request.getParameter("RelayState")).thenReturn(relayState);

        var result = jwtSaml2AuthenticationRequestRepository.loadAuthenticationRequest(request);

        assertNull(result);
    }

    @Test
    void loadAuthenticationRequestWithNonExistentToken() {
        var request = mock(MockHttpServletRequest.class);
        when(request.getParameter("RelayState")).thenReturn("nonExistentRelayState");

        var result = jwtSaml2AuthenticationRequestRepository.loadAuthenticationRequest(request);

        assertNull(result);
    }

    @Test
    void loadAuthenticationRequestWithNullRelyingPartyRegistration() {
        var request = mock(MockHttpServletRequest.class);
        String relayState = "testRelayState";
        String token = "testToken";
        Map<String, Object> claims =
                Map.of(
                        "id", "testId",
                        "relyingPartyRegistrationId", "stirling-pdf",
                        "authenticationRequestUri", "example.com/authnRequest",
                        "samlRequest", "testSamlRequest",
                        "relayState", relayState);

        when(request.getParameter("RelayState")).thenReturn(relayState);
        when(jwtService.extractClaims(token)).thenReturn(claims);
        when(relyingPartyRegistrationRepository.findByRegistrationId("stirling-pdf"))
                .thenReturn(null);
        tokenStore.put(relayState, token);

        var result = jwtSaml2AuthenticationRequestRepository.loadAuthenticationRequest(request);

        assertNull(result);
    }

    @Test
    void removeAuthenticationRequest() {
        var request = mock(HttpServletRequest.class);
        var response = mock(HttpServletResponse.class);
        var relyingPartyRegistration = mock(RelyingPartyRegistration.class);
        var assertingPartyMetadata = mock(AssertingPartyMetadata.class);
        String relayState = "testRelayState";
        String token = "testToken";
        Map<String, Object> claims =
                Map.of(
                        "id", "testId",
                        "relyingPartyRegistrationId", "stirling-pdf",
                        "authenticationRequestUri", "example.com/authnRequest",
                        "samlRequest", "testSamlRequest",
                        "relayState", relayState);

        when(request.getParameter("RelayState")).thenReturn(relayState);
        when(jwtService.extractClaims(token)).thenReturn(claims);
        when(relyingPartyRegistrationRepository.findByRegistrationId("stirling-pdf"))
                .thenReturn(relyingPartyRegistration);
        when(relyingPartyRegistration.getRegistrationId()).thenReturn("stirling-pdf");
        when(relyingPartyRegistration.getAssertingPartyMetadata())
                .thenReturn(assertingPartyMetadata);
        when(assertingPartyMetadata.getSingleSignOnServiceLocation())
                .thenReturn("https://example.com/sso");
        tokenStore.put(relayState, token);

        var result =
                jwtSaml2AuthenticationRequestRepository.removeAuthenticationRequest(
                        request, response);

        assertNotNull(result);
        assertFalse(tokenStore.containsKey(relayState));
    }

    @Test
    void removeAuthenticationRequestWithNullRelayState() {
        var request = mock(HttpServletRequest.class);
        var response = mock(HttpServletResponse.class);
        when(request.getParameter("RelayState")).thenReturn(null);

        var result =
                jwtSaml2AuthenticationRequestRepository.removeAuthenticationRequest(
                        request, response);

        assertNull(result);
    }

    @Test
    void removeAuthenticationRequestWithNonExistentToken() {
        var request = mock(HttpServletRequest.class);
        var response = mock(HttpServletResponse.class);
        when(request.getParameter("RelayState")).thenReturn("nonExistentRelayState");

        var result =
                jwtSaml2AuthenticationRequestRepository.removeAuthenticationRequest(
                        request, response);

        assertNull(result);
    }

    @Test
    void removeAuthenticationRequestWithOnlyRelayState() {
        var request = mock(HttpServletRequest.class);
        var response = mock(HttpServletResponse.class);
        String relayState = "testRelayState";

        when(request.getParameter("RelayState")).thenReturn(relayState);

        var result =
                jwtSaml2AuthenticationRequestRepository.removeAuthenticationRequest(
                        request, response);

        assertNull(result);
        assertFalse(tokenStore.containsKey(relayState));
    }
}
