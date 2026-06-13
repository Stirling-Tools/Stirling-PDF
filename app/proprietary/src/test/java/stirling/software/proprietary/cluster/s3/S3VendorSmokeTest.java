package stirling.software.proprietary.cluster.s3;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.localstack.LocalStackContainer;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import stirling.software.common.cluster.FileStore;
import stirling.software.common.model.ApplicationProperties;

import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;

/**
 * End-to-end smoke against the full {@link S3Clients#build} path. Defaults to a LocalStack
 * container so it runs in CI; if {@code S3_SMOKE_ENDPOINT} is set, swaps in a real vendor (AWS /
 * Supabase / R2 / MinIO over network) to validate live signing + DNS.
 */
@Testcontainers(disabledWithoutDocker = true)
class S3VendorSmokeTest {

    private static LocalStackContainer localstack;
    private static S3Clients.Bundle bundle;
    private static String bucket;
    private static String vendorLabel;

    @BeforeAll
    static void setUp() {
        ApplicationProperties.Storage.S3 cfg = new ApplicationProperties.Storage.S3();
        String envEndpoint = System.getenv("S3_SMOKE_ENDPOINT");

        if (envEndpoint != null && !envEndpoint.isBlank()) {
            vendorLabel = System.getenv().getOrDefault("S3_SMOKE_LABEL", "external");
            cfg.setEndpoint(envEndpoint);
            cfg.setBucket(requireEnv("S3_SMOKE_BUCKET"));
            cfg.setRegion(System.getenv().getOrDefault("S3_SMOKE_REGION", "us-east-1"));
            cfg.setAccessKey(requireEnv("S3_SMOKE_KEY"));
            cfg.setSecretKey(requireEnv("S3_SMOKE_SECRET"));
            cfg.setPathStyleAccess(
                    Boolean.parseBoolean(
                            System.getenv().getOrDefault("S3_SMOKE_PATHSTYLE", "false")));
            cfg.setAllowPrivateEndpoints(
                    Boolean.parseBoolean(
                            System.getenv().getOrDefault("S3_SMOKE_ALLOWPRIVATE", "false")));
        } else {
            vendorLabel = "localstack";
            localstack =
                    new LocalStackContainer(DockerImageName.parse("localstack/localstack:3.8"))
                            .withServices(LocalStackContainer.Service.S3);
            localstack.start();
            cfg.setEndpoint(
                    localstack.getEndpointOverride(LocalStackContainer.Service.S3).toString());
            cfg.setBucket("stirling-smoke");
            cfg.setRegion(localstack.getRegion());
            cfg.setAccessKey(localstack.getAccessKey());
            cfg.setSecretKey(localstack.getSecretKey());
            // Exercise virtual-hosted addressing where possible. LocalStack supports both;
            // path-style remains covered by the MinIO suite.
            cfg.setPathStyleAccess(false);
            // Required: localhost is a loopback address and would otherwise be rejected.
            cfg.setAllowPrivateEndpoints(true);
        }

        bundle = S3Clients.build(cfg, "vendor-smoke[" + vendorLabel + "]");
        bucket = cfg.getBucket();
        ensureBucketExists(bucket);
    }

    @AfterAll
    static void tearDown() {
        if (bundle != null) {
            bundle.close();
        }
        if (localstack != null) {
            localstack.stop();
        }
    }

    @Test
    void s3FileStore_roundTripsContentAgainstVendor() throws Exception {
        S3FileStore store = new S3FileStore(bundle.client(), bucket, "smoke/", false);
        byte[] payload = ("hello from " + vendorLabel).getBytes(StandardCharsets.UTF_8);

        FileStore.Stored stored =
                store.store(new ByteArrayInputStream(payload), "smoke-payload.txt");
        try {
            assertThat(stored.size()).isEqualTo(payload.length);
            assertThat(store.exists(stored.fileId())).isTrue();
            assertThat(store.size(stored.fileId())).isEqualTo(payload.length);
            assertThat(store.retrieveBytes(stored.fileId())).isEqualTo(payload);
        } finally {
            assertThat(store.delete(stored.fileId())).isTrue();
            assertThat(store.exists(stored.fileId())).isFalse();
        }
    }

    @Test
    void presignedGet_downloadsContentOverHttp() throws Exception {
        String key = "smoke/presign-" + System.currentTimeMillis() + ".txt";
        byte[] payload = ("presigned by " + vendorLabel).getBytes(StandardCharsets.UTF_8);

        bundle.client().putObject(p -> p.bucket(bucket).key(key), RequestBody.fromBytes(payload));
        try {
            PresignedGetObjectRequest presigned =
                    bundle.presigner()
                            .presignGetObject(
                                    GetObjectPresignRequest.builder()
                                            .signatureDuration(Duration.ofMinutes(5))
                                            .getObjectRequest(g -> g.bucket(bucket).key(key))
                                            .build());

            HttpResponse<byte[]> resp =
                    HttpClient.newHttpClient()
                            .send(
                                    HttpRequest.newBuilder(presigned.url().toURI()).GET().build(),
                                    HttpResponse.BodyHandlers.ofByteArray());

            assertThat(resp.statusCode()).isEqualTo(200);
            assertThat(resp.body()).isEqualTo(payload);
        } finally {
            bundle.client().deleteObject(d -> d.bucket(bucket).key(key));
        }
    }

    private static String requireEnv(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    name + " env var must be set when S3_SMOKE_ENDPOINT is set");
        }
        return value;
    }

    private static void ensureBucketExists(String b) {
        try {
            bundle.client().headBucket(h -> h.bucket(b));
        } catch (S3Exception e) {
            if (e.statusCode() == 404 || e.statusCode() == 301 || e.statusCode() == 400) {
                try {
                    bundle.client().createBucket(c -> c.bucket(b));
                } catch (S3Exception ignored) {
                    // Bucket already exists or vendor disallows runtime create (Supabase/R2 often
                    // require pre-create). Caller is expected to have pre-created it in that case.
                }
            }
        }
    }
}
