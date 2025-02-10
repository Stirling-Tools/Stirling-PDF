package stirling.software.SPDF.config.security.saml2;

import java.io.Serializable;
import java.util.List;
import java.util.Map;

import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticatedPrincipal;

public class CustomSaml2AuthenticatedPrincipal
        implements Saml2AuthenticatedPrincipal, Serializable {

    private final String name;
    private final Map<String, List<Object>> attributes;
    private final String nameId;
    private final List<String> sessionIndexes;

    public CustomSaml2AuthenticatedPrincipal(
            String name,
            Map<String, List<Object>> attributes,
            String nameId,
            List<String> sessionIndexes) {
        this.name = name;
        this.attributes = attributes;
        this.nameId = nameId;
        this.sessionIndexes = sessionIndexes;
    }

    @Override
    public String getName() {
        return this.name;
    }

    @Override
    public Map<String, List<Object>> getAttributes() {
        return this.attributes;
    }

    public String getNameId() {
        return this.nameId;
    }

    public List<String> getSessionIndexes() {
        return this.sessionIndexes;
    }
}
