package stirling.software.proprietary.cluster.s3;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.cluster.FileStore;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.provider.S3StorageProvider;
import stirling.software.proprietary.storage.provider.StoredObject;

import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;

/**
 * Comprehensive live-vendor test against a real S3-compatible endpoint specified via {@code
 * S3_SMOKE_*} env vars. Skipped automatically when {@code S3_SMOKE_ENDPOINT} is not set, so CI is
 * not affected. Covers:
 *
 * <ul>
 *   <li>{@code S3StorageProvider} CRUD: store / load / delete / presigned URL
 *   <li>{@code S3FileStore} CRUD (cluster artifact path)
 *   <li>Folder semantics simulated via key prefixes (matches production usage)
 *   <li>Negative paths: wrong secret, missing bucket, missing key, traversal IDs
 *   <li>Edge cases: zero-byte, unicode filename, multi-megabyte streaming
 *   <li>Configuration guards: SSRF endpoint rejection, bucket validation
 * </ul>
 *
 * Every uploaded key is tracked and removed in {@link #cleanUp} so re-running against the same
 * bucket leaves no residue.
 */
@EnabledIfEnvironmentVariable(named = "S3_SMOKE_ENDPOINT", matches = ".+")
class S3VendorComprehensiveTest {

    private static final String PREFIX = "stirling-comprehensive/" + UUID.randomUUID() + "/";

    private static ApplicationProperties.Storage.S3 cfg;
    private static S3Clients.Bundle bundle;
    private static S3StorageProvider provider;
    private static String bucket;
    private static String vendorLabel;
    private static User owner;

    private static final List<String> keysToCleanup =
            Collections.synchronizedList(new ArrayList<>());

    @BeforeAll
    static void setUp() {
        cfg = configFromEnv();
        bucket = cfg.getBucket();
        vendorLabel = System.getenv().getOrDefault("S3_SMOKE_LABEL", "external");
        bundle = S3Clients.build(cfg, "comprehensive[" + vendorLabel + "]");
        provider = new S3StorageProvider(bundle.client(), bundle.presigner(), bucket);

        owner = new User();
        owner.setId(7L);
        owner.setUsername("comprehensive-tester");
    }

    @AfterAll
    static void cleanUp() {
        if (bundle != null) {
            for (String key : keysToCleanup) {
                try {
                    bundle.client().deleteObject(d -> d.bucket(bucket).key(key));
                } catch (Exception e) {
                    // Best-effort cleanup; ignore.
                }
            }
            try {
                provider.close();
            } catch (Exception ignored) {
            }
            bundle.close();
        }
    }

    private static String track(String key) {
        keysToCleanup.add(key);
        return key;
    }

    private static ApplicationProperties.Storage.S3 configFromEnv() {
        ApplicationProperties.Storage.S3 c = new ApplicationProperties.Storage.S3();
        c.setEndpoint(System.getenv("S3_SMOKE_ENDPOINT"));
        c.setBucket(requireEnv("S3_SMOKE_BUCKET"));
        c.setRegion(System.getenv().getOrDefault("S3_SMOKE_REGION", "us-east-1"));
        c.setAccessKey(requireEnv("S3_SMOKE_KEY"));
        c.setSecretKey(requireEnv("S3_SMOKE_SECRET"));
        c.setPathStyleAccess(
                Boolean.parseBoolean(System.getenv().getOrDefault("S3_SMOKE_PATHSTYLE", "false")));
        c.setAllowPrivateEndpoints(false);
        return c;
    }

