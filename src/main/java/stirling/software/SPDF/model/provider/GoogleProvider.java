package stirling.software.SPDF.model.provider;

import java.util.ArrayList;
import java.util.Collection;

import lombok.NoArgsConstructor;

// @Setter
@NoArgsConstructor
public class GoogleProvider extends Provider {

    private static final String NAME = "google";
    private static final String CLIENT_NAME = "Google";
    private static final String AUTHORIZATION_URI = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String TOKEN_URI = "https://www.googleapis.com/oauth2/v4/token";
    private static final String USER_INFO_URI =
            "https://www.googleapis.com/oauth2/v3/userinfo?alt=json";

    private String clientId;
    private String clientSecret;
    private Collection<String> scopes = new ArrayList<>();
    private String useAsUsername = "email";

    public GoogleProvider(
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
            scopes.add("https://www.googleapis.com/auth/userinfo.email");
            scopes.add("https://www.googleapis.com/auth/userinfo.profile");
        }
        return scopes;
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
}
