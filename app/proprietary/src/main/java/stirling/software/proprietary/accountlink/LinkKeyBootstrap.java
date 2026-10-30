package stirling.software.proprietary.accountlink;

import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;

import lombok.extern.slf4j.Slf4j;

/**
 * Redeems {@code stirling.billing.account-link.key} once the server is up, so a deployment can link
 * from configuration alone. Runs off the startup thread and keeps retrying while Stirling Cloud is
 * unreachable; a refused key is logged once and left alone, since retrying cannot fix it.
 *
 * <p>A key works once, so replicas only share the link when they share a database: the first pod
 * links, the rest find its credential. Per-pod databases leave every other pod unlinked.
 */
@Slf4j
@Component
@Profile("!saas")
@ConditionalOnProperty(
        name = "stirling.billing.account-link.enabled",
        havingValue = "true",
        matchIfMissing = true)
public class LinkKeyBootstrap {

    static final Duration FIRST_RETRY = Duration.ofSeconds(30);
    static final Duration MAX_RETRY = Duration.ofMinutes(30);

    private final AccountLinkProperties properties;
    private final LinkKeyRedeemService redeemer;
    private final DeviceCredentialStore credentialStore;
    private final ObjectProvider<UsageSyncService> syncService;
    private final ScheduledExecutorService scheduler;

    @Autowired
    public LinkKeyBootstrap(
            AccountLinkProperties properties,
            LinkKeyRedeemService redeemer,
            DeviceCredentialStore credentialStore,
            ObjectProvider<UsageSyncService> syncService) {
        this(
                properties,
                redeemer,
                credentialStore,
                syncService,
                Executors.newSingleThreadScheduledExecutor(
                        task -> {
                            Thread thread = new Thread(task, "account-link-key");
                            thread.setDaemon(true);
                            return thread;
                        }));
    }

    LinkKeyBootstrap(
            AccountLinkProperties properties,
            LinkKeyRedeemService redeemer,
            DeviceCredentialStore credentialStore,
            ObjectProvider<UsageSyncService> syncService,
            ScheduledExecutorService scheduler) {
        this.properties = properties;
        this.redeemer = redeemer;
        this.credentialStore = credentialStore;
        this.syncService = syncService;
        this.scheduler = scheduler;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        if (configuredKey() == null) {
            return;
        }
        scheduler.execute(() -> attempt(FIRST_RETRY));
    }

    @PreDestroy
    void shutdown() {
        scheduler.shutdownNow();
    }

    void attempt(Duration nextDelay) {
        String key = configuredKey();
        if (key == null) {
            return;
        }
        try {
            if (credentialStore.isLinked()) {
                log.debug("Account-link: already linked, ignoring the configured link key");
                return;
            }
            LinkKeyRedeemService.Result result =
                    redeemer.redeemFromConfiguration(key, properties.getName());
            switch (result.outcome()) {
                case LINKED -> {
                    log.info(
                            "Account-link: linked to Stirling Cloud team {} from the configured"
                                    + " key",
                            result.teamId());
                    syncAfterLink();
                }
                case ALREADY_LINKED -> {}
                case BAD_FORMAT ->
                        log.error(
                                "Account-link: stirling.billing.account-link.key is not a link"
                                        + " key. Copy it again from Stirling Cloud.");
                case REJECTED -> {
                    if (!credentialStore.isLinked()) {
                        log.error(
                                "Account-link: Stirling Cloud refused the configured link key {}."
                                        + " It may be used, expired or revoked; create a new key."
                                        + " Replicas that share one key also need a shared"
                                        + " database.",
                                keyId(key));
                    }
                }
                case UNAVAILABLE, BUSY -> retry(nextDelay);
            }
        } catch (RuntimeException e) {
            log.warn("Account-link: linking from the configured key failed", e);
            retry(nextDelay);
        }
    }

    private void retry(Duration delay) {
        log.info(
                "Account-link: will retry the configured link key in {} seconds",
                delay.toSeconds());
        Duration next = delay.multipliedBy(2);
        Duration capped = next.compareTo(MAX_RETRY) > 0 ? MAX_RETRY : next;
        scheduler.schedule(() -> attempt(capped), delay.toMillis(), TimeUnit.MILLISECONDS);
    }

    private void syncAfterLink() {
        UsageSyncService sync = syncService.getIfAvailable();
        if (sync == null) {
            return;
        }
        try {
            sync.syncNow();
        } catch (RuntimeException e) {
            log.warn("Initial account-link sync failed; the scheduled sync will retry", e);
        }
    }

    private String configuredKey() {
        String key = properties.getKey();
        return key == null || key.isBlank() ? null : key;
    }

    private static String keyId(String key) {
        return LinkKeyFormat.parse(key).map(LinkKeyFormat.Parts::keyId).orElse("(unreadable)");
    }
}
