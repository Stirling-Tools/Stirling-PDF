package stirling.software.proprietary.policy.input;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.util.FileReadinessChecker;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.webhook.WebhookConfig;
import stirling.software.proprietary.policy.webhook.WebhookSpool;

/** Tests for {@link WebhookInputSource}: ledger-backed read/consume, and id/secret minting. */
@ExtendWith(MockitoExtension.class)
class WebhookInputSourceTest {

    private static final String POLICY = "p1";
    private static final String WEBHOOK_ID = "testwebhookid1234";

    @Mock private FileReadinessChecker readinessChecker;
    @Mock private S3InputSource s3InputSource;

    @TempDir Path tempDir;

    private WebhookSpool spool;
    private WebhookInputSource source;
    private InProcessProcessedLedger ledger;
    private RecordingContext ctx;

    @BeforeEach
    void setUp() {
        spool = new WebhookSpool(tempDir.resolve("spool"));
        source = new WebhookInputSource(spool, readinessChecker, s3InputSource);
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
        // In flight: still spooled, but a second sweep does not pick it up again.
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
    void snapshotReReadsEveryRunAndNeverDeletes() throws IOException {
        Path delivered = spool.store(WEBHOOK_ID, "doc.pdf", "data".getBytes());

        assertEquals(1, source.resolve(spec("snapshot"), ctx).size());
        List<ResolvedInput> second = source.resolve(spec("snapshot"), ctx);
        assertEquals(1, second.size());
        second.get(0).onComplete().accept(true);
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
        // Two creates never collide.
        Map<String, Object> other = source.prepareOptionsForSave(Map.of(), true);
        assertNotEquals(id, other.get(WebhookConfig.WEBHOOK_ID_OPTION).toString());
    }

    @Test
    void prepareLeavesAnExistingWebhookUntouchedOnEdit() {
        Map<String, Object> existing =
                Map.of("webhookId", WEBHOOK_ID, "signingSecret", "keepme", "mode", "snapshot");

        Map<String, Object> prepared = source.prepareOptionsForSave(existing, false);

        assertEquals(WEBHOOK_ID, prepared.get("webhookId"));
        assertEquals("keepme", prepared.get("signingSecret"));
    }

    @Test
    void aConnectionBackedWebhookDelegatesToTheS3SourceUnderItsReservedPrefix() throws IOException {
        when(s3InputSource.resolve(any(), any())).thenReturn(List.of());
        InputSpec spec =
                new InputSpec(
                        "webhook",
                        Map.of(
                                "webhookId",
                                WEBHOOK_ID,
                                "signingSecret",
                                "secret",
                                "mode",
                                "consume",
                                "connectionId",
                                7));

        source.resolve(spec, ctx);

        ArgumentCaptor<InputSpec> delegated = ArgumentCaptor.forClass(InputSpec.class);
        verify(s3InputSource).resolve(delegated.capture(), eq(ctx));
        InputSpec s3 = delegated.getValue();
        assertEquals("s3", s3.type());
        assertEquals(7L, ((Number) s3.options().get("connectionId")).longValue());
        assertEquals("stirling-webhook/" + WEBHOOK_ID, s3.options().get("prefix"));
        assertEquals("consume", s3.options().get("mode"));
    }

    @Test
    void aConnectionBackedWebhookValidatesTheConnectionThroughTheS3Source() {
        InputSpec spec =
                new InputSpec(
                        "webhook",
                        Map.of(
                                "webhookId",
                                WEBHOOK_ID,
                                "signingSecret",
                                "secret",
                                "connectionId",
                                7));

        source.validate(spec);

        // Save-time validation defers to the S3 source, which ownership-checks the connection.
        verify(s3InputSource).validate(any());
    }

    /** Policy-scoped context backed by the in-process ledger, recording presence reports. */
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
