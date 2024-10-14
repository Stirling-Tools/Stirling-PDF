package stirling.software.SPDF.config.security.saml;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import org.opensaml.saml.saml2.core.Assertion;
import org.springframework.security.core.AuthenticatedPrincipal;
import org.springframework.util.Assert;

import com.unboundid.scim2.common.types.Email;
import com.unboundid.scim2.common.types.Name;
import com.unboundid.scim2.common.types.UserResource;

public class ScimSaml2AuthenticatedPrincipal implements AuthenticatedPrincipal, Serializable {

    private static final long serialVersionUID = 1L;

    private final transient UserResource userResource;

    public ScimSaml2AuthenticatedPrincipal(
            final Assertion assertion,
            final Map<String, List<Object>> attributes,
            final SimpleScimMappings attributeMappings) {
        Assert.notNull(assertion, "assertion cannot be null");
        Assert.notNull(assertion.getSubject(), "assertion subject cannot be null");
        Assert.notNull(
                assertion.getSubject().getNameID(), "assertion subject NameID cannot be null");
        Assert.notNull(attributes, "attributes cannot be null");
        Assert.notNull(attributeMappings, "attributeMappings cannot be null");

        final Name name =
                new Name()
                        .setFamilyName(
                                getAttribute(
                                        attributes,
                                        attributeMappings,
                                        SimpleScimMappings::getFamilyName))
                        .setGivenName(
                                getAttribute(
                                        attributes,
                                        attributeMappings,
                                        SimpleScimMappings::getGivenName));

        final List<Email> emails = new ArrayList<>(1);
        emails.add(
                new Email()
                        .setValue(
                                getAttribute(
                                        attributes,
                                        attributeMappings,
                                        SimpleScimMappings::getEmail))
                        .setPrimary(true));

        userResource =
                new UserResource()
                        .setUserName(assertion.getSubject().getNameID().getValue())
                        .setName(name)
                        .setEmails(emails);
    }

    private static String getAttribute(
            final Map<String, List<Object>> attributes,
            final SimpleScimMappings simpleScimMappings,
            final Function<SimpleScimMappings, String> attributeMapper) {

        final String key = attributeMapper.apply(simpleScimMappings);

        final List<Object> values = attributes.getOrDefault(key, Collections.emptyList());

        return values.stream()
                .filter(String.class::isInstance)
                .map(String.class::cast)
                .findFirst()
                .orElse(null);
    }

    @Override
    public String getName() {
        return this.userResource.getUserName();
    }

    public UserResource getUserResource() {
        return this.userResource;
    }
}
