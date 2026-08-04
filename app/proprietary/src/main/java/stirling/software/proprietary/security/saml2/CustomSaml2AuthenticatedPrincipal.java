package stirling.software.proprietary.security.saml2;

import java.io.Serializable;
import java.util.List;
import java.util.Map;

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

    public String getNameId() {
        return this.nameId;
    }

    public List<String> getSessionIndexes() {
        return this.sessionIndexes;
    }

    @SuppressWarnings("unchecked")
    public <A> List<A> getAttribute(String name) {
        List<Object> values = this.attributes.get(name);
        return values != null ? (List<A>) values : null;
    }

    @SuppressWarnings("unchecked")
    public <A> A getFirstAttribute(String name) {
        List<Object> values = this.attributes.get(name);
        return values != null && !values.isEmpty() ? (A) values.get(0) : null;
    }
}
