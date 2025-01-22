package stirling.software.SPDF.model.provider;

import java.util.Arrays;
import java.util.Collection;
import java.util.stream.Collectors;

import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public abstract class Provider {

    private String issuer;
    private String name;
    private String clientName;
    private String clientId;
    private String clientSecret;
    private Collection<String> scopes;
    private String useAsUsername;

    public Provider(
            String issuer,
            String name,
            String clientName,
            String clientId,
            String clientSecret,
            Collection<String> scopes,
            String useAsUsername) {
        this.issuer = issuer;
        this.name = name;
        this.clientName = clientName;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.scopes = scopes;
        this.useAsUsername = !useAsUsername.isBlank() ? useAsUsername : "email";
    }

    //    todo: why are we passing name here if it's not used?
    public boolean isSettingsValid() {
        return isValid(this.getIssuer(), "issuer")
                && isValid(this.getClientId(), "clientId")
                && isValid(this.getClientSecret(), "clientSecret")
                && isValid(this.getScopes(), "scopes")
                && isValid(this.getUseAsUsername(), "useAsUsername");
    }

    private boolean isValid(String value, String name) {
        return value != null && !value.isBlank();
    }

    private boolean isValid(Collection<String> value, String name) {
        return value != null && !value.isEmpty();
    }

    public void setIssuer(String issuer) {
        this.issuer = issuer;
    }

    public void setName(String name) {
        this.name = name;
    }

    public void setClientName(String clientName) {
        this.clientName = clientName;
    }

    public void setClientId(String clientId) {
        this.clientId = clientId;
    }

    public void setClientSecret(String clientSecret) {
        this.clientSecret = clientSecret;
    }

    public void setScopes(String scopes) {
        this.scopes =
                Arrays.stream(scopes.split(",")).map(String::trim).collect(Collectors.toList());
    }

    public void setUseAsUsername(String useAsUsername) {
        this.useAsUsername = useAsUsername;
    }
}
