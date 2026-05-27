package stirling.software.proprietary.storage.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Optional;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.mock.web.MockMultipartFile;
import org.testcontainers.containers.MinIOContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import stirling.software.proprietary.security.model.User;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

@Testcontainers(disabledWithoutDocker = true)
class S3StorageProviderTest {

    private static final String BUCKET = "stirling-test-bucket";
    private static final String ACCESS_KEY = "minioadmin";
    private static final String SECRET_KEY = "minioadmin";

    @Container
    static MinIOContainer minio =
            new MinIOContainer("minio/minio:latest")
                    .withUserName(ACCESS_KEY)
                    .withPassword(SECRET_KEY);

    private static S3Client s3Client;
    private static S3Presigner s3Presigner;
    private static S3StorageProvider provider;

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

        s3Presigner =
                S3Presigner.builder()
                        .endpointOverride(endpoint)
                        .region(Region.US_EAST_1)
                        .credentialsProvider(StaticCredentialsProvider.create(creds))
                        .serviceConfiguration(s3Config)
                        .build();

        s3Client.createBucket(CreateBucketRequest.builder().bucket(BUCKET).build());
        provider = new S3StorageProvider(s3Client, s3Presigner, BUCKET);
    }

    @AfterAll
    static void tearDown() {
        if (provider != null) {
            provider.close();
        }
    }

    @Test
    void blankBucket_constructorRejects() {
        assertThatThrownBy(() -> new S3StorageProvider(s3Client, s3Presigner, ""))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new S3StorageProvider(s3Client, s3Presigner, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void store_thenLoad_roundTripsContent() throws Exception {
        User owner = new User();
        owner.setId(42L);
        byte[] content = "hello s3 round trip".getBytes(StandardCharsets.UTF_8);
        MockMultipartFile file =
                new MockMultipartFile("file", "sample.pdf", "application/pdf", content);

        StoredObject stored = provider.store(owner, file);

        // Key is intentionally opaque ({ownerId}/{uuid}) - the filename is preserved on
        // StoredObject.originalFilename for display, never in the S3 key, so vendors that
        // restrict key charset (e.g. Supabase: ASCII only) accept any filename.
        assertThat(stored.getStorageKey())
                .matches(
                        "42/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
        assertThat(stored.getStorageKey()).doesNotContain("sample.pdf");
        assertThat(stored.getOriginalFilename()).isEqualTo("sample.pdf");
        assertThat(stored.getContentType()).isEqualTo("application/pdf");
        assertThat(stored.getSizeBytes()).isEqualTo(content.length);

        Resource loaded = provider.load(stored.getStorageKey());
        try (InputStream in = loaded.getInputStream()) {
            assertThat(in.readAllBytes()).isEqualTo(content);
        }
    }

    @Test
    void load_unknownKey_throwsIOException() {
        assertThatThrownBy(() -> provider.load("does/not/exist.txt"))
                .isInstanceOf(IOException.class);
    }

    @Test
    void store_unicodeFilename_yieldsAsciiOnlyKey_andPreservesOriginalName() throws Exception {
        // Regression: Supabase Storage rejects S3 keys containing non-ASCII chars (400
        // Invalid key). Locking in that the storage key never embeds the filename so any
        // unicode display name still uploads successfully.
        User owner = new User();
        owner.setId(99L);
        String unicodeName = "résumé-日本語-é.pdf";
        byte[] payload = "u".getBytes(StandardCharsets.UTF_8);
        MockMultipartFile file =
                new MockMultipartFile("file", unicodeName, "application/pdf", payload);

        StoredObject stored = provider.store(owner, file);

        assertThat(stored.getStorageKey())
                .matches(
                        "99/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
        assertThat(stored.getOriginalFilename()).isEqualTo(unicodeName);
        try (InputStream in = provider.load(stored.getStorageKey()).getInputStream()) {
            assertThat(in.readAllBytes()).isEqualTo(payload);
        }
    }

    @Test
    void delete_removesObject() throws Exception {
        User owner = new User();
        owner.setId(7L);
        MockMultipartFile file =
                new MockMultipartFile(
                        "file", "todelete.bin", "application/octet-stream", new byte[] {1, 2, 3});

        StoredObject stored = provider.store(owner, file);
        provider.delete(stored.getStorageKey());

        assertThatThrownBy(() -> provider.load(stored.getStorageKey()))
                .isInstanceOf(IOException.class);
    }

    @Test
    void delete_unknownKey_isNoOp() {
        assertThat(catchIOException(() -> provider.delete("never-existed"))).isNull();
    }

    @Test
    void signedDownloadUrl_returnsWorkingPresignedGet() throws Exception {
        User owner = new User();
        owner.setId(99L);
        byte[] content = "presigned payload".getBytes(StandardCharsets.UTF_8);
        StoredObject stored =
                provider.store(
                        owner, new MockMultipartFile("file", "presign.txt", "text/plain", content));

        Optional<URI> signed =
                provider.signedDownloadUrl(stored.getStorageKey(), Duration.ofMinutes(2));

        assertThat(signed).isPresent();
        URI uri = signed.get();
        assertThat(uri.getScheme()).isIn("http", "https");
        assertThat(uri.getRawQuery()).contains("X-Amz-Signature");

        HttpURLConnection conn = (HttpURLConnection) new URL(uri.toString()).openConnection();
        try {
            assertThat(conn.getResponseCode()).isEqualTo(200);
            try (InputStream in = conn.getInputStream()) {
                assertThat(in.readAllBytes()).isEqualTo(content);
            }
        } finally {
            conn.disconnect();
        }
    }

    @Test
    void signedDownloadUrl_nullKey_returnsEmpty() throws Exception {
        assertThat(provider.signedDownloadUrl(null, Duration.ofMinutes(1))).isEmpty();
        assertThat(provider.signedDownloadUrl("   ", Duration.ofMinutes(1))).isEmpty();
    }

    @Test
    void signedDownloadUrl_nullOrZeroTtl_appliesDefault() throws Exception {
        User owner = new User();
        owner.setId(3L);
        StoredObject stored =
                provider.store(
                        owner,
                        new MockMultipartFile(
                                "file",
                                "ttl.txt",
                                "text/plain",
                                "x".getBytes(StandardCharsets.UTF_8)));

        assertThat(provider.signedDownloadUrl(stored.getStorageKey(), null)).isPresent();
        assertThat(provider.signedDownloadUrl(stored.getStorageKey(), Duration.ZERO)).isPresent();
        assertThat(provider.signedDownloadUrl(stored.getStorageKey(), Duration.ofSeconds(-5)))
                .isPresent();
    }

    @Test
    void signedDownloadUrl_inlineFlagEncodesResponseContentDispositionInQuery() throws Exception {
        User owner = new User();
        owner.setId(55L);
        StoredObject stored =
                provider.store(
                        owner,
                        new MockMultipartFile(
                                "file",
                                "stored-name.pdf",
                                "application/pdf",
                                "payload".getBytes(StandardCharsets.UTF_8)));

        URI attached =
                provider.signedDownloadUrl(
                                stored.getStorageKey(), Duration.ofMinutes(2), false, "report.pdf")
                        .orElseThrow();
        String attachedQuery =
                java.net.URLDecoder.decode(attached.getRawQuery(), StandardCharsets.UTF_8);
        assertThat(attachedQuery)
                .contains("response-content-disposition=attachment; filename=\"report.pdf\"");

        URI inline =
                provider.signedDownloadUrl(
                                stored.getStorageKey(), Duration.ofMinutes(2), true, "report.pdf")
                        .orElseThrow();
        String inlineQuery =
                java.net.URLDecoder.decode(inline.getRawQuery(), StandardCharsets.UTF_8);
        assertThat(inlineQuery)
                .contains("response-content-disposition=inline; filename=\"report.pdf\"");

        URI bare =
                provider.signedDownloadUrl(
                                stored.getStorageKey(), Duration.ofMinutes(2), false, null)
                        .orElseThrow();
        assertThat(bare.getRawQuery()).doesNotContain("response-content-disposition");
    }

    @Test
    void buildContentDisposition_escapesQuotesAndStripsControlChars() {
        assertThat(S3StorageProvider.buildContentDisposition(true, "ev\"il\r\nname.pdf"))
                .isEqualTo("inline; filename=\"ev\\\"ilname.pdf\"");
        assertThat(S3StorageProvider.buildContentDisposition(false, null)).isNull();
        assertThat(S3StorageProvider.buildContentDisposition(false, "   ")).isNull();
    }

    private static IOException catchIOException(IOAction action) {
        try {
            action.run();
            return null;
        } catch (IOException e) {
            return e;
        }
    }

    @FunctionalInterface
    private interface IOAction {
        void run() throws IOException;
    }
}
