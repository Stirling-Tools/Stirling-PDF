package stirling.software.proprietary.security.identity;

import io.quarkus.security.identity.request.BaseAuthenticationRequest;

/**
 * Carries a Stirling per-user API key (the {@code X-API-KEY} header) through the Quarkus auth SPI.
 */
public class ApiKeyAuthenticationRequest extends BaseAuthenticationRequest {

    private final String apiKey;

    public ApiKeyAuthenticationRequest(String apiKey) {
        this.apiKey = apiKey;
    }

    public String getApiKey() {
        return apiKey;
    }
}
