package stirling.software.proprietary.storage.provider;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.proprietary.security.model.User;

class LocalStorageProviderTest {

    @TempDir Path tempDir;

    @Test
    void storeFromPathMovesTheFileAndExposesItThroughLoad() throws Exception {
        Path storageRoot = tempDir.resolve("storage");
        Path source = tempDir.resolve("incoming.pdf");
        byte[] content = "pdf-bytes".getBytes();
        Files.write(source, content);
        LocalStorageProvider provider = new LocalStorageProvider(storageRoot);
        User owner = new User();
        owner.setId(7L);

        StoredObject stored =
                provider.storeFromPath(owner, source, "incoming.pdf", "application/pdf");

        assertThat(stored.getSizeBytes()).isEqualTo(content.length);
        assertThat(stored.getOriginalFilename()).isEqualTo("incoming.pdf");
        assertThat(stored.getContentType()).isEqualTo("application/pdf");
        assertThat(source).doesNotExist();
        assertThat(provider.load(stored.getStorageKey()).getInputStream().readAllBytes())
                .isEqualTo(content);
    }
}
