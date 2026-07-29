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

import stirling.software.proprietary.model.TeamCreatedEvent;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.TeamService;

/**
 * Seeds an enabled Classification policy per team so classification is on by default. Idempotent;
 * skips the internal team.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DefaultClassificationPolicySeeder {

    static final String CATEGORY = "classification";
    private static final String CLASSIFY_ENDPOINT = "/api/v1/ai/tools/classify-and-label";
    private static final String POLICY_NAME = "Classification Policy";

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

    // Any team created at runtime (admin-created, SaaS sign-ups); after the team's commit so a
    // rolled-back team never leaves a policy behind.
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onTeamCreated(TeamCreatedEvent event) {
        seedIfMissing(event.teamId(), event.teamName());
    }

    private void seedIfMissing(Long teamId, String teamName) {
        if (teamId == null || TeamService.INTERNAL_TEAM_NAME.equals(teamName)) {
            return;
        }
        boolean alreadySeeded =
                policyStore.findByTeam(teamId).stream()
                        .anyMatch(DefaultClassificationPolicySeeder::isClassification);
        if (alreadySeeded) {
            return;
        }
        policyStore.save(defaultPolicy(teamId));
        log.info("Seeded default Classification policy for team {}", teamId);
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
                "system",
                true,
                null,
                List.of(),
                List.of(new PipelineStep(CLASSIFY_ENDPOINT, Map.of())),
                new OutputSpec("inline", options),
                teamId);
    }
}
