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

    @Override
    public String getNameId() {
        return this.nameId;
    }

    @Override
    public List<String> getSessionIndexes() {
        return this.sessionIndexes;
    }

    @Override
    public String getResponseValue() {
        return this.responseValue;
    }

    @Override
    @SuppressWarnings("unchecked")
    public <A> List<A> getAttribute(String name) {
        List<Object> values = this.attributes.get(name);
        return values != null ? (List<A>) values : null;
    }

    @Override
    @SuppressWarnings("unchecked")
    public <A> A getFirstAttribute(String name) {
        List<Object> values = this.attributes.get(name);
        return values != null && !values.isEmpty() ? (A) values.get(0) : null;
    }
}
