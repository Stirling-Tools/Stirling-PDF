package stirling.software.proprietary.policy.input;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.webhook.InProcessWebhookDeliveryStore;
import stirling.software.proprietary.policy.webhook.WebhookConfig;
import stirling.software.proprietary.policy.webhook.WebhookDeliveries;
import stirling.software.proprietary.policy.webhook.WebhookDelivery;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.storage.provider.LocalStorageProvider;

class WebhookInputSourceTest {

    private static final String POLICY = "p1";
    private static final String OTHER_POLICY = "p2";
    private static final String WEBHOOK_ID = "testwebhookid1234";

    @TempDir Path tempDir;

    private InProcessWebhookDeliveryStore index;
    private WebhookDeliveries deliveries;
    private WebhookInputSource source;
    private InProcessProcessedLedger ledger;
    private RecordingContext ctx;

    @BeforeEach
    void setUp() {
        Team team = new Team();
        team.setId(7L);
        User owner = new User();
        owner.setId(1L);
        owner.setUsername("owner");
        owner.setTeam(team);
        UserService users = mock(UserService.class);
        when(users.findByUsername(anyString())).thenReturn(Optional.empty());
        when(users.findByUsername("owner")).thenReturn(Optional.of(owner));

        index = new InProcessWebhookDeliveryStore();
        deliveries = new WebhookDeliveries(new LocalStorageProvider(tempDir), index, users);
        source = new WebhookInputSource(deliveries);
        ledger = new InProcessProcessedLedger();
        ctx = new RecordingContext(POLICY);
    }

    private static InputSpec spec() {
        return new InputSpec("webhook", Map.of("webhookId", WEBHOOK_ID, "signingSecret", "secret"));
    }

    private WebhookDelivery delivered(String name) throws IOException {
        Source webhook =
                new Source(
                        "s1",
                        "Partner uploads",
                        "webhook",
                        Map.of("webhookId", WEBHOOK_ID, "signingSecret", "secret"),
                        true,
                        "owner",
                        null);
        return deliveries.accept(webhook, name, null, "data".getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void aProcessedDeliveryIsRemovedFromStorageAndTheIndex() throws IOException {
        delivered("doc.pdf");

        List<ResolvedInput> work = source.resolve(spec(), ctx);

        assertEquals(1, work.size());
        assertEquals("doc.pdf", work.get(0).inputs().primary().get(0).getFilename());
        assertEquals(1, storedFiles());
        assertTrue(source.resolve(spec(), ctx).isEmpty()); // claimed, so not re-issued

        work.get(0).onComplete().accept(true);
        assertEquals(0, storedFiles());
        assertEquals(0, index.size());
        assertTrue(source.resolve(spec(), ctx).isEmpty());
    }

    @Test
    void aFailedRunKeepsTheDeliveryAndStampsTheFailure() throws IOException {
        delivered("doc.pdf");

        List<ResolvedInput> work = source.resolve(spec(), ctx);
        work.get(0).onComplete().accept(false);

        assertEquals(1, storedFiles());
        WebhookDelivery parked = index.forWebhook(WEBHOOK_ID).get(0);
        assertNotNull(parked.failedAt());
        assertTrue(source.resolve(spec(), ctx).isEmpty()); // parked, not retried unattended
    }

    @Test
    void aDeliveryIsKeptUntilEveryPolicyFedByTheWebhookHasSucceeded() throws IOException {
        delivered("shared.pdf");
        RecordingContext other = new RecordingContext(OTHER_POLICY);

        ResolvedInput first = source.resolve(spec(), ctx).get(0);
        ResolvedInput second = source.resolve(spec(), other).get(0);

        first.onComplete().accept(true);
        assertEquals(1, storedFiles()); // the other policy is still reading it

        second.onComplete().accept(true);
        assertEquals(0, storedFiles());
        assertEquals(0, index.size());
    }

    @Test
    void everyDeliveryIsReportedPresentWhetherOrNotItIsClaimed() throws IOException {
        WebhookDelivery a = delivered("a.pdf");
        WebhookDelivery b = delivered("b.pdf");
        source.resolve(spec(), ctx).get(0).onComplete().accept(false);
        ctx.present.clear();

        source.resolve(spec(), ctx);

        assertTrue(ctx.present.containsAll(List.of(a.identity(), b.identity())));
    }

    @Test
    void nothingDeliveredIsAnEmptySourceNotAnError() throws IOException {
        List<ResolvedInput> work = source.resolve(spec(), ctx);
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

    private long storedFiles() {
        try (Stream<Path> walk = Files.walk(tempDir)) {
            return walk.filter(Files::isRegularFile).count();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private class RecordingContext implements ResolveContext {

        private final String policyId;
        private final List<String> present = new ArrayList<>();

        private RecordingContext(String policyId) {
            this.policyId = policyId;
        }

        @Override
        public boolean claim(String identity, String gate, Supplier<String> contentHash) {
            return ledger.claim(policyId, identity, gate, contentHash);
        }

        @Override
        public void settle(
                String identity, String finalGate, String finalContentHash, boolean success) {
            ledger.settle(policyId, identity, finalGate, finalContentHash, success);
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
