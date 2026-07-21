package stirling.software.proprietary.cluster.s3;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MinIOContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import stirling.software.common.cluster.FileStore;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;

@Testcontainers(disabledWithoutDocker = true)
class S3FileStoreTest {

    private static final String BUCKET = "stirling-test-filestore";
    private static final String ACCESS_KEY = "minioadmin";
    private static final String SECRET_KEY = "minioadmin";

    @Container
    static MinIOContainer minio =
            new MinIOContainer("minio/minio:latest")
                    .withUserName(ACCESS_KEY)
                    .withPassword(SECRET_KEY);

    private static S3Client s3Client;
    private static S3FileStore store;

    @BeforeAll
    static void setUp() {
        URI endpoint = URI.create(minio.getS3URL());
        AwsBasicCredentials creds = AwsBasicCredentials.create(ACCESS_KEY, SECRET_KEY);
        S3Configuration s3Config = S3Configuration.builder().pathStyleAccessEnabled(true).build();

        s3Client =
                S3Client.builder()
                        .endpointOverride(endpoint)
                        .httpClient(UrlConnectionHttpClient.create())
                        .region(Region.US_EAST_1)
                        .credentialsProvider(StaticCredentialsProvider.create(creds))
                        .serviceConfiguration(s3Config)
                        .build();

        s3Client.createBucket(CreateBucketRequest.builder().bucket(BUCKET).build());
        store = new S3FileStore(s3Client, BUCKET, "transient/", false);
    }

    @AfterAll
    static void tearDown() {
        if (store != null) {
            store.close();
        }
        if (s3Client != null) {
            s3Client.close();
        }
    }

