package stirling.software.proprietary.policy.remote;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;

import stirling.software.proprietary.policy.input.ResolveContext;
import stirling.software.proprietary.policy.input.ResolvedInput;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.output.CloudDriveOutputSink;
import stirling.software.proprietary.policy.output.OutputDelivery;

public abstract class CloudDriveContract<L extends CloudLocation, F extends CloudFile> {

    protected static final String POLICY = "p1";

    protected InProcessProcessedLedger ledger;
    private CloudDriveInputSource<L, F> source;
    private CloudDriveOutputSink<L, F> sink;

    protected abstract CloudDrive<L, F> drive() throws Exception;

    protected abstract String type();

    protected abstract Map<String, Object> options(String folder, Map<String, Object> extra);

    protected abstract void put(String folder, String name, String content) throws Exception;

    protected abstract String content(String folder, String name) throws Exception;

    @BeforeEach
    void wireContract() throws Exception {
        CloudDrive<L, F> drive = drive();
        ledger = new InProcessProcessedLedger();
        source = new CloudDriveInputSource<>(drive) {};
        sink = new CloudDriveOutputSink<>(drive, ledger) {};
    }

    private List<ResolvedInput> sweep(String mode, String policy) throws IOException {
        return source.resolve(
                new InputSpec(type(), options("Inbox", Map.of("mode", mode))), new Ctx(policy));
    }

    @Test
    void consumeReadsThenRemovesOnlyAfterSuccess() throws Exception {
        put("Inbox", "a.pdf", "first");
        put("Inbox", "b.pdf", "second");

        List<ResolvedInput> work = sweep("consume", POLICY);

        assertThat(work).hasSize(2);
        ResolvedInput first =
                work.stream()
                        .filter(w -> "a.pdf".equals(w.inputs().primary().getFirst().getFilename()))
                        .findFirst()
                        .orElseThrow();
        try (InputStream in = first.inputs().primary().getFirst().getInputStream()) {
            assertThat(new String(in.readAllBytes(), StandardCharsets.UTF_8)).isEqualTo("first");
        }
        assertThat(sweep("consume", POLICY)).isEmpty();
        first.onComplete().accept(true);
        work.stream().filter(w -> w != first).findFirst().orElseThrow().onComplete().accept(false);

        assertThat(content("Inbox", "a.pdf")).isNull();
        assertThat(content("Inbox", "b.pdf")).isEqualTo("second");
    }

    @Test
    void aFileReplacedMidRunIsKeptAndClaimedAgain() throws Exception {
        put("Inbox", "doc.pdf", "v1");
        List<ResolvedInput> work = sweep("consume", POLICY);

        put("Inbox", "doc.pdf", "v2 is a different version");
        work.getFirst().onComplete().accept(true);

        assertThat(content("Inbox", "doc.pdf")).isEqualTo("v2 is a different version");
        assertThat(sweep("consume", POLICY)).hasSize(1);
    }

    @Test
    void aSharedFileIsRemovedOnlyOnceEveryPolicyIsDone() throws Exception {
        put("Inbox", "doc.pdf", "shared");
        List<ResolvedInput> mine = sweep("consume", POLICY);
        List<ResolvedInput> theirs = sweep("consume", "p2");

        mine.getFirst().onComplete().accept(true);
        assertThat(content("Inbox", "doc.pdf")).isEqualTo("shared");
        theirs.getFirst().onComplete().accept(true);
        assertThat(content("Inbox", "doc.pdf")).isNull();
    }

    @Test
    void trackKeepsOriginalsAndProcessesEachVersionOnce() throws Exception {
        put("Inbox", "doc.pdf", "v1");
        sweep("track", POLICY).getFirst().onComplete().accept(true);

        assertThat(content("Inbox", "doc.pdf")).isEqualTo("v1");
        assertThat(sweep("track", POLICY)).isEmpty();
        put("Inbox", "doc.pdf", "v2 changed");
        assertThat(sweep("track", POLICY)).hasSize(1);
    }

    @Test
    void snapshotSeesEverythingEveryTime() throws Exception {
        put("Inbox", "doc.pdf", "x");
        assertThat(sweep("snapshot", POLICY)).hasSize(1);
        assertThat(sweep("snapshot", POLICY)).hasSize(1);
    }

    @Test
    void outputsNeverReplaceAnExistingName() throws Exception {
        put("Done", "report.pdf", "already here");

        sink.deliver(
                new OutputDelivery("run-1", POLICY),
                List.of(named("new one", "report.pdf"), named("newer", "report.pdf")),
                new OutputSpec(type(), options("Done", Map.of())));

        assertThat(content("Done", "report.pdf")).isEqualTo("already here");
        assertThat(content("Done", "report (1).pdf")).isEqualTo("new one");
        assertThat(content("Done", "report (2).pdf")).isEqualTo("newer");
    }

    @Test
    void aPolicyNeverReingestsItsOwnOutput() throws Exception {
        put("Inbox", "original.pdf", "original");
        sweep("track", POLICY).getFirst().onComplete().accept(true);

        sink.deliver(
                new OutputDelivery("run-1", POLICY),
                List.of(named("processed output", "processed.pdf")),
                new OutputSpec(type(), options("Inbox", Map.of())));

        assertThat(sweep("track", POLICY)).isEmpty();
        assertThat(sweep("track", "p2")).hasSize(2);
    }

    @Test
    void aMissingFolderIsAnErrorNotAnEmptyListing() {
        InputSpec missing = new InputSpec(type(), options("Nowhere", Map.of()));
        assertThrows(IOException.class, () -> source.resolve(missing, new Ctx(POLICY)));
        assertThrows(IllegalArgumentException.class, () -> source.validate(missing));
    }

    protected static ByteArrayResource named(String text, String name) {
        return new ByteArrayResource(text.getBytes(StandardCharsets.UTF_8)) {
            @Override
            public String getFilename() {
                return name;
            }
        };
    }

    private final class Ctx implements ResolveContext {
        private final String policyId;

        private Ctx(String policyId) {
            this.policyId = policyId;
        }

        @Override
        public boolean claim(String identity, String gate, Supplier<String> contentHash) {
            return ledger.claim(policyId, identity, gate, contentHash);
        }

        @Override
        public void settle(String identity, String gate, String hash, boolean success) {
            ledger.settle(policyId, identity, gate, hash, success);
        }

        @Override
        public boolean allSettledDone(String identity) {
            return ledger.allSettledDone(identity);
        }

        @Override
        public void reportPresent(Collection<String> identities) {}
    }
}
