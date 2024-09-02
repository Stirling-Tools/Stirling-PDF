package stirling.software.SPDF.model.provider;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.stream.Collectors;

import stirling.software.SPDF.model.Provider;

public class GithubProvider extends Provider {

    private static final String authorizationUri = "https://github.com/login/oauth/authorize";
    private static final String tokenUri = "https://github.com/login/oauth/access_token";
    private static final String userInfoUri = "https://api.github.com/user";

    public String getAuthorizationuri() {
        return authorizationUri;
    }

    public String getTokenuri() {
        return tokenUri;
    }

    public String getUserinfouri() {
        return userInfoUri;
    }

    private String clientId;
    private String clientSecret;
    private Collection<String> scopes = new ArrayList<>();
    private String useAsUsername = "login";

    @Override
    public String getIssuer() {
        return new String();
    }

    @Override
    public void setIssuer(String issuer) {}

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
            scopes.add("read:user");
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
        return "GitHub [clientId="
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
        return "github";
    }

    @Override
    public String getClientName() {
        return "GitHub";
    }

    public boolean isSettingsValid() {
        return super.isValid(this.getClientId(), "clientId")
                && super.isValid(this.getClientSecret(), "clientSecret")
                && super.isValid(this.getScopes(), "scopes")
                && isValid(this.getUseAsUsername(), "useAsUsername");
    }
}
