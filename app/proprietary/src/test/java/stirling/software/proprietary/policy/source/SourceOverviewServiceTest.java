package stirling.software.proprietary.policy.source;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

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
    private SourceOverviewService service;

    @BeforeEach
    void setUp() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().setEnableLogin(false);
        UserServiceInterface userService = mock(UserServiceInterface.class);
        PolicyManagementAuthority authority = mock(PolicyManagementAuthority.class);
        SourceAccessGuard sourceGuard = new SourceAccessGuard(userService, properties, authority);
        PolicyAccessGuard policyGuard = new PolicyAccessGuard(userService, properties, authority);
        service = new SourceOverviewService(sourceStore, policyStore, sourceGuard, policyGuard);
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
    void documentVolumeIsNotTrackedYet() {
        Source a = source("A", "/a");
        assertNull(find(service.overview(), a.id()).docsTotal());
    }

    private Source source(String name, String directory) {
        return sourceStore.save(
                new Source(
                        null, name, "folder", Map.of("directory", directory), true, "owner", null));
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

    private static SourceView find(SourcesResponse response, String id) {
        return response.sources().stream()
                .filter(view -> view.id().equals(id))
                .findFirst()
                .orElseThrow();
    }
}
