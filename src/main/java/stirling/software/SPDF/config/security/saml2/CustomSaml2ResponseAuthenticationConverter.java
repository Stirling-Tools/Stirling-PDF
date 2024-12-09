package stirling.software.SPDF.config.security.saml2;

import java.util.*;

import org.opensaml.core.xml.XMLObject;
import org.opensaml.saml.saml2.core.Assertion;
import org.opensaml.saml.saml2.core.Attribute;
import org.opensaml.saml.saml2.core.AttributeStatement;
import org.opensaml.saml.saml2.core.AuthnStatement;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.saml2.provider.service.authentication.OpenSaml4AuthenticationProvider.ResponseToken;
import org.springframework.security.saml2.provider.service.authentication.Saml2Authentication;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.config.security.UserService;
import stirling.software.SPDF.model.User;

@Component
@Slf4j
public class CustomSaml2ResponseAuthenticationConverter
        implements Converter<ResponseToken, Saml2Authentication> {

    private UserService userService;

    public CustomSaml2ResponseAuthenticationConverter(UserService userService) {
        this.userService = userService;
    }

    private Map<String, List<Object>> extractAttributes(Assertion assertion) {
        Map<String, List<Object>> attributes = new HashMap<>();

        for (AttributeStatement attributeStatement : assertion.getAttributeStatements()) {
            for (Attribute attribute : attributeStatement.getAttributes()) {
                String attributeName = attribute.getName();
                List<Object> values = new ArrayList<>();

                for (XMLObject xmlObject : attribute.getAttributeValues()) {
                    // Get the text content directly
                    String value = xmlObject.getDOM().getTextContent();
                    if (value != null && !value.trim().isEmpty()) {
                        values.add(value);
                    }
                }

                if (!values.isEmpty()) {
                    // Store with both full URI and last part of the URI
                    attributes.put(attributeName, values);
                    String shortName = attributeName.substring(attributeName.lastIndexOf('/') + 1);
                    attributes.put(shortName, values);
                }
            }
        }

        return attributes;
    }

    @Override
    public Saml2Authentication convert(ResponseToken responseToken) {
        Assertion assertion = responseToken.getResponse().getAssertions().get(0);
        Map<String, List<Object>> attributes = extractAttributes(assertion);

        // Debug log with actual values
        log.debug("Extracted SAML Attributes: " + attributes);

        // Try to get username/identifier in order of preference
        String userIdentifier = null;
        if (hasAttribute(attributes, "username")) {
            userIdentifier = getFirstAttributeValue(attributes, "username");
        } else if (hasAttribute(attributes, "emailaddress")) {
            userIdentifier = getFirstAttributeValue(attributes, "emailaddress");
        } else if (hasAttribute(attributes, "name")) {
            userIdentifier = getFirstAttributeValue(attributes, "name");
        } else if (hasAttribute(attributes, "upn")) {
            userIdentifier = getFirstAttributeValue(attributes, "upn");
        } else if (hasAttribute(attributes, "uid")) {
            userIdentifier = getFirstAttributeValue(attributes, "uid");
        } else {
            userIdentifier = assertion.getSubject().getNameID().getValue();
        }

        // Rest of your existing code...
        Optional<User> userOpt = userService.findByUsernameIgnoreCase(userIdentifier);
        SimpleGrantedAuthority simpleGrantedAuthority = new SimpleGrantedAuthority("ROLE_USER");
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            if (user != null) {
                simpleGrantedAuthority =
                        new SimpleGrantedAuthority(userService.findRole(user).getAuthority());
            }
        }

        List<String> sessionIndexes = new ArrayList<>();
        for (AuthnStatement authnStatement : assertion.getAuthnStatements()) {
            sessionIndexes.add(authnStatement.getSessionIndex());
        }

        CustomSaml2AuthenticatedPrincipal principal =
                new CustomSaml2AuthenticatedPrincipal(
                        userIdentifier, attributes, userIdentifier, sessionIndexes);

        return new Saml2Authentication(
                principal,
                responseToken.getToken().getSaml2Response(),
                Collections.singletonList(simpleGrantedAuthority));
    }

    private boolean hasAttribute(Map<String, List<Object>> attributes, String name) {
        return attributes.containsKey(name) && !attributes.get(name).isEmpty();
    }

    private String getFirstAttributeValue(Map<String, List<Object>> attributes, String name) {
        List<Object> values = attributes.get(name);
        return values != null && !values.isEmpty() ? values.get(0).toString() : null;
    }
}
