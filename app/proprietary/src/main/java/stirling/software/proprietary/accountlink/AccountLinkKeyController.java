package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.extern.slf4j.Slf4j;

/**
 * Linking with a key from Stirling Cloud, and the read-only plan a key-linked server shows. Such a
 * server holds no cloud sign-in, so its billing view is built from the entitlement it already
 * fetches with its device credential. Owner-only, like the rest of the account-link surface.
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/account-link")
@Profile("!saas")
@PreAuthorize("hasRole('ADMIN') and @orgOwnerService.isCurrentUser(authentication)")
@ConditionalOnProperty(
        name = "stirling.billing.account-link.enabled",
        havingValue = "true",
        matchIfMissing = true)
public class AccountLinkKeyController {

    private final LinkKeyRedeemService redeemer;
    private final AccountLinkService accountLinkService;
    private final EntitlementCache entitlementCache;
    private final LocalUsageService localUsageService;
    private final ObjectProvider<UsageSyncService> syncServiceProvider;

    public AccountLinkKeyController(
            LinkKeyRedeemService redeemer,
            AccountLinkService accountLinkService,
            EntitlementCache entitlementCache,
            LocalUsageService localUsageService,
            ObjectProvider<UsageSyncService> syncServiceProvider) {
        this.redeemer = redeemer;
        this.accountLinkService = accountLinkService;
        this.entitlementCache = entitlementCache;
        this.localUsageService = localUsageService;
        this.syncServiceProvider = syncServiceProvider;
    }

    public record RedeemKeyRequest(String key, String name) {}

    /** {@code known} is false until the server has heard from Stirling Cloud at least once. */
    public record CloudPlan(
            boolean known,
            boolean subscribed,
            long freeRemainingUnits,
            long prepaidRemainingUnits,
            long periodSpendUnits,
            Long periodCapUnits,
            String state,
            LocalDateTime periodStart,
            LocalDateTime periodEnd,
            Integer licensedUsers,
            long unsyncedUnits,
            EntitlementCache.ConnectionStatus connection) {}

    @PostMapping("/key")
    public ResponseEntity<?> redeemKey(@RequestBody(required = false) RedeemKeyRequest req) {
        LinkKeyRedeemService.Result result =
                redeemer.redeemAsOwner(
                        req != null ? req.key() : null,
                        req != null ? req.name() : null,
                        SecurityContextHolder.getContext().getAuthentication());
        return switch (result.outcome()) {
            case LINKED -> {
                syncAfterLink();
                yield ResponseEntity.ok(accountLinkService.status());
            }
            case BAD_FORMAT -> error(HttpStatus.BAD_REQUEST, "KEY_FORMAT");
            case REJECTED -> error(HttpStatus.BAD_REQUEST, "KEY_REJECTED");
            case ALREADY_LINKED -> error(HttpStatus.CONFLICT, "ALREADY_LINKED");
            case BUSY -> error(HttpStatus.CONFLICT, "LINK_IN_PROGRESS");
            case UNAVAILABLE -> error(HttpStatus.BAD_GATEWAY, "CONNECT_FAILED");
        };
    }

    @GetMapping("/plan")
    public ResponseEntity<CloudPlan> plan() {
        Optional<InstanceEntitlement> entitlement =
                accountLinkService.isLinked() ? entitlementCache.current() : Optional.empty();
        long unsynced =
                entitlement.isPresent()
                        ? localUsageService.currentPeriodUnsynced().totalUnsyncedUnits()
                        : 0;
        EntitlementCache.ConnectionStatus connection = entitlementCache.connectionStatus();
        return ResponseEntity.ok(
                entitlement
                        .map(
                                e ->
                                        new CloudPlan(
                                                true,
                                                e.subscribed(),
                                                e.freeRemainingUnits(),
                                                e.prepaidRemainingUnits(),
                                                e.periodSpendUnits(),
                                                e.periodCapUnits(),
                                                e.state() != null ? e.state().name() : null,
                                                e.periodStart(),
                                                e.periodEnd(),
                                                e.licensedUsers(),
                                                unsynced,
                                                connection))
                        .orElseGet(
                                () ->
                                        new CloudPlan(
                                                false,
                                                false,
                                                0,
                                                0,
                                                0,
                                                null,
                                                null,
                                                null,
                                                null,
                                                null,
                                                0,
                                                connection)));
    }

    private void syncAfterLink() {
        UsageSyncService sync = syncServiceProvider.getIfAvailable();
        if (sync == null) {
            return;
        }
        try {
            sync.syncNow();
        } catch (RuntimeException e) {
            log.warn("Initial account-link sync failed; the scheduled sync will retry", e);
        }
    }

    private static ResponseEntity<Map<String, String>> error(HttpStatus status, String code) {
        return ResponseEntity.status(status).body(Map.of("error", code));
    }
}
