package stirling.software.proprietary.controller.api;

import java.util.Map;
import java.util.Optional;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.CreditService;

/**
 * Handles Polar.sh webhook events for subscription lifecycle management.
 *
 * <p>Register this endpoint ({@code /api/v1/webhooks/polar}) in the Polar dashboard under
 * organization settings. Subscribe to: {@code subscription.active}, {@code subscription.canceled},
 * {@code order.created}.
 *
 * <p>Webhook signature verification should be configured via a filter or middleware using the
 * webhook secret from Polar settings. For now, this controller trusts the caller — add HMAC
 * verification before production use.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/webhooks")
@RequiredArgsConstructor
public class PolarWebhookController {

    private final UserService userService;
    private final CreditService creditService;

    @SuppressWarnings("unchecked")
    @PostMapping("/polar")
    public ResponseEntity<Map<String, String>> handleWebhook(
            @RequestBody Map<String, Object> payload) {
        String type = (String) payload.get("type");
        Map<String, Object> data = (Map<String, Object>) payload.get("data");

        if (type == null || data == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid webhook payload"));
        }

        log.info("Polar webhook received: {}", type);

        try {
            switch (type) {
                case "subscription.active" -> handleSubscriptionActive(data);
                case "subscription.canceled" -> handleSubscriptionCanceled(data);
                case "subscription.updated" -> handleSubscriptionUpdated(data);
                case "order.created" -> handleOrderCreated(data);
                case "order.paid" -> handleOrderCreated(data); // treat same as created
                default -> log.debug("Unhandled Polar webhook event: {}", type);
            }
        } catch (Exception e) {
            log.error("Error processing Polar webhook {}: {}", type, e.getMessage(), e);
            // Return 200 anyway to prevent Polar from retrying
        }

        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    @SuppressWarnings("unchecked")
    private void handleSubscriptionActive(Map<String, Object> data) {
        String customerId = extractCustomerId(data);
        if (customerId == null) return;

        Optional<User> userOpt = userService.findBySupabaseId(customerId);
        if (userOpt.isEmpty()) {
            log.warn("No user found for Polar customer {}", customerId);
            return;
        }

        User user = userOpt.get();
        user.setPlanTier("pro");

        // Update role to PRO_USER
        user.getAuthorities().clear();
        Authority authority = new Authority(Role.PRO_USER.getRoleId(), user);
        user.addAuthority(authority);
        userService.saveUser(user);

        // Update credit allocation
        creditService.updatePlanAllocation(user.getId(), "pro");
        log.info("User {} upgraded to Pro via Polar subscription", user.getUsername());
    }

    private void handleSubscriptionCanceled(Map<String, Object> data) {
        String customerId = extractCustomerId(data);
        if (customerId == null) return;

        Optional<User> userOpt = userService.findBySupabaseId(customerId);
        if (userOpt.isEmpty()) return;

        User user = userOpt.get();
        user.setPlanTier("free");

        // Downgrade role to FREE_USER
        user.getAuthorities().clear();
        Authority authority = new Authority(Role.FREE_USER.getRoleId(), user);
        user.addAuthority(authority);
        userService.saveUser(user);

        // Update credit allocation
        creditService.updatePlanAllocation(user.getId(), "free");
        log.info("User {} downgraded to Free after subscription cancellation", user.getUsername());
    }

    private void handleSubscriptionUpdated(Map<String, Object> data) {
        String status = (String) data.get("status");
        if ("active".equals(status)) {
            handleSubscriptionActive(data);
        } else if ("canceled".equals(status)) {
            handleSubscriptionCanceled(data);
        }
    }

    @SuppressWarnings("unchecked")
    private void handleOrderCreated(Map<String, Object> data) {
        String customerId = extractCustomerId(data);
        if (customerId == null) return;

        Optional<User> userOpt = userService.findBySupabaseId(customerId);
        if (userOpt.isEmpty()) return;

        User user = userOpt.get();

        // Check if this order is a credit pack purchase
        Map<String, Object> product = (Map<String, Object>) data.get("product");
        if (product != null) {
            String productName = (String) product.get("name");
            if (productName != null && productName.toLowerCase().contains("credit")) {
                int credits = parseCreditAmount(productName);
                if (credits > 0) {
                    String planTier = user.getPlanTier() != null ? user.getPlanTier() : "free";
                    creditService.addPurchasedCredits(user.getId(), credits, planTier);
                    log.info(
                            "Added {} purchased credits to user {} via Polar order",
                            credits,
                            user.getUsername());
                }
            }
        }
    }

    @SuppressWarnings("unchecked")
    private String extractCustomerId(Map<String, Object> data) {
        // Polar nests customer info in data.customer or data.customer_id
        Object customer = data.get("customer");
        if (customer instanceof Map) {
            return (String) ((Map<String, Object>) customer).get("id");
        }
        return (String) data.get("customer_id");
    }

    private int parseCreditAmount(String productName) {
        // Parse credit amounts from product names like "100 Credits", "500 Credits"
        String normalized = productName.replaceAll("[^0-9]", " ").trim();
        String[] parts = normalized.split("\\s+");
        for (String part : parts) {
            try {
                int val = Integer.parseInt(part);
                if (val > 0) return val;
            } catch (NumberFormatException ignored) {
            }
        }
        return 0;
    }
}
