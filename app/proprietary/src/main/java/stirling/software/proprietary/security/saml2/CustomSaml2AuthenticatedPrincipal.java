package stirling.software.proprietary.security.saml2;

import java.io.Serializable;
import java.util.List;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticatedPrincipal;
import org.springframework.security.saml2.provider.service.authentication.Saml2ResponseAssertionAccessor;

@ConditionalOnProperty(name = "security.saml2.enabled", havingValue = "true")
public record CustomSaml2AuthenticatedPrincipal(
        String name,
        Map<String, List<Object>> attributes,
        String nameId,
        List<String> sessionIndexes,
        String responseValue)
        implements Saml2ResponseAssertionAccessor, Saml2AuthenticatedPrincipal, Serializable {

    @Override
    public String getName() {
        return this.name;
    }

    @Override
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
