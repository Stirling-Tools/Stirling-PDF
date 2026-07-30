package stirling.software.proprietary.policy.output;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.testcontainers.containers.MinIOContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.policy.input.ResolveContext;
import stirling.software.proprietary.policy.input.ResolvedInput;
import stirling.software.proprietary.policy.input.S3InputSource;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.s3.S3ConnectionPool;
import stirling.software.proprietary.policy.s3.S3TestConnections;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/**
 * End-to-end {@link S3OutputSink} test against a real S3 API (MinIO): uploads, collision renaming,
 * and - composed with {@link S3InputSource} - the loop-safety guarantee that a policy writing into
 * a bucket it also watches never re-ingests its own outputs, while a second policy still can.
 */
@Testcontainers(disabledWithoutDocker = true)
class S3OutputSinkMinioTest {

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
    private S3OutputSink sink;
    private S3InputSource source;
    private InProcessProcessedLedger ledger;

    @BeforeEach
    void setUp() {
        if (adminClient == null) {
            adminClient =
                    S3Client.builder()
                            .endpointOverride(URI.create(minio.getS3URL()))
                            .httpClient(UrlConnectionHttpClient.create())
                            .region(Region.US_EAST_1)
                            .credentialsProvider(
                                    StaticCredentialsProvider.create(
                                            AwsBasicCredentials.create(ACCESS_KEY, SECRET_KEY)))
                            .serviceConfiguration(
                                    S3Configuration.builder().pathStyleAccessEnabled(true).build())
                            .build();
        }
        bucket = "policy-outbox-" + ++bucketCounter;
        adminClient.createBucket(CreateBucketRequest.builder().bucket(bucket).build());

        ApplicationProperties properties = new ApplicationProperties();
        properties.getPolicies().setAllowPrivateS3Endpoints(true);
        S3ConnectionPool pool = new S3ConnectionPool(properties);
        ledger = new InProcessProcessedLedger();
        sink = new S3OutputSink(pool, S3TestConnections.legacyResolver(), ledger);
        source = new S3InputSource(pool, S3TestConnections.legacyResolver());
    }

    @Test
    void uploadsOutputsUnderThePrefix() throws IOException {
        List<ResultFile> results =
                sink.deliver(
                        new OutputDelivery("run-1", POLICY),
                        List.of(output("doc.pdf", "pdf bytes")),
                        outputSpec("processed/"));

        assertThat(results).hasSize(1);
        assertThat(results.get(0).getFileName()).isEqualTo("s3://" + bucket + "/processed/doc.pdf");
        assertThat(objectContent("processed/doc.pdf")).isEqualTo("pdf bytes");
    }

    @Test
    void anExistingKeyIsNeverOverwritten() throws IOException {
        adminClient.putObject(
                PutObjectRequest.builder().bucket(bucket).key("doc.pdf").build(),
                RequestBody.fromString("theirs", StandardCharsets.UTF_8));

        List<ResultFile> results =
                sink.deliver(
                        new OutputDelivery("run-1", POLICY),
                        List.of(output("doc.pdf", "ours")),
                        outputSpec(""));

        assertThat(results.get(0).getFileName()).isEqualTo("s3://" + bucket + "/doc (1).pdf");
        assertThat(objectContent("doc.pdf")).isEqualTo("theirs");
        assertThat(objectContent("doc (1).pdf")).isEqualTo("ours");
    }

    @Test
    void aPolicyWritingIntoItsWatchedBucketSkipsItsOwnOutputsButAnotherPolicyChains()
            throws IOException {
        sink.deliver(
                new OutputDelivery("run-1", POLICY),
                List.of(output("result.pdf", "produced")),
                outputSpec(""));

        // The producing policy's sweep sees its own output at the recorded gate and skips it.
        assertThat(source.resolve(inputSpec(), new RecordingContext(POLICY))).isEmpty();

        // A different policy watching the same bucket has no row and processes it - chaining.
        List<ResolvedInput> chained = source.resolve(inputSpec(), new RecordingContext("p2"));
        assertThat(chained).hasSize(1);
        try (InputStream stream = chained.get(0).inputs().primary().get(0).getInputStream()) {
            assertThat(new String(stream.readAllBytes(), StandardCharsets.UTF_8))
                    .isEqualTo("produced");
        }
    }

    private OutputSpec outputSpec(String prefix) {
        return new OutputSpec(
                "s3",
                Map.of(
                        "bucket", bucket,
                        "prefix", prefix,
                        "endpoint", minio.getS3URL(),
                        "accessKeyId", ACCESS_KEY,
                        "secretAccessKey", SECRET_KEY));
    }

    private InputSpec inputSpec() {
        return new InputSpec(
                "s3",
                Map.of(
                        "bucket", bucket,
                        "endpoint", minio.getS3URL(),
                        "accessKeyId", ACCESS_KEY,
                        "secretAccessKey", SECRET_KEY));
    }

    private String objectContent(String key) throws IOException {
        try (ResponseInputStream<GetObjectResponse> stream =
                adminClient.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build())) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static Resource output(String name, String content) {
        return new ByteArrayResource(content.getBytes(StandardCharsets.UTF_8)) {
            @Override
            public String getFilename() {
                return name;
            }
        };
    }

    private class RecordingContext implements ResolveContext {

        private final String policyId;

        private RecordingContext(String policyId) {
            this.policyId = policyId;
        }

        @Override
        public boolean claim(String identity, String gate, Supplier<String> contentHash) {
            return ledger.claim(policyId, identity, gate, contentHash);
        }

        @Override
        public void settle(
                String identity, String finalGate, String finalContentHash, boolean success) {
            ledger.settle(policyId, identity, finalGate, finalContentHash, success);
        }

        @Override
        public boolean allSettledDone(String identity) {
            return ledger.allSettledDone(identity);
        }

        @Override
        public void reportPresent(Collection<String> identities) {}
    }
}
