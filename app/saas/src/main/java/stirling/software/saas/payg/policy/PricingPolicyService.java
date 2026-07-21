package stirling.software.saas.payg.policy;

import java.time.Duration;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.repository.PricingPolicyRepository;

/**
 * Read-side facade over {@link PricingPolicyRepository}. The hot-path question is "what pricing
 * policy applies to this team right now?" — answered by either the team's per-team override (via
 * {@link PaygTeamExtensions#getPricingPolicyId()}) or the row with {@code is_default = TRUE}.
 *
 * <p>Reads are cached per-{@code teamId} for {@value #CACHE_TTL_SECONDS} seconds. The TTL is the
 * correctness floor: a policy change is visible on every instance within that window without any
 * coordination. Admin writes additionally fire a {@link PolicyChangedEvent} after commit so the
 * instance handling the write sees its own change immediately; other instances pick it up on the
 * next TTL expiry.
 *
 * <p><b>Writes are transactional and publish a {@link PolicyChangedEvent} after commit.</b> The
 * after-commit timing matters: publishing inside the tx would clear caches on instances that
 * haven't yet seen the row change, racing them into re-reading stale state. After-commit (via
 * {@link TransactionSynchronizationManager}) guarantees the new state is visible before any
 * listener fires.
 *
 * <p><b>Cache value is a JPA entity.</b> Callers must not mutate the returned policy — treat as
 * read-only. We accept this rather than wrapping in a DTO to keep the PR small; if mutation becomes
 * a footgun, swap the cache value type for an immutable snapshot.
 */
@Service
@Slf4j
public class PricingPolicyService {

    static final int CACHE_TTL_SECONDS = 30;
    private static final int CACHE_MAX_SIZE = 10_000;

