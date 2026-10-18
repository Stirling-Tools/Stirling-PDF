package stirling.software.proprietary.policy.microsoft;

import java.net.URI;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Where Microsoft Graph and Entra sign-in live. Defaults to the worldwide cloud; a national cloud
 * (US Government, China) is selected server-wide with {@code stirling.microsoft.graph-url} and
 * {@code stirling.microsoft.login-url}, never per connection, so a portal user cannot aim the
 * server's credentials at another host.
 */
@Component
public class GraphEndpoints {

    public static final String DEFAULT_GRAPH_URL = "https://graph.microsoft.com/v1.0";
    public static final String DEFAULT_LOGIN_URL = "https://login.microsoftonline.com";

    private final String graphUrl;
    private final String loginUrl;

    public GraphEndpoints(
            @Value("${stirling.microsoft.graph-url:" + DEFAULT_GRAPH_URL + "}") String graphUrl,
            @Value("${stirling.microsoft.login-url:" + DEFAULT_LOGIN_URL + "}") String loginUrl) {
        this.graphUrl = stripTrailingSlash(graphUrl);
        this.loginUrl = stripTrailingSlash(loginUrl);
    }

    public String graphUrl() {
        return graphUrl;
    }

    public String tokenUrl(String tenantId) {
        return loginUrl + "/" + tenantId + "/oauth2/v2.0/token";
    }

    public String authorizeUrl(String tenant) {
        return loginUrl + "/" + tenant + "/oauth2/v2.0/authorize";
    }

    /** The app-only scope for Graph: its origin plus {@code /.default}. */
    public String graphScope() {
        URI uri = URI.create(graphUrl);
        return uri.getScheme() + "://" + uri.getAuthority() + "/.default";
    }

    private static String stripTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
