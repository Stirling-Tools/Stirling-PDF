package stirling.software.proprietary.storage.crypto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Base64;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.FileEncryptionKey;
import stirling.software.proprietary.storage.provider.LocalStorageProvider;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.provider.StoredObject;

class EncryptingStorageProviderTest {

    private static final byte[] PLAINTEXT =
            "This is the secret PDF payload used to prove round-trips work."
                    .getBytes(StandardCharsets.UTF_8);
    private static final String MASTER =
            Base64.getEncoder()
                    .encodeToString(
                            "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.UTF_8));

    @TempDir Path tempDir;

    private InMemoryKeyRepo repo;
    private LocalStorageProvider inner;
    private EncryptingStorageProvider provider;
    private User owner;

    @BeforeEach
    void setUp() {
        repo = new InMemoryKeyRepo();
        inner = new LocalStorageProvider(tempDir);
        provider = new EncryptingStorageProvider(inner, newKeyService(), true);
        Team team = new Team();
        team.setId(7L);
        owner = new User();
        owner.setId(1L);
        owner.setTeam(team);
    }

    private FileEncryptionKeyService newKeyService() {
        return new FileEncryptionKeyService(repo.mock, new FileEncryptionMasterKey(MASTER, false));
    }

    private static MultipartFile upload() {
        return new MockMultipartFile("file", "test.pdf", "application/pdf", PLAINTEXT);
    }

    @Test
    void store_load_roundTripsAndKeepsPlaintextMetadata() throws IOException {
        StoredObject stored = provider.store(owner, upload());

        assertThat(stored.getSizeBytes()).isEqualTo(PLAINTEXT.length);
        assertThat(stored.getEncryptionKeyId()).isNotNull();
        assertThat(stored.getOriginalFilename()).isEqualTo("test.pdf");

        Resource loaded = provider.load(stored.getStorageKey());
        assertThat(loaded.contentLength()).isEqualTo(PLAINTEXT.length);
        try (InputStream in = loaded.getInputStream()) {
            assertThat(in.readAllBytes()).isEqualTo(PLAINTEXT);
        }
        // Re-openable resources must support a second full read (e.g. retry after range abort).
        try (InputStream in = loaded.getInputStream()) {
            assertThat(in.readAllBytes()).isEqualTo(PLAINTEXT);
        }
    }

    @Test
    void store_writesOnlyCiphertextToDisk() throws IOException {
        StoredObject stored = provider.store(owner, upload());
        byte[] onDisk = Files.readAllBytes(tempDir.resolve(stored.getStorageKey()));

        assertThat(new String(onDisk, 0, 8, StandardCharsets.US_ASCII)).isEqualTo("SPDFEAR1");
        assertThat(new String(onDisk, StandardCharsets.ISO_8859_1)).doesNotContain("secret");
        assertThat(onDisk.length).isGreaterThan(PLAINTEXT.length);
    }

    @Test
    void load_legacyPlaintextBlob_passesThroughUntouched() throws IOException {
        StoredObject legacy = inner.store(owner, upload());
        Resource loaded = provider.load(legacy.getStorageKey());
        try (InputStream in = loaded.getInputStream()) {
            assertThat(in.readAllBytes()).isEqualTo(PLAINTEXT);
        }
    }

    @Test
    void store_writeDisabled_staysPlaintextButLoadStillDecrypts() throws IOException {
        StoredObject encrypted = provider.store(owner, upload());

        EncryptingStorageProvider decryptOnly =
                new EncryptingStorageProvider(inner, newKeyService(), false);
        StoredObject plain = decryptOnly.store(owner, upload());

        assertThat(plain.getEncryptionKeyId()).isNull();
        byte[] onDisk = Files.readAllBytes(tempDir.resolve(plain.getStorageKey()));
        assertThat(onDisk).isEqualTo(PLAINTEXT);

        // Decrypt-only mode still reads previously encrypted content.
        try (InputStream in = decryptOnly.load(encrypted.getStorageKey()).getInputStream()) {
            assertThat(in.readAllBytes()).isEqualTo(PLAINTEXT);
        }
    }

    @Test
    void load_disabledKey_failsClosed() throws IOException {
        StoredObject stored = provider.store(owner, upload());
        repo.rows
                .get(UUID.fromString(stored.getEncryptionKeyId()))
                .setStatus(FileEncryptionKey.Status.DISABLED);

        // Fresh service = fresh unwrap cache, as another node would see it.
        EncryptingStorageProvider fresh =
                new EncryptingStorageProvider(inner, newKeyService(), true);
        assertThatThrownBy(() -> fresh.load(stored.getStorageKey()))
                .isInstanceOf(StorageEncryptionException.class)
                .hasMessageContaining("disabled");
    }

    @Test
    void load_tamperedPayload_failsAuthentication() throws IOException {
        StoredObject stored = provider.store(owner, upload());
        Path blob = tempDir.resolve(stored.getStorageKey());
        byte[] bytes = Files.readAllBytes(blob);
        bytes[EncryptedFileFormat.HEADER_LENGTH + 20] ^= 0x42; // flip a payload bit
        Files.write(blob, bytes);

        Resource loaded = provider.load(stored.getStorageKey());
        assertThatThrownBy(
                        () -> {
                            try (InputStream in = loaded.getInputStream()) {
                                in.readAllBytes();
                            }
                        })
                .isInstanceOf(IOException.class);
    }

    @Test
    void load_tamperedHeaderKeyId_failsAuthentication() throws IOException {
        StoredObject stored = provider.store(owner, upload());
        // Second key so the swapped-in id exists and is ACTIVE.
        Team otherTeam = new Team();
        otherTeam.setId(99L);
        User otherOwner = new User();
        otherOwner.setId(2L);
        otherOwner.setTeam(otherTeam);
        StoredObject other = provider.store(otherOwner, upload());

        Path blob = tempDir.resolve(stored.getStorageKey());
        byte[] bytes = Files.readAllBytes(blob);
        byte[] otherBytes = Files.readAllBytes(tempDir.resolve(other.getStorageKey()));
        System.arraycopy(otherBytes, 10, bytes, 10, 16); // transplant the other key id
        Files.write(blob, bytes);

        assertThatThrownBy(() -> provider.load(stored.getStorageKey()))
                .isInstanceOf(StorageEncryptionException.class);
    }

    @Test
    void signedDownloadUrl_isSuppressed() throws IOException {
        StoredObject stored = provider.store(owner, upload());
        assertThat(provider.signedDownloadUrl(stored.getStorageKey(), Duration.ofMinutes(5)))
                .isEmpty();
        assertThat(
                        provider.signedDownloadUrl(
                                stored.getStorageKey(), Duration.ofMinutes(5), true, "a.pdf"))
                .isEmpty();
    }

    @Test
    void load_oneShotStreamBackend_roundTrips() throws IOException {
        // Simulates S3: load() hands back a single-use InputStreamResource.
        StorageProvider oneShotInner =
                new StorageProvider() {
                    @Override
                    public StoredObject store(User owner, MultipartFile file) throws IOException {
                        return inner.store(owner, file);
                    }

                    @Override
                    public Resource load(String storageKey) throws IOException {
                        InputStream in = inner.load(storageKey).getInputStream();
                        return new InputStreamResource(in);
                    }

                    @Override
                    public void delete(String storageKey) throws IOException {
                        inner.delete(storageKey);
                    }
                };
        EncryptingStorageProvider oneShot =
                new EncryptingStorageProvider(oneShotInner, newKeyService(), true);

        StoredObject stored = oneShot.store(owner, upload());
        Resource loaded = oneShot.load(stored.getStorageKey());
        assertThat(loaded.isOpen()).isTrue();
        assertThat(loaded.contentLength()).isEqualTo(PLAINTEXT.length);
        try (InputStream in = loaded.getInputStream()) {
            assertThat(in.readAllBytes()).isEqualTo(PLAINTEXT);
        }

        // Legacy plaintext through the one-shot path replays the sniffed prefix.
        StoredObject legacy = inner.store(owner, upload());
        try (InputStream in = oneShot.load(legacy.getStorageKey()).getInputStream()) {
            assertThat(in.readAllBytes()).isEqualTo(PLAINTEXT);
        }
    }

    @Test
    void store_largeFile_roundTripsAcrossSegmentBoundaries() throws IOException {
        byte[] big = new byte[EncryptedFileFormat.SEGMENT_SIZE_BYTES * 2 + 12345];
        for (int i = 0; i < big.length; i++) {
            big[i] = (byte) (i * 31);
        }
        StoredObject stored =
                provider.store(
                        owner, new MockMultipartFile("file", "big.bin", "application/pdf", big));
        assertThat(stored.getSizeBytes()).isEqualTo(big.length);
        try (InputStream in = provider.load(stored.getStorageKey()).getInputStream()) {
            assertThat(in.readAllBytes()).isEqualTo(big);
        }
    }

    @Test
    void load_tinyLegacyBlob_shorterThanHeader_passesThrough() throws IOException {
        byte[] tiny = "hi".getBytes(StandardCharsets.UTF_8);
        StoredObject legacy =
                inner.store(owner, new MockMultipartFile("file", "tiny.txt", "text/plain", tiny));
        try (InputStream in = provider.load(legacy.getStorageKey()).getInputStream()) {
            assertThat(in.readAllBytes()).isEqualTo(tiny);
        }
    }
}
