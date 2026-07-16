package stirling.software.proprietary.policy.output;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.InProcessPolicyStore;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Tests for {@link PolicyInlineOutputMigration}: policies carrying a folder/S3 destination inline
 * are rewritten to reference a created {@link Output} by id; inline (return-to-caller) policies are
 * left untouched; the pass is idempotent; and two policies sharing a destination in the same team
 * share one Output.
 */
class PolicyInlineOutputMigrationTest {

    private final PolicyStore policyStore = new InProcessPolicyStore();
    private final OutputStore outputStore = new InProcessOutputStore();
    private final PolicyInlineOutputMigration migration =
            new PolicyInlineOutputMigration(policyStore, outputStore);

    @Test
    void migratesAFolderPolicyToAStoredOutput() {
        Policy saved = policyStore.save(folderPolicy("Archive", "/out"));

        migration.migrate();

        Policy migrated = policyStore.get(saved.id()).orElseThrow();
        assertNotNull(migrated.outputId());
        Output output = outputStore.get(migrated.outputId()).orElseThrow();
        assertEquals("folder", output.type());
        assertEquals("/out", output.options().get("directory"));
    }

    @Test
    void leavesInlinePoliciesUntouched() {
        Policy saved =
                policyStore.save(
                        new Policy(
                                null,
                                "Editor run",
                                "owner",
                                true,
                                null,
                                List.of(),
                                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                                OutputSpec.inline()));

        migration.migrate();

        assertNull(policyStore.get(saved.id()).orElseThrow().outputId());
        assertTrue(outputStore.all().isEmpty());
    }

    @Test
    void isIdempotent() {
        policyStore.save(folderPolicy("Archive", "/out"));

        migration.migrate();
        int afterFirst = outputStore.all().size();
        migration.migrate();

        assertEquals(afterFirst, outputStore.all().size());
    }

    @Test
    void dedupesASharedDestinationWithinATeam() {
        policyStore.save(teamFolderPolicy("A", "/shared", 7L));
        policyStore.save(teamFolderPolicy("B", "/shared", 7L));

        migration.migrate();

        assertEquals(1, outputStore.all().size());
    }

    private static Policy folderPolicy(String name, String directory) {
        return new Policy(
                null,
                name,
                "owner",
                true,
                null,
                List.of(),
                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                OutputSpec.folder(directory));
    }

    private static Policy teamFolderPolicy(String name, String directory, Long teamId) {
        return new Policy(
                null,
                name,
                "owner",
                true,
                null,
                List.of(),
                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                OutputSpec.folder(directory),
                teamId);
    }
}
