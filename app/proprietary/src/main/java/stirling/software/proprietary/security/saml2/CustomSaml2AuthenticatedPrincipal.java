package stirling.software.proprietary.security.saml2;

import java.io.Serializable;
import java.util.List;
import java.util.Map;

// TODO: Migration required - this record implemented Spring Security's
// org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticatedPrincipal.
// There is NO Quarkus SAML extension; the SAML SP must be rehosted on a Jakarta @WebServlet
// using OpenSAML 5 (dnulnets/quarkus-saml pattern). The OpenSAML-derived principal data
// (name, attributes, nameId, sessionIndexes) is preserved below as a plain data carrier;
// re-wire it into the replacement SAML authentication flow / SecurityIdentity when that lands.
//
// TODO: Migration required - the original @ConditionalOnProperty(name = "security.saml2.enabled",
// havingValue = "true") guard was dropped because this is a plain data record, not a CDI bean.
// Gate construction of this principal on the "security.saml2.enabled" runtime config in the
// SAML authentication flow instead.
public record CustomSaml2AuthenticatedPrincipal(
        String name,
        Map<String, List<Object>> attributes,
        String nameId,
        List<String> sessionIndexes)
        implements Serializable {

    public String getName() {
        return this.name;
    }

    public Map<String, List<Object>> getAttributes() {
        return this.attributes;
    }
}
