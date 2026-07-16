package stirling.software.proprietary.policy.output;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
 * Tests for {@link OutputOverviewService}: every output appears once, annotated with the policies
 * that reference it (by {@code outputId}), its status derived from enabled + reference count, and
 * the KPI strip counting total / in-use / unused. Login disabled, so team guards pass through.
 */
class OutputOverviewServiceTest {

    private final OutputStore outputStore = new InProcessOutputStore();
    private final PolicyStore policyStore = new InProcessPolicyStore();
    private OutputOverviewService service;

    @BeforeEach
    void setUp() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().setEnableLogin(false);
        UserServiceInterface userService = mock(UserServiceInterface.class);
        PolicyManagementAuthority authority = mock(PolicyManagementAuthority.class);
        OutputAccessGuard outputGuard = new OutputAccessGuard(userService, properties, authority);
        PolicyAccessGuard policyGuard = new PolicyAccessGuard(userService, properties, authority);
        service = new OutputOverviewService(outputStore, policyStore, outputGuard, policyGuard);
    }

    @Test
    void countsReferencesAndDerivesStatus() {
        Output archive = outputStore.save(folder("Archive out", "/out"));
        outputStore.save(folder("Spare", "/spare"));
        policyStore.save(policyWritingTo("Compress + archive", archive.id()));
        policyStore.save(policyWritingTo("Redact + archive", archive.id()));

        OutputsResponse response = service.overview();

        assertEquals(2, response.outputs().size());
        // Sorted by reference count desc: the referenced one leads.
        OutputView first = response.outputs().get(0);
        assertEquals("Archive out", first.name());
        assertEquals(2, first.referenceCount());
        assertEquals("active", first.status());
        assertEquals(2, first.referencingPolicies().size());

        OutputView second = response.outputs().get(1);
        assertEquals("Spare", second.name());
        assertEquals(0, second.referenceCount());
        assertEquals("unused", second.status());

        // KPI strip: total, in-use, unused.
        assertEquals(List.of(2L, 1L, 1L), response.kpis().stream().map(OutputKpi::value).toList());
    }

    @Test
    void aDisabledOutputReadsAsDisabled() {
        outputStore.save(
                new Output(null, "Paused", "folder", Map.of("directory", "/p"), false, "o", null));

        OutputView view = service.overview().outputs().get(0);

        assertEquals("disabled", view.status());
    }

    private static Output folder(String name, String directory) {
        return new Output(
                null, name, "folder", Map.of("directory", directory), true, "owner", null);
    }

    private static Policy policyWritingTo(String name, String outputId) {
        return new Policy(
                        null,
                        name,
                        "owner",
                        true,
                        null,
                        List.of(),
                        List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                        OutputSpec.inline())
                .withOutputId(outputId);
    }
}
