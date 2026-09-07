package stirling.software.proprietary.policy.output;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.testcontainers.containers.MinIOContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.s3.S3ConnectionPool;
import stirling.software.proprietary.policy.s3.S3TestConnections;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.ObjectLockMode;
import software.amazon.awssdk.services.s3.model.S3Exception;

/**
 * Proves the Object Lock (WORM) retention path against a real S3 API.
 *
 * <p>The claim being tested is a compliance one - SEC 17a-4(f) and FINRA require records on
 * non-rewritable, non-erasable storage - so asserting that we merely <em>send</em> the retention
 * headers would be worthless. What matters is that the store then genuinely refuses to delete the
 * object, which is what {@link #anObjectWrittenUnderComplianceRetentionCannotBeDeleted} checks.
 */
@Testcontainers(disabledWithoutDocker = true)
class S3OutputSinkObjectLockMinioTest {

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
        bucket = "worm-archive-" + ++bucketCounter;
        // Object Lock can only be enabled at bucket creation here, and implies versioning.
        adminClient.createBucket(
                CreateBucketRequest.builder()
                        .bucket(bucket)
                        .objectLockEnabledForBucket(true)
                        .build());

        ApplicationProperties properties = new ApplicationProperties();
        properties.getPolicies().setAllowPrivateS3Endpoints(true);
        sink =
                new S3OutputSink(
                        new S3ConnectionPool(properties),
                        S3TestConnections.legacyResolver(),
                        new InProcessProcessedLedger());
    }

    @Test
    void anObjectWrittenUnderComplianceRetentionCannotBeDeleted() throws IOException {
        List<ResultFile> results =
                sink.deliver(
                        new OutputDelivery("run-1", POLICY),
                        List.of(output("statement.pdf", "regulated record")),
                        lockedOutputSpec("COMPLIANCE", 7));

        assertThat(results).hasSize(1);

        HeadObjectResponse head =
                adminClient.headObject(
                        HeadObjectRequest.builder().bucket(bucket).key("statement.pdf").build());
        assertThat(head.objectLockMode()).isEqualTo(ObjectLockMode.COMPLIANCE);
        // Retention is computed per object from "now", so a daily policy gives each document its
        // own full window rather than a shared deadline.
        assertThat(head.objectLockRetainUntilDate())
                .isBetween(
                        Instant.now().plus(6, ChronoUnit.DAYS),
                        Instant.now().plus(8, ChronoUnit.DAYS));

        // The point of the feature: the store itself refuses, not us.
        assertThatThrownBy(
                        () ->
                                adminClient.deleteObject(
                                        DeleteObjectRequest.builder()
                                                .bucket(bucket)
                                                .key("statement.pdf")
                                                .versionId(head.versionId())
                                                .build()))
                .isInstanceOf(S3Exception.class);

        // And it is still readable - locked, not quarantined.
        assertThat(
                        adminClient
                                .getObject(
                                        GetObjectRequest.builder()
                                                .bucket(bucket)
                                                .key("statement.pdf")
                                                .build())
                                .response()
                                .contentLength())
                .isEqualTo("regulated record".length());
    }

    @Test
    void withoutRetentionConfiguredObjectsAreWrittenUnlockedAsBefore() throws IOException {
        sink.deliver(
                new OutputDelivery("run-2", POLICY),
                List.of(output("scratch.pdf", "ordinary output")),
                lockedOutputSpec(null, null));

        HeadObjectResponse head =
                adminClient.headObject(
                        HeadObjectRequest.builder().bucket(bucket).key("scratch.pdf").build());
        // No accidental retention: an Object-Lock-enabled bucket must not silently lock everything.
        assertThat(head.objectLockMode()).isNull();
        assertThat(head.objectLockRetainUntilDate()).isNull();
    }

    private OutputSpec lockedOutputSpec(String lockMode, Integer retentionDays) {
        Map<String, Object> options = new java.util.LinkedHashMap<>();
        options.put("bucket", bucket);
        options.put("prefix", "");
        options.put("endpoint", minio.getS3URL());
        options.put("accessKeyId", ACCESS_KEY);
        options.put("secretAccessKey", SECRET_KEY);
        if (lockMode != null) {
            options.put("objectLockMode", lockMode);
            options.put("retentionDays", String.valueOf(retentionDays));
        }
        return new OutputSpec("s3", options);
    }

    private static org.springframework.core.io.Resource output(String name, String content) {
        return new ByteArrayResource(content.getBytes(StandardCharsets.UTF_8)) {
            @Override
            public String getFilename() {
                return name;
            }
        };
    }
}
