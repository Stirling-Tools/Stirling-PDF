package stirling.software.proprietary.connectedaccount;

/**
 * A provider's token response. {@code refreshToken} is null when the provider did not rotate it,
 * and {@code identity} is null on a refresh.
 */
public record OAuthTokens(
        String accessToken,
        String refreshToken,
        long expiresInSeconds,
        String scope,
        AccountIdentity identity) {

    public record AccountIdentity(
            String externalId, String tenantId, String email, String displayName) {}
}
