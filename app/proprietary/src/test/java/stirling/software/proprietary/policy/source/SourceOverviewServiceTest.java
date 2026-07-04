package stirling.software.proprietary.policy.source;

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
import stirling.software.proprietary.policy.store.InProcessPolicyStore;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Tests for {@link SourceOverviewService}: each source appears exactly once, annotated with the
 * policies that reference it. Login is disabled, so the team guards pass everything through and the
 * reference counting is exercised directly.
 */
class SourceOverviewServiceTest {

    private final SourceStore sourceStore = new InProcessSourceStore();
    private final PolicyStore policyStore = new InProcessPolicyStore();
    private final SourceDocCounter docCounter = new InProcessSourceDocCounter();
    private SourceOverviewService service;

    @BeforeEach
    void setUp() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().setEnableLogin(false);
        UserServiceInterface userService = mock(UserServiceInterface.class);
        PolicyManagementAuthority authority = mock(PolicyManagementAuthority.class);
        SourceAccessGuard sourceGuard = new SourceAccessGuard(userService, properties, authority);
        PolicyAccessGuard policyGuard = new PolicyAccessGuard(userService, properties, authority);
        service =
                new SourceOverviewService(
                        sourceStore, policyStore, sourceGuard, policyGuard, docCounter);
    }

    @Test
    void eachSourceAppearsOnceWithItsReferenceCount() {
        Source a = source("A", "/a");
        Source b = source("B", "/b");
        Source c = source("C unused", "/c");
        policyReferencing("P1", a.id());
        policyReferencing("P2", a.id(), b.id());

        SourcesResponse response = service.overview();

        assertEquals(3, response.sources().size());
        // Sorted most-referenced first, so the shared source A leads.
        assertEquals(a.id(), response.sources().get(0).id());

        SourceView av = find(response, a.id());
        assertEquals(2, av.referenceCount());
        assertEquals("active", av.status());
        assertTrue(
                av.referencingPolicies().stream()
                        .map(SourceView.PolicyRef::name)
                        .toList()
                        .containsAll(List.of("P1", "P2")));
        assertTrue(
                av.config().stream()
                        .anyMatch(
                                row ->
                                        row.label().equals("Directory")
                                                && row.value().equals("/a")));

        assertEquals(1, find(response, b.id()).referenceCount());

        SourceView cv = find(response, c.id());
        assertEquals(0, cv.referenceCount());
        assertEquals("unused", cv.status());

        // KPI strip: total, in-use, orphaned.
        assertEquals(List.of(3L, 2L, 1L), response.kpis().stream().map(SourceKpi::value).toList());
    }

    @Test
    void aDisabledSourceReadsAsDisabled() {
        Source disabled =
                sourceStore.save(
                        new Source(
                                null,
                                "Paused",
                                "folder",
                                Map.of("directory", "/d"),
                                false,
                                "owner",
                                null));

        assertEquals("disabled", find(service.overview(), disabled.id()).status());
    }

    @Test
    void overviewLoadsOnlyTheCallersTeam() {
        // Login on, caller is on team 1. Another team's source and policy must be invisible, and a
        // cross-team policy referencing our source must not inflate its reference count.
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().setEnableLogin(true);
        UserServiceInterface userService = mock(UserServiceInterface.class);
        PolicyManagementAuthority authority = mock(PolicyManagementAuthority.class);
        when(authority.currentUserTeamId()).thenReturn(1L);
        SourceAccessGuard sourceGuard = new SourceAccessGuard(userService, properties, authority);
        PolicyAccessGuard policyGuard = new PolicyAccessGuard(userService, properties, authority);
        SourceOverviewService scoped =
                new SourceOverviewService(
                        sourceStore, policyStore, sourceGuard, policyGuard, docCounter);

        Source ours = teamSource("Ours", "/ours", 1L);
        teamSource("Theirs", "/theirs", 2L);
        teamPolicy("Our policy", 1L, ours.id());
        teamPolicy("Their policy", 2L, ours.id());

        SourcesResponse response = scoped.overview();

        assertEquals(1, response.sources().size());
        SourceView view = response.sources().get(0);
        assertEquals(ours.id(), view.id());
        assertEquals(1, view.referenceCount());
        assertEquals(List.of(1L, 1L, 0L), response.kpis().stream().map(SourceKpi::value).toList());
    }

    @Test
    void documentCountsReflectRecordedDocs() {
        Source a = source("A", "/a");
        Source b = source("B", "/b");
        docCounter.record(a.id(), 5);
        docCounter.record(a.id(), 3);

        SourceView av = find(service.overview(), a.id());
        assertEquals(8, av.docsTotal());
        assertEquals(8, av.docs24h());
        assertEquals(8, av.docs30d());

        // A source with no recorded documents reads as zero, not null.
        assertEquals(0, find(service.overview(), b.id()).docsTotal());
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

    private void policyReferencing(String name, String... sourceIds) {
        policyStore.save(
                new Policy(
                        null,
                        name,
                        "owner",
                        true,
                        null,
                        List.of(sourceIds),
                        List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                        OutputSpec.inline()));
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

    private static SourceView find(SourcesResponse response, String id) {
        return response.sources().stream()
                .filter(view -> view.id().equals(id))
                .findFirst()
                .orElseThrow();
    }
}
