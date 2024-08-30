package stirling.software.SPDF.model.provider;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.stream.Collectors;

import stirling.software.SPDF.model.Provider;

public class GoogleProvider extends Provider {

    private static final String authorizationUri = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String tokenUri = "https://www.googleapis.com/oauth2/v4/token";
    private static final String userInfoUri =
            "https://www.googleapis.com/oauth2/v3/userinfo?alt=json";

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
    private String useAsUsername = "email";

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
            scopes.add("https://www.googleapis.com/auth/userinfo.email");
            scopes.add("https://www.googleapis.com/auth/userinfo.profile");
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
        return "Google [clientId="
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
        return "google";
    }

    @Override
    public String getClientName() {
        return "Google";
    }

    public boolean isSettingsValid() {
        return super.isValid(this.getClientId(), "clientId")
                && super.isValid(this.getClientSecret(), "clientSecret")
                && super.isValid(this.getScopes(), "scopes")
                && isValid(this.getUseAsUsername(), "useAsUsername");
    }
}
