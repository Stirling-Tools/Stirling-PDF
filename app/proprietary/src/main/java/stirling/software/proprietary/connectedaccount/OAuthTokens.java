package stirling.software.proprietary.connectedaccount;

public record OAuthTokens(
        String accessToken,
        String refreshToken,
        long expiresInSeconds,
        String scope,
        AccountIdentity identity) {

    public record AccountIdentity(
            String externalId, String tenantId, String email, String displayName) {}
}
