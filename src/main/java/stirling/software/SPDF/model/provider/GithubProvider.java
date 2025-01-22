package stirling.software.SPDF.model.provider;

import java.util.ArrayList;
import java.util.Collection;

import lombok.NoArgsConstructor;

// @Setter
@NoArgsConstructor
public class GithubProvider extends Provider {

    private static final String NAME = "github";
    private static final String CLIENT_NAME = "GitHub";
    private static final String AUTHORIZATION_URI = "https://github.com/login/oauth/authorize";
    private static final String TOKEN_URI = "https://github.com/login/oauth/access_token";
    private static final String USER_INFO_URI = "https://api.github.com/user";

    private String clientId;
    private String clientSecret;
    private Collection<String> scopes = new ArrayList<>();
    private String useAsUsername = "login";

    public GithubProvider(
            String clientId, String clientSecret, Collection<String> scopes, String useAsUsername) {
        super(null, NAME, CLIENT_NAME, clientId, clientSecret, scopes, useAsUsername);
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.scopes = scopes;
        this.useAsUsername = useAsUsername;
    }

    public String getAuthorizationUri() {
        return AUTHORIZATION_URI;
    }

    public String getTokenUri() {
        return TOKEN_URI;
    }

    public String getUserinfoUri() {
        return USER_INFO_URI;
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
}
