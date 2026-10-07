package stirling.software.proprietary.policy.webhook;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.storage.crypto.EncryptingStorageProvider;
import stirling.software.proprietary.storage.crypto.FileEncryptionKeyService;
import stirling.software.proprietary.storage.crypto.FileEncryptionMasterKey;
import stirling.software.proprietary.storage.crypto.InMemoryKeyRepo;
import stirling.software.proprietary.storage.provider.LocalStorageProvider;
import stirling.software.proprietary.storage.provider.StorageProvider;

class WebhookDeliveriesTest {

    private static final String WEBHOOK_ID = "deliveriestestid";
    private static final String MASTER =
            Base64.getEncoder()
                    .encodeToString(
                            "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.UTF_8));
    private static final byte[] BODY = "the delivered document".getBytes(StandardCharsets.UTF_8);

    @TempDir Path tempDir;

    private LocalStorageProvider disk;
    private InProcessWebhookDeliveryStore index;
    private User owner;

    @BeforeEach
    void setUp() {
        disk = new LocalStorageProvider(tempDir);
        index = new InProcessWebhookDeliveryStore();
        owner = WebhookTestUsers.owner();
    }

    private static Source source(String ownerUsername) {
        return new Source(
                "s1",
                "Partner uploads",
                "webhook",
                Map.of("webhookId", WEBHOOK_ID, "signingSecret", "secret"),
                true,
                ownerUsername,
                null);
    }

    private WebhookDeliveries deliveries(StorageProvider storage, UserService users) {
        return new WebhookDeliveries(storage, index, users, () -> 1_000L);
    }

    @Test
    void aDeliveryLandsEncryptedWhenTheStorageFlagIsOn() throws IOException {
        StorageProvider encrypting =
                new EncryptingStorageProvider(
                        disk,
                        new FileEncryptionKeyService(
                                new InMemoryKeyRepo().mock,
                                new FileEncryptionMasterKey(MASTER, false)),
                        true);
        WebhookDeliveries deliveries = deliveries(encrypting, WebhookTestUsers.knowingOnly(owner));

        WebhookDelivery delivery =
                deliveries.accept(
                        source(WebhookTestUsers.OWNER), "invoice.pdf", "application/pdf", BODY);

        byte[] onDisk = Files.readAllBytes(onlyFileUnder(tempDir));
        assertThat(new String(onDisk, 0, 8, StandardCharsets.US_ASCII)).isEqualTo("SPDFEAR1");
        assertThat(new String(onDisk, StandardCharsets.ISO_8859_1))
                .doesNotContain("the delivered document");
        assertThat(read(deliveries, delivery)).isEqualTo("the delivered document");
        assertThat(deliveries.open(delivery).getFilename()).isEqualTo("invoice.pdf");
    }

    @Test
    void theStorageOwnerIsTheSourceOwner() throws IOException {
        WebhookDeliveries deliveries = deliveries(disk, WebhookTestUsers.knowingOnly(owner));

        WebhookDelivery delivery =
                deliveries.accept(source(WebhookTestUsers.OWNER), "a.pdf", null, BODY);

        // LocalStorageProvider prefixes keys with the owner's id, which is what scopes them.
        assertThat(delivery.storageKey()).startsWith(owner.getId() + "/");
        assertThat(delivery.identity()).isEqualTo(WEBHOOK_ID + "/" + delivery.id() + "-a.pdf");
        assertThat(delivery.failedAt()).isNull();
    }

    @Test
    void aSourceWithoutAnOwnerStoresUnderTheInternalApiUser() throws IOException {
        User internal = new User();
        internal.setId(99L);
        internal.setUsername(Role.INTERNAL_API_USER.getRoleId());
        WebhookDeliveries deliveries = deliveries(disk, WebhookTestUsers.knowingOnly(internal));

        WebhookDelivery delivery = deliveries.accept(source(null), "a.pdf", null, BODY);

        assertThat(delivery.storageKey()).startsWith("99/");
    }

    @Test
    void noResolvableOwnerRefusesTheDeliveryAndStoresNothing() {
        UserService nobody = mock(UserService.class);
        when(nobody.findByUsername(any())).thenReturn(Optional.empty());
        WebhookDeliveries deliveries = deliveries(disk, nobody);

        assertThatThrownBy(() -> deliveries.accept(source("ghost"), "a.pdf", null, BODY))
                .isInstanceOf(IllegalStateException.class);
        assertThat(index.size()).isZero();
        assertThat(filesUnder(tempDir)).isZero();
    }

    @Test
    void anIndexFailureTakesTheBlobBackOut() {
        WebhookDeliveryStore failing = spy(new InProcessWebhookDeliveryStore());
        doThrow(new IllegalStateException("db down")).when(failing).save(any());
        WebhookDeliveries deliveries =
                new WebhookDeliveries(disk, failing, WebhookTestUsers.knowingOnly(owner));

        assertThatThrownBy(
                        () ->
                                deliveries.accept(
                                        source(WebhookTestUsers.OWNER), "a.pdf", null, BODY))
                .isInstanceOf(IllegalStateException.class);
        assertThat(filesUnder(tempDir)).isZero();
    }

    @Test
    void discardRemovesBytesAndRowAndIsIdempotent() throws IOException {
        WebhookDeliveries deliveries = deliveries(disk, WebhookTestUsers.knowingOnly(owner));
        WebhookDelivery delivery =
                deliveries.accept(source(WebhookTestUsers.OWNER), "a.pdf", null, BODY);

        deliveries.discard(delivery);
        deliveries.discard(delivery);

        assertThat(index.size()).isZero();
        assertThat(filesUnder(tempDir)).isZero();
    }

    @Test
    void recordFailureStampsTheClockAndKeepsTheDelivery() throws IOException {
        WebhookDeliveries deliveries = deliveries(disk, WebhookTestUsers.knowingOnly(owner));
        WebhookDelivery delivery =
                deliveries.accept(source(WebhookTestUsers.OWNER), "a.pdf", null, BODY);

        deliveries.recordFailure(delivery);

        assertThat(index.forWebhook(WEBHOOK_ID))
                .singleElement()
                .extracting(WebhookDelivery::failedAt)
                .isEqualTo(1_000L);
        assertThat(filesUnder(tempDir)).isEqualTo(1);
    }

    @Test
    void filenamesAreReducedToASafeBasename() {
        assertThat(WebhookDeliveries.sanitizeFilename("../../etc/passwd")).isEqualTo("passwd");
        assertThat(WebhookDeliveries.sanitizeFilename("C:\\docs\\Q1 report.pdf"))
                .isEqualTo("Q1_report.pdf");
        assertThat(WebhookDeliveries.sanitizeFilename(".hidden")).isEqualTo("hidden");
        assertThat(WebhookDeliveries.sanitizeFilename(null)).isEqualTo("document.pdf");
        assertThat(WebhookDeliveries.sanitizeFilename("...")).isEqualTo("document.pdf");
    }

    private static String read(WebhookDeliveries deliveries, WebhookDelivery delivery)
            throws IOException {
        try (InputStream in = deliveries.open(delivery).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static Path onlyFileUnder(Path root) throws IOException {
        try (Stream<Path> walk = Files.walk(root)) {
            return walk.filter(Files::isRegularFile).findFirst().orElseThrow();
        }
    }

    private static long filesUnder(Path root) {
        try (Stream<Path> walk = Files.walk(root)) {
            return walk.filter(Files::isRegularFile).count();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}
