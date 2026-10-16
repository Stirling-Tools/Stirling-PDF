package stirling.software.proprietary.accountlink;

import java.time.Duration;
import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.DistributedLock;
import stirling.software.common.cluster.DistributedLock.LockHandle;
import stirling.software.proprietary.service.OrgOwnerService;

/**
 * Links this server by redeeming a one-time key created in Stirling Cloud, so the person paying
 * need not sign in on the server. Everything after the stored credential is the same as a link made
 * through the browser.
 *
 * <p>The cluster lock is held across the commit, so replicas booting with the same key see the
 * winner's credential instead of spending a second redeem that SaaS will refuse.
 */
@Slf4j
@Service
@Profile("!saas")
@ConditionalOnProperty(
        name = "stirling.billing.account-link.enabled",
        havingValue = "true",
        matchIfMissing = true)
public class LinkKeyRedeemService {

    static final String LOCK_KEY = "account-link:redeem-key";

    private static final Duration LOCK_LEASE = Duration.ofMinutes(2);

    public enum Outcome {
        LINKED,
        ALREADY_LINKED,
        /** Not shaped like a link key; nothing was sent. */
        BAD_FORMAT,
        /** SaaS refused it: unknown, mistyped, used, revoked or expired. */
        REJECTED,
        /** SaaS or the lock backend could not be reached; the key is unspent. */
        UNAVAILABLE,
        /** Another node is redeeming right now. */
        BUSY
    }

    public record Result(Outcome outcome, Long teamId) {
        static Result of(Outcome outcome) {
            return new Result(outcome, null);
        }
    }

    private final AccountLinkClient client;
    private final DeviceCredentialStore credentialStore;
    private final EntitlementCache entitlementCache;
    private final OrgOwnerService owners;
    private final DistributedLock locks;
    private final TransactionTemplate transaction;

    public LinkKeyRedeemService(
            AccountLinkClient client,
            DeviceCredentialStore credentialStore,
            EntitlementCache entitlementCache,
            OrgOwnerService owners,
            DistributedLock locks,
            PlatformTransactionManager transactionManager) {
        this.client = client;
        this.credentialStore = credentialStore;
        this.entitlementCache = entitlementCache;
        this.owners = owners;
        this.locks = locks;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    /** A key pasted by the organisation owner. */
    public Result redeemAsOwner(String rawKey, String name, Authentication authentication) {
        return redeem(rawKey, name, authentication, true);
    }

    /** A key from server configuration; whoever can set that already outranks the owner. */
    public Result redeemFromConfiguration(String rawKey, String name) {
        return redeem(rawKey, name, null, false);
    }

    private Result redeem(
            String rawKey, String name, Authentication authentication, boolean requireOwner) {
        Optional<LinkKeyFormat.Parts> parts = LinkKeyFormat.parse(rawKey);
        if (parts.isEmpty()) {
            return Result.of(Outcome.BAD_FORMAT);
        }
        Optional<LockHandle> lock;
        try {
            lock = locks.tryAcquire(LOCK_KEY, LOCK_LEASE);
        } catch (RuntimeException e) {
            log.warn("Account-link: could not take the link lock ({})", e.getMessage());
            return Result.of(Outcome.UNAVAILABLE);
        }
        if (lock.isEmpty()) {
            return Result.of(Outcome.BUSY);
        }
        Result result;
        try (LockHandle held = lock.get()) {
            result =
                    transaction.execute(
                            status -> {
                                if (requireOwner) {
                                    owners.requireCurrentOwner(authentication);
                                }
                                credentialStore.assertNoHandover();
                                if (credentialStore.isLinked()) {
                                    return Result.of(Outcome.ALREADY_LINKED);
                                }
                                AccountLinkClient.ConnectClaimResult claim =
                                        client.redeemKey(parts.get().compose(), name);
                                return switch (claim.outcome()) {
                                    case GRANTED -> {
                                        credentialStore.save(
                                                claim.deviceId(),
                                                claim.deviceSecret(),
                                                claim.teamId(),
                                                LinkMethod.KEY);
                                        yield new Result(Outcome.LINKED, claim.teamId());
                                    }
                                    case UNAVAILABLE -> Result.of(Outcome.UNAVAILABLE);
                                    default -> Result.of(Outcome.REJECTED);
                                };
                            });
        }
        if (result.outcome() == Outcome.LINKED) {
            entitlementCache.invalidate();
            log.info(
                    "Account-link: linked to team {} with key {}",
                    result.teamId(),
                    parts.get().keyId());
        }
        return result;
    }
}
