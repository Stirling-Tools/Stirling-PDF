package stirling.software.proprietary.security.saml2;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.opensaml.core.xml.XMLObject;
import org.opensaml.saml.saml2.core.Assertion;
import org.opensaml.saml.saml2.core.Attribute;
import org.opensaml.saml.saml2.core.AttributeStatement;
import org.opensaml.saml.saml2.core.AuthnStatement;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

@Slf4j
@ApplicationScoped
@RequiredArgsConstructor
public class CustomSaml2ResponseAuthenticationConverter {

    private final UserService userService;

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

    public CustomSaml2AuthenticatedPrincipal convert(Assertion assertion) {
        Map<String, List<Object>> attributes = extractAttributes(assertion);

        // Debug log with actual values
        log.debug("Extracted SAML Attributes: {}", attributes);

        // Try to get username/identifier in order of preference
        String userIdentifier;
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
        String authority = "ROLE_USER";
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            authority = userService.findRole(user).getAuthority();
        }
        log.debug("Resolved SAML authority: {}", authority);

        List<String> sessionIndexes = new ArrayList<>();
        for (AuthnStatement authnStatement : assertion.getAuthnStatements()) {
            sessionIndexes.add(authnStatement.getSessionIndex());
        }

        return new CustomSaml2AuthenticatedPrincipal(
                userIdentifier, attributes, userIdentifier, sessionIndexes);
    }

    private boolean hasAttribute(Map<String, List<Object>> attributes, String name) {
        return attributes.containsKey(name) && !attributes.get(name).isEmpty();
    }

    private String getFirstAttributeValue(Map<String, List<Object>> attributes, String name) {
        List<Object> values = attributes.get(name);
        return values != null && !values.isEmpty() ? values.get(0).toString() : null;
    }
}