    @Test
    void blankBucket_constructorRejects() {
        assertThatThrownBy(() -> new S3FileStore(s3Client, ""))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new S3FileStore(s3Client, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void store_thenRetrieve_roundTripsContent() throws IOException {
        byte[] payload = "hello cluster s3".getBytes(StandardCharsets.UTF_8);
        FileStore.Stored stored = store.store(new ByteArrayInputStream(payload), "foo.txt");

        assertThat(stored.fileId()).isNotBlank();
        assertThat(stored.size()).isEqualTo(payload.length);

        assertThat(store.exists(stored.fileId())).isTrue();
        assertThat(store.size(stored.fileId())).isEqualTo(payload.length);
        assertThat(store.retrieveBytes(stored.fileId())).isEqualTo(payload);

        try (InputStream in = store.retrieve(stored.fileId())) {
            assertThat(in.readAllBytes()).isEqualTo(payload);
        }
    }

    @Test
    void store_keysUseConfiguredPrefix() throws IOException {
        byte[] payload = "prefixed".getBytes(StandardCharsets.UTF_8);
        FileStore.Stored stored = store.store(new ByteArrayInputStream(payload), "p.txt");

        String prefixed = store.resolveKey(stored.fileId());
        assertThat(prefixed).startsWith("transient/");
        s3Client.headObject(HeadObjectRequest.builder().bucket(BUCKET).key(prefixed).build());

        assertThatThrownBy(
                        () ->
                                s3Client.headObject(
                                        HeadObjectRequest.builder()
                                                .bucket(BUCKET)
                                                .key(stored.fileId())
                                                .build()))
                .isInstanceOfAny(
                        NoSuchKeyException.class,
                        software.amazon.awssdk.services.s3.model.S3Exception.class);
    }

    @Test
    void emptyPrefix_writesAtBucketRoot() throws IOException {
        S3FileStore rootStore = new S3FileStore(s3Client, BUCKET, "", false);
        byte[] payload = "no-prefix".getBytes(StandardCharsets.UTF_8);
        FileStore.Stored stored = rootStore.store(new ByteArrayInputStream(payload), "r.txt");
        assertThat(rootStore.resolveKey(stored.fileId())).isEqualTo(stored.fileId());
        assertThat(rootStore.retrieveBytes(stored.fileId())).isEqualTo(payload);
        assertThat(rootStore.delete(stored.fileId())).isTrue();
    }

    @Test
    void delete_removesObject_andReturnsTrue() throws IOException {
        FileStore.Stored stored =
                store.store(new ByteArrayInputStream(new byte[] {1, 2, 3}), "d.bin");
        assertThat(store.delete(stored.fileId())).isTrue();
        assertThat(store.exists(stored.fileId())).isFalse();
        assertThatThrownBy(() -> store.retrieveBytes(stored.fileId()))
                .isInstanceOf(IOException.class);
    }

    @Test
    void delete_unknownKey_isIdempotentReturnsTrue() {
        // S3 DeleteObject is idempotent (returns 204 whether or not the object existed).
        // The store reflects S3's behaviour rather than racing a HEAD before each DELETE.
        assertThat(store.delete("00000000-0000-0000-0000-000000000000")).isTrue();
    }

    @Test
    void retrieve_missingKey_throwsIOException() {
        assertThatThrownBy(() -> store.retrieveBytes("does-not-exist"))
                .isInstanceOf(IOException.class);
        assertThatThrownBy(() -> store.retrieve("does-not-exist")).isInstanceOf(IOException.class);
        assertThatThrownBy(() -> store.size("does-not-exist")).isInstanceOf(IOException.class);
    }

    @Test
    void exists_returnsFalseForBlankOrTraversalIds() {
        assertThat(store.exists(null)).isFalse();
        assertThat(store.exists("")).isFalse();
        assertThat(store.exists("..")).isFalse();
        assertThat(store.exists("a/b")).isFalse();
        assertThat(store.exists("a\\b")).isFalse();
    }

    @Test
    void delete_traversalId_returnsFalseWithoutCall() {
        assertThat(store.delete("../etc/passwd")).isFalse();
        assertThat(store.delete("foo/bar")).isFalse();
    }

    @Test
    void store_largePayload_streamsViaTempFileWithoutBufferingInMemory() throws IOException {
        long payloadSize = 16L * 1024 * 1024;
        Path tempDir = Path.of(System.getProperty("java.io.tmpdir"));
        long uploadTempsBefore = countS3UploadTemps(tempDir);

        FileStore.Stored stored;
        try (InputStream large = new RepeatingInputStream((byte) 0x42, payloadSize)) {
            stored = store.store(large, "big.bin");
        }

        assertThat(stored.size()).isEqualTo(payloadSize);
        assertThat(store.size(stored.fileId())).isEqualTo(payloadSize);
        assertThat(countS3UploadTemps(tempDir)).isEqualTo(uploadTempsBefore);
        store.delete(stored.fileId());
    }

    @Test
    void store_uploadFailure_stillDeletesTempFile() {
        Path tempDir = Path.of(System.getProperty("java.io.tmpdir"));
        long uploadTempsBefore = countS3UploadTemps(tempDir);

        // Non-existent bucket causes putObject to fail after the temp file is written, exercising
        // the failure-path cleanup in the finally block.
        S3FileStore brokenStore =
                new S3FileStore(s3Client, "bucket-that-does-not-exist", "transient/", false);

        assertThatThrownBy(
                        () ->
                                brokenStore.store(
                                        new ByteArrayInputStream(
                                                "payload".getBytes(StandardCharsets.UTF_8)),
                                        "x.bin"))
                .isInstanceOf(IOException.class);

        assertThat(countS3UploadTemps(tempDir)).isEqualTo(uploadTempsBefore);
    }

    private static long countS3UploadTemps(Path tempDir) {
        try (Stream<Path> entries = Files.list(tempDir)) {
            return entries.filter(p -> p.getFileName().toString().startsWith("s3-upload-")).count();
        } catch (IOException e) {
            return 0L;
        }
    }

    /** Generates {@code length} bytes of a single value without buffering them in memory. */
    private static final class RepeatingInputStream extends InputStream {
        private final byte value;
        private long remaining;

        RepeatingInputStream(byte value, long length) {
            this.value = value;
            this.remaining = length;
        }

        @Override
        public int read() {
            if (remaining <= 0) {
                return -1;
            }
            remaining--;
            return value & 0xFF;
        }

        @Override
        public int read(byte[] b, int off, int len) {
            if (remaining <= 0) {
                return -1;
            }
            int toWrite = (int) Math.min(len, remaining);
            for (int i = 0; i < toWrite; i++) {
                b[off + i] = value;
            }
            remaining -= toWrite;
            return toWrite;
        }
    }

    @Test
    void store_withOwner_persistsOwnerMetadata() throws IOException {
        FileStore.Stored stored =
                store.store(
                        new ByteArrayInputStream("owned".getBytes(StandardCharsets.UTF_8)),
                        "o.txt",
                        "alice");
        assertThat(store.getOwner(stored.fileId())).isEqualTo("alice");
    }

    @Test
    void store_withoutOwner_yieldsNullFromGetOwner() throws IOException {
        FileStore.Stored stored =
                store.store(
                        new ByteArrayInputStream("anon".getBytes(StandardCharsets.UTF_8)), "a.txt");
        assertThat(store.getOwner(stored.fileId())).isNull();
    }

    @Test
    void getOwner_returnsNullForUnknownFileId() throws IOException {
        assertThat(store.getOwner("00000000-0000-0000-0000-000000000000")).isNull();
    }
}
