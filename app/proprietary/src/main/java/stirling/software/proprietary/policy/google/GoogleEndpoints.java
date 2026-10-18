package stirling.software.proprietary.policy.google;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Where Google sign-in and the Drive API live. Overridable server-wide only ({@code
 * stirling.google.*}), never per connection, so a portal user cannot aim the server's credentials
 * at another host.
 */
@Component
public class GoogleEndpoints {

    private final String authorizeUrl;
    private final String tokenUrl;
    private final String revokeUrl;
    private final String driveUrl;
    private final String uploadUrl;

    public GoogleEndpoints(
            @Value("${stirling.google.authorize-url:https://accounts.google.com/o/oauth2/v2/auth}")
                    String authorizeUrl,
            @Value("${stirling.google.token-url:https://oauth2.googleapis.com/token}")
                    String tokenUrl,
            @Value("${stirling.google.revoke-url:https://oauth2.googleapis.com/revoke}")
                    String revokeUrl,
            @Value("${stirling.google.drive-url:https://www.googleapis.com/drive/v3}")
                    String driveUrl,
            @Value("${stirling.google.upload-url:https://www.googleapis.com/upload/drive/v3}")
                    String uploadUrl) {
        this.authorizeUrl = authorizeUrl;
        this.tokenUrl = tokenUrl;
        this.revokeUrl = revokeUrl;
        this.driveUrl = stripTrailingSlash(driveUrl);
        this.uploadUrl = stripTrailingSlash(uploadUrl);
    }

    public String authorizeUrl() {
        return authorizeUrl;
    }

    public String tokenUrl() {
        return tokenUrl;
    }

    public String revokeUrl() {
        return revokeUrl;
    }

    public String driveUrl() {
        return driveUrl;
    }

    public String uploadUrl() {
        return uploadUrl;
    }

    private static String stripTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
