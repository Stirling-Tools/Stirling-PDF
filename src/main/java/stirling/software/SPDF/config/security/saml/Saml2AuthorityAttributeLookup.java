package stirling.software.SPDF.config.security.saml;

public interface Saml2AuthorityAttributeLookup {
    String getAuthorityAttribute(String registrationId);

    SimpleScimMappings getIdentityMappings(String registrationId);
}
