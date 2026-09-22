package stirling.software.proprietary.policy.webhook;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class LegacyWebhookSpoolTest {

    @TempDir Path tempDir;

    @Test
    void countsLeftoverFilesWithoutTouchingThem() throws IOException {
        Path spool = tempDir.resolve("policy-webhook-spool");
        Files.createDirectories(spool.resolve("hook1"));
        Files.writeString(spool.resolve("hook1/a.pdf"), "a");
        Files.writeString(spool.resolve("hook1/b.pdf"), "b");

        LegacyWebhookSpool legacy = new LegacyWebhookSpool(spool);
        legacy.warnIfPresent();

        assertThat(legacy.countFiles()).isEqualTo(2);
        assertThat(Files.exists(spool.resolve("hook1/a.pdf"))).isTrue();
    }

    @Test
    void aMissingSpoolIsZeroNotAnError() {
        assertThat(new LegacyWebhookSpool(tempDir.resolve("never-made")).countFiles()).isZero();
    }
}
