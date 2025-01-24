package stirling.software.SPDF.model.provider;

import static stirling.software.SPDF.utils.validation.Validator.isStringEmpty;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.stream.Collectors;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class Provider {

    private String issuer;
    private String name;
    private String clientName;
    private String clientId;
    private String clientSecret;
    private Collection<String> scopes;
    private String useAsUsername;
    private String authorizationUri;
    private String tokenUri;
    private String userInfoUri;

    public Provider(
            String issuer,
            String name,
            String clientName,
            String clientId,
            String clientSecret,
            Collection<String> scopes,
            String useAsUsername,
            String authorizationUri,
            String tokenUri,
            String userInfoUri) {
        this.issuer = issuer;
        this.name = name;
        this.clientName = clientName;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.scopes = scopes == null ? new ArrayList<>() : scopes;
        this.useAsUsername = isStringEmpty(useAsUsername) ? "email" : useAsUsername;
        this.authorizationUri = authorizationUri;
        this.tokenUri = tokenUri;
        this.userInfoUri = userInfoUri;
    }

    public void setScopes(String scopes) {
        if (scopes != null && !scopes.isBlank()) {
            this.scopes =
                    Arrays.stream(scopes.split(",")).map(String::trim).collect(Collectors.toList());
        }
    }

    @Override
    public String toString() {
        return "Provider [name="
                + getName()
                + ", clientName="
                + getClientName()
                + ", clientId="
                + getClientId()
                + ", clientSecret="
                + (getClientSecret() != null && !getClientSecret().isEmpty() ? "*****" : "NULL")
                + ", scopes="
                + getScopes()
                + ", useAsUsername="
                + getUseAsUsername()
                + "]";
    }
}
