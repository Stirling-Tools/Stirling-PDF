package stirling.software.proprietary.security.saml2;

import java.io.Serializable;
import java.util.List;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticatedPrincipal;

@ConditionalOnProperty(name = "security.saml2.enabled", havingValue = "true")
public record CustomSaml2AuthenticatedPrincipal(
        String name,
        Map<String, List<Object>> attributes,
        String nameId,
        List<String> sessionIndexes,
        String relyingPartyRegistrationId)
        implements Saml2AuthenticatedPrincipal, Serializable {

    /**
     * Constructor without relyingPartyRegistrationId for backwards compatibility. Sets
     * relyingPartyRegistrationId to null.
     */
    public CustomSaml2AuthenticatedPrincipal(
            String name,
            Map<String, List<Object>> attributes,
            String nameId,
            List<String> sessionIndexes) {
        this(name, attributes, nameId, sessionIndexes, null);
    }

    @Override
    public String getName() {
        return this.name;
    }

    @Override
    public Map<String, List<Object>> getAttributes() {
        return this.attributes;
    }

    @Override
    public List<String> getSessionIndexes() {
        return this.sessionIndexes;
    }

    @Override
    public String getRelyingPartyRegistrationId() {
        return this.relyingPartyRegistrationId;
    }
}
