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
    void removesTheRetiredSpoolAndItsFiles() throws IOException {
        Path spool = tempDir.resolve("policy-webhook-spool");
        Files.createDirectories(spool.resolve("hook1"));
        Files.writeString(spool.resolve("hook1/a.pdf"), "a");
        Files.writeString(spool.resolve("hook1/.b.pdf.part"), "b");

        new LegacyWebhookSpool(spool).removeIfPresent();

        assertThat(spool).doesNotExist();
        assertThat(tempDir).exists();
    }

    @Test
    void aMissingSpoolIsANoOp() {
        LegacyWebhookSpool legacy = new LegacyWebhookSpool(tempDir.resolve("never-made"));

        legacy.removeIfPresent();

        assertThat(legacy.countFiles()).isZero();
    }
}
