package stirling.software.proprietary.policy.overview;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceAccessGuard;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.InProcessPolicyStore;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Tests for {@link PolicyOverviewService}: every policy appears once with its sources resolved to
 * names, its steps and trigger/output summarised, and the KPI strip counting active vs paused.
 * Login is disabled so the team guards pass everything through.
 */
class PolicyOverviewServiceTest {

    private final SourceStore sourceStore = new InProcessSourceStore();
    private final PolicyStore policyStore = new InProcessPolicyStore();
    private PolicyOverviewService service;

    @BeforeEach
    void setUp() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().setEnableLogin(false);
        UserServiceInterface userService = mock(UserServiceInterface.class);
        PolicyManagementAuthority authority = mock(PolicyManagementAuthority.class);
        SourceAccessGuard sourceGuard = new SourceAccessGuard(userService, properties, authority);
        PolicyAccessGuard policyGuard = new PolicyAccessGuard(userService, properties, authority);
        service = new PolicyOverviewService(policyStore, sourceStore, policyGuard, sourceGuard);
    }

    @Test
    void eachPolicyAppearsWithResolvedSourcesStepsAndSummary() {
        Source claims = source("Claims intake", "/claims");
        policyStore.save(
                new Policy(
                        null,
                        "Redaction",
                        "owner",
                        true,
                        new TriggerConfig("schedule", Map.of()),
                        List.of(claims.id()),
                        List.of(new PipelineStep("/api/v1/security/auto-redact", Map.of())),
                        OutputSpec.inline()));
        policyStore.save(
                new Policy(
                        null,
                        "Archive (paused)",
                        "owner",
                        false,
                        null,
                        List.of(),
                        List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                        OutputSpec.inline()));

        PoliciesOverviewResponse response = service.overview();

        assertEquals(2, response.pipelines().size());
        // Sorted by name, case-insensitive, so "Archive" leads "Redaction".
        PolicyView archive = response.pipelines().get(0);
        assertEquals("Archive (paused)", archive.name());
        assertEquals("paused", archive.status());
        assertEquals("manual", archive.trigger());

        PolicyView redaction = find(response, "Redaction");
        assertEquals("active", redaction.status());
        assertEquals("schedule", redaction.trigger());
        assertEquals("inline", redaction.output());
        assertEquals(List.of("/api/v1/security/auto-redact"), redaction.steps());
        assertEquals(1, redaction.sources().size());
        assertEquals(claims.id(), redaction.sources().get(0).id());
        assertEquals("Claims intake", redaction.sources().get(0).name());

        // KPI strip: total, active, paused.
        assertEquals(List.of(2L, 1L, 1L), response.kpis().stream().map(PolicyKpi::value).toList());
    }

    @Test
    void anUnresolvedSourceFallsBackToItsId() {
        policyStore.save(
                new Policy(
                        null,
                        "Orphan",
                        "owner",
                        true,
                        null,
                        List.of("src-missing"),
                        List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                        OutputSpec.inline()));

        PolicyView view = find(service.overview(), "Orphan");
        assertEquals(1, view.sources().size());
        assertEquals("src-missing", view.sources().get(0).id());
        assertEquals("src-missing", view.sources().get(0).name());
    }

    @Test
    void overviewLoadsOnlyTheCallersTeam() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().setEnableLogin(true);
        UserServiceInterface userService = mock(UserServiceInterface.class);
        PolicyManagementAuthority authority = mock(PolicyManagementAuthority.class);
        when(authority.currentUserTeamId()).thenReturn(1L);
        SourceAccessGuard sourceGuard = new SourceAccessGuard(userService, properties, authority);
        PolicyAccessGuard policyGuard = new PolicyAccessGuard(userService, properties, authority);
        PolicyOverviewService scoped =
                new PolicyOverviewService(policyStore, sourceStore, policyGuard, sourceGuard);

        Source ours = teamSource("Ours", "/ours", 1L);
        teamPolicy("Our policy", 1L, ours.id());
        teamPolicy("Their policy", 2L, ours.id());

        PoliciesOverviewResponse response = scoped.overview();

        assertEquals(1, response.pipelines().size());
        PolicyView view = response.pipelines().get(0);
        assertEquals("Our policy", view.name());
        assertEquals("Ours", view.sources().get(0).name());
        assertEquals(List.of(1L, 1L, 0L), response.kpis().stream().map(PolicyKpi::value).toList());
    }

    @Test
    void emptyStoreReportsZeroKpis() {
        PoliciesOverviewResponse response = service.overview();
        assertTrue(response.pipelines().isEmpty());
        assertEquals(List.of(0L, 0L, 0L), response.kpis().stream().map(PolicyKpi::value).toList());
    }

    private Source source(String name, String directory) {
        return sourceStore.save(
                new Source(
                        null, name, "folder", Map.of("directory", directory), true, "owner", null));
    }

    private Source teamSource(String name, String directory, Long teamId) {
        return sourceStore.save(
                new Source(
                        null,
                        name,
                        "folder",
                        Map.of("directory", directory),
                        true,
                        "owner",
                        teamId));
    }

    private void teamPolicy(String name, Long teamId, String... sourceIds) {
        policyStore.save(
                new Policy(
                        null,
                        name,
                        "owner",
                        true,
                        null,
                        List.of(sourceIds),
                        List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                        OutputSpec.inline(),
                        teamId));
    }

    private static PolicyView find(PoliciesOverviewResponse response, String name) {
        return response.pipelines().stream()
                .filter(view -> view.name().equals(name))
                .findFirst()
                .orElseThrow();
    }
}
