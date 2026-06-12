package stirling.software.proprietary.security.saml2;

import java.util.HashMap;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.service.JwtServiceInterface;

// TODO: Migration required - this class implemented Spring Security's
// org.springframework.security.saml2.provider.service.web.Saml2AuthenticationRequestRepository
// over Saml2PostAuthenticationRequest / RelyingPartyRegistration(Repository). There is NO Quarkus
// SAML extension, so the Spring Security SAML glue (interface, Saml2PostAuthenticationRequest,
// RelyingPartyRegistration[Repository]) has been removed. The SAML SP must be rehosted on a
// Jakarta @WebServlet using OpenSAML 5 (see the dnulnets/quarkus-saml pattern); this repository
// should then store/restore the OpenSAML AuthnRequest state instead of the Spring types below.
//
// The reusable, provider-agnostic logic is preserved here: the JWT-backed token store keyed by
// RelayState, plus the serialize/deserialize of the SAML request fields into JWT claims. The
// methods that referenced the removed Spring types now operate on a plain Map<String, Object>
// claims representation and a String relayState. Re-wire these to the OpenSAML request model once
// the SP is rehosted.
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

    // TODO: Migration required - original signature was
    // saveAuthenticationRequest(Saml2PostAuthenticationRequest authRequest, HttpServletRequest,
    // HttpServletResponse). Pass the OpenSAML-derived claims + relayState once the SP is rehosted.
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

    // TODO: Migration required - original returned Saml2PostAuthenticationRequest. Map the returned
    // claims back to the OpenSAML AuthnRequest model once the SP is rehosted.
    public Map<String, Object> loadAuthenticationRequest(HttpServletRequest request) {
        String token = extractTokenFromStore(request);

        if (token == null) {
            log.debug("No SAMLResponse token found in RelayState");
            return null;
        }

        Map<String, Object> claims = jwtService.extractClaims(token);
        return deserializeSamlRequest(claims);
    }

    // TODO: Migration required - original returned Saml2PostAuthenticationRequest.
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

    // TODO: Migration required - original signature was
    // serializeSamlRequest(Saml2PostAuthenticationRequest authRequest). Build this claims map from
    // the OpenSAML AuthnRequest fields (id, relyingPartyRegistrationId / SP entity id,
    // authenticationRequestUri / destination, samlRequest, relayState) once the SP is rehosted.
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

    // TODO: Migration required - original returned Saml2PostAuthenticationRequest rebuilt via
    // Saml2PostAuthenticationRequest.withRelyingPartyRegistration(...). Resolve the
    // RelyingPartyRegistration equivalent (SP metadata) and rebuild the OpenSAML AuthnRequest from
    // these claims once the SP is rehosted. For now the raw claims map is returned unchanged.
    private Map<String, Object> deserializeSamlRequest(Map<String, Object> claims) {
        return claims;
    }
}
