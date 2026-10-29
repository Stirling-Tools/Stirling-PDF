package stirling.software.proprietary.policy.webhook;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockHttpServletRequest;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.input.ResolveContext;
import stirling.software.proprietary.policy.input.ResolvedInput;
import stirling.software.proprietary.policy.input.WebhookInputSource;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.trigger.WebhookTrigger;
import stirling.software.proprietary.storage.provider.LocalStorageProvider;

class WebhookLocalDeliveryE2eTest {

    private static final String POLICY = "p1";
    private static final String WEBHOOK_ID = "localwebhookid12";
    private static final String SECRET = "topsecret";

    @TempDir Path tempDir;

    private WebhookReceiverController receiver;
    private WebhookInputSource inputSource;
    private WebhookTrigger trigger;
    private InProcessProcessedLedger ledger;
    private RecordingContext ctx;

    @BeforeEach
    void setUp() {
        SourceStore sourceStore = new InProcessSourceStore();
        sourceStore.save(
                new Source(
                        "s1",
                        "Partner uploads",
                        "webhook",
                        Map.of("webhookId", WEBHOOK_ID, "signingSecret", SECRET, "mode", "consume"),
                        true,
                        WebhookTestUsers.OWNER,
                        null));
        WebhookDeliveries deliveries =
                new WebhookDeliveries(
                        new LocalStorageProvider(tempDir),
                        new InProcessWebhookDeliveryStore(),
                        WebhookTestUsers.knowingOnly(WebhookTestUsers.owner()));
        trigger = mock(WebhookTrigger.class);
        receiver =
                new WebhookReceiverController(
                        sourceStore, deliveries, trigger, new ApplicationProperties());
        inputSource = new WebhookInputSource(deliveries);
        ledger = new InProcessProcessedLedger();
        ctx = new RecordingContext();
    }

    @Test
    void aDeliveryIsStoredFiresTheTriggerThenIsReadAndConsumed() throws IOException {
        byte[] body = TestPdfs.minimal();
        String signature = WebhookSignatures.sign(SECRET, body);

        var response = receiver.receive(WEBHOOK_ID, signature, "invoice.pdf", request(body));
        assertThat(response.getStatusCode().value()).isEqualTo(202);
        verify(trigger).fireForWebhook(WEBHOOK_ID);
        assertThat(storedFiles()).isEqualTo(1);

        List<ResolvedInput> work = inputSource.resolve(spec(), ctx);
        assertThat(work).hasSize(1);
        assertThat(work.get(0).inputs().primary().get(0).getFilename()).isEqualTo("invoice.pdf");
        assertThat(read(work.get(0))).isEqualTo(body);
        assertThat(inputSource.resolve(spec(), ctx)).isEmpty();

        work.get(0).onComplete().accept(true);
        assertThat(inputSource.resolve(spec(), ctx)).isEmpty();
        assertThat(storedFiles()).isZero();
    }

    private static InputSpec spec() {
        return new InputSpec(
                "webhook",
                Map.of("webhookId", WEBHOOK_ID, "signingSecret", SECRET, "mode", "consume"));
    }

    private static MockHttpServletRequest request(byte[] body) {
        MockHttpServletRequest req =
                new MockHttpServletRequest("POST", "/api/v1/webhooks/" + WEBHOOK_ID);
        req.setContent(body);
        return req;
    }

    private static byte[] read(ResolvedInput unit) throws IOException {
        try (InputStream stream = unit.inputs().primary().get(0).getInputStream()) {
            return stream.readAllBytes();
        }
    }

    private long storedFiles() {
        try (Stream<Path> walk = Files.walk(tempDir)) {
            return walk.filter(Files::isRegularFile).count();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private class RecordingContext implements ResolveContext {

        private final List<String> present = new ArrayList<>();

        @Override
        public boolean claim(String identity, String gate, Supplier<String> contentHash) {
            return ledger.claim(POLICY, identity, gate, contentHash);
        }

        @Override
        public void settle(
                String identity, String finalGate, String finalContentHash, boolean success) {
            ledger.settle(POLICY, identity, finalGate, finalContentHash, success);
        }

        @Override
        public boolean allSettledDone(String identity) {
            return ledger.allSettledDone(identity);
        }

        @Override
        public void reportPresent(Collection<String> identities) {
            present.addAll(identities);
        }
    }
}
