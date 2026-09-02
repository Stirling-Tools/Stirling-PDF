package stirling.software.proprietary.security.saml2;

import java.util.HashMap;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.service.JwtServiceInterface;

@Slf4j
public class JwtSaml2AuthenticationRequestRepository {
    private final Map<String, String> tokenStore;
    private final JwtServiceInterface jwtService;

    private static final String SAML_REQUEST_TOKEN = "stirling_saml_request_token";

    public JwtSaml2AuthenticationRequestRepository(
            Map<String, String> tokenStore, JwtServiceInterface jwtService) {
        this.tokenStore = tokenStore;
        this.jwtService = jwtService;
    }

    public void saveAuthenticationRequest(
            Map<String, Object> claims,
            String relayState,
            HttpServletRequest request,
            HttpServletResponse response) {
        if (!jwtService.isJwtEnabled()) {
            log.debug("V2 is not enabled, skipping SAMLRequest token storage");
            return;
        }

        if (claims == null) {
            removeAuthenticationRequest(request, response);
            return;
        }

        String token = jwtService.generateToken("", claims);

        tokenStore.put(relayState, token);
        request.setAttribute(SAML_REQUEST_TOKEN, relayState);
        response.addHeader(SAML_REQUEST_TOKEN, relayState);

        log.debug("Saved SAMLRequest token with RelayState: {}", relayState);
    }

    public Map<String, Object> loadAuthenticationRequest(HttpServletRequest request) {
        String token = extractTokenFromStore(request);

        if (token == null) {
            log.debug("No SAMLResponse token found in RelayState");
            return null;
        }

        Map<String, Object> claims = jwtService.extractClaims(token);
        return deserializeSamlRequest(claims);
    }

    public Map<String, Object> removeAuthenticationRequest(
            HttpServletRequest request, HttpServletResponse response) {
        Map<String, Object> authRequest = loadAuthenticationRequest(request);

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

    private Map<String, Object> serializeSamlRequest(
            String id,
            String relyingPartyRegistrationId,
            String authenticationRequestUri,
            String samlRequest,
            String relayState) {
        Map<String, Object> claims = new HashMap<>();

        claims.put("id", id);
        claims.put("relyingPartyRegistrationId", relyingPartyRegistrationId);
        claims.put("authenticationRequestUri", authenticationRequestUri);
        claims.put("samlRequest", samlRequest);
        claims.put("relayState", relayState);

        return claims;
    }

    private Map<String, Object> deserializeSamlRequest(Map<String, Object> claims) {
        return claims;
    }
}
