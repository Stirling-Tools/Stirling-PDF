package stirling.software.SPDF.model.provider;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.stream.Collectors;

import stirling.software.SPDF.model.Provider;

public class KeycloakProvider extends Provider {

    private String issuer;
    private String clientId;
    private String clientSecret;
    private Collection<String> scopes = new ArrayList<>();
    private String useAsUsername = "email";

    @Override
    public String getIssuer() {
        return this.issuer;
    }

    @Override
    public void setIssuer(String issuer) {
        this.issuer = issuer;
    }

    @Override
    public String getClientId() {
        return this.clientId;
    }

    @Override
    public void setClientId(String clientId) {
        this.clientId = clientId;
    }

    @Override
    public String getClientSecret() {
        return this.clientSecret;
    }

    @Override
    public void setClientSecret(String clientSecret) {
        this.clientSecret = clientSecret;
    }

    @Override
    public Collection<String> getScopes() {
        if (scopes == null || scopes.isEmpty()) {
            scopes = new ArrayList<>();
            scopes.add("profile");
            scopes.add("email");
        }
        return scopes;
    }

    @Override
    public void setScopes(String scopes) {
        this.scopes =
                Arrays.stream(scopes.split(",")).map(String::trim).collect(Collectors.toList());
    }

    @Override
    public String getUseAsUsername() {
        return this.useAsUsername;
    }

    @Override
    public void setUseAsUsername(String useAsUsername) {
        this.useAsUsername = useAsUsername;
    }

    @Override
    public String toString() {
        return "Keycloak [issuer="
                + issuer
                + ", clientId="
                + clientId
                + ", clientSecret="
                + (clientSecret != null && !clientSecret.isEmpty() ? "MASKED" : "NULL")
                + ", scopes="
                + scopes
                + ", useAsUsername="
                + useAsUsername
                + "]";
    }

    @Override
    public String getName() {
        return "keycloak";
    }

    @Override
    public String getClientName() {
        return "Keycloak";
    }

    public boolean isSettingsValid() {
        return isValid(this.getIssuer(), "issuer")
                && isValid(this.getClientId(), "clientId")
                && isValid(this.getClientSecret(), "clientSecret")
                && isValid(this.getScopes(), "scopes")
                && isValid(this.getUseAsUsername(), "useAsUsername");
    }
}
