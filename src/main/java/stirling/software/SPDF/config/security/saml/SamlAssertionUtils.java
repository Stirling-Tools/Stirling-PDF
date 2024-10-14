package stirling.software.SPDF.config.security.saml;

import java.time.Instant;
import java.util.*;

import org.opensaml.core.xml.XMLObject;
import org.opensaml.core.xml.schema.*;
import org.opensaml.saml.saml2.core.Assertion;

public class SamlAssertionUtils {

    public static Map<String, List<Object>> getAssertionAttributes(Assertion assertion) {
        Map<String, List<Object>> attributeMap = new LinkedHashMap<>();

        assertion
                .getAttributeStatements()
                .forEach(
                        attributeStatement -> {
                            attributeStatement
                                    .getAttributes()
                                    .forEach(
                                            attribute -> {
                                                List<Object> attributeValues = new ArrayList<>();

                                                attribute
                                                        .getAttributeValues()
                                                        .forEach(
                                                                xmlObject -> {
                                                                    Object attributeValue =
                                                                            getXmlObjectValue(
                                                                                    xmlObject);
                                                                    if (attributeValue != null) {
                                                                        attributeValues.add(
                                                                                attributeValue);
                                                                    }
                                                                });

                                                attributeMap.put(
                                                        attribute.getName(), attributeValues);
                                            });
                        });

        return attributeMap;
    }

    public static Object getXmlObjectValue(XMLObject xmlObject) {
        if (xmlObject instanceof XSAny) {
            return ((XSAny) xmlObject).getTextContent();
        } else if (xmlObject instanceof XSString) {
            return ((XSString) xmlObject).getValue();
        } else if (xmlObject instanceof XSInteger) {
            return ((XSInteger) xmlObject).getValue();
        } else if (xmlObject instanceof XSURI) {
            return ((XSURI) xmlObject).getURI();
        } else if (xmlObject instanceof XSBoolean) {
            return ((XSBoolean) xmlObject).getValue().getValue();
        } else if (xmlObject instanceof XSDateTime) {
            Instant dateTime = ((XSDateTime) xmlObject).getValue();
            return (dateTime != null) ? Instant.ofEpochMilli(dateTime.toEpochMilli()) : null;
        }
        return null;
    }
}
