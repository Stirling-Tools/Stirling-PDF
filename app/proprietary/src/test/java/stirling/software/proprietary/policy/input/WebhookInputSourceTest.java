package stirling.software.proprietary.policy.input;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.util.FileReadinessChecker;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.webhook.WebhookConfig;
import stirling.software.proprietary.policy.webhook.WebhookSpool;

@ExtendWith(MockitoExtension.class)
class WebhookInputSourceTest {

    private static final String POLICY = "p1";
    private static final String WEBHOOK_ID = "testwebhookid1234";

    @Mock private FileReadinessChecker readinessChecker;

    @TempDir Path tempDir;

    private WebhookSpool spool;
    private WebhookInputSource source;
    private InProcessProcessedLedger ledger;
    private RecordingContext ctx;

    @BeforeEach
    void setUp() {
        spool = new WebhookSpool(tempDir.resolve("spool"));
        source = new WebhookInputSource(spool, readinessChecker);
        ledger = new InProcessProcessedLedger();
        ctx = new RecordingContext();
        lenient().when(readinessChecker.isReady(any())).thenReturn(true);
    }

    private static InputSpec spec(String mode) {
        return new InputSpec(
                "webhook",
                Map.of("webhookId", WEBHOOK_ID, "signingSecret", "secret", "mode", mode));
    }

    @Test
    void consumeRemovesTheDeliveryOnceProcessed() throws IOException {
        Path delivered = spool.store(WEBHOOK_ID, "doc.pdf", "data".getBytes());

        List<ResolvedInput> work = source.resolve(spec("consume"), ctx);

        assertEquals(1, work.size());
        assertEquals("doc.pdf", work.get(0).inputs().primary().get(0).getFilename());
        assertTrue(Files.exists(delivered));
        assertTrue(source.resolve(spec("consume"), ctx).isEmpty());

        work.get(0).onComplete().accept(true);
        assertTrue(Files.notExists(delivered));
        assertTrue(source.resolve(spec("consume"), ctx).isEmpty());
    }

    @Test
    void aFailedRunLeavesTheDeliveryInPlace() throws IOException {
        Path delivered = spool.store(WEBHOOK_ID, "doc.pdf", "data".getBytes());

        List<ResolvedInput> work = source.resolve(spec("consume"), ctx);
        work.get(0).onComplete().accept(false);

        assertTrue(Files.exists(delivered));
    }

    @Test
    void nothingDeliveredIsAnEmptySourceNotAnError() throws IOException {
        List<ResolvedInput> work = source.resolve(spec("consume"), ctx);
        assertTrue(work.isEmpty());
        assertTrue(ctx.present.isEmpty());
    }

    @Test
    void validateRejectsMissingIdOrSecret() {
        assertThrows(
                IllegalArgumentException.class,
                () -> source.validate(new InputSpec("webhook", Map.of("signingSecret", "s"))));
        assertThrows(
                IllegalArgumentException.class,
                () -> source.validate(new InputSpec("webhook", Map.of("webhookId", WEBHOOK_ID))));
    }

    @Test
    void prepareMintsIdAndSecretOnCreate() {
        Map<String, Object> prepared =
                source.prepareOptionsForSave(Map.of("mode", "consume"), true);

        String id = prepared.get(WebhookConfig.WEBHOOK_ID_OPTION).toString();
        String secret = prepared.get(WebhookConfig.SIGNING_SECRET_OPTION).toString();
        assertFalse(id.isBlank());
        assertFalse(secret.isBlank());
        assertEquals("consume", prepared.get("mode"));
        Map<String, Object> other = source.prepareOptionsForSave(Map.of(), true);
        assertNotEquals(id, other.get(WebhookConfig.WEBHOOK_ID_OPTION).toString());
    }

    @Test
    void prepareLeavesAnExistingWebhookUntouchedOnEdit() {
        Map<String, Object> existing = Map.of("webhookId", WEBHOOK_ID, "signingSecret", "keepme");

        Map<String, Object> prepared = source.prepareOptionsForSave(existing, false);

        assertEquals(WEBHOOK_ID, prepared.get("webhookId"));
        assertEquals("keepme", prepared.get("signingSecret"));
    }

    @Test
    void prepareIgnoresClientSuppliedIdAndSecretOnCreate() {
        Map<String, Object> prepared =
                source.prepareOptionsForSave(
                        Map.of("webhookId", "client-chosen-id", "signingSecret", "weak"), true);

        assertNotEquals("client-chosen-id", prepared.get(WebhookConfig.WEBHOOK_ID_OPTION));
        assertNotEquals("weak", prepared.get(WebhookConfig.SIGNING_SECRET_OPTION));
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
