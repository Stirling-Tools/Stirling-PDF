package stirling.software.proprietary.policy.webhook;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockHttpServletRequest;
import org.testcontainers.containers.MinIOContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.FileReadinessChecker;
import stirling.software.proprietary.access.service.OwnershipService;
import stirling.software.proprietary.integration.model.IntegrationConfig;
import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.repository.IntegrationConfigRepository;
import stirling.software.proprietary.policy.input.ResolveContext;
import stirling.software.proprietary.policy.input.ResolvedInput;
import stirling.software.proprietary.policy.input.S3InputSource;
import stirling.software.proprietary.policy.input.WebhookInputSource;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.s3.S3ConnectionPool;
import stirling.software.proprietary.policy.s3.S3ConnectionResolver;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.trigger.WebhookTrigger;
import stirling.software.proprietary.security.service.UserService;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.S3Object;
import tools.jackson.databind.ObjectMapper;

/**
 * End-to-end test of a connection-backed webhook against a real S3 API (MinIO): a signed delivery
 * is staged by the receiver into the S3 connection's bucket under the reserved per-webhook prefix,
 * then read and consumed by the source (which delegates to {@link S3InputSource}). Proves the
 * durable, multi-node staging model hosted deployments use, through the production S3 client
 * factory.
 */
@Testcontainers(disabledWithoutDocker = true)
class WebhookS3ConnectionMinioTest {

    private static final String POLICY = "p1";
    private static final String ACCESS_KEY = "minioadmin";
    private static final String SECRET_KEY = "minioadmin";
    private static final String WEBHOOK_ID = "miniowebhookid12";
    private static final String SECRET = "topsecret";
    private static final long CONNECTION_ID = 7L;

    @Container
    static MinIOContainer minio =
            new MinIOContainer("minio/minio:latest")
                    .withUserName(ACCESS_KEY)
                    .withPassword(SECRET_KEY);

    private static S3Client adminClient;
    private static int bucketCounter;

    @TempDir Path tempDir;

    private String bucket;
    private String stagingPrefix;
    private WebhookReceiverController receiver;
    private WebhookInputSource inputSource;
    private InProcessProcessedLedger ledger;
    private RecordingContext ctx;

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
        bucket = "webhook-inbox-" + ++bucketCounter;
        adminClient.createBucket(CreateBucketRequest.builder().bucket(bucket).build());
        stagingPrefix = "stirling-webhook/" + WEBHOOK_ID + "/";

        // The MinIO endpoint resolves to loopback, so the operator opt-in must be on.
        ApplicationProperties properties = new ApplicationProperties();
        properties.getPolicies().setAllowPrivateS3Endpoints(true);

        // A resolver over a stored S3 connection pointing at MinIO. No SecurityContext in the test,
        // so the resolver's ownership check is skipped (the delivery path's trust-the-save model).
        S3ConnectionResolver resolver = resolverFor(minioConnection());
        S3ConnectionPool pool = new S3ConnectionPool(properties);
        S3InputSource s3 = new S3InputSource(pool, resolver);

        inputSource =
                new WebhookInputSource(
                        new WebhookSpool(tempDir.resolve("spool")),
                        mock(FileReadinessChecker.class),
                        s3);

        InProcessSourceStore sourceStore = new InProcessSourceStore();
        sourceStore.save(
                new Source(
                        "s1",
                        "Partner uploads",
                        "webhook",
                        Map.of(
                                "webhookId", WEBHOOK_ID,
                                "signingSecret", SECRET,
                                "mode", "consume",
                                "connectionId", CONNECTION_ID),
                        true,
                        "owner",
                        null));
        receiver =
                new WebhookReceiverController(
                        sourceStore,
                        new WebhookSpool(tempDir.resolve("spool")),
                        mock(WebhookTrigger.class),
                        properties,
                        resolver,
                        pool);
        ledger = new InProcessProcessedLedger();
        ctx = new RecordingContext();
    }

    @Test
    void aDeliveryIsStagedToTheConnectionThenReadAndConsumed() throws IOException {
        byte[] body = "a pdf".getBytes(StandardCharsets.UTF_8);
        String signature = WebhookSignatures.sign(SECRET, body);

        // Deliver: the receiver stages the object into the connection's bucket under the prefix.
        var response = receiver.receive(WEBHOOK_ID, signature, "invoice.pdf", request(body));
        assertThat(response.getStatusCode().value()).isEqualTo(202);

        List<S3Object> staged = listUnder(stagingPrefix);
        assertThat(staged).hasSize(1);
        // Staged under a unique subfolder so the object basename stays the clean original name.
        assertThat(staged.get(0).key()).endsWith("/invoice.pdf");

        // Read: the webhook source resolves the delivery by delegating to the S3 source.
        List<ResolvedInput> work = inputSource.resolve(webhookSpec(), ctx);
        assertThat(work).hasSize(1);
        assertThat(work.get(0).inputs().primary().get(0).getFilename()).isEqualTo("invoice.pdf");
        assertThat(read(work.get(0))).isEqualTo("a pdf");
        // In flight: a second sweep claims nothing.
        assertThat(inputSource.resolve(webhookSpec(), ctx)).isEmpty();

        // Consume: a successful run removes the staged object from the bucket.
        work.get(0).onComplete().accept(true);
        assertThat(listUnder(stagingPrefix)).isEmpty();
        assertThat(inputSource.resolve(webhookSpec(), ctx)).isEmpty();
    }

    @Test
    void aRejectedDeliveryStagesNothing() {
        byte[] body = "a pdf".getBytes(StandardCharsets.UTF_8);

        try {
            receiver.receive(WEBHOOK_ID, "sha256=deadbeef", "x.pdf", request(body));
        } catch (RuntimeException expected) {
            // 401 invalid signature
        }

        assertThat(listUnder(stagingPrefix)).isEmpty();
    }

    private IntegrationConfig minioConnection() {
        IntegrationConfig connection = new IntegrationConfig();
        connection.setId(CONNECTION_ID);
        connection.setIntegrationType(IntegrationType.S3);
        connection.setName("minio");
        connection.setEnabled(true);
        connection.setConfig(
                new ObjectMapper()
                        .writeValueAsString(
                                Map.of(
                                        "bucket", bucket,
                                        "region", "us-east-1",
                                        "endpoint", minio.getS3URL(),
                                        "accessKeyId", ACCESS_KEY,
                                        "secretAccessKey", SECRET_KEY)));
        return connection;
    }

    private static S3ConnectionResolver resolverFor(IntegrationConfig connection) {
        IntegrationConfigRepository connections = mock(IntegrationConfigRepository.class);
        when(connections.findById(connection.getId())).thenReturn(Optional.of(connection));
        return new S3ConnectionResolver(
                connections, mock(OwnershipService.class), mock(UserService.class));
    }

    private static InputSpec webhookSpec() {
        return new InputSpec(
                "webhook",
                Map.of(
                        "webhookId", WEBHOOK_ID,
                        "signingSecret", SECRET,
                        "mode", "consume",
                        "connectionId", CONNECTION_ID));
    }

    private static MockHttpServletRequest request(byte[] body) {
        MockHttpServletRequest req =
                new MockHttpServletRequest("POST", "/api/v1/webhooks/" + WEBHOOK_ID);
        req.setContent(body);
        return req;
    }

    private List<S3Object> listUnder(String prefix) {
        return adminClient
                .listObjectsV2(ListObjectsV2Request.builder().bucket(bucket).prefix(prefix).build())
                .contents();
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
