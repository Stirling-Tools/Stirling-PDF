package stirling.software.proprietary.policy.webhook;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.storage.provider.LocalStorageProvider;

class WebhookDeliveryRetentionTest {

    private static final String WEBHOOK_ID = "retentiontestid1";
    private static final long DAY = 24L * 60 * 60 * 1000;

    @TempDir Path tempDir;

    private final AtomicLong clock = new AtomicLong(10 * DAY);
    private InProcessWebhookDeliveryStore index;
    private InProcessProcessedLedger ledger;
    private WebhookDeliveries deliveries;
    private WebhookDeliveryRetention retention;

    @BeforeEach
    void setUp() {
        index = new InProcessWebhookDeliveryStore();
        ledger = new InProcessProcessedLedger(clock::get);
        deliveries =
                new WebhookDeliveries(
                        new LocalStorageProvider(tempDir),
                        index,
                        WebhookTestUsers.knowingOnly(WebhookTestUsers.owner()),
                        clock::get);
        retention = new WebhookDeliveryRetention(deliveries, index, ledger, clock::get);
    }

    private WebhookDelivery delivered(String name) throws IOException {
        Source source =
                new Source(
                        "s1",
                        "Partner uploads",
                        "webhook",
                        Map.of("webhookId", WEBHOOK_ID, "signingSecret", "secret"),
                        true,
                        WebhookTestUsers.OWNER,
                        null);
        return deliveries.accept(source, name, null, "doc".getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void aFailureOlderThanTheWindowIsPurged() throws IOException {
        WebhookDelivery delivery = delivered("old.pdf");
        deliveries.recordFailure(delivery);
        clock.addAndGet(WebhookDeliveryRetention.RETENTION.toMillis() + 1);

        retention.purgeExpiredFailures();

        assertThat(index.size()).isZero();
        assertThat(filesUnder(tempDir)).isZero();
    }

    @Test
    void aRecentFailureIsKept() throws IOException {
        WebhookDelivery delivery = delivered("recent.pdf");
        deliveries.recordFailure(delivery);
        clock.addAndGet(WebhookDeliveryRetention.RETENTION.toMillis() - DAY);

        retention.purgeExpiredFailures();

        assertThat(index.size()).isEqualTo(1);
    }

    @Test
    void aDeliveryThatNeverFailedIsNeverPurged() throws IOException {
        delivered("pending.pdf");
        clock.addAndGet(100 * DAY);

        retention.purgeExpiredFailures();

        assertThat(index.size()).isEqualTo(1);
    }

    @Test
    void aRetryStillInFlightProtectsAnOldFailure() throws IOException {
        WebhookDelivery delivery = delivered("retrying.pdf");
        deliveries.recordFailure(delivery);
        clock.addAndGet(WebhookDeliveryRetention.RETENTION.toMillis() + 1);
        // A user-invoked sweep on another policy has just picked it up.
        assertThat(ledger.claim("p2", delivery.identity(), delivery.gate(), null)).isTrue();

        retention.purgeExpiredFailures();
        assertThat(index.size()).isEqualTo(1);

        ledger.settle("p2", delivery.identity(), delivery.gate(), null, false);
        retention.purgeExpiredFailures();
        assertThat(index.size()).isZero();
    }

    @Test
    void theWindowRestartsFromTheLatestFailure() throws IOException {
        WebhookDelivery delivery = delivered("again.pdf");
        deliveries.recordFailure(delivery);
        clock.addAndGet(6 * DAY);
        deliveries.recordFailure(index.forWebhook(WEBHOOK_ID).get(0));
        clock.addAndGet(2 * DAY);

        retention.purgeExpiredFailures();

        assertThat(index.size()).isEqualTo(1);
    }

    private static long filesUnder(Path root) {
        try (Stream<Path> walk = Files.walk(root)) {
            return walk.filter(Files::isRegularFile).count();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}
