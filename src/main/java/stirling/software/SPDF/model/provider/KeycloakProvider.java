package stirling.software.SPDF.model.provider;

import java.util.ArrayList;
import java.util.Collection;

import lombok.NoArgsConstructor;

import stirling.software.SPDF.model.UsernameAttribute;

@NoArgsConstructor
public class KeycloakProvider extends Provider {

    private static final String NAME = "keycloak";
    private static final String CLIENT_NAME = "Keycloak";

    public KeycloakProvider(
            String issuer,
            String clientId,
            String clientSecret,
            Collection<String> scopes,
            UsernameAttribute useAsUsername) {
        super(
                issuer,
                NAME,
                CLIENT_NAME,
                clientId,
                clientSecret,
                scopes,
                useAsUsername,
                null,
                null,
                null);
    }

    @Override
    public String getName() {
        return NAME;
    }

    @Override
    public String getClientName() {
        return CLIENT_NAME;
    }

    @Override
    public Collection<String> getScopes() {
        Collection<String> scopes = super.getScopes();

        if (scopes == null || scopes.isEmpty()) {
            scopes = new ArrayList<>();
            scopes.add("profile");
            scopes.add("email");
        }

        return scopes;
    }

    @Override
    public String toString() {
        return "Keycloak [issuer="
                + getIssuer()
                + ", clientId="
                + getClientId()
                + ", clientSecret="
                + (getClientSecret() != null && !getClientSecret().isBlank() ? "*****" : "NULL")
                + ", scopes="
                + getScopes()
                + ", useAsUsername="
                + getUseAsUsername()
                + "]";
    }
}
