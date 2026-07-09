package stirling.software.proprietary.policy.input;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MinIOContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/**
 * End-to-end {@link S3InputSource} test against a real S3 API (MinIO), through the production
 * client factory: listing, claiming, streaming, consensus delete, and save-time validation.
 */
@Testcontainers(disabledWithoutDocker = true)
class S3InputSourceMinioTest {

    private static final String POLICY = "p1";
    private static final String ACCESS_KEY = "minioadmin";
    private static final String SECRET_KEY = "minioadmin";

    @Container
    static MinIOContainer minio =
            new MinIOContainer("minio/minio:latest")
                    .withUserName(ACCESS_KEY)
                    .withPassword(SECRET_KEY);

    private static S3Client adminClient;
    private static int bucketCounter;

    private String bucket;
    private S3InputSource source;
    private InProcessProcessedLedger ledger;
    private RecordingContext ctx;

    @BeforeEach
    void setUp() {
        if (adminClient == null) {
            adminClient =
                    S3Client.builder()
                            .endpointOverride(java.net.URI.create(minio.getS3URL()))
                            .httpClient(UrlConnectionHttpClient.create())
                            .region(Region.US_EAST_1)
                            .credentialsProvider(
                                    StaticCredentialsProvider.create(
                                            AwsBasicCredentials.create(ACCESS_KEY, SECRET_KEY)))
                            .serviceConfiguration(
                                    S3Configuration.builder().pathStyleAccessEnabled(true).build())
                            .build();
        }
        bucket = "policy-inbox-" + ++bucketCounter;
        adminClient.createBucket(CreateBucketRequest.builder().bucket(bucket).build());

        // The MinIO endpoint resolves to loopback, so the operator opt-in must be on.
        ApplicationProperties properties = new ApplicationProperties();
        properties.getPolicies().setAllowPrivateS3Endpoints(true);
        source = new S3InputSource(properties);
        ledger = new InProcessProcessedLedger();
        ctx = new RecordingContext();
    }

    @Test
    void consumeListsStreamsAndDeletesByConsensus() throws IOException {
        put("incoming/doc.pdf", "pdf bytes");
        put("incoming/other.txt", "text");

        List<ResolvedInput> work = source.resolve(spec(Map.of("prefix", "incoming/")), ctx);

        assertThat(work).hasSize(2);
        assertThat(ctx.present)
                .containsExactlyInAnyOrder(
                        "s3://" + bucket + "/incoming/doc.pdf",
                        "s3://" + bucket + "/incoming/other.txt");
        assertThat(read(work.get(0))).isIn("pdf bytes", "text");
        // In flight: nothing to claim on a second sweep.
        assertThat(source.resolve(spec(Map.of("prefix", "incoming/")), ctx)).isEmpty();

        work.forEach(unit -> unit.onComplete().accept(true));
        assertThat(exists("incoming/doc.pdf")).isFalse();
        assertThat(exists("incoming/other.txt")).isFalse();
    }

    @Test
    void aFailedObjectStaysInTheBucket() throws IOException {
        put("doc.pdf", "data");

        source.resolve(spec(Map.of()), ctx).get(0).onComplete().accept(false);

        assertThat(exists("doc.pdf")).isTrue();
        assertThat(source.resolve(spec(Map.of()), ctx)).isEmpty();
    }

    @Test
    void anObjectOverwrittenMidRunSurvivesTheDeleteAndRunsAgain() throws IOException {
        put("doc.pdf", "v1");

        List<ResolvedInput> work = source.resolve(spec(Map.of()), ctx);
        put("doc.pdf", "v2 with a different etag");
        work.get(0).onComplete().accept(true);

        assertThat(exists("doc.pdf")).isTrue();
        assertThat(source.resolve(spec(Map.of()), ctx)).hasSize(1);
    }

    @Test
    void prefixLimitsWhatIsRead() throws IOException {
        put("incoming/doc.pdf", "data");
        put("archive/old.pdf", "data");

        List<ResolvedInput> work = source.resolve(spec(Map.of("prefix", "incoming/")), ctx);

        assertThat(work).hasSize(1);
        assertThat(ctx.present).containsExactly("s3://" + bucket + "/incoming/doc.pdf");
    }

    @Test
    void validateAcceptsAReachableBucketAndRejectsBadCredentials() {
        source.validate(spec(Map.of()));

        Map<String, Object> wrongSecret = new HashMap<>(baseOptions());
        wrongSecret.put("secretAccessKey", "not-the-secret");
        assertThatThrownBy(() -> source.validate(new InputSpec("s3", wrongSecret)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("cannot access");

        Map<String, Object> missingBucket = new HashMap<>(baseOptions());
        missingBucket.put("bucket", "no-such-bucket-here");
        assertThatThrownBy(() -> source.validate(new InputSpec("s3", missingBucket)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("cannot access");
    }

    @Test
    void aPrivateEndpointIsRejectedWithoutTheOperatorOptIn() {
        S3InputSource guarded = new S3InputSource(new ApplicationProperties());

        assertThatThrownBy(() -> guarded.validate(spec(Map.of())))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("policies.allowPrivateS3Endpoints");
    }

    private Map<String, Object> baseOptions() {
        return Map.of(
                "bucket", bucket,
                "endpoint", minio.getS3URL(),
                "accessKeyId", ACCESS_KEY,
                "secretAccessKey", SECRET_KEY);
    }

    private InputSpec spec(Map<String, Object> extra) {
        Map<String, Object> options = new HashMap<>(baseOptions());
        options.putAll(extra);
        return new InputSpec("s3", options);
    }

    private void put(String key, String content) {
        adminClient.putObject(
                PutObjectRequest.builder().bucket(bucket).key(key).build(),
                RequestBody.fromString(content, StandardCharsets.UTF_8));
    }

    private boolean exists(String key) {
        try {
            adminClient.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build());
            return true;
        } catch (NoSuchKeyException e) {
            return false;
        }
    }

    private static String read(ResolvedInput unit) throws IOException {
        try (InputStream stream = unit.inputs().primary().get(0).getInputStream()) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private class RecordingContext implements ResolveContext {

        private final List<String> present = new ArrayList<>();

        @Override
        public boolean claim(String identity, String gate, Supplier<String> contentHash) {
            return ledger.claim(POLICY, identity, gate, contentHash);
        }

        @Override
        public void settle(
                String identity, String finalGate, String finalContentHash, boolean success) {
            ledger.settle(POLICY, identity, finalGate, finalContentHash, success);
        }

        @Override
        public boolean allSettledDone(String identity) {
            return ledger.allSettledDone(identity);
        }

        @Override
        public void reportPresent(Collection<String> identities) {
            present.addAll(identities);
        }
    }
}
