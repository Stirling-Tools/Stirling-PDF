package stirling.software.proprietary.service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import tools.jackson.databind.ObjectMapper;

/**
 * Service for interacting with the Polar.sh API for billing, subscriptions, and checkout.
 *
 * <p>Configured via environment variables:
 *
 * <ul>
 *   <li>{@code POLAR_API_KEY} — Organization Access Token (OAT)
 *   <li>{@code POLAR_API_URL} — API base URL (defaults to {@code https://api.polar.sh/v1})
 *   <li>{@code POLAR_PRODUCT_ID_PRO} — Product ID for the Pro plan
 *   <li>{@code POLAR_PRODUCT_ID_CREDITS_*} — Product IDs for credit packs
 * </ul>
 */
@Slf4j
@Service
public class PolarService {

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final String apiKey;
    private final String apiUrl;

    public PolarService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

        this.apiKey = resolveEnv("POLAR_API_KEY", "");
        this.apiUrl = resolveEnv("POLAR_API_URL", "https://api.polar.sh/v1");

        if (apiKey.isBlank()) {
            log.warn("POLAR_API_KEY not set — Polar billing features will be unavailable");
        } else {
            log.info("Polar billing configured (API: {})", apiUrl);
        }
    }

    /** Create a checkout session for a subscription or credit purchase. */
    @SuppressWarnings("unchecked")
    public Map<String, Object> createCheckout(
            String productId,
            String customerEmail,
            String successUrl,
            String returnUrl,
            boolean allowTrial)
            throws IOException, InterruptedException {
        requireApiKey();

        Map<String, Object> body =
                filterNulls(
                        Map.of(
                                "products", new String[] {productId},
                                "customer_email", customerEmail,
                                "success_url", successUrl,
                                "allow_trial", allowTrial));
        if (returnUrl != null) {
            body = new java.util.HashMap<>(body);
            body.put("return_url", returnUrl);
        }

        String json = objectMapper.writeValueAsString(body);
        HttpResponse<String> response = post("/checkouts/", json);
        return objectMapper.readValue(response.body(), Map.class);
    }

    /** Create a customer portal session so the user can manage billing. */
    @SuppressWarnings("unchecked")
    public Map<String, Object> createCustomerPortalSession(String customerId, String returnUrl)
            throws IOException, InterruptedException {
        requireApiKey();

        Map<String, Object> body = new java.util.HashMap<>();
        body.put("customer_id", customerId);
        if (returnUrl != null) {
            body.put("return_url", returnUrl);
        }

        String json = objectMapper.writeValueAsString(body);
        HttpResponse<String> response = post("/customer-sessions/", json);
        return objectMapper.readValue(response.body(), Map.class);
    }

    /** List products with their prices. */
    @SuppressWarnings("unchecked")
    public Map<String, Object> listProducts() throws IOException, InterruptedException {
        requireApiKey();
        HttpResponse<String> response = get("/products/?is_archived=false");
        return objectMapper.readValue(response.body(), Map.class);
    }

    /** List subscriptions for a given customer. */
    @SuppressWarnings("unchecked")
    public Map<String, Object> listSubscriptions(String customerId)
            throws IOException, InterruptedException {
        requireApiKey();
        HttpResponse<String> response =
                get("/subscriptions/?customer_id=" + customerId + "&active=true");
        return objectMapper.readValue(response.body(), Map.class);
    }

    /** Get a single subscription. */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getSubscription(String subscriptionId)
            throws IOException, InterruptedException {
        requireApiKey();
        HttpResponse<String> response = get("/subscriptions/" + subscriptionId);
        return objectMapper.readValue(response.body(), Map.class);
    }

    // ---- HTTP helpers ----

    private HttpResponse<String> get(String path) throws IOException, InterruptedException {
        HttpRequest request =
                HttpRequest.newBuilder()
                        .uri(URI.create(apiUrl + path))
                        .header("Authorization", "Bearer " + apiKey)
                        .header("Accept", "application/json")
                        .GET()
                        .build();
        HttpResponse<String> response =
                httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            log.error("Polar API error: {} {} -> {}", "GET", path, response.body());
            throw new IOException("Polar API returned " + response.statusCode());
        }
        return response;
    }

    private HttpResponse<String> post(String path, String jsonBody)
            throws IOException, InterruptedException {
        HttpRequest request =
                HttpRequest.newBuilder()
                        .uri(URI.create(apiUrl + path))
                        .header("Authorization", "Bearer " + apiKey)
                        .header("Content-Type", "application/json")
                        .header("Accept", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                        .build();
        HttpResponse<String> response =
                httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            log.error("Polar API error: {} {} -> {}", "POST", path, response.body());
            throw new IOException("Polar API returned " + response.statusCode());
        }
        return response;
    }

    private void requireApiKey() {
        if (apiKey.isBlank()) {
            throw new IllegalStateException("POLAR_API_KEY is not configured");
        }
    }

    private static String resolveEnv(String key, String defaultValue) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) {
            value = System.getProperty(key);
        }
        return (value != null && !value.isBlank()) ? value : defaultValue;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> filterNulls(Map<String, Object> map) {
        Map<String, Object> result = new java.util.HashMap<>();
        map.forEach(
                (k, v) -> {
                    if (v != null) result.put(k, v);
                });
        return result;
    }
}
