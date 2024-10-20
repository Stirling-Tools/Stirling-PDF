package stirling.software.SPDF.config.security.saml2;

import java.util.*;

import org.opensaml.core.xml.XMLObject;
import org.opensaml.core.xml.schema.XSBoolean;
import org.opensaml.core.xml.schema.XSString;
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

    @Override
    public Saml2Authentication convert(ResponseToken responseToken) {
        // Extract the assertion from the response
        Assertion assertion = responseToken.getResponse().getAssertions().get(0);

        // Extract the NameID
        String nameId = assertion.getSubject().getNameID().getValue();

        Optional<User> userOpt = userService.findByUsernameIgnoreCase(nameId);
        SimpleGrantedAuthority simpleGrantedAuthority = new SimpleGrantedAuthority("ROLE_USER");
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            if (user != null) {
                simpleGrantedAuthority =
                        new SimpleGrantedAuthority(userService.findRole(user).getAuthority());
            }
        }

        // Extract the SessionIndexes
        List<String> sessionIndexes = new ArrayList<>();
        for (AuthnStatement authnStatement : assertion.getAuthnStatements()) {
            sessionIndexes.add(authnStatement.getSessionIndex());
        }

        // Extract the Attributes
        Map<String, List<Object>> attributes = extractAttributes(assertion);

        // Create the custom principal
        CustomSaml2AuthenticatedPrincipal principal =
                new CustomSaml2AuthenticatedPrincipal(nameId, attributes, nameId, sessionIndexes);

        // Create the Saml2Authentication
        return new Saml2Authentication(
                principal,
                responseToken.getToken().getSaml2Response(),
                Collections.singletonList(simpleGrantedAuthority));
    }

    private Map<String, List<Object>> extractAttributes(Assertion assertion) {
        Map<String, List<Object>> attributes = new HashMap<>();
        for (AttributeStatement attributeStatement : assertion.getAttributeStatements()) {
            for (Attribute attribute : attributeStatement.getAttributes()) {
                String attributeName = attribute.getName();
                List<Object> values = new ArrayList<>();
                for (XMLObject xmlObject : attribute.getAttributeValues()) {
                    log.info("BOOL: " + ((XSBoolean) xmlObject).getValue());
                    values.add(((XSString) xmlObject).getValue());
                }
                attributes.put(attributeName, values);
            }
        }
        return attributes;
    }
}