    private final PricingPolicyRepository policyRepository;
    private final PaygTeamExtensionsRepository teamExtensionsRepository;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * Cache keyed by {@code teamId}. Null teamId not supported (caller's bug). Value is the
     * effective policy — either the team's override or the default row.
     */
    private final Cache<Long, PricingPolicy> byTeamCache;

    public PricingPolicyService(
            PricingPolicyRepository policyRepository,
            PaygTeamExtensionsRepository teamExtensionsRepository,
            ApplicationEventPublisher eventPublisher) {
        this.policyRepository = Objects.requireNonNull(policyRepository, "policyRepository");
        this.teamExtensionsRepository =
                Objects.requireNonNull(teamExtensionsRepository, "teamExtensionsRepository");
        this.eventPublisher = Objects.requireNonNull(eventPublisher, "eventPublisher");
        this.byTeamCache =
                Caffeine.newBuilder()
                        .maximumSize(CACHE_MAX_SIZE)
                        .expireAfterWrite(Duration.ofSeconds(CACHE_TTL_SECONDS))
                        .recordStats()
                        .build();
    }

    /**
     * Resolves the effective policy for {@code teamId}: per-team override if set, else the row with
     * {@code is_default = TRUE}. Throws {@link IllegalStateException} if no default exists — the
     * seed migration is expected to put one there.
     *
     * <p>A {@code null} {@code teamId} (admin-created user, deleted team, pre-team-migration
     * account) is valid and returns the default policy directly. Throwing here would silently
     * exclude the team-less cohort from PAYG via the filter's fail-open path, biasing the
     * shadow-vs-legacy reconciliation.
     *
     * <p>{@link Transactional}({@code readOnly = true}) so the eager-loaded {@code stepLimits} and
     * {@code stripePriceIds} collections initialize inside the same session.
     */
    @Transactional(readOnly = true)
    public PricingPolicy getEffectivePolicy(Long teamId) {
        if (teamId == null) {
            return loadDefaultPolicy();
        }
        return byTeamCache.get(teamId, this::loadEffectivePolicy);
    }

    /** Bypasses the cache. Useful for admin endpoints that want a fresh read after a mutation. */
    @Transactional(readOnly = true)
    public PricingPolicy getEffectivePolicyUncached(Long teamId) {
        if (teamId == null) {
            return loadDefaultPolicy();
        }
        return loadEffectivePolicy(teamId);
    }

    /** Lists every policy (admin read). Not cached — admin pages should always see fresh state. */
    @Transactional(readOnly = true)
    public List<PricingPolicy> listAll() {
        return policyRepository.findAll();
    }

    @Transactional(readOnly = true)
    public Optional<PricingPolicy> findByVersion(String version) {
        return policyRepository.findByVersion(version);
    }

    @Transactional(readOnly = true)
    public Optional<PricingPolicy> findById(Long policyId) {
        return policyRepository.findById(policyId);
    }

    /** Creates a new policy row. Publishes {@link PolicyChangedEvent} after commit. */
    @Transactional
    public PricingPolicy create(PricingPolicy draft) {
        Objects.requireNonNull(draft, "draft");
        if (draft.getId() != null) {
            throw new IllegalArgumentException(
                    "Create draft must not carry a policy_id; use update() to modify an existing"
                            + " row.");
        }
        if (Boolean.TRUE.equals(draft.getIsDefault())) {
            // Promotion to default must go through setDefault() so the existing default is
            // atomically cleared first; otherwise the partial unique index rejects the insert.
            throw new IllegalArgumentException(
                    "Create with is_default=true is not allowed; create the row then call"
                            + " setDefault(id).");
        }
        PricingPolicy saved = policyRepository.save(draft);
        publishOnCommit("create:" + saved.getId());
        return saved;
    }

    /**
     * Promotes {@code newDefaultId} to be the default policy, atomically clearing the existing
     * default first. Idempotent — calling with a row already flagged default is a silent no-op (no
     * event fired; no state actually changed).
     */
    @Transactional
    public PricingPolicy setDefault(Long newDefaultId) {
        Objects.requireNonNull(newDefaultId, "newDefaultId");
        PricingPolicy target =
                policyRepository
                        .findById(newDefaultId)
                        .orElseThrow(
                                () ->
                                        new IllegalArgumentException(
                                                "No pricing_policy with id " + newDefaultId));
        if (Boolean.TRUE.equals(target.getIsDefault())) {
            return target;
        }
        policyRepository.clearDefaultFlag();
        target.setIsDefault(true);
        PricingPolicy saved = policyRepository.save(target);
        publishOnCommit("setDefault:" + saved.getId());
        return saved;
    }

    /**
     * Sets {@code teamId}'s per-team policy override. {@code policyId = null} clears the override
     * (team falls back to default). Validates the policy exists.
     */
    @Transactional
    public void setTeamOverride(Long teamId, Long policyId) {
        Objects.requireNonNull(teamId, "teamId");
        if (policyId != null && !policyRepository.existsById(policyId)) {
            throw new IllegalArgumentException("No pricing_policy with id " + policyId);
        }
        PaygTeamExtensions extensions =
                teamExtensionsRepository
                        .findById(teamId)
                        .orElseThrow(
                                () ->
                                        new IllegalStateException(
                                                "No payg_team_extensions row for team "
                                                        + teamId
                                                        + " — should have been created on first"
                                                        + " PAYG access."));
        extensions.setPricingPolicyId(policyId);
        teamExtensionsRepository.save(extensions);
        publishOnCommit("teamOverride:" + teamId);
    }

    /**
     * Invalidates the cache. Called on every {@link PolicyChangedEvent} regardless of which row
     * changed — cache hit rate is already team-scoped so the cost of a clear is bounded by how many
     * active teams there are.
     */
    @EventListener
    public void onPolicyChanged(PolicyChangedEvent event) {
        long evicted = byTeamCache.estimatedSize();
        byTeamCache.invalidateAll();
        log.debug(
                "PricingPolicyService cache invalidated (payload='{}', approx {} entries dropped)",
                event.getPayload(),
                evicted);
    }

    /** Visible for tests. */
    long cacheSize() {
        return byTeamCache.estimatedSize();
    }

    /**
     * Schedules a {@link PolicyChangedEvent} to fire after the current transaction commits, or
     * fires immediately if no transaction is active (e.g. test paths calling write methods without
     * a tx). Inside-transaction firing would have listeners clearing caches before the row change
     * is visible to other connections — racing them into re-reading stale state.
     */
    private void publishOnCommit(String payload) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            eventPublisher.publishEvent(
                                    new PolicyChangedEvent(PricingPolicyService.this, payload));
                        }
                    });
        } else {
            eventPublisher.publishEvent(new PolicyChangedEvent(this, payload));
        }
    }

    private PricingPolicy loadEffectivePolicy(Long teamId) {
        Optional<Long> overrideId =
                teamExtensionsRepository
                        .findById(teamId)
                        .map(PaygTeamExtensions::getPricingPolicyId);
        if (overrideId.isPresent()) {
            Long id = overrideId.get();
            Optional<PricingPolicy> override = policyRepository.findById(id);
            if (override.isPresent()) {
                return override.get();
            }
            // Override points at a missing policy — log and fall through to default rather than
            // failing hard. The admin path that sets the override should validate up front; this
            // is a safety net for racing deletes.
            log.warn(
                    "Team {} has pricing_policy_id={} set as override but that row is missing;"
                            + " falling back to default.",
                    teamId,
                    id);
        }
        return loadDefaultPolicy();
    }

    private PricingPolicy loadDefaultPolicy() {
        return policyRepository
                .findFirstByIsDefaultTrue()
                .orElseThrow(
                        () ->
                                new IllegalStateException(
                                        "No default pricing_policy row found — the V11 seed"
                                                + " migration must run before"
                                                + " PricingPolicyService is reachable."));
    }
}
