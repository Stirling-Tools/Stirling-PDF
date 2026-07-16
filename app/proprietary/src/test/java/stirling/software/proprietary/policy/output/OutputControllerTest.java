package stirling.software.proprietary.policy.output;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.InProcessPolicyStore;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.util.SecretMasker;

/**
 * Tests for {@link OutputController}: the delete guard protects an output a policy still references
 * (409) while removing an unreferenced one, inline is rejected as a stored destination, and secrets
 * round-trip through the redaction sentinel. Login is disabled so editing and team scoping pass
 * through and each behaviour is exercised on its own.
 */
class OutputControllerTest {

    private final OutputStore outputStore = new InProcessOutputStore();
    private final PolicyStore policyStore = new InProcessPolicyStore();
    private OutputController controller;

    @BeforeEach
    void setUp() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().setEnableLogin(false);
        UserServiceInterface userService = mock(UserServiceInterface.class);
        PolicyManagementAuthority authority = mock(PolicyManagementAuthority.class);
        OutputAccessGuard outputGuard = new OutputAccessGuard(userService, properties, authority);
        PolicyAccessGuard policyGuard = new PolicyAccessGuard(userService, properties, authority);
        OutputOverviewService overviewService =
                new OutputOverviewService(outputStore, policyStore, outputGuard, policyGuard);
        // A permissive sink so config validation passes and save can be exercised.
        PolicyOutputSink folderSink = mock(PolicyOutputSink.class);
        when(folderSink.supports(any())).thenReturn(true);
        controller =
                new OutputController(
                        outputStore,
                        outputGuard,
                        overviewService,
                        policyStore,
                        policyGuard,
                        authority,
                        properties,
                        List.of(folderSink));
    }

    @Test
    void deletingAReferencedOutputConflicts() {
        Output output = outputStore.save(folderOutput());
        policyStore.save(policyWritingTo("Redact incoming", output.id()));

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> controller.delete(output.id()));

        assertEquals(409, ex.getStatusCode().value());
        assertTrue(outputStore.get(output.id()).isPresent());
    }

    @Test
    void deletingAnUnreferencedOutputSucceeds() {
        Output output = outputStore.save(folderOutput());

        ResponseEntity<Void> response = controller.delete(output.id());

        assertEquals(204, response.getStatusCode().value());
        assertTrue(outputStore.get(output.id()).isEmpty());
    }

    @Test
    void deletingAMissingOutputIsNotFound() {
        assertEquals(404, controller.delete("nope").getStatusCode().value());
    }

    @Test
    void inlineIsNotASaveableDestination() {
        Output inline = new Output(null, "Download", "inline", Map.of(), true, "owner", null);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> controller.save(inline));

        assertEquals(400, ex.getStatusCode().value());
    }

    @Test
    void readsReturnSecretsAsTheRedactionSentinel() {
        Output saved = outputStore.save(s3Output("shh"));

        Output read = controller.get(saved.id()).getBody();

        assertEquals(SecretMasker.REDACTED, read.options().get("secretAccessKey"));
        assertEquals("outbox", read.options().get("prefix"));
        assertEquals(
                "shh", outputStore.get(saved.id()).orElseThrow().options().get("secretAccessKey"));
    }

    @Test
    void savingTheSentinelBackKeepsTheStoredSecret() {
        Output saved = outputStore.save(s3Output("shh"));

        Output edited =
                new Output(
                        saved.id(),
                        "Renamed",
                        saved.type(),
                        Map.of("prefix", "outbox", "secretAccessKey", SecretMasker.REDACTED),
                        true,
                        saved.owner(),
                        saved.teamId());
        Output response = controller.save(edited).getBody();

        assertEquals(
                "shh", outputStore.get(saved.id()).orElseThrow().options().get("secretAccessKey"));
        assertEquals(SecretMasker.REDACTED, response.options().get("secretAccessKey"));
    }

    private static Output s3Output(String secret) {
        return new Output(
                null,
                "Processed bucket",
                "s3",
                Map.of("prefix", "outbox", "secretAccessKey", secret),
                true,
                "owner",
                null);
    }

    private static Output folderOutput() {
        return new Output(
                null, "Archive out", "folder", Map.of("directory", "/out"), true, "owner", null);
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
