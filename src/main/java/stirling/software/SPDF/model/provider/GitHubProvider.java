package stirling.software.SPDF.model.provider;

import java.util.ArrayList;
import java.util.Collection;

import lombok.NoArgsConstructor;

import stirling.software.SPDF.model.UsernameAttribute;

@NoArgsConstructor
public class GitHubProvider extends Provider {

    private static final String NAME = "github";
    private static final String CLIENT_NAME = "GitHub";
    private static final String AUTHORIZATION_URI = "https://github.com/login/oauth/authorize";
    private static final String TOKEN_URI = "https://github.com/login/oauth/access_token";
    private static final String USER_INFO_URI = "https://api.github.com/user";

    public GitHubProvider(
            String clientId,
            String clientSecret,
            Collection<String> scopes,
            UsernameAttribute useAsUsername) {
        super(
                null,
                NAME,
                CLIENT_NAME,
                clientId,
                clientSecret,
                scopes,
                useAsUsername != null ? useAsUsername : UsernameAttribute.LOGIN,
                AUTHORIZATION_URI,
                TOKEN_URI,
                USER_INFO_URI);
    }

    @Override
    public String getAuthorizationUri() {
        return AUTHORIZATION_URI;
    }

    @Override
    public String getTokenUri() {
        return TOKEN_URI;
    }

    @Override
    public String getUserInfoUri() {
        return USER_INFO_URI;
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
            scopes.add("read:user");
        }

        return scopes;
    }

    @Override
    public String toString() {
        return "GitHub [clientId="
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
