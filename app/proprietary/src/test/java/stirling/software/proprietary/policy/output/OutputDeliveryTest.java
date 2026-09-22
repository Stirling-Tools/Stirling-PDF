package stirling.software.proprietary.policy.output;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.FileSystemResource;

import stirling.software.proprietary.policy.model.*;

class OutputDeliveryTest {
    private static OutputDelivery delivery(
            String source, String document, String user, String path) {
        var run =
                new PolicyRun(
                        "run",
                        "policy",
                        new PipelineDefinition("test", List.of(), OutputSpec.inline()),
                        source,
                        document,
                        user);
        return OutputDelivery.forRun(run, PolicyInputs.of(List.of(new FileSystemResource(path))));
    }

    @Test
    void editorRetriesShareAnIdentityWithinTheSubmittingUser() {
        var first = delivery(null, "workspace-id", "alice", "/tmp/first");
        var retry = delivery(null, "workspace-id", "alice", "/tmp/retry");
        assertEquals(first.documentIdentity(), retry.documentIdentity());
        assertNotEquals(
                first.documentIdentity(),
                delivery(null, "workspace-id", "bob", "/tmp/third").documentIdentity());
    }

    @Test
    void sourceIdentityDoesNotDependOnWhoTriggeredTheRun() {
        assertEquals(
                delivery("source", "file", null, "/input/pdf").documentIdentity(),
                delivery("source", "file", "alice", "/input/pdf").documentIdentity());
        assertNotEquals(
                delivery("source", "file", null, "/input/pdf").documentIdentity(),
                delivery("another", "file", null, "/input/pdf").documentIdentity());
    }

    @Test
    void snapshotsUseTheirOriginalLocationAndAnonymousUploadsUseTheCorpusIdentity() {
        assertEquals(
                delivery("source", null, null, "/input/pdf").documentIdentity(),
                delivery("source", null, "alice", "/input/pdf").documentIdentity());
        assertNull(delivery(null, null, "alice", "/tmp/upload").documentIdentity());
    }
}
