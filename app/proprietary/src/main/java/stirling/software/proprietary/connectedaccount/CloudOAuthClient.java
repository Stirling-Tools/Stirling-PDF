package stirling.software.proprietary.connectedaccount;

import java.io.IOException;
import java.util.List;

public interface CloudOAuthClient {

    CloudProvider provider();

    boolean available();

    String authorizationUrl(String state, String codeChallenge, String redirectUri);

    OAuthTokens exchangeCode(String code, String codeVerifier, String redirectUri)
            throws IOException;

    OAuthTokens refresh(String refreshToken, List<String> scopes) throws IOException;

    void revoke(String refreshToken);
}
