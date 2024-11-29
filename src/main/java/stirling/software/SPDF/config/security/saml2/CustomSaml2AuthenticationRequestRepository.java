package stirling.software.SPDF.config.security.saml2;

import java.util.Enumeration;

import org.springframework.security.saml2.provider.service.authentication.AbstractSaml2AuthenticationRequest;
import org.springframework.security.saml2.provider.service.web.Saml2AuthenticationRequestRepository;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

@Component
public class CustomSaml2AuthenticationRequestRepository
        implements Saml2AuthenticationRequestRepository<AbstractSaml2AuthenticationRequest> {

    private static final String AUTHENTICATION_REQUEST_KEY_PREFIX = "SAML2_AUTHENTICATION_REQUEST_";

    @Override
    public void saveAuthenticationRequest(
            AbstractSaml2AuthenticationRequest authenticationRequest,
            HttpServletRequest request,
            HttpServletResponse response) {
        HttpSession session = request.getSession(true);
        String requestId = authenticationRequest.getId();
        session.setAttribute(AUTHENTICATION_REQUEST_KEY_PREFIX + requestId, authenticationRequest);
    }

    @Override
    public AbstractSaml2AuthenticationRequest loadAuthenticationRequest(
            HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            Enumeration<String> attributeNames = session.getAttributeNames();
            while (attributeNames.hasMoreElements()) {
                String attributeName = attributeNames.nextElement();
                if (attributeName.startsWith(AUTHENTICATION_REQUEST_KEY_PREFIX)) {
                    return (AbstractSaml2AuthenticationRequest) session.getAttribute(attributeName);
                }
            }
        }
        return null;
    }

    @Override
    public AbstractSaml2AuthenticationRequest removeAuthenticationRequest(
            HttpServletRequest request, HttpServletResponse response) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            Enumeration<String> attributeNames = session.getAttributeNames();
            while (attributeNames.hasMoreElements()) {
                String attributeName = attributeNames.nextElement();
                if (attributeName.startsWith(AUTHENTICATION_REQUEST_KEY_PREFIX)) {
                    AbstractSaml2AuthenticationRequest auth =
                            (AbstractSaml2AuthenticationRequest)
                                    session.getAttribute(attributeName);
                    session.removeAttribute(attributeName);
                    return auth;
                }
            }
        }
        return null;
    }
}
