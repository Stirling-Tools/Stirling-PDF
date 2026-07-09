package stirling.software.proprietary.policy.output;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.policy.ledger.ClaimState;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.ledger.ProcessedFileStatus;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.s3.S3ConnectionPool;

import software.amazon.awssdk.awscore.exception.AwsServiceException;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectResponse;
import software.amazon.awssdk.services.s3.model.S3Exception;

/**
 * Tests for {@link S3OutputSink}: the ledger row exists before the object is visible, collisions
 * re-pick names, ad-hoc runs record nothing, and encrypted-bucket ETags are re-recorded.
 */
@ExtendWith(MockitoExtension.class)
class S3OutputSinkTest {

    private static final String POLICY = "p1";
    private static final String BUCKET = "outbox-bucket";
    private static final OutputDelivery DELIVERY = new OutputDelivery("run-1", POLICY);
    private static final OutputDelivery AD_HOC = new OutputDelivery("run-2", null);

    @Mock private S3Client s3Client;

    private S3OutputSink sink;
    private InProcessProcessedLedger ledger;
    private final List<PutObjectRequest> puts = new ArrayList<>();

    @BeforeEach
    void setUp() {
        ledger = new InProcessProcessedLedger();
        sink =
                new S3OutputSink(
                        new S3ConnectionPool(new ApplicationProperties(), config -> s3Client),
                        ledger);
    }

    @Test
    void recordsTheRowBeforeTheObjectBecomesVisible() throws IOException {
        // The row for the exact key must already be settled DONE at the moment the PUT runs -
        // record-before-visible, asserted from inside the upload itself.
        List<ClaimState> stateAtPutTime = new ArrayList<>();
        when(s3Client.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
                .thenAnswer(
                        invocation -> {
                            PutObjectRequest request = invocation.getArgument(0);
                            puts.add(request);
                            stateAtPutTime.add(stateFor(identity(request.key())));
                            return PutObjectResponse.builder().eTag(quotedMd5("data")).build();
                        });

        List<ResultFile> results =
                sink.deliver(DELIVERY, List.of(output("doc.pdf", "data")), spec());

        assertEquals(1, results.size());
        assertEquals("s3://" + BUCKET + "/processed/doc.pdf", results.get(0).getFileName());
        assertEquals(4, results.get(0).getFileSize());
        assertNotNull(stateAtPutTime.get(0));
        assertEquals(ProcessedFileStatus.DONE, stateAtPutTime.get(0).status());
        assertEquals(md5("data"), stateAtPutTime.get(0).gate());
        assertTrue(puts.get(0).ifNoneMatch() != null);
    }

    @Test
    void aTakenKeyIsForgottenAndRePicked() throws IOException {
        when(s3Client.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
                .thenAnswer(
                        invocation -> {
                            PutObjectRequest request = invocation.getArgument(0);
                            puts.add(request);
                            if (puts.size() == 1) {
                                throw s3Error(412, "PreconditionFailed");
                            }
                            return PutObjectResponse.builder().eTag(quotedMd5("data")).build();
                        });

        List<ResultFile> results =
                sink.deliver(DELIVERY, List.of(output("doc.pdf", "data")), spec());

        assertEquals("s3://" + BUCKET + "/processed/doc (1).pdf", results.get(0).getFileName());
        // The lost candidate's row is gone; only the delivered key is recorded.
        assertNull(stateFor(identity("processed/doc.pdf")));
        assertNotNull(stateFor(identity("processed/doc (1).pdf")));
    }

    @Test
    void anEncryptedBucketETagIsReRecordedAtTheActualGate() throws IOException {
        when(s3Client.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
                .thenReturn(PutObjectResponse.builder().eTag("\"kms-opaque-etag\"").build());

        sink.deliver(DELIVERY, List.of(output("doc.pdf", "data")), spec());

        assertEquals("kms-opaque-etag", stateFor(identity("processed/doc.pdf")).gate());
    }

    @Test
    void anAdHocDeliveryRecordsNothing() throws IOException {
        when(s3Client.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
                .thenReturn(PutObjectResponse.builder().eTag(quotedMd5("data")).build());

        sink.deliver(AD_HOC, List.of(output("doc.pdf", "data")), spec());

        assertNull(stateFor(identity("processed/doc.pdf")));
    }

    @Test
    void aFailedUploadForgetsItsRowAndThrows() {
        when(s3Client.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
                .thenThrow(SdkClientException.create("connection refused"));

        assertThrows(
                IOException.class,
                () -> sink.deliver(DELIVERY, List.of(output("doc.pdf", "data")), spec()));

        assertNull(stateFor(identity("processed/doc.pdf")));
    }

    @Test
    void aStoreWithoutConditionalPutsFallsBackToExistenceChecks() throws IOException {
        when(s3Client.headObject(any(HeadObjectRequest.class))).thenThrow(s3Error(404, "NotFound"));
        when(s3Client.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
                .thenAnswer(
                        invocation -> {
                            PutObjectRequest request = invocation.getArgument(0);
                            puts.add(request);
                            if (request.ifNoneMatch() != null) {
                                throw s3Error(501, "NotImplemented");
                            }
                            return PutObjectResponse.builder().eTag(quotedMd5("data")).build();
                        });

        List<ResultFile> results =
                sink.deliver(DELIVERY, List.of(output("doc.pdf", "data")), spec());

        // Same key, second attempt unconditional.
        assertEquals("s3://" + BUCKET + "/processed/doc.pdf", results.get(0).getFileName());
        assertEquals(2, puts.size());
        assertNull(puts.get(1).ifNoneMatch());
        assertNotNull(stateFor(identity("processed/doc.pdf")));
    }

    @Test
    void aBarePrefixGetsItsSlash() throws IOException {
        when(s3Client.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
                .thenAnswer(
                        invocation -> {
                            puts.add(invocation.getArgument(0));
                            return PutObjectResponse.builder().eTag(quotedMd5("data")).build();
                        });

        sink.deliver(
                DELIVERY,
                List.of(output("doc.pdf", "data")),
                new OutputSpec("s3", Map.of("bucket", BUCKET, "prefix", "processed")));

        assertEquals("processed/doc.pdf", puts.get(0).key());
    }

    @Test
    void validateRejectsBadConfigShape() {
        assertThrows(
                IllegalArgumentException.class,
                () -> sink.validate(new OutputSpec("s3", Map.of())));
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        sink.validate(
                                new OutputSpec(
                                        "s3", Map.of("bucket", BUCKET, "accessKeyId", "AKIA"))));
    }

    @Test
    void supportsOnlyS3Specs() {
        assertTrue(sink.supports(spec()));
        assertFalse(sink.supports(OutputSpec.inline()));
        assertFalse(sink.supports(null));
    }

    private static OutputSpec spec() {
        return new OutputSpec("s3", Map.of("bucket", BUCKET, "prefix", "processed/"));
    }

    private static String identity(String key) {
        return "s3://" + BUCKET + "/" + key;
    }

    private ClaimState stateFor(String identity) {
        return ledger.statesFor(POLICY, List.of(identity)).get(identity);
    }

    private static Resource output(String name, String content) {
        return new ByteArrayResource(content.getBytes(StandardCharsets.UTF_8)) {
            @Override
            public String getFilename() {
                return name;
            }
        };
    }

    private static String md5(String content) {
        try {
            return HexFormat.of()
                    .formatHex(
                            MessageDigest.getInstance("MD5")
                                    .digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String quotedMd5(String content) {
        return "\"" + md5(content) + "\"";
    }

    private static AwsServiceException s3Error(int status, String code) {
        return S3Exception.builder().statusCode(status).message(code).build();
    }
}
