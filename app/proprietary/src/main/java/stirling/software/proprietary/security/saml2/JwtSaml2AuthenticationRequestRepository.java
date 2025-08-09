package stirling.software.proprietary.security.saml2;

import java.util.HashMap;
import java.util.Map;

import org.springframework.security.saml2.provider.service.authentication.Saml2PostAuthenticationRequest;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistration;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.web.Saml2AuthenticationRequestRepository;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.service.JwtServiceInterface;

@Slf4j
public class JwtSaml2AuthenticationRequestRepository
        implements Saml2AuthenticationRequestRepository<Saml2PostAuthenticationRequest> {
    private final Map<String, String> tokenStore;
    private final JwtServiceInterface jwtService;
    private final RelyingPartyRegistrationRepository relyingPartyRegistrationRepository;

    private static final String SAML_REQUEST_TOKEN = "stirling_saml_request_token";

    public JwtSaml2AuthenticationRequestRepository(
            Map<String, String> tokenStore,
            JwtServiceInterface jwtService,
            RelyingPartyRegistrationRepository relyingPartyRegistrationRepository) {
        this.tokenStore = tokenStore;
        this.jwtService = jwtService;
        this.relyingPartyRegistrationRepository = relyingPartyRegistrationRepository;
    }

    @Override
    public void saveAuthenticationRequest(
            Saml2PostAuthenticationRequest authRequest,
            HttpServletRequest request,
            HttpServletResponse response) {
        if (!jwtService.isJwtEnabled()) {
            log.debug("V2 is not enabled, skipping SAMLRequest token storage");
            return;
        }

        if (authRequest == null) {
            removeAuthenticationRequest(request, response);
            return;
        }

        Map<String, Object> claims = serializeSamlRequest(authRequest);
        String token = jwtService.generateToken("", claims);
        String relayState = authRequest.getRelayState();

        tokenStore.put(relayState, token);
        request.setAttribute(SAML_REQUEST_TOKEN, relayState);
        response.addHeader(SAML_REQUEST_TOKEN, relayState);

        log.debug("Saved SAMLRequest token with RelayState: {}", relayState);
    }

    @Override
    public Saml2PostAuthenticationRequest loadAuthenticationRequest(HttpServletRequest request) {
        String token = extractTokenFromStore(request);

        if (token == null) {
            log.debug("No SAMLResponse token found in RelayState");
            return null;
        }

        Map<String, Object> claims = jwtService.extractClaims(token);
        return deserializeSamlRequest(claims);
    }

    @Override
    public Saml2PostAuthenticationRequest removeAuthenticationRequest(
            HttpServletRequest request, HttpServletResponse response) {
        Saml2PostAuthenticationRequest authRequest = loadAuthenticationRequest(request);

        String relayStateId = request.getParameter("RelayState");
        if (relayStateId != null) {
            tokenStore.remove(relayStateId);
            log.debug("Removed SAMLRequest token for RelayState ID: {}", relayStateId);
        }

        return authRequest;
    }

    private String extractTokenFromStore(HttpServletRequest request) {
        String authnRequestId = request.getParameter("RelayState");

        if (authnRequestId != null && !authnRequestId.isEmpty()) {
            String token = tokenStore.get(authnRequestId);

            if (token != null) {
                tokenStore.remove(authnRequestId);
                log.debug("Retrieved SAMLRequest token for RelayState ID: {}", authnRequestId);
                return token;
            } else {
                log.warn("No SAMLRequest token found for RelayState ID: {}", authnRequestId);
            }
        }

        return null;
    }

    private Map<String, Object> serializeSamlRequest(Saml2PostAuthenticationRequest authRequest) {
        Map<String, Object> claims = new HashMap<>();

        claims.put("id", authRequest.getId());
        claims.put("relyingPartyRegistrationId", authRequest.getRelyingPartyRegistrationId());
        claims.put("authenticationRequestUri", authRequest.getAuthenticationRequestUri());
        claims.put("samlRequest", authRequest.getSamlRequest());
        claims.put("relayState", authRequest.getRelayState());

        return claims;
    }

    private Saml2PostAuthenticationRequest deserializeSamlRequest(Map<String, Object> claims) {
        String relyingPartyRegistrationId = (String) claims.get("relyingPartyRegistrationId");
        RelyingPartyRegistration relyingPartyRegistration =
                relyingPartyRegistrationRepository.findByRegistrationId(relyingPartyRegistrationId);

        if (relyingPartyRegistration == null) {
            return null;
        }

        return Saml2PostAuthenticationRequest.withRelyingPartyRegistration(relyingPartyRegistration)
                .id((String) claims.get("id"))
                .authenticationRequestUri((String) claims.get("authenticationRequestUri"))
                .samlRequest((String) claims.get("samlRequest"))
                .relayState((String) claims.get("relayState"))
                .build();
    }
}
