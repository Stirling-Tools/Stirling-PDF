package stirling.software.proprietary.controller.api;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.PolarService;

/**
 * Backend billing endpoints that proxy to the Polar.sh API. Replaces the former Supabase edge
 * functions: {@code stripe-price-lookup}, {@code create-checkout}, {@code manage-billing}.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/billing")
@RequiredArgsConstructor
public class BillingController {

    private final PolarService polarService;
    private final UserService userService;

    /**
     * Returns product pricing from Polar.
     *
     * <p>Replaces {@code supabase.functions.invoke('stripe-price-lookup')}.
     */
    @SuppressWarnings("unchecked")
    @GetMapping("/prices")
    public ResponseEntity<Map<String, Object>> getPrices(
            @RequestParam(required = false, defaultValue = "usd") String currency) {
        try {
            Map<String, Object> products = polarService.listProducts();
            List<Map<String, Object>> items =
                    (List<Map<String, Object>>) products.getOrDefault("items", new ArrayList<>());

            Map<String, Object> prices = new HashMap<>();
            for (Map<String, Object> product : items) {
                String productName = (String) product.get("name");
                List<Map<String, Object>> productPrices =
                        (List<Map<String, Object>>)
                                product.getOrDefault("prices", new ArrayList<>());

                if (!productPrices.isEmpty()) {
                    Map<String, Object> price = productPrices.get(0);
                    String lookupKey = productName != null ? productName.toLowerCase() : "";
                    prices.put(
                            lookupKey,
                            Map.of(
                                    "unit_amount",
                                    price.getOrDefault("price_amount", 0),
                                    "currency",
                                    price.getOrDefault("price_currency", currency)));
                }
            }

            return ResponseEntity.ok(Map.of("prices", prices, "missing", List.of()));
        } catch (Exception e) {
            log.error("Failed to fetch prices from Polar", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to fetch pricing"));
        }
    }

    /**
     * Creates a Polar checkout session.
     *
     * <p>Replaces {@code supabase.functions.invoke('create-checkout')}.
     */
    @PostMapping("/checkout")
    public ResponseEntity<Map<String, Object>> createCheckout(
            @RequestBody Map<String, Object> body) {
        try {
            User user = resolveCurrentUser();
            String email = user != null ? user.getEmail() : null;

            String productId = resolveProductId(body);
            if (productId == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Product ID required"));
            }

            String successUrl = (String) body.getOrDefault("callback_base_url", "");
            if (!successUrl.isBlank()) {
                successUrl = successUrl + "/checkout/success";
            }

            boolean trialConversion = Boolean.TRUE.equals(body.get("trial_conversion"));

            Map<String, Object> checkout =
                    polarService.createCheckout(
                            productId,
                            email,
                            successUrl,
                            (String) body.get("return_url"),
                            !trialConversion);

            // The frontend expects clientSecret for embedded checkout or url for redirect
            Map<String, Object> response = new HashMap<>();
            response.put("url", checkout.get("url"));
            response.put("clientSecret", checkout.get("client_secret"));
            response.put("id", checkout.get("id"));

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Failed to create checkout session", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to create checkout session"));
        }
    }

    /**
     * Creates a Polar customer portal session.
     *
     * <p>Replaces {@code supabase.functions.invoke('manage-billing')}.
     */
    @PostMapping("/portal")
    public ResponseEntity<Map<String, Object>> createPortalSession(
            @RequestBody Map<String, Object> body) {
        try {
            User user = resolveCurrentUser();
            if (user == null) {
                return ResponseEntity.status(401).body(Map.of("error", "Not authenticated"));
            }

            // Use the user's Polar customer ID (stored on user or looked up)
            String customerId = user.getSupabaseId(); // repurpose field for Polar customer ID
            if (customerId == null || customerId.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(
                                Map.of(
                                        "error",
                                        "No billing customer found. Please subscribe first."));
            }

            String returnUrl = (String) body.getOrDefault("return_url", "/");

            Map<String, Object> session =
                    polarService.createCustomerPortalSession(customerId, returnUrl);

            return ResponseEntity.ok(
                    Map.of("url", session.getOrDefault("customer_portal_url", "")));
        } catch (Exception e) {
            log.error("Failed to create billing portal session", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to open billing portal"));
        }
    }

    // ---- Helpers ----

    /**
     * Resolve product ID from the checkout request body. Supports plan-based or credit-pack-based
     * product lookup via environment variables.
     */
    private String resolveProductId(Map<String, Object> body) {
        String purchaseType = (String) body.getOrDefault("purchase_type", "subscription");
        if ("credits".equals(purchaseType)) {
            String pack = (String) body.get("credits_pack");
            if (pack != null) {
                String envKey = "POLAR_PRODUCT_ID_CREDITS_" + pack.toUpperCase();
                return resolveEnv(envKey);
            }
        } else {
            String plan = (String) body.get("plan");
            if (plan != null) {
                String envKey = "POLAR_PRODUCT_ID_" + plan.toUpperCase();
                return resolveEnv(envKey);
            }
        }
        // Fall back to explicit product_id in body
        return (String) body.get("product_id");
    }

    private String resolveEnv(String key) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) {
            value = System.getProperty(key);
        }
        return value;
    }

    private User resolveCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) return null;
        Object principal = auth.getPrincipal();
        String username =
                principal instanceof UserDetails ud ? ud.getUsername() : principal.toString();
        return userService.findByUsernameIgnoreCase(username).orElse(null);
    }
}
