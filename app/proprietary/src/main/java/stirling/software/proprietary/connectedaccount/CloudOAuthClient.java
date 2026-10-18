package stirling.software.proprietary.connectedaccount;

import java.io.IOException;
import java.util.List;

/**
 * One provider's authorization-code-with-PKCE flow for connected accounts. Implementations read the
 * server's single app registration for that provider, so an admin configures each provider once for
 * the editor, connected accounts and organisation connections alike.
 */
public interface CloudOAuthClient {

    CloudProvider provider();

    /** Whether the server's app registration is complete and account connections are allowed. */
    boolean available();

    String authorizationUrl(String state, String codeChallenge, String redirectUri);

    /** Redeems a callback's code; the result carries the account identity and a refresh token. */
    OAuthTokens exchangeCode(String code, String codeVerifier, String redirectUri)
            throws IOException;

    /**
     * A fresh access token for {@code scopes}, or for the provider's default scopes when empty.
     *
     * @throws OAuthException with {@code revoked} set when the user must sign in again
     */
    OAuthTokens refresh(String refreshToken, List<String> scopes) throws IOException;

    /** Best effort: tells the provider to forget the grant. Never throws. */
    void revoke(String refreshToken);
}
