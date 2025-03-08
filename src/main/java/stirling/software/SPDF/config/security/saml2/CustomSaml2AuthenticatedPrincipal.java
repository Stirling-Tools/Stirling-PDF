package stirling.software.SPDF.config.security.saml2;

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
        List<String> sessionIndexes)
        implements Saml2AuthenticatedPrincipal, Serializable {

    @Override
    public String getName() {
        return this.name;
    }

    @Override
    public Map<String, List<Object>> getAttributes() {
        return this.attributes;
    }
}
