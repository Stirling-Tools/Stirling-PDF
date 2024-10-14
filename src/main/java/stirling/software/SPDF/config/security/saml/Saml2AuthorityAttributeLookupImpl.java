package stirling.software.SPDF.config.security.saml;

import org.springframework.stereotype.Component;

@Component
public class Saml2AuthorityAttributeLookupImpl implements Saml2AuthorityAttributeLookup {

    @Override
    public String getAuthorityAttribute(String registrationId) {
        return "authorityAttributeName";
    }

    @Override
    public SimpleScimMappings getIdentityMappings(String registrationId) {
        return new SimpleScimMappings();
    }
}
