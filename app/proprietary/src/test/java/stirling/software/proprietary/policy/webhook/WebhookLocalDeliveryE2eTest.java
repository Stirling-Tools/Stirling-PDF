package stirling.software.proprietary.policy.webhook;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockHttpServletRequest;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.FileReadinessChecker;
import stirling.software.proprietary.policy.input.ResolveContext;
import stirling.software.proprietary.policy.input.ResolvedInput;
import stirling.software.proprietary.policy.input.WebhookInputSource;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.trigger.WebhookTrigger;

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
        WebhookSpool spool = new WebhookSpool(tempDir.resolve("spool"));
        SourceStore sourceStore = new InProcessSourceStore();
        sourceStore.save(
                new Source(
                        "s1",
                        "Partner uploads",
                        "webhook",
                        Map.of("webhookId", WEBHOOK_ID, "signingSecret", SECRET, "mode", "consume"),
                        true,
                        "owner",
                        null));
        trigger = mock(WebhookTrigger.class);
        FileReadinessChecker readiness = mock(FileReadinessChecker.class);
        when(readiness.isReady(any())).thenReturn(true);
        receiver =
                new WebhookReceiverController(
                        sourceStore, spool, trigger, new ApplicationProperties());
        inputSource = new WebhookInputSource(spool, readiness);
        ledger = new InProcessProcessedLedger();
        ctx = new RecordingContext();
    }

    @Test
    void aDeliveryIsSpooledFiresTheTriggerThenIsReadAndConsumed() throws IOException {
        byte[] body = "a pdf".getBytes(StandardCharsets.UTF_8);
        String signature = WebhookSignatures.sign(SECRET, body);

        var response = receiver.receive(WEBHOOK_ID, signature, "invoice.pdf", request(body));
        assertThat(response.getStatusCode().value()).isEqualTo(202);
        verify(trigger).fireForWebhook(WEBHOOK_ID);

        List<ResolvedInput> work = inputSource.resolve(spec(), ctx);
        assertThat(work).hasSize(1);
        assertThat(work.get(0).inputs().primary().get(0).getFilename()).isEqualTo("invoice.pdf");
        assertThat(read(work.get(0))).isEqualTo("a pdf");
        assertThat(inputSource.resolve(spec(), ctx)).isEmpty();

        work.get(0).onComplete().accept(true);
        assertThat(inputSource.resolve(spec(), ctx)).isEmpty();
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

    private static String read(ResolvedInput unit) throws IOException {
        try (InputStream stream = unit.inputs().primary().get(0).getInputStream()) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
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
