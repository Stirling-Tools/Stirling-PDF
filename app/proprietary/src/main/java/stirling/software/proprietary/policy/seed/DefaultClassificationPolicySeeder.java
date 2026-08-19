package stirling.software.proprietary.policy.seed;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.model.TeamCreatedEvent;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.TeamService;

/**
 * Seeds an enabled Classification policy per team; idempotent, skips the internal team. Owned by
 * the internal API user, as ownerless runs fall back to the owner and step dispatch authenticates
 * as it.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DefaultClassificationPolicySeeder {

    static final String CATEGORY = "classification";
    private static final String CLASSIFY_ENDPOINT = "/api/v1/ai/tools/classify-and-label";
    private static final String POLICY_NAME = "Classification Policy";

    /**
     * Pre-existing seeds used this placeholder, which was never a user; see {@link #repairOwner}.
     */
    private static final String LEGACY_OWNER = "system";

    private final PolicyStore policyStore;
    private final TeamRepository teamRepository;

    // The default team is created during startup, before the entity event listener is guaranteed
    // wired, so ensure it once the context is fully ready (self-hosted first boot).
    @EventListener(ApplicationReadyEvent.class)
    public void seedDefaultTeamOnStartup() {
        teamRepository
                .findByName(TeamService.DEFAULT_TEAM_NAME)
                .ifPresent(team -> seedIfMissing(team.getId(), team.getName()));
    }

    // Seeds inside the new team's own transaction: rollback leaves no policy behind, and the
    // store's
    // pessimistic lock needs a live transaction, which AFTER_COMMIT cannot offer.
    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onTeamCreated(TeamCreatedEvent event) {
        seedIfMissing(event.teamId(), event.teamName());
    }

    private void seedIfMissing(Long teamId, String teamName) {
        if (teamId == null || TeamService.INTERNAL_TEAM_NAME.equals(teamName)) {
            return;
        }
        Policy existing =
                policyStore.findByTeam(teamId).stream()
                        .filter(DefaultClassificationPolicySeeder::isClassification)
                        .findFirst()
                        .orElse(null);
        if (existing != null) {
            repairOwner(existing);
            return;
        }
        policyStore.save(defaultPolicy(teamId));
        log.info("Seeded default Classification policy for team {}", teamId);
    }

    /**
     * Move a policy seeded before the owner was a real identity onto the internal API user. Left
     * alone otherwise, so an owner someone deliberately changed is never overwritten.
     */
    private void repairOwner(Policy policy) {
        if (!LEGACY_OWNER.equals(policy.owner())) {
            return;
        }
        policyStore.save(policy.withOwner(Role.INTERNAL_API_USER.getRoleId()));
        log.info(
                "Re-owned Classification policy {} from '{}' to the internal API user",
                policy.id(),
                LEGACY_OWNER);
    }

    private static boolean isClassification(Policy policy) {
        return policy.output() != null
                && CATEGORY.equals(policy.output().options().get("categoryId"));
    }

    /** The default Classification policy: classify each upload, versioning the file in place. */
    static Policy defaultPolicy(Long teamId) {
        Map<String, Object> options = new HashMap<>();
        options.put("categoryId", CATEGORY);
        options.put("runOn", "upload");
        options.put("mode", "new_version");
        options.put("sources", List.of("editor"));
        options.put("scopeTypes", List.of());
        options.put("reviewerEmail", "");
        return new Policy(
                null,
                POLICY_NAME,
                Role.INTERNAL_API_USER.getRoleId(),
                true,
                List.of(),
                List.of(new PipelineStep(CLASSIFY_ENDPOINT, Map.of())),
                new OutputSpec("inline", options),
                teamId);
    }
}