    private static String requireEnv(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(name + " env var must be set");
        }
        return value;
    }

    // ==========================================================================================
    // FILE CRUD via S3StorageProvider (user-uploaded files)
    // ==========================================================================================

    @Test
    void provider_store_thenLoad_matchesBytes() throws IOException {
        byte[] payload = ("provider-roundtrip-" + vendorLabel).getBytes(StandardCharsets.UTF_8);
        MockMultipartFile file = new MockMultipartFile("file", "doc.txt", "text/plain", payload);

        StoredObject obj = provider.store(owner, file);
        track(obj.getStorageKey());

        assertThat(obj.getStorageKey()).isNotBlank();
        assertThat(obj.getSizeBytes()).isEqualTo(payload.length);
        assertThat(provider.load(obj.getStorageKey()).getInputStream().readAllBytes())
                .isEqualTo(payload);
    }

    @Test
    void provider_delete_removesObject() throws IOException {
        byte[] payload = "delete-me".getBytes(StandardCharsets.UTF_8);
        MockMultipartFile file = new MockMultipartFile("file", "x.txt", "text/plain", payload);
        StoredObject obj = provider.store(owner, file);
        track(obj.getStorageKey());

        provider.delete(obj.getStorageKey());

        assertThatThrownBy(() -> provider.load(obj.getStorageKey()))
                .isInstanceOf(IOException.class);
    }

    @Test
    void provider_load_missingKey_throws() {
        assertThatThrownBy(() -> provider.load(PREFIX + "does-not-exist"))
                .isInstanceOf(IOException.class);
    }

    @Test
    void provider_presignedDownload_returnsBytesOverHttp() throws Exception {
        byte[] payload = "presign me".getBytes(StandardCharsets.UTF_8);
        MockMultipartFile file = new MockMultipartFile("file", "p.txt", "text/plain", payload);
        StoredObject obj = provider.store(owner, file);
        track(obj.getStorageKey());

        java.util.Optional<java.net.URI> url =
                provider.signedDownloadUrl(obj.getStorageKey(), Duration.ofMinutes(5));
        assertThat(url).isPresent();

        HttpResponse<byte[]> resp =
                HttpClient.newHttpClient()
                        .send(
                                HttpRequest.newBuilder(url.get()).GET().build(),
                                HttpResponse.BodyHandlers.ofByteArray());

        assertThat(resp.statusCode()).isEqualTo(200);
        assertThat(resp.body()).isEqualTo(payload);
    }

    @Test
    void provider_store_zeroBytes_isAccepted() throws IOException {
        MockMultipartFile empty =
                new MockMultipartFile("file", "empty.txt", "text/plain", new byte[0]);
        StoredObject obj = provider.store(owner, empty);
        track(obj.getStorageKey());

        assertThat(obj.getSizeBytes()).isZero();
        assertThat(provider.load(obj.getStorageKey()).getInputStream().readAllBytes())
                .isEqualTo(new byte[0]);
    }

    @Test
    void provider_store_unicodeFilename_yieldsOpaqueAsciiKey_andPreservesNameForDisplay()
            throws IOException {
        // Regression: pre-fix, the storage key embedded the filename verbatim, which Supabase
        // rejected with 400 Invalid key. Post-fix, the key is {ownerId}/{uuid} (ASCII-only)
        // and the original unicode name lives on StoredObject.originalFilename.
        String unicodeName = "résumé-日本語-é.pdf";
        byte[] payload = "u".getBytes(StandardCharsets.UTF_8);
        MockMultipartFile file =
                new MockMultipartFile("file", unicodeName, "application/pdf", payload);

        StoredObject obj = provider.store(owner, file);
        track(obj.getStorageKey());

        assertThat(obj.getStorageKey()).matches("[0-9]+/[0-9a-fA-F-]+");
        assertThat(obj.getStorageKey())
                .isEqualTo(
                        new String(
                                obj.getStorageKey().getBytes(StandardCharsets.US_ASCII),
                                StandardCharsets.US_ASCII));
        assertThat(obj.getOriginalFilename()).isEqualTo(unicodeName);
        assertThat(provider.load(obj.getStorageKey()).getInputStream().readAllBytes())
                .isEqualTo(payload);
    }

    // ==========================================================================================
    // Concurrency, overwrite, TTL expiry (added after initial run surfaced the unicode bug)
    // ==========================================================================================

    @Test
    void provider_concurrent10Uploads_allSucceedWithDistinctKeys() throws Exception {
        int n = 10;
        java.util.concurrent.ExecutorService pool =
                java.util.concurrent.Executors.newFixedThreadPool(n);
        try {
            List<java.util.concurrent.Future<StoredObject>> futures = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                final int idx = i;
                futures.add(
                        pool.submit(
                                () -> {
                                    byte[] payload =
                                            ("concurrent-" + idx).getBytes(StandardCharsets.UTF_8);
                                    MockMultipartFile f =
                                            new MockMultipartFile(
                                                    "file",
                                                    "c-" + idx + ".txt",
                                                    "text/plain",
                                                    payload);
                                    StoredObject obj = provider.store(owner, f);
                                    track(obj.getStorageKey());
                                    return obj;
                                }));
            }

            java.util.Set<String> keys = new java.util.HashSet<>();
            for (java.util.concurrent.Future<StoredObject> fut : futures) {
                StoredObject obj = fut.get(30, java.util.concurrent.TimeUnit.SECONDS);
                assertThat(keys.add(obj.getStorageKey()))
                        .as("distinct key for each parallel upload")
                        .isTrue();
                assertThat(provider.load(obj.getStorageKey()).getInputStream().readAllBytes())
                        .isNotEmpty();
            }
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void sameKey_overwrite_returnsLatestPayload() {
        String key = PREFIX + "overwrite-" + UUID.randomUUID() + ".txt";
        track(key);

        byte[] first = "FIRST".getBytes(StandardCharsets.UTF_8);
        byte[] second = "SECOND".getBytes(StandardCharsets.UTF_8);

        bundle.client().putObject(p -> p.bucket(bucket).key(key), RequestBody.fromBytes(first));
        bundle.client().putObject(p -> p.bucket(bucket).key(key), RequestBody.fromBytes(second));

        assertThat(getRaw(key)).isEqualTo(second);
    }

    @Test
    void presignedDownload_afterTtlExpiry_returns403() throws Exception {
        String key = PREFIX + "presign-expiry-" + UUID.randomUUID() + ".txt";
        byte[] payload = "presign expiry".getBytes(StandardCharsets.UTF_8);
        track(putRaw(key, "presign expiry"));

        // 2-second TTL, then wait long enough that any vendor clock skew tolerance is also past.
        PresignedGetObjectRequest presigned =
                bundle.presigner()
                        .presignGetObject(
                                GetObjectPresignRequest.builder()
                                        .signatureDuration(Duration.ofSeconds(2))
                                        .getObjectRequest(g -> g.bucket(bucket).key(key))
                                        .build());

        // Confirm it works while valid - rules out unrelated failures.
        HttpResponse<byte[]> ok =
                HttpClient.newHttpClient()
                        .send(
                                HttpRequest.newBuilder(presigned.url().toURI()).GET().build(),
                                HttpResponse.BodyHandlers.ofByteArray());
        assertThat(ok.statusCode()).isEqualTo(200);
        assertThat(ok.body()).isEqualTo(payload);

        Thread.sleep(5_000);

        HttpResponse<byte[]> expired =
                HttpClient.newHttpClient()
                        .send(
                                HttpRequest.newBuilder(presigned.url().toURI()).GET().build(),
                                HttpResponse.BodyHandlers.ofByteArray());
        assertThat(expired.statusCode())
                .as("presigned URL must be rejected after TTL expires")
                .isIn(400, 403);
    }

    @Test
    void provider_store_4MBPayload_streams() throws IOException {
        byte[] payload = new byte[4 * 1024 * 1024];
        java.util.Arrays.fill(payload, (byte) 0x42);
        MockMultipartFile file =
                new MockMultipartFile("file", "big.bin", "application/octet-stream", payload);

        StoredObject obj = provider.store(owner, file);
        track(obj.getStorageKey());

        assertThat(obj.getSizeBytes()).isEqualTo(payload.length);
        assertThat(provider.load(obj.getStorageKey()).getInputStream().readAllBytes())
                .isEqualTo(payload);
    }

    // ==========================================================================================
    // FILE CRUD via S3FileStore (cluster artifact path)
    // ==========================================================================================

    @Test
    void fileStore_storeAndRetrieve_roundTrip() throws IOException {
        S3FileStore store = new S3FileStore(bundle.client(), bucket, PREFIX + "fs/", false);
        byte[] payload = "filestore round trip".getBytes(StandardCharsets.UTF_8);

        FileStore.Stored stored = store.store(new ByteArrayInputStream(payload), "rt.txt");
        track(store.resolveKey(stored.fileId()));

        assertThat(store.size(stored.fileId())).isEqualTo(payload.length);
        assertThat(store.retrieveBytes(stored.fileId())).isEqualTo(payload);
        assertThat(store.exists(stored.fileId())).isTrue();
    }

    @Test
    void fileStore_delete_returnsTrue_andExistsFalseAfter() throws IOException {
        S3FileStore store = new S3FileStore(bundle.client(), bucket, PREFIX + "fs/", false);
        FileStore.Stored stored = store.store(new ByteArrayInputStream("x".getBytes()), "del.txt");

        assertThat(store.delete(stored.fileId())).isTrue();
        assertThat(store.exists(stored.fileId())).isFalse();
    }

    @Test
    void fileStore_retrieveBytes_missingKey_throws() {
        S3FileStore store = new S3FileStore(bundle.client(), bucket, PREFIX + "fs/", false);
        assertThatThrownBy(() -> store.retrieveBytes("does-not-exist"))
                .isInstanceOf(IOException.class);
    }

    @Test
    void fileStore_rejectsTraversalId() {
        S3FileStore store = new S3FileStore(bundle.client(), bucket, PREFIX + "fs/", false);
        assertThat(store.exists("..")).isFalse();
        assertThat(store.delete("../etc/passwd")).isFalse();
        assertThat(store.exists("a/b")).isFalse();
        assertThat(store.exists("a\\b")).isFalse();
    }

    // ==========================================================================================
    // Folder semantics simulated via key prefixes
    // ==========================================================================================

    @Test
    void folderPrefix_isolatesObjects_andDeleteByPrefixDoesNotTouchRoot() throws IOException {
        // Two "folders" + a root object - all reuse the test PREFIX so cleanup catches them.
        String folderA = PREFIX + "folder-A/";
        String folderB = PREFIX + "folder-B/";
        String rootObj = PREFIX + "root-" + UUID.randomUUID() + ".txt";

        track(putRaw(folderA + "file-1.txt", "in-A"));
        track(putRaw(folderA + "file-2.txt", "in-A2"));
        track(putRaw(folderB + "file-1.txt", "in-B"));
        track(putRaw(rootObj, "at-root"));

        // "Delete folder A": delete every key under folderA prefix
        deleteAllUnderPrefix(folderA);

        // Verify A is empty, B and root untouched
        assertThat(headOrNull(folderA + "file-1.txt")).isNull();
        assertThat(headOrNull(folderB + "file-1.txt")).isNotNull();
        assertThat(headOrNull(rootObj)).isNotNull();
    }

    @Test
    void moveBetweenFolders_viaCopyAndDelete_preservesContent() throws Exception {
        String oldKey = PREFIX + "move-old/" + UUID.randomUUID() + ".txt";
        String newKey = PREFIX + "move-new/" + UUID.randomUUID() + ".txt";
        byte[] payload = "moveable".getBytes(StandardCharsets.UTF_8);

        track(oldKey);
        track(newKey);
        bundle.client()
                .putObject(p -> p.bucket(bucket).key(oldKey), RequestBody.fromBytes(payload));

        // Simulate move: server-side copy + delete original.
        bundle.client()
                .copyObject(
                        c ->
                                c.sourceBucket(bucket)
                                        .sourceKey(oldKey)
                                        .destinationBucket(bucket)
                                        .destinationKey(newKey));
        bundle.client().deleteObject(d -> d.bucket(bucket).key(oldKey));

        assertThat(headOrNull(oldKey)).isNull();
        assertThat(getRaw(newKey)).isEqualTo(payload);
    }

    // ==========================================================================================
    // Negative: wrong settings / wrong creds
    // ==========================================================================================

    @Test
    void wrongSecret_throwsOnFirstOperation() {
        ApplicationProperties.Storage.S3 bad = configFromEnv();
        bad.setSecretKey("definitely-not-the-real-secret-" + UUID.randomUUID());

        try (S3Clients.Bundle badBundle = S3Clients.build(bad, "wrong-secret")) {
            assertThatThrownBy(() -> badBundle.client().headBucket(h -> h.bucket(bucket)))
                    .isInstanceOf(S3Exception.class)
                    .satisfies(e -> assertThat(((S3Exception) e).statusCode()).isIn(401, 403, 400));
        }
    }

    @Test
    void nonExistentBucket_throwsOnHeadOrPut() {
        String fakeBucket = "stirling-no-such-bucket-" + UUID.randomUUID();
        assertThatThrownBy(() -> bundle.client().headBucket(h -> h.bucket(fakeBucket)))
                .isInstanceOfAny(NoSuchBucketException.class, S3Exception.class);
    }

    @Test
    void blankBucket_atBuildTime_throwsIllegalState() {
        ApplicationProperties.Storage.S3 bad = configFromEnv();
        bad.setBucket("");
        assertThatThrownBy(() -> S3Clients.build(bad, "blank-bucket"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("bucket");
    }

    @Test
    void invalidEndpointUri_atBuildTime_throwsIllegalState() {
        ApplicationProperties.Storage.S3 bad = configFromEnv();
        bad.setEndpoint("not a valid uri ::::");
        assertThatThrownBy(() -> S3Clients.build(bad, "bad-uri"))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void privateEndpoint_withoutOptIn_atBuildTime_throwsIllegalState() {
        ApplicationProperties.Storage.S3 bad = configFromEnv();
        bad.setEndpoint("http://127.0.0.1:9000");
        bad.setAllowPrivateEndpoints(false);
        assertThatThrownBy(() -> S3Clients.build(bad, "loopback"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("private");
    }

    @Test
    void getMissingKey_returnsNoSuchKey() {
        String missing = PREFIX + "missing-" + UUID.randomUUID();
        assertThatThrownBy(() -> bundle.client().getObject(g -> g.bucket(bucket).key(missing)))
                .isInstanceOfAny(NoSuchKeyException.class, S3Exception.class);
    }

    // ==========================================================================================
    // Bundle lifecycle
    // ==========================================================================================

    @Test
    void bundleClose_isIdempotent() {
        ApplicationProperties.Storage.S3 c = configFromEnv();
        S3Clients.Bundle b = S3Clients.build(c, "lifecycle");
        b.close();
        b.close(); // should not throw
    }

    // ==========================================================================================
    // Internal helpers (using the bundle directly for prefix/folder simulation)
    // ==========================================================================================

    private String putRaw(String key, String body) {
        bundle.client()
                .putObject(
                        p -> p.bucket(bucket).key(key),
                        RequestBody.fromBytes(body.getBytes(StandardCharsets.UTF_8)));
        return key;
    }

    private byte[] getRaw(String key) {
        return bundle.client().getObjectAsBytes(g -> g.bucket(bucket).key(key)).asByteArray();
    }

    private Object headOrNull(String key) {
        try {
            return bundle.client().headObject(h -> h.bucket(bucket).key(key));
        } catch (Exception e) {
            return null;
        }
    }

    private byte[] tryGetBytes(String key) {
        try {
            return bundle.client().getObjectAsBytes(g -> g.bucket(bucket).key(key)).asByteArray();
        } catch (Exception e) {
            return null;
        }
    }

    private void deleteAllUnderPrefix(String prefix) {
        var listing = bundle.client().listObjectsV2(l -> l.bucket(bucket).prefix(prefix));
        for (var obj : listing.contents()) {
            bundle.client().deleteObject(d -> d.bucket(bucket).key(obj.key()));
        }
    }

    // ==========================================================================================
    // Key edge cases: leading/trailing/double slash, length, URL-special chars
    // ==========================================================================================

    @Test
    void key_trailingSlash_storesAsZeroByteFolderMarker() {
        String key = PREFIX + "folder-marker-" + UUID.randomUUID() + "/";
        track(key);

        // S3 spec: trailing slash is legal and creates a 0-byte "folder marker" object.
        // Some vendors normalize it away; capture either behavior.
        bundle.client()
                .putObject(p -> p.bucket(bucket).key(key), RequestBody.fromBytes(new byte[0]));
        Object head = headOrNull(key);
        // Either: vendor accepts the marker (head is non-null) or normalizes to bare key.
        assertThat(head != null || headOrNull(key.substring(0, key.length() - 1)) != null)
                .as("vendor should either accept trailing-slash marker or normalize to bare key")
                .isTrue();
    }

    @Test
    void key_doubleSlash_normalizedOrStoredVerbatim() {
        String key = PREFIX + "double//slash-" + UUID.randomUUID() + ".txt";
        track(key);
        bundle.client()
                .putObject(
                        p -> p.bucket(bucket).key(key),
                        RequestBody.fromBytes("ds".getBytes(StandardCharsets.UTF_8)));

        // Either GET-with-the-exact-key works, or vendor normalized -> single-slash form works.
        String alt = key.replace("//", "/");
        track(alt);
        byte[] viaExact = tryGetBytes(key);
        byte[] viaNormalized = tryGetBytes(alt);
        assertThat(viaExact != null || viaNormalized != null)
                .as("either exact double-slash key or normalized single-slash form must return")
                .isTrue();
    }

    @Test
    void key_200Chars_isStoredAndRetrievable() {
        // Stirling production keys are ~45 chars ({ownerId}/{uuid}). 200 chars exceeds that by
        // ~5x but stays inside every vendor's documented limit. The S3 spec max is 1024 bytes
        // but some vendors (Supabase) impose stricter caps (~250-byte total path including
        // bucket prefix - 1000 chars fails with KeyTooLongError).
        StringBuilder sb = new StringBuilder(PREFIX + "long/");
        while (sb.length() < 200) {
            sb.append("abcdefghij");
        }
        String longKey = sb.substring(0, 200);
        track(longKey);

        byte[] payload = "long-key".getBytes(StandardCharsets.UTF_8);
        bundle.client()
                .putObject(p -> p.bucket(bucket).key(longKey), RequestBody.fromBytes(payload));
        assertThat(getRaw(longKey)).isEqualTo(payload);
    }

    @Test
    void key_safeSpecialChars_areSignedAndRetrievableViaSdk() {
        // Restrict to chars every S3-compatible vendor accepts: dot, dash, underscore.
        // Stirling's production key format ({ownerId}/{uuid}) is even narrower; this test
        // confirms the SDK SigV4 signer copes with slightly more exotic ASCII-safe keys.
        // Note: Supabase rejects keys containing space / + / ? / & / # ("400 Invalid key"),
        // see documentsVendorKeyRestrictions_tolerantTest for that documentation.
        String key =
                PREFIX
                        + "safe-special/"
                        + UUID.randomUUID()
                        + "_segment.with-dots.and_underscores.txt";
        track(key);

        bundle.client()
                .putObject(
                        p -> p.bucket(bucket).key(key),
                        RequestBody.fromBytes("safe".getBytes(StandardCharsets.UTF_8)));
        assertThat(getRaw(key)).isEqualTo("safe".getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void documentsVendorKeyRestrictions_tolerantTest() {
        // Documents - rather than enforces - which key characters cause vendor rejection.
        // Stirling production code is safe because S3StorageProvider always emits an
        // ASCII-safe UUID-only key. If you ever change that, this test becomes a canary.
        // AWS S3 and MinIO accept all of these; Supabase rejects all of them with 400.
        String[] suspiciousKeys = {
            PREFIX + "with space.txt",
            PREFIX + "with+plus.txt",
            PREFIX + "with#hash.txt",
            PREFIX + "with?question.txt",
            PREFIX + "with&amp.txt",
        };
        int accepted = 0;
        int rejected = 0;
        for (String k : suspiciousKeys) {
            track(k);
            try {
                bundle.client()
                        .putObject(
                                p -> p.bucket(bucket).key(k),
                                RequestBody.fromBytes("x".getBytes(StandardCharsets.UTF_8)));
                accepted++;
            } catch (S3Exception e) {
                assertThat(e.statusCode())
                        .as("vendor rejection must be a clean 4xx, not a signature mismatch")
                        .isBetween(400, 499);
                rejected++;
            }
        }
        assertThat(accepted + rejected).isEqualTo(suspiciousKeys.length);
    }

    // ==========================================================================================
    // Presigned-URL: TTL bounds + Content-Disposition behavior (Stirling uses this for shares)
    // ==========================================================================================

    @Test
    void presignedGet_ttlExceeding7Days_isRejectedAtSigningTime() {
        String key = PREFIX + "ttl-overflow-" + UUID.randomUUID() + ".txt";
        track(putRaw(key, "x"));

        // SigV4 caps presigned URL TTL at 7 days. SDK should refuse to sign anything larger.
        assertThatThrownBy(
                        () ->
                                bundle.presigner()
                                        .presignGetObject(
                                                GetObjectPresignRequest.builder()
                                                        .signatureDuration(Duration.ofDays(8))
                                                        .getObjectRequest(
                                                                g -> g.bucket(bucket).key(key))
                                                        .build()))
                .isInstanceOfAny(IllegalArgumentException.class, RuntimeException.class);
    }

    @Test
    void provider_signedDownloadUrl_attachmentDisposition_endsWithAttachmentHeader()
            throws Exception {
        byte[] payload = "attach me".getBytes(StandardCharsets.UTF_8);
        MockMultipartFile file =
                new MockMultipartFile("file", "report.pdf", "application/pdf", payload);
        StoredObject obj = provider.store(owner, file);
        track(obj.getStorageKey());

        java.util.Optional<java.net.URI> url =
                provider.signedDownloadUrl(
                        obj.getStorageKey(), Duration.ofMinutes(2), false, "report.pdf");
        assertThat(url).isPresent();

        HttpResponse<byte[]> resp =
                HttpClient.newHttpClient()
                        .send(
                                HttpRequest.newBuilder(url.get()).GET().build(),
                                HttpResponse.BodyHandlers.ofByteArray());

        assertThat(resp.statusCode()).isEqualTo(200);
        // Supabase + AWS both honor response-content-disposition query param.
        assertThat(resp.headers().firstValue("content-disposition").orElse(""))
                .as("vendor must honor response-content-disposition override in presigned URL")
                .startsWith("attachment");
    }

    @Test
    void provider_signedDownloadUrl_inlineDisposition_endsWithInlineHeader() throws Exception {
        byte[] payload = "inline".getBytes(StandardCharsets.UTF_8);
        MockMultipartFile file =
                new MockMultipartFile("file", "preview.pdf", "application/pdf", payload);
        StoredObject obj = provider.store(owner, file);
        track(obj.getStorageKey());

        java.util.Optional<java.net.URI> url =
                provider.signedDownloadUrl(
                        obj.getStorageKey(), Duration.ofMinutes(2), true, "preview.pdf");
        assertThat(url).isPresent();

        HttpResponse<byte[]> resp =
                HttpClient.newHttpClient()
                        .send(
                                HttpRequest.newBuilder(url.get()).GET().build(),
                                HttpResponse.BodyHandlers.ofByteArray());

        assertThat(resp.statusCode()).isEqualTo(200);
        assertThat(resp.headers().firstValue("content-disposition").orElse(""))
                .as("inline=true must set 'inline' disposition")
                .startsWith("inline");
    }

    // ==========================================================================================
    // List pagination + HEAD missing semantics
    // ==========================================================================================

    @Test
    void listObjectsV2_paginationWithMaxKeys_returnsContinuationToken() {
        // Stage 3 objects under a unique sub-prefix.
        String prefix = PREFIX + "page-" + UUID.randomUUID() + "/";
        for (int i = 0; i < 3; i++) {
            track(putRaw(prefix + "obj-" + i, "p" + i));
        }

        var first = bundle.client().listObjectsV2(l -> l.bucket(bucket).prefix(prefix).maxKeys(1));
        assertThat(first.contents()).hasSize(1);
        assertThat(first.isTruncated()).isTrue();
        assertThat(first.nextContinuationToken()).isNotBlank();

        var second =
                bundle.client()
                        .listObjectsV2(
                                l ->
                                        l.bucket(bucket)
                                                .prefix(prefix)
                                                .maxKeys(2)
                                                .continuationToken(first.nextContinuationToken()));
        assertThat(second.contents()).hasSize(2);
        assertThat(second.isTruncated()).isFalse();
    }

    @Test
    void headObject_missingKey_throwsNoSuchKeyOr404() {
        String missing = PREFIX + "head-missing-" + UUID.randomUUID();
        assertThatThrownBy(() -> bundle.client().headObject(h -> h.bucket(bucket).key(missing)))
                .isInstanceOf(S3Exception.class)
                .satisfies(e -> assertThat(((S3Exception) e).statusCode()).isEqualTo(404));
    }

    /**
     * Presigned-URL test scaffolding for parity with the smoke test (covers the SDK presign path).
     */
    @Test
    void presignGetObject_independentOfProvider_returnsBytes() throws Exception {
        String key = PREFIX + "presign-direct-" + UUID.randomUUID() + ".txt";
        byte[] payload = "direct presign".getBytes(StandardCharsets.UTF_8);
        track(putRaw(key, "direct presign"));

        PresignedGetObjectRequest presigned =
                bundle.presigner()
                        .presignGetObject(
                                GetObjectPresignRequest.builder()
                                        .signatureDuration(Duration.ofMinutes(2))
                                        .getObjectRequest(g -> g.bucket(bucket).key(key))
                                        .build());

        HttpResponse<byte[]> resp =
                HttpClient.newHttpClient()
                        .send(
                                HttpRequest.newBuilder(presigned.url().toURI()).GET().build(),
                                HttpResponse.BodyHandlers.ofByteArray());

        assertThat(resp.statusCode()).isEqualTo(200);
        assertThat(resp.body()).isEqualTo(payload);
    }
}
