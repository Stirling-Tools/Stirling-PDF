package stirling.software.SPDF.model.provider;

import java.util.ArrayList;
import java.util.Collection;

import lombok.NoArgsConstructor;

// @Setter
@NoArgsConstructor
public class KeycloakProvider extends Provider {

    private static final String NAME = "keycloak";
    private static final String CLIENT_NAME = "Keycloak";

    private String issuer;
    private String clientId;
    private String clientSecret;
    private Collection<String> scopes;
    private String useAsUsername = "email";

    public KeycloakProvider(
            String issuer,
            String clientId,
            String clientSecret,
            Collection<String> scopes,
            String useAsUsername) {
        super(issuer, NAME, CLIENT_NAME, clientId, clientSecret, scopes, useAsUsername);
        this.useAsUsername = useAsUsername;
        this.issuer = issuer;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.scopes = scopes;
    }

    @Override
    public Collection<String> getScopes() {
        var scopes = super.getScopes();

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
                + issuer
                + ", clientId="
                + clientId
                + ", clientSecret="
                + (clientSecret != null && !clientSecret.isBlank() ? "MASKED" : "NULL")
                + ", scopes="
                + scopes
                + ", useAsUsername="
                + useAsUsername
                + "]";
    }
}
